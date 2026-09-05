// ═══════════════════════════════════════════════════════════════
//  NOTES API — thin wrappers over /notes/api
// ═══════════════════════════════════════════════════════════════
//
//  Every call throws on a non-2xx so callers can handle failure in one
//  place. Once Cloudflare Access is in front of /notes, an expired
//  session shows up here as a redirect to the login page, which fetch
//  reports as an opaque failure — hence the explicit ok check.

const BASE = "/notes/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch { /* non-JSON error body */ }
    throw new Error(`${res.status} ${detail}`);
  }

  return res.status === 204 ? null : res.json();
}

function jsonBody(payload) {
  return {
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  };
}

/** All notes, newest first. Summaries only — no bodies. */
export function listNotes() {
  return request("/list");
}

/** One note, including its body. */
export function readNote(id) {
  return request(`/note/${id}`);
}

/** Create a note. Returns its summary, including the new id. */
export function createNote(body = "") {
  return request("/note", { method: "POST", ...jsonBody({ body }) });
}

/** Overwrite a note. Returns the updated summary. */
export function saveNote(id, body) {
  return request(`/note/${id}`, { method: "PUT", ...jsonBody({ body }) });
}

/** Full-text search across titles and bodies. Empty query returns []. */
export function searchNotes(query) {
  return request(`/search?q=${encodeURIComponent(query)}`);
}

export function deleteNote(id) {
  return request(`/note/${id}`, { method: "DELETE" });
}
