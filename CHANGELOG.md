# Changelog — Voidbase

## v0.7.4 — 2026-09-05
*Convention audit, part two — cascade layers*

### Changed
- **Every stylesheet now lives in a cascade layer** — `@layer reset, tokens, components`, declared in `theme.css` and appended to by the other three. A rule in an earlier layer cannot beat one in a later layer whatever its specificity, so the reset can no longer outrank a component. The `a:visited` bug that started this audit isn't fixed so much as no longer expressible
- The dashboard's `h1`–`h4` moved into `reset` for the same reason. Bare element selectors carrying colour are the exact shape that went wrong; at (0,0,1) they lose to any class today, but in `reset` they lose to any component forever
- **Six `:root[data-theme="white"|"beige"] body .header…` rules are gone**, replaced by a `--header-text` token. They keyed a component off the theme from the dashboard stylesheet and scored (0,3,1), the highest specificity in the project. Four of the six were measured to be doing nothing at all — `.header__aqi` and `.header__location` already set that colour themselves, and `.header__meta` inherits it. The two that worked only ever worked by inheritance, which is what the token does
- The render matrix runs its `:link` canary twice now. The `layered` variant injects into `@layer reset`, which is where such a rule would actually land, and reports `protected` — this is Lane A's acceptance test. The `unlayered` variant reports `VULNERABLE` and always will: CSS in no layer beats CSS in every layer, by design

### Known
- **uPlot's stylesheet and CodeMirror's injected theme are unlayered, so they now outrank all of ours.** Nothing collides today — uPlot sets no background on the elements we style, and our only `.cm-` rules are our own decoration class. Booked in `TODO.md`: self-hosting uPlot lets it go in a `vendor` layer. CodeMirror injects at runtime and can't be layered from CSS at all, which is why the `!important`s in `livepreview.js` stay

## v0.7.3 — 2026-09-05
*Convention audit, part one*

### Fixed
- **Game titles from IsThereAnyDeal were interpolated into `innerHTML`.** `renderDeals()` and `searchGames()` build their rows with `createElement`/`textContent`/`dataset` now, the way `search.js` has always built its preset list. Third-party strings, straight into markup
- Ticker symbols the same way — `createCard()` dropped `stocksSymbols` into its template. That one is persisted and editable, so it was only ever your own XSS to write

### Changed
- Hardcoded colours moved behind tokens: `--toggle-thumb` for both toggle thumbs, `--axis-line-color` for the Markets chart axis. Anything a theme might want to override belongs in `theme.css`, greys included
- The customizer scrim derives from `--surface-dark` rather than restating black, and the Markets overlay text-shadow uses `--shadow-sm` rather than restating its value

## v0.7.2 — 2026-09-05
*Visited links*

### Fixed
- **The notes button's icon sat at full brightness and never dimmed**, while the border around it lit and dimmed exactly as it should. `a:visited { color: inherit }` in `theme.css` scores (0,1,1), which outranks `.nav-trigger`'s (0,1,0) — so the glyph fell back to `--text-primary` the moment `/notes` entered browser history, and not one page load before. The rule was redundant on top of being wrong: `a { color: inherit }` is author-origin and already beats the UA's visited colour in both link states
- The gear was never affected because it's a `<button>`, and `:visited` has nothing to match
- **`.gitignore` was excluding the entire notes front-end.** The `notes/` pattern for the local dev directory was unanchored, so it matched `public/js/notes/` too and quietly took all nine modules with it. Anchored to `/notes/`

### Changed
- `.utilities__card:link, .utilities__card:visited` is now a specificity bump against a rule that no longer exists. Left in place; it's the fossil of the first time this happened

## v0.7.1 — 2026-09-03
*Notes chrome*

### Added
- **One button for the dashboard ↔ notes trip**, in both directions. A 42px circle in the bottom-left corner of both pages — same size, same border, same corner as the Control Panel gear, pointing at whichever page you aren't on. The `← Voidbase` text link was always a placeholder, and the dashboard had no way into notes at all
- New note lives in the sidebar now, as a row directly above the list — which is where the note it makes turns up anyway

### Changed
- **NOTES is no longer set in Josefin.** It's the VOIDBASE wordmark; a second word in it makes the first one less of a signature. It's the same thin uppercase treatment as MARKETS and NEW ARRIVALS now, which is what it always was — a section label
- The notes header carries the page name and nothing else. Three identical icon buttons in the top right gave a create action and two view toggles the same weight
- Collapsing the sidebar leaves a narrow rail rather than nothing, so the button that collapsed it is still there to undo it
- A sidebar collapsed on desktop no longer follows you to a phone, where there'd be no toggle to get the list back

### Removed
- Live-formatting toggle. Formatting in place is the whole point of the editor; a switch for turning it off was a switch for making it worse. `layout.js` and the `notesPreview` key go with it
*Notes app*

