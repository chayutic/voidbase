require('dotenv').config();

const crypto  = require("crypto");
const express = require("express");

const notesRouter = require("./lib/notes-routes");
const notesStore  = require("./lib/notes-store");

const app = express();
const PORT = 3000;

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options":  "nosniff",
    "Referrer-Policy":         "same-origin",
    "Content-Security-Policy": "frame-ancestors 'none'",
  });
  next();
});

// ── IsThereAnyDeal API key ─────────────────────────────────────
const ITAD_KEY = process.env.ITAD_KEY;

// ── Air quality (WAQI) ─────────────────────────────────────────
const AQ_TOKEN = process.env.AQ_TOKEN;
const AQ_CITY  = process.env.AQ_CITY || "Bangkok";

// ── Jellyfin ───────────────────────────────────────────────────
const JELLYFIN_URL = process.env.JELLYFIN_URL; // e.g. http://192.168.1.41:8096
const JELLYFIN_KEY = process.env.JELLYFIN_KEY; // API key: Jellyfin Dashboard → API Keys
const JELLYFIN_ID_RE = /^[0-9a-f]{32}$/;       // item ids and image tags alike

// ── Upstream fetching ──────────────────────────────────────────

// Yahoo and Steam both answer differently, or not at all, to a default
// Node user agent. One string for all three upstreams; there is no
// reason for them to disagree.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Without a deadline an upstream that accepts the connection and then
// says nothing holds the request until Node's own timeout — minutes,
// during which the browser tile just sits empty.
const UPSTREAM_TIMEOUT_MS = 10000;

function fetchUpstream(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: { "Accept": "application/json", "User-Agent": UA, ...options.headers },
    signal:  AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
}

class UpstreamError extends Error {
  constructor(status, message, upstreamStatus = null) {
    super(message);
    this.status         = status;
    this.upstreamStatus = upstreamStatus;
  }
}

// Everything that can go wrong on the upstream's side, body read
// included, leaves here as an UpstreamError: 504 for the deadline, 502
// for the rest. Anything else a route throws is its own bug, and stays 500.
async function upstream(url, options, read) {
  let resp;
  try {
    resp = await fetchUpstream(url, options);
    if (resp.ok) return await read(resp);
  } catch (err) {
    throw new UpstreamError(err.name === "TimeoutError" ? 504 : 502, err.message);
  }
  throw new UpstreamError(502, `upstream answered ${resp.status}`, resp.status);
}

const fetchJSON = (url, options) => upstream(url, options, resp => resp.json());

// Every proxy route is public, so repeated identical requests would each
// spend the upstream's quota. Only successes are kept: a cached failure
// would outlive a transient 502 by the full TTL.
const MEMO_MAX = 500;
const HOUR_MS  = 60 * 60_000;
const memo     = new Map();

async function fetchJSONMemo(url, ttlMs, isGood = () => true) {
  const hit = memo.get(url);
  if (hit && hit.expires > Date.now()) return hit.data;

  const data = await fetchJSON(url);
  if (isGood(data)) {
    memo.delete(url);
    if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value);
    memo.set(url, { data, expires: Date.now() + ttlMs });
  }
  return data;
}

function sendFailure(res, err, label, body) {
  console.error(`${label}:`, err.message);
  res.status(err instanceof UpstreamError ? err.status : 500).json(body);
}

// ── Notes auth ─────────────────────────────────────────────────
// The only gated surface — the rest of the site stays public. A single
// shared password is not a substitute for real auth.
const NOTES_PASSWORD = process.env.NOTES_PASSWORD;

// Digests are always 32 bytes, so the comparison cannot leak the
// password's length the way a length check before it would.
const digest = (text) => crypto.createHash("sha256").update(text).digest();
const NOTES_DIGEST = NOTES_PASSWORD ? digest(NOTES_PASSWORD) : null;

if (!NOTES_DIGEST) console.error("Notes: no authentication configured — all access is blocked");

function notesAuth(req, res, next) {
  if (!NOTES_DIGEST) {
    return res.status(503).type("text").send(
      "Notes are unavailable: no authentication is configured, so all access is blocked."
    );
  }

  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");

  if (scheme === "Basic" && encoded) {
    const decoded  = Buffer.from(encoded, "base64").toString("utf8");
    const password = decoded.slice(decoded.indexOf(":") + 1);

    if (crypto.timingSafeEqual(digest(password), NOTES_DIGEST)) return next();
  }

  res.set("WWW-Authenticate", 'Basic realm="Notes"');
  res.status(401).send("Authentication required");
}

