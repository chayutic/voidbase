require('dotenv').config();

const express = require("express");

const app = express();
const PORT = 3000;

// ── IsThereAnyDeal API key ────────────────────────────────────────
const ITAD_KEY = process.env.ITAD_KEY;
// ─────────────────────────────────────────────────────────────────

// ── Jellyfin ──────────────────────────────────────────────────────
const JELLYFIN_URL = process.env.JELLYFIN_URL; // e.g. http://192.168.1.41:8096
const JELLYFIN_KEY = process.env.JELLYFIN_KEY; // API key: Jellyfin Dashboard → API Keys
// ─────────────────────────────────────────────────────────────────

app.use(express.static("public"));
app.use(express.json());

// Valid combinations: 1d/5m, 5d/15m, 1mo/1d, 6mo/1d, 1y/1wk
const RANGE_MAP = {
  "1d":  "5m",
  "5d":  "15m",
  "1mo": "1d",
  "6mo": "1d",
  "1y":  "1wk",
};

app.get("/api/:symbol", async (req, res) => {
  const { symbol } = req.params;
  const range    = RANGE_MAP[req.query.range] ? req.query.range : "1mo";
  const interval = RANGE_MAP[range];
  const url      = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}&includePrePost=false`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept":     "application/json",
      }
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error(`Fetch failed for ${symbol}:`, err.message);
    res.status(500).json({ error: "Fetch failed" });
  }
});

// ── ITAD: search games by title ───────────────────────────────────
// Returns up to 6 results: [{ id, title, appid }, ...]
app.get("/itad/search", async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: "Missing query" });

  try {
    // 1. Get ITAD game IDs and titles
    const itadUrl  = `https://api.isthereanydeal.com/games/search/v1?key=${ITAD_KEY}&title=${encodeURIComponent(q)}&results=6`;
    const itadResp = await fetch(itadUrl, { headers: { "Accept": "application/json" } });
    const itadData = await itadResp.json();
    const games    = Array.isArray(itadData) ? itadData.slice(0, 6) : [];

    // 2. Resolve Steam appids via Steam's storefront search (no key needed)
    const steamUrl  = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=english&cc=TH`;
    const steamResp = await fetch(steamUrl, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" }
    });
    const steamData = await steamResp.json();

    // Build a map of normalized title → appid from Steam results
    const steamMap = new Map();
    (steamData?.items || []).forEach(item => {
      steamMap.set(item.name.toLowerCase().trim(), String(item.id));
    });

    const results = games.map(g => {
      // Try exact match first, then partial match
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
    console.error("ITAD search error:", err.message);
    res.status(500).json({ error: "Search failed" });
  }
});

// ── ITAD: discount % and 90D low % for pinned games ──────────────
// Expects POST body: { ids: ["id1", "id2", ...] }
// Returns: [{ id, discount, low90discount }, ...]
app.post("/itad/prices", async (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: "Missing ids" });

  try {
    const url = `https://api.isthereanydeal.com/games/prices/v3?key=${ITAD_KEY}&country=US&shops=61`;
    const response = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body:    JSON.stringify(ids),
    });
    const data = await response.json();

    const results = (Array.isArray(data) ? data : []).map(item => {
      const best        = item.deals?.[0];
      const cut         = best?.cut ?? 0;
      const regular     = best?.regular?.amount ?? null;
      const storeLowAmt = best?.storeLow?.amount ?? null;
      // Derive 90D low discount % from storeLow price vs regular price
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
    console.error("ITAD prices error:", err.message);
    res.status(500).json({ error: "Price fetch failed" });
  }
});

// ── Steam: real THB price + review summary for a game by App ID ──
// GET /steam/price/:appid
// Returns: { appid, price, currency, reviewDesc, reviewCount }
app.get("/steam/price/:appid", async (req, res) => {
  const { appid } = req.params;

  try {
    const [detailsResp, reviewsResp] = await Promise.all([
      fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=th&filters=price_overview`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
        }
      }),
      fetch(`https://store.steampowered.com/appreviews/${appid}?json=1&language=all&purchase_type=all&num_per_page=0`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
        }
      }),
    ]);

    const detailsData = await detailsResp.json();
    const reviewsData = await reviewsResp.json();

    const appData = detailsData?.[appid];
    if (!appData?.success) return res.json({ appid, price: null, currency: "THB", reviewDesc: null, reviewCount: null });

    const overview    = appData.data?.price_overview;
    const reviewScore = reviewsData?.query_summary;

    res.json({
      appid,
      price:       overview ? overview.final / 100 : null,
      currency:    overview?.currency ?? "THB",
      reviewDesc:  reviewScore?.review_score_desc ?? null,
      reviewCount: reviewScore?.total_reviews      ?? null,
    });
  } catch (err) {
    console.error("Steam price error:", err.message);
    res.status(500).json({ error: "Steam price fetch failed" });
  }
});