### Added
- **Notes** — a markdown scratch pad at `/notes`, for the things that don't merit an Obsidian entry. Its own document rather than a dashboard section, so it isn't bound to the dashboard's visual language
- Notes are plain `.md` files on disk in `NOTES_DIR`, bind-mounted from the RAID array. No database, no index, no frontmatter — the directory is the source of truth and stays readable by any editor
- Filenames are `YYYYMMDD-HHmmss.md` and never change. The display title is derived at read time: the first line if it's a heading, otherwise a humanised timestamp. Retitling is just editing the first line — no renames, no collisions
- `lib/notes-store.js` and `lib/notes-routes.js` — filesystem layer and Express Router, mounted at `/notes` so a single Cloudflare Access rule can cover the page and its API together
- Eight notes routes: list, search, create, read, save, delete, plus a POST alias on `/note/:id` because `sendBeacon` can only issue POST and that's what saves your work when the tab dies
- **CodeMirror 6 live preview** — markdown formats as you type; only the line under the cursor shows raw source. Bold, italic, strikethrough, code, headings, links, quotes, lists, task boxes, tables, rules
- `Ctrl+B` / `Ctrl+I` / `Ctrl+Shift+X` / `Ctrl+E` toggle formatting rather than blindly inserting markers. `Ctrl+Shift+8` and `Ctrl+Shift+7` toggle bulleted and numbered lists
- Enter continues a list: same indent, same marker, numbers increment, task boxes reset to unchecked. Enter on an empty item removes the marker instead of adding another
- Autosave with no save button — 600ms after you stop typing, plus a flush on blur, note switch, tab hide and page unload
- Full-text search across titles and bodies, filtering the sidebar and highlighting the match. Body matches show surrounding context instead of the note's opening line
- Thai support on the notes page — Noto Sans Thai in the stack and line-heights that leave room for vowel and tone marks. Substring matching means search works on Thai despite it having no spaces between words
- Control Panel on the notes page, same markup and same module as the dashboard. Widgets that only affect the dashboard still write their preference from here
- Live-formatting toggle in the notes header — off shows raw markdown throughout, for when you're fixing a table and want every character visible
- Notes icon in the dock, with a divider marking it as a local page rather than an external shortcut
- **Cross-document View Transition** between dashboard and notes. Progressive enhancement; engines without support just navigate
- `public/theme.css` — design tokens, theme variants and reset, shared by both pages
- `public/settings.css` — Control Panel styles, likewise shared
- `SETTINGS_CHANGE` event so Markets can repaint when the Control Panel changes underneath it
- Immutable caching on `/js/vendor` — those filenames are version-pinned, so `max-age=0` was buying a revalidation round-trip per page load for nothing
- `.dockerignore`, which stops `COPY . .` shipping 19 MB of build-only dependencies into the image
- `npm run build:cm6` — the only build step in the project. CodeMirror ships as a dozen interdependent packages and needs a single instance of `@codemirror/state`, so the pieces have to be linked ahead of time. Run manually, output committed
- Vendored `marked` 18.0.10 for the loading and mobile render paths

### Changed
- `data-theme` moved from `<body>` to `<html>` and is now set by an inline script in each `<head>`
- The Control Panel's Markets widgets (Expanded Charts, Ticker Count) are bound in `settings.js` rather than `markets.js`, so they still work on pages that never load Markets. Reverses the arrangement introduced in v0.6.0
- `@codemirror/lang-markdown` deliberately not used — it depends on `lang-html`, which drags in the full JavaScript and CSS grammars to highlight code fences. Building the language from `@lezer/markdown` directly cut the bundle from 510 KB to 315 KB with GFM intact
- Markdown rendering escapes raw HTML rather than sanitising it. Underline was dropped for strikethrough, so nothing needs raw HTML, and escaping makes injection structurally impossible

### Fixed
- **Theme flash on every page load** — the palette was applied by a deferred module, so the browser painted the default violet and then repainted to the saved theme
- **Text selection was unreadable in the editor.** CodeMirror's base theme ships a light lavender selection under `&light`, and this theme never declared `dark`, so near-white text sat on a near-white block. The black theme needed its own value too — its accent is nearly white, so a derived selection would have been light on light
- **Thai never actually used Noto Sans Thai.** The font was named in the stack but never requested, so it was falling back to a Windows system face. Headings had a second, separate fault: they used a Latin-only token with no Thai fallback at all
- List items rendered in the accent colour — the tag covers the whole item, not just the marker
- `---`, `***` and `___` render as rules; the dashes themselves stayed visible because the highlighter coloured them past the rule meant to hide them
- View transition washed out to white mid-navigation. The default cross-fade relies on `mix-blend-mode: plus-lighter` to add two half-opacity snapshots back to full brightness; overriding the animation without accounting for that let the backdrop show through
- View transition fired in one direction only. The opt-in now sits inline in each `<head>`, ahead of any external stylesheet, so the incoming document is opted in before the browser decides
- A custom `link` renderer added to marked replaced its built-in URL check along with it, so `[click](javascript:alert(1))` rendered as a live link. Now carries its own protocol allowlist

