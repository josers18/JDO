import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawn, type ChildProcess } from "node:child_process";
import { DATA_DIR, ROOT } from "./env.ts";
import { getOrgCredentials } from "./orgStore.ts";
import { maskBody, maskHeaders, maskUrl } from "./wire.ts";
import type { KernelState, KernelStatus, NotebookOutput, NotebookRun, WireEntry } from "../shared/types.ts";

// The Notebook module: one Python kernel (python/kernel.py) per org, run from the project's .venv so the Data Cloud
// Python connector, pandas and matplotlib are there. The kernel gets the org's credentials in its environment; they
// never reach the browser, and its HTTP calls come back as wire entries masked here.

const PYTHON = path.join(ROOT, ".venv", "bin", "python");
const KERNEL = path.join(ROOT, "python", "kernel.py");
const WORK_DIR = path.join(DATA_DIR, "notebook"); // files a cell writes land here, gitignored
export const SETUP_COMMAND = "npm run notebook:setup";

interface Pending {
  count: number;
  started: number;
  outputs: NotebookOutput[];
  wire: WireEntry[];
  resolve: (run: NotebookRun) => void;
}

// Kernel lines are JSON; anything else (a library writing to the real stdout) shows as printed text.
type KernelMessage =
  | { id: string | null; type: "ready"; python: string }
  | { id: string; type: "done"; ok: boolean }
  | { id: string; type: "wire"; entry: Omit<WireEntry, "id" | "turn"> }
  | ({ id: string } & NotebookOutput);

export function toWireEntry(raw: Omit<WireEntry, "id" | "turn">, turn: number): WireEntry {
  return {
    ...raw,
    id: crypto.randomUUID(),
    turn,
    url: maskUrl(raw.url),
    requestHeaders: maskHeaders(raw.requestHeaders ?? {}),
    requestBody: maskBody(raw.requestBody),
    responseBody: maskBody(raw.responseBody),
  };
}

// Printed text arrives in small pieces; consecutive pieces of one stream read as one block.
export function addOutput(outputs: NotebookOutput[], out: NotebookOutput) {
  const last = outputs[outputs.length - 1];
  if (out.type === "stream" && last?.type === "stream" && last.name === out.name) last.text += out.text;
  else outputs.push(out.type === "stream" ? { ...out } : out);
}

class Kernel {
  private proc: ChildProcess | null = null;
  private state: KernelState = "stopped";
  private python?: string;
  private count = 0;
  private pending = new Map<string, Pending>();
  private queue: Promise<unknown> = Promise.resolve(); // cells run one at a time, in the order sent
  private ready: Promise<void> = Promise.resolve();
  private stderrTail = ""; // what a kernel that dies on start printed, for the error

  constructor(private orgId: string) {}

  status(): KernelStatus {
    const state = !fs.existsSync(PYTHON) ? "missing" : this.state === "idle" && this.pending.size ? "busy" : this.state;
    return { state, python: this.python, setupCommand: SETUP_COMMAND };
  }

