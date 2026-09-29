require('dotenv').config();

const crypto  = require("crypto");
const express = require("express");

const notesRouter  = require("./lib/notes-routes");
const notesStore   = require("./lib/notes-store");
const opsRouter    = require("./lib/ops-routes");
const publicStatus = require("./lib/public-status");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options":  "nosniff",
    "Referrer-Policy":         "same-origin",
    "Content-Security-Policy": "frame-ancestors 'none'",
  });
  next();
});

// ── Lock 2: /ops refuses proxied requests ──────────────────────
// Caddy and Cloudflare add these headers; a direct LAN or tailnet
// request never has them. The path is matched the way Caddy's `/ops*`
// matches it, a case-insensitive prefix of the decoded path, so the
// two locks cover the same set and not only what the router answers.

// Also the app's last handler: the refusal has to match what any other
// missing path gets, or it tells the caller that something is there.
const notFound = (req, res) => res.status(404).type("text").send("Not found");

const FORWARDED_HEADERS = ["x-forwarded-for", "x-forwarded-host", "forwarded", "cf-connecting-ip"];

function isOpsPath(urlPath) {
  try {
    return decodeURIComponent(urlPath).toLowerCase().startsWith("/ops");
  } catch {
    return true;
  }
}

app.use((req, res, next) => {
  if (FORWARDED_HEADERS.some(h => h in req.headers) && isOpsPath(req.path)) return notFound(req, res);
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

// Static would otherwise serve these pages at a second URL, and the
// notes page around its auth gate.
app.get("/notes.html", (req, res) => res.redirect(301, "/notes"));
app.get("/ops.html",   (req, res) => res.redirect(301, "/ops"));

// Everything else is edited in place and bind-mounted, so it must stay
// revalidated. ETag still means a 304 rather than a re-download.
app.use(express.static("public"));

// Mounted before the global JSON parser so the notes router can apply
// its own, larger body limit.
app.use("/notes", notesAuth, notesRouter);

app.use("/ops", opsRouter);

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

// ── Public status: the homelab's overall state ─────────────────
// Returns: { overall } — ok, degraded, down or unknown.
//
// Registered ahead of /api/:symbol, which would otherwise take this
// path as a Yahoo lookup for a ticker called STATUS.
app.get("/api/status", async (req, res) => {
  res.set("Cache-Control", "public, max-age=60"); // public.json is rewritten every 5 min
  res.json({ overall: await publicStatus.overall() });
});

// ── Markets: Yahoo Finance chart data ──────────────────────────
// Valid combinations: 1d/5m, 5d/15m, 1mo/1h, 6mo/1d, 1y/1wk
const RANGE_MAP = {
  "1d":  "5m",
  "5d":  "15m",
  "1mo": "1h",
  "6mo": "1d",
  "1y":  "1wk",
};

// Yahoo has nothing between 1h and 1d, so 1M asks for hourly and keeps
// the last bar of each 12 hours from the exchange's local midnight:
// midday and close for a stock, every 12 hours for crypto. Returns a
// copy, because the memo hands every caller the same object.
const HALF_DAY_S = 12 * 60 * 60;

function thinToHalfDays(data) {
  const r  = data?.chart?.result?.[0];
  const ts = r?.timestamp;
  const q  = r?.indicators?.quote?.[0];
  if (!ts || !q?.close) return data;

  const offset = r.meta?.gmtoffset ?? 0;
  const bucket = (t) => Math.floor((t + offset) / HALF_DAY_S);
  const keep   = [];
  ts.forEach((t, i) => {
    if (q.close[i] == null) return;
    if (keep.length && bucket(ts[keep.at(-1)]) === bucket(t)) keep[keep.length - 1] = i;
    else keep.push(i);
  });

  const pick  = (arr) => keep.map(i => arr[i]);
  const quote = Object.fromEntries(Object.entries(q).map(([k, arr]) => [k, pick(arr)]));
  return {
    ...data,
    chart: { ...data.chart, result: [{ ...r, timestamp: pick(ts), indicators: { ...r.indicators, quote: [quote] } }] },
  };
}

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
    const data = await fetchJSONMemo(url, 60_000);
    res.json(range === "1mo" ? thinToHalfDays(data) : data);
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
    // The price is the row's main field, so a reviews failure costs only
    // the review column. Caught here, it never reaches the catch below.
    const [detailsData, reviewsData] = await Promise.all([
      fetchJSONMemo(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=th&filters=price_overview`, HOUR_MS),
      fetchJSONMemo(`https://store.steampowered.com/appreviews/${appid}?json=1&language=all&purchase_type=all&num_per_page=0`, HOUR_MS)
        .catch(err => {
          console.error(`Steam reviews error for ${appid}:`, err.message);
          return null;
        }),
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
// group sorted by DateCreated descending. An episode's imageTag is its
// series' poster: its own Primary is a 16:9 still, cropped to 2:3.
const EPISODE_PAGE      = 50;
const EPISODE_PAGES_MAX = 10;

// The newest episode of each of the `slots` most recently added series.
// Pages until enough series turn up: a whole season imported at once
// fills any fixed window with one series and pushes the others out.
async function recentSeriesEpisodes(slots) {
  const seenSeries = new Set();
  const episodes   = [];

  for (let page = 0; page < EPISODE_PAGES_MAX; page++) {
    const data = await fetchJSON(`${JELLYFIN_URL}/Items?` + new URLSearchParams({
      IncludeItemTypes: "Episode",
      SortBy:           "DateCreated,SortName",
      SortOrder:        "Descending",
      StartIndex:       String(page * EPISODE_PAGE),
      Limit:            String(EPISODE_PAGE),
      Recursive:        "true",
      Fields:           "PrimaryImageAspectRatio,ProductionYear,ImageTags,ParentId,SeriesName,SeasonName,SeriesId",
      ImageTypeLimit:   "1",
      EnableImageTypes: "Primary",
      apikey:           JELLYFIN_KEY,
    }));
    const items = data.Items || [];

    for (const item of items) {
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
        imageTag:   item.SeriesId ? item.SeriesPrimaryImageTag ?? null : null,
      });
      if (episodes.length >= slots) return episodes;
    }
    if (items.length < EPISODE_PAGE) break;
  }
  return episodes;
}

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

    const [moviesData, episodes] = await Promise.all([
      fetchJSON(moviesUrl),
      recentSeriesEpisodes(EPISODE_SLOTS),
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

    res.json([...movies, ...episodes]);
  } catch (err) {
    sendFailure(res, err, "Jellyfin recent error", { error: "Jellyfin fetch failed" });
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

app.use(notFound);

// Without this, a malformed JSON body gets finalhandler's HTML page,
// with a stack trace unless NODE_ENV is production.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) console.error("Unhandled error:", err);
  res.status(status).json({ error: status === 500 ? "Server error" : "Bad request" });
});

notesStore.init()
  .then(dir => console.log(`Notes directory: ${dir}`))
  .catch(err => console.error("Notes directory unavailable:", err.message));

// Express 5 hands a bind failure to this callback instead of throwing.
app.listen(PORT, (err) => {
  if (err) throw err;
  console.log(`Dashboard running on port ${PORT}`);
});