// Vendored libraries are version-pinned in their filename, so the bytes
// at a given path never change. express.static's default is max-age=0,
// which costs a revalidation round-trip on every page load — over the
// tunnel that is real latency for no benefit.
app.use("/js/vendor", express.static("public/js/vendor", {
  maxAge:    "1y",
  immutable: true,
}));

// Static would otherwise serve the notes page around the auth gate.
app.get("/notes.html", (req, res) => res.redirect(301, "/notes"));

// Everything else is edited in place and bind-mounted, so it must stay
// revalidated. ETag still means a 304 rather than a re-download.
app.use(express.static("public"));

// Mounted before the global JSON parser so the notes router can apply
// its own, larger body limit.
app.use("/notes", notesAuth, notesRouter);

app.use(express.json());

// ── Air quality: AQI + PM2.5 for the configured city ───────────
// Returns: { aqi, pm25 } — the token stays server-side.
//
// Namespaced under /air rather than /api to stay clear of the
// /api/:symbol proxy below, which would otherwise match this path and
// happily return quotes for the NYSE ticker AIR.
app.get("/air/current", async (req, res) => {
  if (!AQ_TOKEN) return res.status(503).json({ error: "Air quality not configured" });

  try {
    const url  = `https://api.waqi.info/feed/${encodeURIComponent(AQ_CITY)}/?token=${encodeURIComponent(AQ_TOKEN)}`;
    const data = await fetchJSONMemo(url, 5 * 60_000, d => d?.status === "ok");

    if (data?.status !== "ok") return res.status(502).json({ error: "Upstream error" });

    res.set("Cache-Control", "public, max-age=300"); // AQI updates hourly at best
    res.json({
      aqi:  Number.isFinite(data.data?.aqi) ? data.data.aqi : null,
      pm25: data.data?.iaqi?.pm25?.v ?? null,
    });
  } catch (err) {
    sendFailure(res, err, "Air quality error", { error: "Air quality fetch failed" });
  }
});

// Valid combinations: 1d/5m, 5d/15m, 1mo/1d, 6mo/1d, 1y/1wk
const RANGE_MAP = {
  "1d":  "5m",
  "5d":  "15m",
  "1mo": "1d",
  "6mo": "1d",
  "1y":  "1wk",
};

// Covers indices (^DJI), crypto (BTC-USD), share classes (BRK.B) and
// forex (THB=X).
const SYMBOL_RE = /^[A-Za-z0-9.^=-]{1,20}$/;

app.get("/api/:symbol", async (req, res) => {
  const { symbol } = req.params;
  const asked      = req.query.range ?? "1mo";
  if (!SYMBOL_RE.test(symbol) || typeof asked !== "string") {
    return res.status(400).json({ error: "Bad request" });
  }

  const range    = Object.hasOwn(RANGE_MAP, asked) ? asked : "1mo";
  const interval = RANGE_MAP[range];
  // Encoded: the symbol is whatever the client typed into the ticker
  // edit field, and it is being spliced into an upstream URL path.
  const url      = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;

  try {
    res.json(await fetchJSONMemo(url, 60_000));
  } catch (err) {
    if (err.upstreamStatus === 404) return res.status(404).json({ error: "Unknown symbol" });
    sendFailure(res, err, `Fetch failed for ${symbol}`, { error: "Fetch failed" });
  }
});

