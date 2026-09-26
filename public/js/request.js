// ═══════════════════════════════════════════════════════════════
//  REQUEST — fetch JSON from a proxy route, and name the failure
// ═══════════════════════════════════════════════════════════════
//
//  server.js answers each class of failure with its own status and a
//  JSON body. This turns them into the three kinds a feature can show
//  differently:
//
//    invalid       400, 404 — the input was wrong
//    unavailable   502, 504, any other failure — try again later
//    unconfigured  503 — the route has no key, so it never will work

class RequestError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

function kindOf(res) {
  // Only a route's own answer is JSON. A plain 404 is a route that
  // doesn't exist, and Caddy and Cloudflare send 503s of their own
  // while the app is down.
  if (!res.headers.get("content-type")?.startsWith("application/json")) return "unavailable";
  if (res.status === 400 || res.status === 404) return "invalid";
  if (res.status === 503) return "unconfigured";
  return "unavailable";
}

/** The parsed body, or a RequestError carrying its kind. */
export async function getJSON(url, init) {
  let res;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new RequestError("unavailable", err.message);
  }

  if (!res.ok) throw new RequestError(kindOf(res), `HTTP ${res.status}`);

  try {
    return await res.json();
  } catch (err) {
    throw new RequestError("unavailable", err.message);
  }
}
