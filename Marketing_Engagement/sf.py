"""Minimal Salesforce REST client.

Auth: JWT bearer (SF_CLIENT_ID / SF_USERNAME / SF_PRIVATE_KEY / SF_LOGIN_URL) on
Heroku; the local sf CLI session when SF_CLIENT_ID is unset. Tokens are never
printed or put in error messages.
"""

import json
import os
import subprocess
import time

import jwt
import requests

from catalog import ORG

API = "v64.0"
DEFAULT_AUDIENCE = "https://login.salesforce.com"


class SfError(RuntimeError):
    pass


class SfClient:
    def __init__(self, instance_url, token, session=None):
        self.root = instance_url.rstrip("/")
        self.base = f"{self.root}/services/data/{API}"
        self.http = session or requests.Session()
        self.http.headers["Authorization"] = f"Bearer {token}"

    @classmethod
    def from_env(cls):
        if os.environ.get("SF_CLIENT_ID"):
            return cls(*jwt_login(os.environ["SF_LOGIN_URL"], os.environ.get("SF_AUDIENCE", DEFAULT_AUDIENCE),
                                  os.environ["SF_CLIENT_ID"], os.environ["SF_USERNAME"], os.environ["SF_PRIVATE_KEY"]))
        return cls(*cli_session(ORG))

    def _ok(self, r):
        if r.status_code >= 400:
            raise SfError(f"{r.request.method} {r.url.split('?')[0]} → {r.status_code}: {r.text[:500]}")
        return r

    def query(self, soql):
        page = self._ok(self.http.get(f"{self.base}/query", params={"q": soql}, timeout=60)).json()
        records = page["records"]
        while not page["done"]:
            page = self._ok(self.http.get(self.root + page["nextRecordsUrl"], timeout=60)).json()
            records += page["records"]
        return records

    def create(self, sobject, fields):
        return self._ok(self.http.post(f"{self.base}/sobjects/{sobject}", json=fields, timeout=60)).json()["id"]

    def update(self, sobject, rec_id, fields):
        self._ok(self.http.patch(f"{self.base}/sobjects/{sobject}/{rec_id}", json=fields, timeout=60))


def jwt_assertion(client_id, username, audience, key, now=None):
    now = int(now if now is not None else time.time())
    return jwt.encode({"iss": client_id, "sub": username, "aud": audience, "exp": now + 180}, key, algorithm="RS256")


def jwt_login(token_url, audience, client_id, username, key):
    r = requests.post(f"{token_url.rstrip('/')}/services/oauth2/token", timeout=30, data={
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": jwt_assertion(client_id, username, audience, key)})
    if r.status_code != 200:
        try:
            reason = r.json().get("error_description") or r.json().get("error")
        except ValueError:
            reason = r.text[:200]
        raise SfError(f"JWT login failed ({r.status_code}): {reason}")
    body = r.json()
    return body["instance_url"], body["access_token"]


def cli_session(org):
    def sf(*args):
        out = subprocess.run(["sf", *args, "-o", org, "--json"], capture_output=True, text=True)
        data = json.loads(out.stdout or "{}")
        if data.get("status") != 0:
            raise SfError(f"sf {' '.join(args)} failed: {data.get('message', 'no output')}")
        return data["result"]
    return sf("org", "display")["instanceUrl"], sf("org", "auth", "show-access-token", "--no-prompt")["accessToken"]
