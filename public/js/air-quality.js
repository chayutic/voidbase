// ═══════════════════════════════════════════════════════════════
//  AIR QUALITY — header AQI / PM2.5 readout
// ═══════════════════════════════════════════════════════════════
//
//  Reads GET /air/current. The WAQI token lives in .env and is applied
//  server-side; it is never sent to the browser.

import { getJSON, failedState } from "./request.js";

const aqEl     = document.querySelector(".header__aqi");
const aqInfoEl = document.getElementById("aqInfo");
const aqDotEl  = document.querySelector(".header__aqi-dot");

const REFRESH_MS = 10 * 60 * 1000;

let latestRequest = 0;

/**
 * WAQI band → CSS custom property. The bands are WAQI's own
 * (good / moderate / unhealthy for sensitive groups / unhealthy / hazardous).
 */
function aqColorVar(aqi) {
  if (aqi <= 50)  return "--aqi-good";
  if (aqi <= 100) return "--aqi-moderate";
  if (aqi <= 150) return "--aqi-sensitive";
  if (aqi <= 200) return "--aqi-unhealthy";
  return "--aqi-hazardous";
}

async function fetchAirQuality() {
  const seq = ++latestRequest;
  let data = null;
  let error;
  try {
    data = await getJSON("/air/current");
    if (!Number.isFinite(data.aqi)) throw new Error("No AQI in response");
  } catch (err) {
    console.error("Air quality error:", err.message);
    data  = null;
    error = err;
  }

  if (seq !== latestRequest) return;

  aqEl.dataset.state = data ? "ready" : failedState(error, false);

  aqInfoEl.textContent = data ? `AQI ${data.aqi} · PM2.5 ${data.pm25 ?? "N/A"}` : "AQI unavailable";
  if (aqDotEl) aqDotEl.style.background = data ? `var(${aqColorVar(data.aqi)})` : "";
}

export function initAirQuality() {
  if (!aqInfoEl) return;
  fetchAirQuality();
  setInterval(fetchAirQuality, REFRESH_MS);
}
