// ═══════════════════════════════════════════════════════════════
//  NOTES ROUTES
// ═══════════════════════════════════════════════════════════════
//
//  The page and its API share one mount point so a single auth
//  application can cover both. Nothing here does auth.
//
//  This router carries its own JSON parser with a raised limit, and is
//  mounted ahead of the global one in server.js, because notes bodies
//  can exceed the 100kb default.

const express = require("express");
const path    = require("path");
const store   = require("./notes-store");

const router = express.Router();

router.use(express.json({ limit: "5mb" }));

const PUBLIC_DIR = path.join(__dirname, "..", "public");

/** Translate store errors into status codes. */
function fail(res, err, context) {
  if (err instanceof store.BadIdError)    return res.status(400).json({ error: "Invalid note id" });
  if (err instanceof store.NotFoundError) return res.status(404).json({ error: "Note not found" });

  console.error(`Notes ${context} error:`, err.message);
  return res.status(500).json({ error: "Notes operation failed" });
}

// ── Page ─────────────────────────────────────────────────────────

router.get("/", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "notes.html"));
});

// ── API ──────────────────────────────────────────────────────────

router.get("/api/list", async (req, res) => {
  try {
    res.json(await store.list());
  } catch (err) {
    fail(res, err, "list");
  }
});

router.get("/api/search", async (req, res) => {
  try {
    res.json(await store.search(req.query.q));
  } catch (err) {
    fail(res, err, "search");
  }
});

router.post("/api/note", async (req, res) => {
  try {
    const body = typeof req.body?.body === "string" ? req.body.body : "";
    res.status(201).json(await store.create(body));
  } catch (err) {
    fail(res, err, "create");
  }
});

router.get("/api/note/:id", async (req, res) => {
  try {
    res.json(await store.read(req.params.id));
  } catch (err) {
    fail(res, err, "read");
  }
});

// navigator.sendBeacon can only issue POST, so the editor's
// leaving-the-page safety net cannot use the PUT above. Same handler,
// different verb.
router.post("/api/note/:id", saveHandler);

router.put("/api/note/:id", saveHandler);

async function saveHandler(req, res) {
  if (typeof req.body?.body !== "string") {
    return res.status(400).json({ error: "Expected { body: string }" });
  }
  try {
    res.json(await store.write(req.params.id, req.body.body));
  } catch (err) {
    fail(res, err, "write");
  }
}

router.delete("/api/note/:id", async (req, res) => {
  try {
    await store.remove(req.params.id);
    res.status(204).end();
  } catch (err) {
    fail(res, err, "delete");
  }
});

module.exports = router;