  start() {
    if (this.proc || !fs.existsSync(PYTHON)) return;
    const org = getOrgCredentials(this.orgId);
    fs.mkdirSync(WORK_DIR, { recursive: true });
    const proc = spawn(PYTHON, ["-I", "-u", KERNEL], {
      cwd: WORK_DIR,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        LANG: process.env.LANG ?? "en_US.UTF-8",
        // Corporate TLS inspection: let requests use the same CA bundle Node is told about, if any.
        ...(process.env.NODE_EXTRA_CA_CERTS ? { REQUESTS_CA_BUNDLE: process.env.NODE_EXTRA_CA_CERTS } : {}),
        AFD360_ORG_NAME: org.name,
        AFD360_LOGIN_URL: org.myDomain.replace(/\/+$/, ""),
        // The connector's a360 token exchange rejects JWT-format tokens, which the main app issues for the Agent API.
        AFD360_CLIENT_ID: org.dataCloudClientId ?? org.clientId,
        AFD360_CLIENT_SECRET: org.dataCloudClientSecret ?? org.clientSecret,
        AFD360_APP: org.dataCloudClientId ? "Data Cloud app" : "main app",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.proc = proc;
    this.state = "starting";
    this.stderrTail = "";
    this.ready = new Promise((resolve) => {
      readline.createInterface({ input: proc.stdout! }).on("line", (line) => this.receive(line, resolve));
      proc.once("exit", () => resolve());
    });
    proc.stderr!.on("data", (d) => (this.stderrTail = (this.stderrTail + d).slice(-4000)));
    proc.once("exit", (code, signal) => {
      if (this.proc !== proc) return; // a restart already replaced it
      this.proc = null;
      this.state = "stopped";
      const why = `The kernel stopped (${signal ?? `exit code ${code}`}).${this.stderrTail ? `\n${this.stderrTail.trim()}` : ""}`;
      for (const [id, p] of this.pending) {
        p.outputs.push({ type: "error", ename: "KernelStopped", evalue: why, traceback: why });
        this.finish(id, false);
      }
    });
  }

  private receive(line: string, onReady: () => void) {
    let msg: KernelMessage;
    try {
      msg = JSON.parse(line);
    } catch {
      const p = [...this.pending.values()][0];
      if (p) addOutput(p.outputs, { type: "stream", name: "stdout", text: line + "\n" });
      return;
    }
    if (msg.type === "ready") {
      this.python = msg.python;
      this.state = "idle";
      onReady();
      return;
    }
    const p = msg.id ? this.pending.get(msg.id) : undefined;
    if (!p) return;
    if (msg.type === "done") this.finish(msg.id, msg.ok);
    else if (msg.type === "wire") p.wire.push(toWireEntry(msg.entry, p.count));
    else {
      const { id: _id, ...out } = msg;
      addOutput(p.outputs, out as NotebookOutput);
    }
  }

  private finish(id: string, ok: boolean) {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    p.resolve({ count: p.count, ok, outputs: p.outputs, wire: p.wire, durationMs: Date.now() - p.started });
  }

  run(code: string): Promise<NotebookRun> {
    const next = this.queue.then(async () => {
      this.start();
      await this.ready;
      const count = ++this.count;
      if (!this.proc || this.state === "stopped") {
        const evalue = fs.existsSync(PYTHON) ? `The kernel didn't start.\n${this.stderrTail.trim()}` : `No Python environment yet. Run \`${SETUP_COMMAND}\`.`;
        return { count, ok: false, outputs: [{ type: "error", ename: "KernelUnavailable", evalue, traceback: evalue }], wire: [], durationMs: 0 } as NotebookRun;
      }
      const id = crypto.randomUUID();
      return new Promise<NotebookRun>((resolve) => {
        this.pending.set(id, { count, started: Date.now(), outputs: [], wire: [], resolve });
        this.proc!.stdin!.write(JSON.stringify({ id, count, code }) + "\n");
      });
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  // Ctrl+C for the running cell: Python raises KeyboardInterrupt inside it.
  interrupt() {
    this.proc?.kill("SIGINT");
  }

  stop() {
    const old = this.proc;
    this.proc = null;
    this.state = "stopped";
    this.count = 0;
    this.python = undefined;
    for (const [id, p] of this.pending) {
      p.outputs.push({ type: "error", ename: "KernelRestarted", evalue: "The kernel was restarted.", traceback: "The kernel was restarted." });
      this.finish(id, false);
    }
    old?.kill();
  }

  // A fresh namespace; cells already queued run on the new kernel.
  restart() {
    this.stop();
    this.start();
  }
}

const kernels = new Map<string, Kernel>();

// Credentials are read when the kernel starts; after an org edit the next run starts a fresh one.
export function stopKernel(orgId: string) {
  kernels.get(orgId)?.stop();
  kernels.delete(orgId);
}

export function kernel(orgId: string): Kernel {
  getOrgCredentials(orgId); // unknown org → error before a kernel exists
  let k = kernels.get(orgId);
  if (!k) kernels.set(orgId, (k = new Kernel(orgId)));
  return k;
}