// ── ITAD: search games by title ────────────────────────────────
// Returns up to 6 results: [{ id, title, appid }, ...]
app.get("/itad/search", async (req, res) => {
  if (!ITAD_KEY) return res.status(503).json({ error: "Game deals not configured" });

  const q = req.query.q;
  if (!q || typeof q !== "string") return res.status(400).json({ error: "Missing query" });

  try {
    // Steam is not optional: deals.js records appid once, at pin time,
    // so a result without one would pin a game that never gets a price.
    const itadUrl  = `https://api.isthereanydeal.com/games/search/v1?key=${encodeURIComponent(ITAD_KEY)}&title=${encodeURIComponent(q)}&results=6`;
    const steamUrl = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=english&cc=TH`;
    const [itadData, steamData] = await Promise.all([
      fetchJSONMemo(itadUrl,  HOUR_MS),
      fetchJSONMemo(steamUrl, HOUR_MS),
    ]);
    const games = Array.isArray(itadData) ? itadData.slice(0, 6) : [];

    const steamMap = new Map();
    (steamData?.items || []).forEach(item => {
      steamMap.set(item.name.toLowerCase().trim(), String(item.id));
    });

    const results = games.map(g => {
      const titleLower = g.title.toLowerCase().trim();
      let appid = steamMap.get(titleLower) ?? null;
      if (!appid) {
        for (const [steamTitle, id] of steamMap) {
          if (steamTitle.includes(titleLower) || titleLower.includes(steamTitle)) {
            appid = id; break;
          }
        }
      }
      return { id: g.id, title: g.title, appid };
    });

    res.json(results);
  } catch (err) {
    sendFailure(res, err, "ITAD search error", { error: "Search failed" });
  }
});

// ── ITAD: discount % and 90D low % for pinned games ────────────
// Expects POST body: { ids: ["id1", "id2", ...] }
// Returns: [{ id, discount, low90discount }, ...]

// deals.js stops offering + at the same count. Raise both together, or
// the client can pin a list this route refuses outright.
const MAX_PINS = 20;

app.post("/itad/prices", async (req, res) => {
  if (!ITAD_KEY) return res.status(503).json({ error: "Game deals not configured" });

  const ids = req.body?.ids;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: "Missing ids" });
  if (ids.length > MAX_PINS || !ids.every(id => typeof id === "string")) {
    return res.status(400).json({ error: "Bad ids" });
  }

  try {
    const url  = `https://api.isthereanydeal.com/games/prices/v3?key=${encodeURIComponent(ITAD_KEY)}&country=US&shops=61`;
    const data = await fetchJSON(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(ids),
    });

    const results = (Array.isArray(data) ? data : []).map(item => {
      const best        = item.deals?.[0];
      const cut         = best?.cut ?? 0;
      const regular     = best?.regular?.amount ?? null;
      const storeLowAmt = best?.storeLow?.amount ?? null;
      const storeLowCut = (storeLowAmt !== null && regular) 
        ? -Math.round((1 - storeLowAmt / regular) * 100)
        : null;
      return {
        id:            item.id,
        discount:      -cut,
        low90discount: storeLowCut,
      };
    });

    res.json(results);
  } catch (err) {
    sendFailure(res, err, "ITAD prices error", { error: "Price fetch failed" });
  }
});

