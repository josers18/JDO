#!/usr/bin/env python3
"""Chat with an Agentforce agent over the Agent API.

Flow (https://developer.salesforce.com/docs/ai/agentforce/guide/agent-api-get-started.html):
client-credentials token -> start session -> streaming messages -> end session.

Usage:
  python3 agent_chat.py                  # interactive chat (Ctrl-D / "exit" to quit)
  python3 agent_chat.py "your question"  # one-shot: ask, print answer, end session
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

API_BASE = "https://api.salesforce.com/einstein/ai-agent/v1"
# Search Agent (AiSearch__SearchAgent) - the agent behind /lightning/search/agent in finsdc3
DEFAULT_AGENT_ID = "0Xxam000000thvZCAQ"


def load_env():
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def request(method, url, token=None, body=None, headers=None, form=False):
    hdrs = dict(headers or {})
    data = None
    if token:
        hdrs["Authorization"] = f"Bearer {token}"
    if body is not None:
        if form:
            data = urllib.parse.urlencode(body).encode()
            hdrs["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            data = json.dumps(body).encode()
            hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        return urllib.request.urlopen(req, timeout=130)  # API times out at 120s
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {url} -> HTTP {e.code}: {e.read().decode(errors='replace')}")


def get_token(my_domain, client_id, client_secret):
    resp = request("POST", f"{my_domain}/services/oauth2/token", form=True, body={
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
    })
    return json.load(resp)["access_token"]


def start_session(token, agent_id, my_domain, bypass_user):
    resp = request("POST", f"{API_BASE}/agents/{agent_id}/sessions", token, {
        "externalSessionKey": str(uuid.uuid4()),
        "instanceConfig": {"endpoint": my_domain},
        "streamingCapabilities": {"chunkTypes": ["Text"]},
        "bypassUser": bypass_user,
    })
    session = json.load(resp)
    for msg in session.get("messages", []):
        if msg.get("message"):
            print(f"agent> {msg['message']}\n")
    return session["sessionId"]


def send_streaming(token, session_id, sequence_id, text):
    resp = request(
        "POST", f"{API_BASE}/sessions/{session_id}/messages/stream", token,
        {"message": {"sequenceId": sequence_id, "type": "Text", "text": text}},
        headers={"Accept": "text/event-stream"},
    )
    print("agent> ", end="", flush=True)
    streamed = False
    for raw in resp:
        line = raw.decode().strip()
        if not line.startswith("data:"):
            continue
        payload = line[5:].strip()
        if not payload:
            continue
        msg = json.loads(payload).get("message", {})
        kind = msg.get("type")
        if kind == "TextChunk":
            print(msg.get("message", ""), end="", flush=True)
            streamed = True
        elif kind == "Inform" and not streamed:
            # Full-text message; only print it when no chunks carried the same text
            print(msg.get("message", ""), end="", flush=True)
        elif kind == "EndOfTurn":
            break
    print("\n")


def end_session(token, session_id):
    request("DELETE", f"{API_BASE}/sessions/{session_id}", token,
            headers={"x-session-end-reason": "UserRequest"})


def main():
    load_env()
    missing = [k for k in ("SF_MY_DOMAIN", "SF_CLIENT_ID", "SF_CLIENT_SECRET") if not os.environ.get(k)]
    if missing:
        sys.exit(f"Missing env vars: {', '.join(missing)} (see .env.example)")
    my_domain = os.environ["SF_MY_DOMAIN"].rstrip("/")
    agent_id = os.environ.get("AGENT_ID", DEFAULT_AGENT_ID)
    # Employee agents have no agent-assigned user, so they must run as the token's (Run As) user
    bypass_user = os.environ.get("AGENT_BYPASS_USER", "false").lower() == "true"

    token = get_token(my_domain, os.environ["SF_CLIENT_ID"], os.environ["SF_CLIENT_SECRET"])
    session_id = start_session(token, agent_id, my_domain, bypass_user)
    sequence_id = 0
    try:
        if len(sys.argv) > 1:
            sequence_id += 1
            send_streaming(token, session_id, sequence_id, " ".join(sys.argv[1:]))
            return
        while True:
            try:
                text = input("you> ").strip()
            except EOFError:
                break
            if text.lower() in ("exit", "quit"):
                break
            if text:
                sequence_id += 1
                send_streaming(token, session_id, sequence_id, text)
    except KeyboardInterrupt:
        pass
    finally:
        end_session(token, session_id)


if __name__ == "__main__":
    main()
