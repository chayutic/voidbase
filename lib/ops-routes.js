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

router.get("/api/health", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    res.json(await status.health());
  } catch (err) {
    // An EACCES here means a UGOS permission edit reset status/.
    console.error("status/ unreadable:", err.message);
    res.status(500).json({ error: "status/ unreadable" });
  }
});

module.exports = router;
