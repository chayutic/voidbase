# Changelog — Voidbase

## v0.5.0 — 2026-03-09
*New Arrivals section, visual updates & code cleanup*

### Added
- **New Arrivals section** — horizontally scrollable row of recently added media pulled from Jellyfin
- Separate slots for movies (3) and episodes (3) — forced representation for both types regardless of download timing
- Server-side episode deduplication — one card per series, most recent episode shown
- Poster art fetched via Jellyfin Images API with series poster fallback for episodes lacking their own image
- "Go to Library" card at end of row links to Jellyfin
- Two new Express proxy routes: `GET /jellyfin/recent` and `GET /jellyfin/poster/:seriesId`
- `JELLYFIN_URL` and `JELLYFIN_KEY` environment variables added to `.env`

### Changed
- Various spacing and font changes for a more consitent look.
- Variable name changes for more consistent naming convention.
- Reordered CSS blocks to match visual order of the site.

## v0.4.2 — 2026-03-08
*Turbo Mode, search presets, footer*

### Added
- **Turbo Mode** — collapsible panel below search bar; toggle reveals Web Results Only, Open in New Tab, and Search Presets
- **Search Presets** — save up to 6 query prefixes, persisted in localStorage; active preset prepended to search query on submit; click active preset again to deselect
- Preset add row with Save and Cancel buttons; Escape key closes and resets
- Preset edit button (pencil icon, appears on hover) — inline rename, Enter to commit, Escape to cancel; active preset follows rename
- Preset remove button (× icon, appears on hover)
- Preset label truncation with fade-out mask on overflow
- **Footer** — more vibes and Back to Top link
- Smooth scroll via `scroll-behavior: smooth` on `html`
- Escape key closes Game Deals add row and Search Presets add row, removing active state
- Escape key blurs Google search input

### Changed
- Web Results Only toggle moved inside Turbo Mode panel
- Cancel buttons hidden at ≤425px — + button rotates 45° to × as close affordance on both Game Deals and Search Presets
- × Button SVGs replaced with rotated + button for consistency.
- `renderPresets` rewritten with DOM methods — no user data interpolated into `innerHTML`
- Responsive breakpoints, spacing, and size adjustments for visual consistency.

### Fixed
- Search game input `min-width: 0` prevents it pushing Search button out of frame at narrow viewports

## v0.4.1 — 2025-03-07
*Steam reviews, guest mode, color variables*

### Added
- **Steam reviews column** in Game Deals — shows review description and count fetched from Steam's appreviews API, folded into existing `/steam/price/:appid` endpoint
- Review sentiment color coded using `--steam-positive`, `--steam-mixed`, `--steam-negative` variables
- Responsive review column: full text label ≥650px, SVG thumb icon + count at 500–649px, hidden below 500px
- Icon scheme: thumb up/down SVG with `+` / `++` / `−` / `−−` modifiers for sentiment intensity; Mixed renders as text only
- Hover tooltip on icon view shows full label and review count
- Review count formatted by magnitude: exact below 1k, one decimal `2.4k` up to 9.9k, rounded `24k` / `102k` above
- **Guest Mode** toggle in Control Panel — hides all homelab sections (Media Automation, Media & Photos, Local Network, Website & CMS, Utilities), persisted in localStorage
- Unified highlight color variables: `--green-highlights`, `--red-highlights`, `--orange-highlights` replacing scattered inline oklch values throughout

### Changed
- Game Deals table column order updated: Title / Reviews / Price / Sale / 90D Low
- `/steam/price/:appid` endpoint now returns `reviewDesc` and `reviewCount` alongside price via parallel fetch
- All inline highlight oklch values in CSS replaced with named variables

### Fixed
- Search input and button height mismatch resolved — explicit `height`, `display: flex`, `align-items: center` on both, vertical padding removed

---

## v0.4.0 — 2025-03-07
*Game Deals section*

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
*Expanded charts mode & axis improvements*

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
*Markets section & Express backend*

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
*Settings panel & theme switcher*

### Added
- **Settings panel** — floating gear icon, slide-in panel
- Theme colour switcher with 4 presets: Voidbase Violet, Arctic Blue, Montepulciano, Jade Dragon
- Status Info toggle — hides/shows clock, date, AQI, location in header
- Ticker Count stepper and Expanded Charts toggle in Widgets section
- Theme preference persisted in localStorage

---

## v0.1.0 — 2025-03-04
*Initial dashboard*

### Added
- Initial dashboard
- Header with site title, live clock, date, AQI/PM2.5, location, UTC offset
- Dock — icon shortcut bar with tooltips
- Google search bar with Web Results Only toggle
- Service link sections: Media Automation, Media & Photos, Local Network, Website & CMS, Utilities
- Animated background with radial gradient blobs
- CSS custom property theme system using --theme-hue on body
- Responsive layout with max-width container