// ═══════════════════════════════════════════════════════════════
//  NEW ARRIVALS — recently added Jellyfin media
// ═══════════════════════════════════════════════════════════════
//
//  GET /jellyfin/recent returns three movies and three episodes
//  (deduplicated to one per series server-side). Episodes frequently
//  have no Primary image of their own, so those fall back to the series
//  poster via GET /jellyfin/poster/:seriesId.
//
//  Poster images route through the /jellyfin/image/ proxy so they load
//  from outside the LAN. Card *links* use JELLYFIN_BASE directly and so
//  only resolve on the local network or over Tailscale — see config.js.

import { JELLYFIN_BASE } from "./config.js";

const ARRIVALS_LIMIT = 6;

const arrivalsGrid = document.getElementById("arrivalsGrid");

function buildImageUrl(itemId, imageTag) {
  if (!imageTag) return null;
  return `/jellyfin/image/${itemId}?tag=${imageTag}`;
}

function buildItemUrl(itemId) {
  return `${JELLYFIN_BASE}/web/index.html#!/details?id=${itemId}`;
}

function padNum(n) {
  return String(n).padStart(2, "0");
}

async function resolveEpisodePoster(item) {
  // If episode has its own poster, use it
  if (item.imageTag) {
    return { id: item.id, tag: item.imageTag };
  }
  // Otherwise fall back to series poster via proxy
  if (!item.seriesId) return { id: item.id, tag: null };
  try {
    const res  = await fetch(`/jellyfin/poster/${item.seriesId}`);
    const data = await res.json();
    return { id: item.seriesId, tag: data.imageTag ?? null };
  } catch {
    return { id: item.id, tag: null };
  }
}

function createArrivalCard(item, posterInfo) {
  const a = document.createElement("a");
  a.className = "arrivals__card";
  a.href      = buildItemUrl(item.id);
  a.target    = "_blank";
  a.rel       = "noopener noreferrer";

  // Poster
  const imgWrap = document.createElement("div");
  imgWrap.className = "arrivals__poster";

  const imgUrl = buildImageUrl(posterInfo.id, posterInfo.tag);
  if (imgUrl) {
    const img   = document.createElement("img");
    img.src     = imgUrl;
    img.alt     = item.type === "Movie" ? item.title : (item.seriesName ?? item.title);
    img.loading = "lazy";
    img.draggable = false;
    imgWrap.appendChild(img);
  } else {
    imgWrap.classList.add("arrivals__poster--placeholder");
  }

  // Info block
  const info = document.createElement("div");
  info.className = "arrivals__info";

  if (item.type === "Movie") {
    const title = document.createElement("span");
    title.className   = "arrivals__title";
    title.textContent = item.title;

    const year = document.createElement("span");
    year.className   = "arrivals__meta";
    year.textContent = item.year ?? "—";

    info.appendChild(title);
    info.appendChild(year);
  } else {
    // Episode
    const seriesTitle = document.createElement("span");
    seriesTitle.className   = "arrivals__title";
    seriesTitle.textContent = item.seriesName ?? item.title;

    const meta = document.createElement("span");
    meta.className = "arrivals__meta";
    const ep = (item.seasonNum != null && item.episodeNum != null)
      ? `S${padNum(item.seasonNum)}·E${padNum(item.episodeNum)}`
      : "";
    meta.textContent = [item.year, ep].filter(Boolean).join("  ");

    info.appendChild(seriesTitle);
    info.appendChild(meta);
  }

  a.appendChild(imgWrap);
  a.appendChild(info);
  return a;
}

function createLibraryCard() {
  const div = document.createElement("div");
  div.className = "arrivals__card arrivals__card--library";

  div.innerHTML = `
    <a class="arrivals__library-link" href="${JELLYFIN_BASE}" target="_blank" rel="noopener noreferrer">
      <svg class="arrivals__library-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9"/>
        <polyline points="12 8 16 12 12 16"/>
        <line x1="8" y1="12" x2="16" y2="12"/>
      </svg>
      <span class="arrivals__library-label">Go to<br>Library</span>
    </a>
    <div class="arrivals__library-divider"></div>
    <a class="arrivals__library-link" href="https://watch.voidport.com" target="_blank" rel="noopener noreferrer">
      <img class="arrivals__library-favicon" src="https://voidport.com/content/images/size/w256h256/2026/02/voidport-icon-bw-whitebg-roundedcorner-512px.png" alt="" aria-hidden="true">
      <span class="arrivals__library-label">Watch on Voidport</span>
    </a>`;

  return div;
}

async function fetchArrivals() {
  if (!arrivalsGrid) return;

  try {
    const res   = await fetch("/jellyfin/recent");
    const items = await res.json();

    if (!Array.isArray(items)) throw new Error("Bad response");

    const top = items.slice(0, ARRIVALS_LIMIT);

    // Resolve episode posters in parallel
    const posterInfos = await Promise.all(
      top.map(item =>
        item.type === "Episode"
          ? resolveEpisodePoster(item)
          : Promise.resolve({ id: item.id, tag: item.imageTag })
      )
    );

    arrivalsGrid.innerHTML = "";
    top.forEach((item, i) => {
      arrivalsGrid.appendChild(createArrivalCard(item, posterInfos[i]));
    });
    arrivalsGrid.appendChild(createLibraryCard());

  } catch (err) {
    console.error("Arrivals fetch error:", err);
    arrivalsGrid.innerHTML = `<div class="arrivals__error">Could not load recent media.</div>`;
  }
}

export function initArrivals() {
  if (!arrivalsGrid) return;
  fetchArrivals();
}
