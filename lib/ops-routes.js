// ═══════════════════════════════════════════════════════════════
//  OPS ROUTES
// ═══════════════════════════════════════════════════════════════
//
//  Every private page and API lives under this mount, because Caddy
//  refuses `/ops*` and only that prefix. Lock 2 is not here: it sits
//  in server.js ahead of static, since it has to cover every path
//  Caddy's `/ops*` does, not only the ones this router answers.

const express = require("express");
const path    = require("path");
const status  = require("./ops-status");

const router = express.Router();

const PUBLIC_DIR = path.join(__dirname, "..", "public");

// ── Page ───────────────────────────────────────────────────────

router.get("/", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "ops.html"));
});

// ── API ────────────────────────────────────────────────────────

async function answer(res, read) {
  res.set("Cache-Control", "no-store");
  try {
    res.json(await read());
  } catch (err) {
    // An EACCES here means a UGOS permission edit reset status/.
    console.error("status/ unreadable:", err.message);
    res.status(500).json({ error: "status/ unreadable" });
  }
}

router.get("/api/health",  (req, res) => answer(res, () => status.health(req.hostname)));
router.get("/api/updates", (req, res) => answer(res, () => status.updates()));
router.get("/api/recent",  (req, res) => answer(res, () => status.recent()));
router.get("/api/storage", (req, res) => answer(res, () => status.storage()));

module.exports = router;