### Removed
- The split preview pane. Live formatting made a second copy of the same note redundant, which was the complaint that prompted it

## v0.6.0 — 2026-08-24
*Module split, key handling, dependency cleanup*

### Added
- **Suwayomi card** in Media & Photos — manga reader. Icon recoloured to `currentColor` and the background circle dropped, so the mark follows the theme accent like every other card icon instead of shipping a fixed light/dark variant
- **ES module architecture** — the inline `<script>` in `index.html` is gone, split into 14 modules under `public/js/`. Loaded with `<script type="module">`; no bundler, no build step
- `store.js` — typed `localStorage` wrapper with a `KEYS` registry of every persisted preference. `bool()` takes its default explicitly, since the old code mixed `=== "true"` and `!== "false"` and those read almost the same
- `config.js` — `VERSION` and `JELLYFIN_BASE` for the values more than one module needs
- `main.js` entry point, with init order made explicit: theme first so the palette lands before paint, customizer second so section order settles before the data sections fill in
- `THEME_CHANGE` document event — Markets listens for it and redraws, since uPlot bakes the accent colour into a canvas and a CSS swap alone leaves stale lines
- `GET /air/current` — air quality proxy, so the WAQI key stops shipping to the browser
- `.env.example` documenting the five env var names

### Changed
- WAQI API key moved out of the client and into `.env` as `AQ_TOKEN`, alongside the ITAD and Jellyfin keys
- AQI dot now uses the `--aqi-*` variables instead of five hardcoded hex values — the variables were already sitting there unused
- uPlot pinned to 1.6.32. The unversioned unpkg path was silently tracking whatever they released last
- Fonts moved from two `@import`s in `style.css` to one `<link>` in the head, so they fetch alongside the stylesheet rather than after it
- Markets now owns its two Control Panel widgets (Expanded Charts, Ticker Count) — they render in the settings panel but the state is Markets state
- All `localStorage` access routed through `store.js`

### Fixed
- `.gitignore` was UTF-16 encoded, which git cannot parse — it had been inert since it was written, so `.env` and `node_modules/` were never actually ignored
- Layout Customizer Reset handed back the default layout by reference while the eye toggles mutate in place. Reset, hide a section, cancel, reset again, and the section stayed hidden
- Air quality route was originally `/api/air`, which the `/api/:symbol` wildcard matched first and answered with quotes for the NYSE ticker AIR

### Removed
- Font Awesome — loaded on every page view, zero usages anywhere in the codebase
- Dead `isDeepDiscount` branch in Game Deals and its orphaned `.deals__low--highlight` rule. `fetchDeals()` never set the flag, so the highlight has never once rendered

## v0.5.3 — 2026-03-12
*Layout Customizer fixes and Markets improvements*

### Changed
- `DEFAULT_LAYOUT` is now snapshotted from the DOM at parse time (before any saved layout is applied), ensuring the reset button always restores the intended section order regardless of environment
- `loadLayout()` now merges saved layout against the DOM snapshot — stale section IDs are dropped, and any newly added sections not present in the saved layout are appended rather than silently omitted
- Markets section now caches fetched chart data in memory keyed by symbol and range — switching ticker count or toggling expanded charts repaints from cache instead of re-fetching from the API; background refresh still runs on the 60s interval
- `renderGrid()` rewritten to diff against existing cards instead of destroying and rebuilding — existing cards are reordered or removed in-place, eliminating chart flash adjusting ticker count and minimizing it when toggling expansion

### Fixed
- Reset button on live site was restoring a previously saved user arrangement instead of the default order

## v0.5.2 — 2026-03-10
*Theme system overhaul, Layout Customizer, and code cleanup*

### Added
- Black and White themes (Obsidian Black, Spirit White), Spirit White effectively serves as Light Mode
- Layout Customizer — drag-and-drop section reordering and visibility toggles, accessible from Control Panel
- `VERSION` JS constant as single source of truth for version string across footer and Control Panel, hopefully I remember to change them going forward
- Version stamp in Control Panel footer (quick fix for floating gear icon obfuscating the last item in the menu)

### Changed
- Theme system refactored — colour themes now use explicit `body[data-theme]` blocks instead of a single derived `--theme-hue`; Black and White themes define their own full token sets
- New color variables added to replace hardcoded `oklch()` values throughout
- Active swatch ring changed from `--accent-muted` to `--text-primary`; inactive rings removed
- Removed `opacity` from text elements — replaced with explicit `--text-primary` / `--text-secondary` colour values throughout
- Light mode placeholder removed from Control Panel (White theme is now a swatch)

### Fixed
- Various dead and/or duplicate CSS rules

## v0.5.1 — 2026-03-09
*New Arrivals fixes & improvements*

### Added
- **Jellyfin image proxy** — poster art now loads outside local network via `GET /jellyfin/image/:itemId`; images cached for 24h
- **Split library card** — "Go to Library" (local) and "Watch on Voidport" (watch.voidport.com) as separate links in the last card

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