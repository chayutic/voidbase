// ═══════════════════════════════════════════════════════════════
//  NEW ARRIVALS — recently added Jellyfin media
// ═══════════════════════════════════════════════════════════════
//
//  Episodes frequently have no Primary image of their own, so those
//  fall back to the series poster via GET /jellyfin/poster/:seriesId.
//
//  Poster images route through the /jellyfin/image/ proxy so they load
//  from outside the LAN. Card *links* use JELLYFIN_BASE directly and so
//  only resolve on the local network or over Tailscale — see config.js.

import { JELLYFIN_BASE } from "./config.js";

const ARRIVALS_LIMIT = 6;

const arrivalsGrid = document.getElementById("arrivalsGrid");

function buildImageUrl(itemId, imageTag) {
  return `/jellyfin/image/${encodeURIComponent(itemId)}?tag=${encodeURIComponent(imageTag)}`;
}

function buildItemUrl(itemId) {
  return `${JELLYFIN_BASE}/web/index.html#!/details?id=${itemId}`;
}

function padNum(n) {
  return String(n).padStart(2, "0");
}

async function fetchSeriesPosterTag(seriesId) {
  try {
    const res  = await fetch(`/jellyfin/poster/${encodeURIComponent(seriesId)}`);
    const data = await res.json();
    return data.imageTag ?? null;
  } catch {
    return null;
  }
}

function setPoster(imgWrap, id, tag, alt) {
  const img   = document.createElement("img");
  img.src     = buildImageUrl(id, tag);
  img.alt     = alt;
  img.loading = "lazy";
  img.draggable = false;
  imgWrap.classList.remove("arrivals__poster--placeholder");
  imgWrap.appendChild(img);
}

function createArrivalCard(item) {
  const a = document.createElement("a");
  a.className = "arrivals__card";
  a.href      = buildItemUrl(item.id);
  a.target    = "_blank";
  a.rel       = "noopener noreferrer";

  const imgWrap = document.createElement("div");
  imgWrap.className = "arrivals__poster";

  const alt = item.type === "Movie" ? item.title : (item.seriesName ?? item.title);
  if (item.imageTag) {
    setPoster(imgWrap, item.id, item.imageTag, alt);
  } else {
    imgWrap.classList.add("arrivals__poster--placeholder");
    if (item.type === "Episode" && item.seriesId) {
      fetchSeriesPosterTag(item.seriesId).then(tag => {
        if (tag) setPoster(imgWrap, item.seriesId, tag, alt);
      });
    }
  }

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
      <svg class="arrivals__library-icon" viewBox="119.4 -11.6 191 191" fill="currentColor" aria-hidden="true">
        <circle cx="214.906" cy="83.938" r="71.5" fill="none" stroke="currentColor" stroke-width="16"/>
        <path fill-rule="evenodd" d="M214.982,25.321A58.519,58.519,0,1,1,156.463,83.84,58.519,58.519,0,0,1,214.982,25.321ZM293.448,5.392c6.748,6.747-22.946,47.38-66.322,90.756s-84.008,73.069-90.756,66.322,22.946-47.381,66.322-90.756S286.7-1.356,293.448,5.392Z"/>
      </svg>
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

    arrivalsGrid.innerHTML = "";
    items.slice(0, ARRIVALS_LIMIT).forEach(item => {
      arrivalsGrid.appendChild(createArrivalCard(item));
    });

  } catch (err) {
    console.error("Arrivals fetch error:", err);
    arrivalsGrid.innerHTML = `<div class="arrivals__error">Could not load recent media.</div>`;
  }
  arrivalsGrid.appendChild(createLibraryCard());
}

export function initArrivals() {
  if (!arrivalsGrid) return;
  fetchArrivals();
}
