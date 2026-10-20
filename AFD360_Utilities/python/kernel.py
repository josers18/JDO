"""Notebook kernel: runs cells in one namespace, like a Jupyter kernel, for the server's Notebook module.

Protocol, one JSON object per line. In on stdin: {"id", "count", "code"}. Out on stdout: {"type": "ready"} once,
then per cell "stream", "display", "error" and "wire" messages tagged with its id, and "done" last.
"""

import ast
import base64
import io
import json
import linecache
import os
import sys
import time
import traceback
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlsplit

os.environ.setdefault("MPLBACKEND", "Agg")

_proto = sys.stdout  # the protocol channel; cell prints go through Stream instead
_cell = {"id": None}
ROWS_ON_WIRE = 50  # rows of a query response kept in its wire entry


def send(msg):
    _proto.write(json.dumps({"id": _cell["id"], **msg}, default=str) + "\n")
    _proto.flush()


class Stream(io.TextIOBase):
    def __init__(self, name):
        self.name = name

    def writable(self):
        return True

    def write(self, text):
        if text:
            send({"type": "stream", "name": self.name, "text": text})
        return len(text)


def display(*objs):
    """Show objects under the cell: HTML when they have it (DataFrames), figures as PNG, else their repr."""
    for obj in objs:
        if hasattr(obj, "savefig"):
            send({"type": "display", "mime": "image/png", "data": png(obj)})
        elif hasattr(obj, "_repr_html_") and (html := obj._repr_html_()):
            send({"type": "display", "mime": "text/html", "data": html})
        else:
            send({"type": "display", "mime": "text/plain", "data": repr(obj)})


def png(fig):
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=110, bbox_inches="tight")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def show_figures():
    plt = sys.modules.get("matplotlib.pyplot")
    if not plt:
        return
    for num in plt.get_fignums():
        send({"type": "display", "mime": "image/png", "data": png(plt.figure(num))})
    plt.close("all")


class Org:
    """The active org from Admin → Orgs; its repr never shows the secret."""

    def __init__(self):
        self.name = os.environ.get("AFD360_ORG_NAME", "")
        self.login_url = os.environ.get("AFD360_LOGIN_URL", "")
        self.client_id = os.environ.get("AFD360_CLIENT_ID", "")
        self.client_secret = os.environ.get("AFD360_CLIENT_SECRET", "")
        self.app = os.environ.get("AFD360_APP", "")

    def __repr__(self):
        return f"Org(name={self.name!r}, login_url={self.login_url!r}, app={self.app!r}, client_id='{self.client_id[:6]}…', client_secret='••••')"


# ── Wire capture: every HTTP call made through requests (the connector uses it) goes to the Wire panel ──

LABELS = [
    ("/services/oauth2/token", "OAuth token"),
    ("/services/a360/token", "Data Cloud token exchange"),
    ("/services/oauth2/revoke", "Revoke core token"),
    ("/api/v2/query/", "Query next batch"),
    ("/api/v2/query", "Query (v2)"),
    ("/api/v1/query", "Query (v1)"),
    ("/api/v1/metadata", "Metadata"),
]


def label_for(url):
    path = urlsplit(url).path
    return next((label for prefix, label in LABELS if path.startswith(prefix)), path or url)


def decode(body, content_type):
    if body is None or body == b"" or body == "":
        return None
    text = body.decode("utf-8", "replace") if isinstance(body, bytes) else str(body)
    if "json" in (content_type or "") or text[:1] in "[{":
        try:
            value = json.loads(text)
        except ValueError:
            return text[:20000]
        if isinstance(value, dict) and isinstance(value.get("data"), list) and len(value["data"]) > ROWS_ON_WIRE:
            more = len(value["data"]) - ROWS_ON_WIRE
            value = {**value, "data": value["data"][:ROWS_ON_WIRE] + [f"… {more} more rows"]}
        return value
    if "x-www-form-urlencoded" in (content_type or ""):
        return dict(parse_qsl(text))
    return text[:20000]


def capture_requests():
    try:
        import requests
    except ImportError:
        return
    original = requests.Session.send

    def send_and_record(self, request, **kwargs):
        entry = {
            "label": label_for(request.url),
            "method": request.method,
            "url": request.url,
            "startedAt": datetime.now(timezone.utc).isoformat(),
            "requestHeaders": dict(request.headers),
            "requestBody": decode(request.body, request.headers.get("Content-Type")),
        }
        started = time.monotonic()
        try:
            response = original(self, request, **kwargs)
        except Exception as e:
            entry.update(error=str(e), durationMs=round((time.monotonic() - started) * 1000))
            send({"type": "wire", "entry": entry})
            raise
        entry.update(
            status=response.status_code,
            responseHeaders=dict(response.headers),
            responseBody=decode(response.content, response.headers.get("Content-Type")),
            responseBytes=len(response.content),
            durationMs=round((time.monotonic() - started) * 1000),
        )
        send({"type": "wire", "entry": entry})
        return response

    requests.Session.send = send_and_record


# ── Running a cell ──


def run(code, count, namespace):
    filename = f"<cell [{count}]>"
    linecache.cache[filename] = (len(code), None, code.splitlines(True), filename)  # source lines in tracebacks
    try:
        tree = ast.parse(code, filename, "exec")
        last = tree.body.pop() if tree.body and isinstance(tree.body[-1], ast.Expr) else None
        exec(compile(tree, filename, "exec"), namespace)
        if last is not None:
            value = eval(compile(ast.Expression(last.value), filename, "eval"), namespace)
            if value is not None:
                namespace["_"] = value
                if not (hasattr(value, "figure") and sys.modules.get("matplotlib.pyplot")):
                    display(value)  # a plot call's return value is the axes: the figure shows below instead
        show_figures()
        return True
    except BaseException as e:  # KeyboardInterrupt from Interrupt included
        show_figures()
        frames = [f for f in traceback.extract_tb(e.__traceback__) if f.filename != __file__]
        lines = traceback.format_list(frames) + traceback.format_exception_only(type(e), e)
        send({"type": "error", "ename": type(e).__name__, "evalue": str(e), "traceback": "".join(lines)})
        return False


def main():
    sys.stdout = Stream("stdout")
    sys.stderr = Stream("stderr")
    capture_requests()
    namespace = {"__name__": "__main__", "display": display, "org": Org()}
    send({"type": "ready", "python": sys.version.split()[0]})
    stdin = sys.__stdin__
    while True:
        try:
            line = stdin.readline()
        except KeyboardInterrupt:  # Interrupt while idle
            continue
        if not line:  # the server went away
            return
        msg = json.loads(line)
        _cell["id"] = msg["id"]
        ok = run(msg["code"], msg["count"], namespace)
        send({"type": "done", "ok": ok})
        _cell["id"] = None


if __name__ == "__main__":
    main()
