import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const DATA_DIR = path.join(ROOT, "data");
const ENV_PATH = path.join(ROOT, ".env");

function loadEnvFile() {
  if (!fs.existsSync(ENV_PATH)) return;
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// The master key encrypts org secrets at rest; generate one on first run so local setup is zero-step.
function ensureMasterKey(): Buffer {
  let hex = process.env.AFD360_MASTER_KEY;
  if (!hex) {
    hex = crypto.randomBytes(32).toString("hex");
    fs.appendFileSync(ENV_PATH, `AFD360_MASTER_KEY=${hex}\n`, { mode: 0o600 });
    process.env.AFD360_MASTER_KEY = hex;
    console.log(`[env] generated AFD360_MASTER_KEY in ${ENV_PATH}`);
  }
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("AFD360_MASTER_KEY must be 64 hex characters");
  return Buffer.from(hex, "hex");
}

loadEnvFile();
export const MASTER_KEY = ensureMasterKey();
export const PORT = Number(process.env.PORT || 3001);
export const SANDBOX_PORT = Number(process.env.SANDBOX_PORT || 3002);
fs.mkdirSync(path.join(DATA_DIR, "conversations"), { recursive: true });
