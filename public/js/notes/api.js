// ═══════════════════════════════════════════════════════════════
//  NOTES API — thin wrappers over /notes/api
// ═══════════════════════════════════════════════════════════════
//
//  Every call throws on a non-2xx so callers handle failure in one
//  place. An expired auth session arrives as a redirect or a 401, not
//  as a network error, which is why the ok check has to be explicit.

const BASE = "/notes/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch { /* non-JSON error body */ }
    const err = new Error(`${res.status} ${detail}`);
    err.status = res.status;
    throw err;
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

/**
 * Overwrite a note. `base` is the mtime this copy was loaded or last
 * saved at; the server answers 409 if the file has moved on since.
 * Returns the updated summary.
 */
export function saveNote(id, body, base) {
  return request(`/note/${id}`, { method: "PUT", ...jsonBody({ body, base }) });
}

/** Full-text search across titles and bodies. Empty query returns []. */
export function searchNotes(query) {
  return request(`/search?q=${encodeURIComponent(query)}`);
}

export function deleteNote(id) {
  return request(`/note/${id}`, { method: "DELETE" });
}