// ── Steam: THB price and review summary ────────────────────────
// Returns: { appid, price, currency, reviewDesc, reviewCount }
app.get("/steam/price/:appid", async (req, res) => {
  const { appid } = req.params;
  if (!/^\d{1,10}$/.test(appid)) return res.status(400).json({ error: "Bad appid" });

  try {
    const [detailsData, reviewsData] = await Promise.all([
      fetchJSONMemo(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=th&filters=price_overview`, HOUR_MS),
      fetchJSONMemo(`https://store.steampowered.com/appreviews/${appid}?json=1&language=all&purchase_type=all&num_per_page=0`, HOUR_MS),
    ]);

    const appData = detailsData?.[appid];
    if (!appData?.success) return res.json({ appid, price: null, currency: "THB", reviewDesc: null, reviewCount: null });

    const overview    = appData.data?.price_overview;
    const reviewScore = reviewsData?.query_summary;

    res.json({
      appid,
      price:       overview ? overview.final / 100 : null,
      currency:    overview?.currency ?? "THB",
      reviewDesc:  reviewScore?.review_score_desc ?? null,
      reviewCount: Number.isFinite(reviewScore?.total_reviews) ? reviewScore.total_reviews : null,
    });
  } catch (err) {
    sendFailure(res, err, "Steam price error", { error: "Steam price fetch failed" });
  }
});


// ── Jellyfin: latest movies and episodes ───────────────────────
// Returns MOVIE_SLOTS movies followed by EPISODE_SLOTS episodes, each
// group sorted by DateCreated descending.
app.get("/jellyfin/recent", async (req, res) => {
  if (!JELLYFIN_URL || !JELLYFIN_KEY) {
    return res.status(503).json({ error: "Jellyfin not configured" });
  }

  const MOVIE_SLOTS   = 3;
  const EPISODE_SLOTS = 3;

  try {
    const moviesUrl = `${JELLYFIN_URL}/Items?` + new URLSearchParams({
      IncludeItemTypes: "Movie",
      SortBy:           "DateCreated,SortName",
      SortOrder:        "Descending",
      Limit:            String(MOVIE_SLOTS),
      Recursive:        "true",
      Fields:           "PrimaryImageAspectRatio,ProductionYear,ImageTags",
      ImageTypeLimit:   "1",
      EnableImageTypes: "Primary",
      apikey:           JELLYFIN_KEY,
    });

    // Limit sits far above EPISODE_SLOTS to leave headroom for the
    // one-per-series deduplication below.
    const episodesUrl = `${JELLYFIN_URL}/Items?` + new URLSearchParams({
      IncludeItemTypes: "Episode",
      SortBy:           "DateCreated,SortName",
      SortOrder:        "Descending",
      Limit:            "30",
      Recursive:        "true",
      Fields:           "PrimaryImageAspectRatio,ProductionYear,ImageTags,ParentId,SeriesName,SeasonName,SeriesId",
      ImageTypeLimit:   "1",
      EnableImageTypes: "Primary",
      apikey:           JELLYFIN_KEY,
    });

    const [moviesData, episodesData] = await Promise.all([
      fetchJSON(moviesUrl),
      fetchJSON(episodesUrl),
    ]);

    const movies = (moviesData.Items || []).slice(0, MOVIE_SLOTS).map(item => ({
      id:         item.Id,
      type:       "Movie",
      title:      item.Name,
      year:       item.ProductionYear ?? null,
      seriesName: null,
      seasonNum:  null,
      episodeNum: null,
      seriesId:   null,
      imageTag:   item.ImageTags?.Primary ?? null,
    }));

    const seenSeries = new Set();
    const episodes   = [];
    for (const item of (episodesData.Items || [])) {
      const sid = item.SeriesId ?? item.Id;
      if (seenSeries.has(sid)) continue;
      seenSeries.add(sid);
      episodes.push({
        id:         item.Id,
        type:       "Episode",
        title:      item.Name,
        year:       item.ProductionYear ?? null,
        seriesName: item.SeriesName ?? null,
        seasonNum:  item.ParentIndexNumber ?? null,
        episodeNum: item.IndexNumber ?? null,
        seriesId:   item.SeriesId ?? null,
        imageTag:   item.ImageTags?.Primary ?? null,
      });
      if (episodes.length >= EPISODE_SLOTS) break;
    }

    res.json([...movies, ...episodes]);
  } catch (err) {
    sendFailure(res, err, "Jellyfin recent error", { error: "Jellyfin fetch failed" });
  }
});

// ── Jellyfin: series poster by series ID ───────────────────────
// Episodes often lack their own Primary image — fall back to the
// series poster. Returns { imageTag } or { imageTag: null }.
app.get("/jellyfin/poster/:seriesId", async (req, res) => {
  if (!JELLYFIN_URL || !JELLYFIN_KEY) {
    return res.status(503).json({ error: "Jellyfin not configured" });
  }
  // arrivals.js falls back to a placeholder on { imageTag: null }, error or not.
  if (!JELLYFIN_ID_RE.test(req.params.seriesId)) return res.status(400).json({ imageTag: null });

  try {
    // The /Items collection filtered by id, not /Items/{id}. The latter
    // answers 400 "Error processing request." on this server for every
    // id, valid or not, so every episode missing its own artwork fell
    // through arrivals.js's catch to a placeholder rather than the
    // series poster this route exists to supply.
    const url  = `${JELLYFIN_URL}/Items?` + new URLSearchParams({
      ids:              req.params.seriesId,
      Fields:           "ImageTags",
      ImageTypeLimit:   "1",
      EnableImageTypes: "Primary",
      apikey:           JELLYFIN_KEY,
    });
    const data = await fetchJSON(url);
    res.json({ imageTag: data.Items?.[0]?.ImageTags?.Primary ?? null });
  } catch (err) {
    sendFailure(res, err, "Jellyfin poster error", { imageTag: null });
  }
});


// ── Jellyfin: image proxy ──────────────────────────────────────
// Proxies poster art so images load outside the local network.
app.get("/jellyfin/image/:itemId", async (req, res) => {
  if (!JELLYFIN_URL || !JELLYFIN_KEY) {
    return res.status(503).end();
  }

  // This route is public while the key it carries is not. Encoding alone
  // is not enough: `..` survives encodeURIComponent and the URL parser
  // then resolves it, walking the keyed request out of /Items/{id}.
  const { itemId } = req.params;
  const { tag }    = req.query;
  if (!JELLYFIN_ID_RE.test(itemId) || typeof tag !== "string" || !JELLYFIN_ID_RE.test(tag)) {
    return res.status(400).end();
  }

  try {
    const url   = `${JELLYFIN_URL}/Items/${itemId}/Images/Primary?` + new URLSearchParams({
      tag:       tag,
      maxHeight: "400",
      quality:   "90",
      apikey:    JELLYFIN_KEY,
    });
    const image = await upstream(url, { headers: { "Accept": "image/*" } }, async resp => ({
      type: resp.headers.get("content-type") || "image/jpeg",
      body: Buffer.from(await resp.arrayBuffer()),
    }));

    res.set("Content-Type", image.type);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(image.body);
  } catch (err) {
    console.error("Jellyfin image proxy error:", err.message);
    res.status(err instanceof UpstreamError ? err.status : 500).end();
  }
});

notesStore.init()
  .then(dir => console.log(`Notes directory: ${dir}`))
  .catch(err => console.error("Notes directory unavailable:", err.message));

app.listen(PORT, () => {
  console.log(`Dashboard running on port ${PORT}`);
});