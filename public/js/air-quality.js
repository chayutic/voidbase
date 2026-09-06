// ═══════════════════════════════════════════════════════════════
//  AIR QUALITY — header AQI / PM2.5 readout
// ═══════════════════════════════════════════════════════════════
//
//  Reads GET /air/current. The WAQI token lives in .env and is applied
//  server-side; it is never sent to the browser.

const aqInfoEl = document.getElementById("aqInfo");
const aqDotEl  = document.querySelector(".header__aqi-dot");

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

export async function initAirQuality() {
  if (!aqInfoEl) return;

  try {
    const res  = await fetch("/air/current");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.aqi == null) throw new Error("No AQI in response");

    aqInfoEl.textContent = `AQI ${data.aqi} · PM2.5 ${data.pm25 ?? "N/A"}`;
    if (aqDotEl) aqDotEl.style.background = `var(${aqColorVar(data.aqi)})`;
  } catch (err) {
    console.error("Air quality error:", err.message);
    aqInfoEl.textContent = "AQI unavailable";
  }
}
