import express from "express";

// MCP Apps sandbox proxy: served on its own origin (port) so widget HTML never runs with the host's origin.
// CSP comes from the widget's declared domains and is sent as an HTTP header (tamper-proof, unlike a meta tag).
// Modeled on modelcontextprotocol/ext-apps examples/basic-host (sandbox.ts + serve.ts).

interface Csp {
  connectDomains?: string[];
  resourceDomains?: string[];
  frameDomains?: string[];
  baseUriDomains?: string[];
}

// Rejects entries that could break out of a directive or inject keywords, and templated Trusted URLs ({subdomain}) browsers reject.
const clean = (d?: string[]) => (d ?? []).filter((x) => typeof x === "string" && !/[;\r\n'" {}]/.test(x)).join(" ");

function cspHeader(csp?: Csp): string {
  const res = clean(csp?.resourceDomains);
  return [
    "default-src 'self' 'unsafe-inline'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: ${res}`.trim(),
    `style-src 'self' 'unsafe-inline' blob: data: ${res}`.trim(),
    `img-src 'self' data: blob: ${res}`.trim(),
    `font-src 'self' data: blob: ${res}`.trim(),
    `media-src 'self' data: blob: ${res}`.trim(),
    `connect-src 'self' ${clean(csp?.connectDomains)}`.trim(),
    `worker-src 'self' blob: ${res}`.trim(),
    clean(csp?.frameDomains) ? `frame-src ${clean(csp?.frameDomains)}` : "frame-src 'none'",
    "object-src 'none'",
    clean(csp?.baseUriDomains) ? `base-uri ${clean(csp?.baseUriDomains)}` : "base-uri 'none'",
  ].join("; ");
}

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>MCP App sandbox</title>
<style>html,body{margin:0;height:100%;background:transparent}body{display:flex;flex-direction:column}iframe{border:0;flex-grow:1;background:transparent}</style>
</head><body><script>
(function () {
  if (window.self === window.top) throw new Error("sandbox must be framed");
  if (!/^http:\\/\\/(localhost|127\\.0\\.0\\.1)(:|\\/|$)/.test(document.referrer)) throw new Error("embedding origin not allowed");
  var HOST = new URL(document.referrer).origin, OWN = location.origin;
  try { window.top.alert("sandbox is not isolated"); throw "FAIL"; } catch (e) { if (e === "FAIL") throw new Error("sandbox is not isolated"); }
  var inner = document.createElement("iframe");
  inner.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
  document.body.appendChild(inner);
  var PERMS = { camera: "camera", microphone: "microphone", geolocation: "geolocation", clipboardWrite: "clipboard-write" };
  window.addEventListener("message", function (ev) {
    if (ev.source === window.parent) {
      if (ev.origin !== HOST) return;
      var d = ev.data;
      if (d && d.method === "ui/notifications/sandbox-resource-ready") {
        var p = d.params || {};
        if (typeof p.sandbox === "string") inner.setAttribute("sandbox", p.sandbox);
        var allow = Object.keys(p.permissions || {}).map(function (k) { return PERMS[k]; }).filter(Boolean).join("; ");
        if (allow) inner.setAttribute("allow", allow);
        var doc = inner.contentDocument || (inner.contentWindow && inner.contentWindow.document);
        if (doc) { doc.open(); doc.write(p.html || ""); doc.close(); } else { inner.srcdoc = p.html || ""; }
      } else if (inner.contentWindow) {
        inner.contentWindow.postMessage(d, "*");
      }
    } else if (ev.source === inner.contentWindow) {
      if (ev.origin !== OWN) return;
      window.parent.postMessage(ev.data, HOST);
    }
  });
  window.parent.postMessage({ jsonrpc: "2.0", method: "ui/notifications/sandbox-proxy-ready", params: {} }, HOST);
})();
</script></body></html>`;

export function startSandbox(port: number) {
  const app = express();
  app.get(["/", "/sandbox.html"], (req, res) => {
    let csp: Csp | undefined;
    try {
      csp = typeof req.query.csp === "string" ? JSON.parse(req.query.csp) : undefined;
    } catch {
      csp = undefined;
    }
    res.setHeader("Content-Security-Policy", cspHeader(csp));
    res.setHeader("Cache-Control", "no-store");
    res.type("html").send(PAGE);
  });
  app.use((_req, res) => res.status(404).send("Only the sandbox page is served here"));
  const host = process.env.HOST || "127.0.0.1";
  app.listen(port, host, () => console.log(`[sandbox] MCP Apps sandbox on http://${host}:${port}`));
}
