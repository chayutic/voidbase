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
  if (err instanceof store.BadIdError)    return res.status(400).json({ error: err.detail ?? "Invalid note id" });
  if (err instanceof store.NotFoundError) return res.status(404).json({ error: err.detail ?? "Note not found" });
  if (err instanceof store.ConflictError) return res.status(409).json({ error: err.detail ?? "Note changed elsewhere" });

  console.error(`Notes ${context} error:`, err.message);
  return res.status(500).json({ error: "Notes operation failed" });
}

// ── Page ───────────────────────────────────────────────────────

router.get("/", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "notes.html"));
});

// ── API ────────────────────────────────────────────────────────

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
    res.status(201).json(await store.create(body, req.body?.folder ?? ""));
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
    const base = typeof req.body.base === "string" ? req.body.base : null;
    res.json(await store.write(req.params.id, req.body.body, base));
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

router.post("/api/note/:id/move", async (req, res) => {
  try {
    res.json(await store.move(req.params.id, req.body?.folder ?? ""));
  } catch (err) {
    fail(res, err, "move");
  }
});

router.put("/api/note/:id/pin", async (req, res) => {
  if (typeof req.body?.pinned !== "boolean") {
    return res.status(400).json({ error: "Expected { pinned: boolean }" });
  }
  try {
    res.json({ pins: await store.setPinned(req.params.id, req.body.pinned) });
  } catch (err) {
    fail(res, err, "pin");
  }
});

router.put("/api/pins", async (req, res) => {
  try {
    res.json({ pins: await store.orderPins(req.body?.pins) });
  } catch (err) {
    fail(res, err, "pin order");
  }
});

router.post("/api/folder", async (req, res) => {
  try {
    res.status(201).json(await store.createFolder(req.body?.name));
  } catch (err) {
    fail(res, err, "folder create");
  }
});

router.put("/api/folder", async (req, res) => {
  try {
    res.json(await store.renameFolder(req.body?.from, req.body?.to));
  } catch (err) {
    fail(res, err, "folder rename");
  }
});

router.delete("/api/folder", async (req, res) => {
  try {
    await store.removeFolder(req.body?.name);
    res.status(204).end();
  } catch (err) {
    fail(res, err, "folder delete");
  }
});

module.exports = router;