// ── Jellyfin: latest movies and episodes ─────────────────────────
// GET /jellyfin/recent
// Returns up to 12 recently-added movies and episodes, sorted by
// DateCreated descending. The client slices to 6.
//
// Each item shape:
//   { id, type, title, year, seriesName, seasonNum, episodeNum, imageTag }
//
// imageTag is the Primary image tag for poster art.
// Construct the image URL on the client:
//   {JELLYFIN_URL}/Items/{id}/Images/Primary?tag={imageTag}&maxHeight=400
app.get("/jellyfin/recent", async (req, res) => {
  if (!JELLYFIN_URL || !JELLYFIN_KEY) {
    return res.status(503).json({ error: "Jellyfin not configured" });
  }

  const MOVIE_SLOTS   = 3;
  const EPISODE_SLOTS = 3;

  try {
    // Fetch latest Movies
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

    // Fetch latest Episodes — deduplicated to one per series server-side
    // Fetch more than needed so we have headroom after deduplication
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

    const [moviesResp, episodesResp] = await Promise.all([
      fetch(moviesUrl,   { headers: { "Accept": "application/json" } }),
      fetch(episodesUrl, { headers: { "Accept": "application/json" } }),
    ]);

    const moviesData   = await moviesResp.json();
    const episodesData = await episodesResp.json();

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

    // Deduplicate episodes: one per series, most recent first
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

    // Movies first, then episodes — fixed slots, no timestamp merge
    res.json([...movies, ...episodes]);
  } catch (err) {
    console.error("Jellyfin recent error:", err.message);
    res.status(500).json({ error: "Jellyfin fetch failed" });
  }
});

// ── Jellyfin: series poster by series ID ──────────────────────────
// GET /jellyfin/poster/:seriesId
// Episodes often lack their own Primary image — fall back to the
// series poster. Returns { imageTag } or { imageTag: null }.
app.get("/jellyfin/poster/:seriesId", async (req, res) => {
  if (!JELLYFIN_URL || !JELLYFIN_KEY) {
    return res.status(503).json({ error: "Jellyfin not configured" });
  }

  try {
    const url  = `${JELLYFIN_URL}/Items/${req.params.seriesId}?` + new URLSearchParams({
      Fields: "ImageTags",
      apikey: JELLYFIN_KEY,
    });
    const resp = await fetch(url, { headers: { "Accept": "application/json" } });
    const data = await resp.json();
    res.json({ imageTag: data.ImageTags?.Primary ?? null });
  } catch (err) {
    console.error("Jellyfin poster error:", err.message);
    res.status(500).json({ imageTag: null });
  }
});


// ── Jellyfin: image proxy ─────────────────────────────────────────
// GET /jellyfin/image/:itemId?tag=xxx
// Proxies poster art so images load outside the local network.
app.get("/jellyfin/image/:itemId", async (req, res) => {
  if (!JELLYFIN_URL || !JELLYFIN_KEY) {
    return res.status(503).end();
  }

  const { itemId } = req.params;
  const { tag }    = req.query;
  if (!tag) return res.status(400).end();

  try {
    const url      = `${JELLYFIN_URL}/Items/${itemId}/Images/Primary?tag=${tag}&maxHeight=400&quality=90&apikey=${JELLYFIN_KEY}`;
    const response = await fetch(url);

    if (!response.ok) return res.status(response.status).end();

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer      = await response.arrayBuffer();

    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=86400"); // cache for 24h
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("Jellyfin image proxy error:", err.message);
    res.status(500).end();
  }
});

app.listen(PORT, () => {
  console.log(`Dashboard running on port ${PORT}`);
});