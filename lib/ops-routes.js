// ═══════════════════════════════════════════════════════════════
//  OPS ROUTES
// ═══════════════════════════════════════════════════════════════
//
//  Every private page and API lives under this mount, because Caddy
//  refuses `/ops*` and only that prefix. Lock 2 is not here: it sits
//  in server.js ahead of static, since it has to cover every path
//  Caddy's `/ops*` does, not only the ones this router answers.

const express = require("express");

const router = express.Router();

// ── Page ───────────────────────────────────────────────────────

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark light" />
  <title>Ops — Voidbase</title>
</head>
<body>
  <h1>Ops</h1>
  <p>Nothing here yet.</p>
</body>
</html>
`;

router.get("/", (req, res) => {
  res.type("html").send(PAGE);
});

module.exports = router;
