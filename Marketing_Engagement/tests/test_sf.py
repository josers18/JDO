import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

import sf


class Resp:
    def __init__(self, status, body):
        self.status_code, self._body, self.text = status, body, str(body)
        self.request = type("R", (), {"method": "GET"})()
        self.url = "https://x/services/data/v64.0/query?q=..."

    def json(self):
        return self._body


class Session:
    def __init__(self, responses):
        self.responses, self.calls, self.headers = list(responses), [], {}

    def _next(self, method, url, **kw):
        self.calls.append((method, url, kw))
        return self.responses.pop(0)

    def get(self, url, **kw): return self._next("GET", url, **kw)
    def post(self, url, **kw): return self._next("POST", url, **kw)
    def patch(self, url, **kw): return self._next("PATCH", url, **kw)


def test_query_follows_next_records_url():
    s = Session([Resp(200, {"done": False, "records": [{"Id": "1"}], "nextRecordsUrl": "/services/data/v64.0/query/01g-2000"}),
                 Resp(200, {"done": True, "records": [{"Id": "2"}]})])
    c = sf.SfClient("https://org.my.salesforce.com/", "tok", session=s)
    assert [r["Id"] for r in c.query("SELECT Id FROM Account")] == ["1", "2"]
    assert s.calls[1][1] == "https://org.my.salesforce.com/services/data/v64.0/query/01g-2000"
    assert s.headers["Authorization"] == "Bearer tok"


def test_create_and_update():
    s = Session([Resp(201, {"id": "701NEW"}), Resp(204, None)])
    c = sf.SfClient("https://org", "tok", session=s)
    assert c.create("Campaign", {"Name": "X"}) == "701NEW"
    c.update("Campaign", "701NEW", {"Status": "Completed"})
    assert s.calls[1][0] == "PATCH" and s.calls[1][1].endswith("/sobjects/Campaign/701NEW")


def test_http_error_raises_without_token():
    s = Session([Resp(400, [{"message": "bad field"}])])
    c = sf.SfClient("https://org", "secret-token", session=s)
    with pytest.raises(sf.SfError) as e:
        c.query("SELECT Bad FROM Account")
    assert "400" in str(e.value) and "secret-token" not in str(e.value)


def test_jwt_assertion_claims():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                            serialization.NoEncryption()).decode()
    token = sf.jwt_assertion("CID", "admin@finsdc3.demo", "https://login.salesforce.com", pem, now=1_000_000)
    claims = jwt.decode(token, key.public_key(), algorithms=["RS256"], audience="https://login.salesforce.com",
                        options={"verify_exp": False})
    assert claims == {"iss": "CID", "sub": "admin@finsdc3.demo", "aud": "https://login.salesforce.com", "exp": 1_000_180}
