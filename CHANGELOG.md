# Changelog — Voidbase

---

## v0.4.0 — 2025-03-07

### Added
- **Game Deals section** — track Steam games with live pricing and discount data
- Search games by title via IsThereAnyDeal API (proxied through Express)
- Pin/unpin games, persisted in localStorage
- Real THB pricing pulled from Steam Store API (`cc=th`)
- Current discount % and 90-day low discount % from ITAD
- Fire icon on deals that match or approach the 90D low, using a tiered threshold (10pp within low if 90D low < 55%, otherwise 15pp)
- Table layout with headers: Title / Price / Disc. / 90D Low
- Game name truncation with ellipsis on overflow
- Sort by highest discount
- **Force 90D Low** setting in control panel — 90D Low column hidden below 425px by default, toggle overrides
- Footer matching header visual language, pinned to bottom of viewport

### Changed
- THB prices displayed as whole numbers (no decimal points)
- 90D Low shown as percentage rather than price for regional consistency
- Settings panel Widgets section expanded with Force 90D Low toggle

### Fixed
- Fire icon logic reworked — was triggering on all rows due to double negation bug in server response
- 0% discount no longer triggers fire icon
- 90D Low of 0% displays in secondary text colour instead of green

---

## v0.3.1 — 2025-03-06

### Added
- **Expanded charts mode** — toggleable in settings, switches cards from compact (100px) to expanded (180px) height
- Expanded mode forces 2×3 grid layout
- Y-axis on right side with 4 evenly spaced gridlines
- Month-snapped x-axis ticks for 6M and 1Y ranges
- Every-other-month labels for 1Y to reduce crowding
- "12 Feb" date format for 1M range (replaces dd/mm)
- Gradient opacity reduced in expanded mode

### Fixed
- createChart moved inside IIFE scope to correctly access expandedCharts and currentRange
- ResizeObserver updated to use correct height based on expanded state
- Overlay symbol/price/delta repositioned correctly to top-left in expanded mode

---

## v0.3.0 — 2025-03-06

### Added
- **Markets section** — stock and ETF price tracker using uPlot charts
- Yahoo Finance API proxy in Express (`/api/:symbol`)
- Time range selector: 1D / 1M / 6M / 1Y
- Compact overlay card design — chart bleeds edge-to-edge, symbol/price/delta overlaid
- Price delta with green/red colour coding
- Editable ticker symbols with localStorage persistence
- Auto-refresh on 60s interval
- Responsive chart width via ResizeObserver
- Search bar with Google search and Web Results Only toggle
- Service link cards expanded with icons and descriptions
- Collapsible Utilities section

### Changed
- Typography unified to Geist font — removed Inter
- h1–h4 hierarchy established with consistent weights and line-heights
- Service card labels migrated to semantic h3/h4
- Search button replaced with SVG icon

---

## v0.2.0 — 2025-03-05

### Added
- **Settings panel** — floating gear icon, slide-in panel
- Theme colour switcher with 4 presets: Voidbase Violet, Arctic Blue, Montepulciano, Jade Dragon
- Status Info toggle — hides/shows clock, date, AQI, location in header
- Ticker Count stepper and Expanded Charts toggle in Widgets section
- Theme preference persisted in localStorage

---

## v0.1.0 — 2025-03-04

### Added
- Initial dashboard
- Header with site title, live clock, date, AQI/PM2.5, location, UTC offset
- Dock — icon shortcut bar with tooltips
- Google search bar with Web Results Only toggle
- Service link sections: Media Automation, Media & Photos, Local Network, Website & CMS, Utilities
- Animated background with radial gradient blobs
- CSS custom property theme system using --theme-hue on body
- Responsive layout with max-width container