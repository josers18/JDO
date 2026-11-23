const SECRET_KEYS =
  /^(access_token|refresh_token|client_secret|id_token|subject_token|token|password|assertion|signature|credentials|api[_-]?key|accessKey|secretKey|signingKey|privateKey|clientSecret|accessToken|refreshToken|presignedUrls?|secretAccessKey|securityToken|authorization)$/i;
const SIGNED_PARAMS = /^(X-Amz-Signature|X-Goog-Signature|sig)$/i;

export function maskToken(value: string): string {
  return value.length <= 12 ? "••••" : `${value.slice(0, 6)}…${value.slice(-4)}`;
}

// Everything recorded on the wire is masked here so the Wire tab is always safe to show on screen.
export function maskHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (/^authorization$/i.test(k)) {
      const bearer = /^(Bearer\s+)(.+)$/i.exec(v);
      out[k] = bearer ? bearer[1] + maskToken(bearer[2]) : "••••";
    } else if (/^(set-cookie|cookie)$/i.test(k) || SECRET_KEYS.test(k)) out[k] = "••••";
    else out[k] = /^https?:\/\//i.test(v) ? maskUrl(v) : v;
  }
  return out;
}

export function maskBody(body: unknown): unknown {
  if (Array.isArray(body)) return body.map(maskBody);
  if (body && typeof body === "object") {
    const named = body as Record<string, unknown>;
    const secretValue = [named.name, named.key].some((name) => typeof name === "string" && SECRET_KEYS.test(name));
    return Object.fromEntries(
      Object.entries(body).map(([k, v]) => [
        k,
        SECRET_KEYS.test(k) || (secretValue && k === "value")
          ? typeof v === "string"
            ? maskToken(v)
            : "••••"
          : maskBody(v),
      ]),
    );
  }
  return typeof body === "string" && /^https?:\/\//i.test(body) ? maskUrl(body) : body;
}

const decoded = (v: string) => {
  try {
    return decodeURIComponent(v.replace(/\+/g, " "));
  } catch {
    return v;
  }
};

// Secrets sent as query parameters (OAuth flows that use params, like the Python connector's).
export function maskUrl(url: string): string {
  return url.replace(/([?&])([^=&#]+)=([^&#]*)/g, (m, sep: string, k: string, v: string) =>
    SECRET_KEYS.test(k) || SIGNED_PARAMS.test(k) ? `${sep}${k}=${maskToken(decoded(v))}` : m,
  );
}
