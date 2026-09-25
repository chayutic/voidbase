# Changelog — Voidbase

## v0.7.19 — 2026-09-25
*Invisible, but still there*

### Added
- **Two new convention checks.** `font-size-ramp` fails any font size that isn't a `--text-*` token, in CSS or in a JS `fontSize`. `focus-ring` fails any control reset with `all: unset` that doesn't hand the browser's focus ring back

### Changed
- **Every dashboard font size is a ramp token.** v0.7.8 moved the 40 of them onto the ramp's values and never actually swapped in the tokens, so changing `--text-label` moved notes and the Control Panel and left the dashboard where it was. Not one pixel moved in the swap
- **A collapsed notes sidebar is applied before first paint.** It used to paint the full list first and snap to the rail half a second later on a slow connection, the same flash the dashboard layout had until v0.7.15

### Fixed
- **On a phone, a tap on empty-looking space could unpin a game.** The row × and the ticker pencil sit at `opacity: 0` until hovered, and a touch screen doesn't hover, but they still took taps. Below 700px they're visible now, as they already were in notes
- **Collapse the notes sidebar, then narrow the window below 700px, and the list couldn't scroll.** The narrow layout undid every collapsed rule except `overflow: hidden`
- **Controls reset with `all: unset` showed no focus at all.** The browser's own ring is back on all 17 of them; mouse clicks don't draw it
- **The dashboard's placeholders were the browser's grey**, at about 4:1. They're `--text-secondary` now, like everything else that describes something. Its token had been declared all along and never read
- **The New Arrivals error message sat at 2.7:1**, secondary text at half opacity. Full opacity now
- **"(no Steam ID)" in deals search results was 0.6rem at 40% opacity.** It's the micro step now, like other small print
- **The Control Panel toggles and the three dashboard inputs had no accessible names.** Neither did the ticker stepper, unless "−" counts
- Dead CSS: `.stocks`, `--search-text`, `--search-shadow`, and a `.cm-md-rule *` whose comment described a span `livepreview.js` deliberately never creates

## v0.7.18 — 2026-09-25
*Everything is a 500*

### Added
- **Game Deals holds 20 games.** At 20 the `+` goes and a "List full" label takes its place, set like the Markets range toggles. It comes back when a game is removed. The server refuses a longer price list, so a second tab can't sneak a 21st in either
- **The server remembers upstream answers for a while**: air quality 5 minutes, Yahoo a minute, Steam and ITAD search an hour. Every proxy route is public, and until now anyone asking the same question twice spent the quota twice. Failures are never remembered
- **Pages carry `nosniff`, `Referrer-Policy: same-origin` and `frame-ancestors 'none'`.** `/notes` could be framed by anyone. `X-Powered-By: Express` is gone

### Changed
- **Proxy failures say what failed.** An upstream that times out is a 504, one that answers wrong is a 502, and a symbol Yahoo doesn't know is a 404 rather than a 200 wrapping Yahoo's own error. A 500 now means the bug is ours
- **A game search asks ITAD and Steam at the same time.** It used to ask them in turn, so a slow Steam could hold a search for 20 seconds. It still fails if either does, since a result without a Steam appid would pin a game that never gets a price
- **Every proxy parameter is checked before it goes anywhere.** Symbols, appids, Jellyfin ids and image tags have to look like what they are, `range` has to be one of the five, and a repeated `q`, `range` or `tag` is a 400 rather than whatever Express made of it
- **The image is `node:24-alpine`, installed with `npm ci --omit=dev`, and runs under `init`.** Node 18 went end of life in April 2025 and dev has been on 24 for a while. Without an init, node as PID 1 ignored `docker stop`, so every redeploy waited out the ten-second grace period and ended in a SIGKILL

### Fixed
- **A revoked ITAD key looked like an empty search.** ITAD's 403 came back as `200 []`, which read "No results found.", and the price lookup quietly dropped every discount. Any non-OK upstream answer is an error now
- **`/jellyfin/image/..` walked out of `/Items/{id}` with the API key attached.** `encodeURIComponent` leaves `..` alone and the URL parser then resolves it. Jellyfin 404'd, but the comment above that line said encoding made it impossible
- **`range=constructor` sent Yahoo a stringified function.** The range lookup fell through to `Object.prototype`
- **Steam's review count went into the deals markup unchecked.** Steam has only ever sent a number, but the comment vouching for that markup was wrong. It is a number or it is nothing now
- **The chart request didn't encode its ticker symbol.** It does now, as the client half of the symbol check above

## v0.7.17 — 2026-09-25
*A preset nobody could see*

### Changed
- **The AQI refreshes every ten minutes.** It was read once per page load, so a tab left open all day showed the morning's air. A slow reading that lands after a newer one is dropped, failure included
- **New Arrivals draws its cards before the series posters arrive.** Episodes without their own image used to hold the whole section blank until every poster lookup came back. They sit on the placeholder now and fill in as each one lands
- **The Utilities toggle says whether it's open.** It carries `aria-expanded`, and its name no longer reads "Expand utilities" while collapsing them

### Fixed
- **Renaming the active Turbo preset in a stale tab left the active term pointing at nothing**, and every search after that had it prepended anyway — `alpha test` from a panel showing no preset selected. An active term that isn't a preset is ignored
- **Two tabs reverted each other's Turbo presets**, the same way they did tickers and pinned games before v0.7.16. Add, rename and remove re-read storage first
- **A preset could be renamed to one that already existed**, though adding one couldn't. With two identical presets, renaming the second changed the first, and removing either removed both. The rename is refused
- **WAQI's `-` for a station with no reading showed as `AQI -` with the hazardous dot.** Both the server and the header treat a non-numeric AQI as unavailable
- **When Jellyfin failed, the library card went with it**, including Watch on Voidport, which doesn't touch the Jellyfin API
- **The Watch on Voidport icon was a 404.** voidport.com moved off Ghost, and the `/content/images/` URL the library card pointed at went with it. It only looked fine in a browser that still had the old copy cached. The mark is inline SVG now, lifted from the site's own `favicon.svg` and drawn in `currentColor` like the arrow above it, so nothing under `public/` loads from voidport.com anymore
- **The dock tooltip survived a round trip.** Click a shortcut, press Back, and the label was still up over an item the pointer wasn't on. It's also shown on keyboard focus now, which it never was

## v0.7.16 — 2026-09-25
*The last response in is not the latest*

### Changed
- **A Ticker Count change only fetches the card it adds.** It used to tear down and refetch all six charts, six upstream requests per click, which is the rebuild `renderGrid()` diffs to avoid. Expanded Charts still rebuilds every chart, since it changes their height

### Fixed
- **Switching range while the previous one was still loading drew the old range under the new button.** With 6M held and 1Y landing first, every card ended on 6M's numbers: BTC-USD +18.72%, where 1Y is −24.49%. A response for a range, symbol or card that has moved on since is dropped
- **Two dashboard tabs reverted each other's edits.** Each wrote its own copy of the ticker list and the pinned games back whole, so a rename or a pin made in one tab was gone after the other tab's next edit. Both re-read storage before writing and apply just the one change. The stale tab still shows its old copy until it reloads
- **When the ITAD price lookup failed, the Steam prices and reviews that had arrived were thrown away**, and every row claimed a 0% discount. The two sources land independently now, and a discount nobody knows is `—`
- **A failed game search said "No results found."** The "Search failed." branch was only reachable on a network error
- **An older game search landing after a newer one replaced its results**, and clicking one pinned a game nobody had searched for. Late responses are dropped, including one that lands after Cancel

### Removed
- **Two bits of dead arithmetic in the chart factory**: a padding ternary with the same value on both arms, and a bottom inset of `range * 0`

## v0.7.15 — 2026-09-25
*Painted once, in the right order*

### Changed
- **Guest Mode, Status Info and Force 90d are classes on `<html>`**, set by the inline `<head>` script alongside the theme and toggled by `settings.js` after that. Status Info used to hide the header by setting an inline `display` on two elements
- **The saved section order is applied by an inline script** right after the last section, which records the authored order on `.container` first so Customizer Reset still knows it. `customizer.js` no longer parses or applies a layout. It reads the current one off the page and writes the new one
- **`SETTINGS_CHANGE` fires for every Control Panel toggle.** It was documented as firing for any preference, but Status Info, Guest Mode and Force 90d never sent it. Nothing was listening for them yet
- **`lint:conventions` allows the pre-paint keys in HTML**: `theme`, plus the four above. Anything else is still a hit
- **Init order in `main.js` no longer matters**, and its header stops claiming it does. The theme half of that claim was already stale, and the customizer half was never true

### Fixed
- **Blocking site data for voidport.com killed both pages on load.** Reading `localStorage` throws when storage is blocked, and the first throw aborted every module: no clock, no version, no notes list, no editor. `store.js` catches now. Reads fall back to defaults and writes go nowhere
- **A saved section order, Guest Mode and a hidden status line all painted in the default state first**, then jumped. That was about 370 ms of the wrong layout per load over the tunnel, repeated on every customizer save, since saving reloads. In Guest Mode, a homelab section was on screen for 430 ms. All of it is settled before first paint now
- **Starting a second Turbo preset rename within 150 ms of the first one's blur threw the second one away.** The first rename's deferred commit rebuilt the list, the new input with it. It now skips the rebuild while a newer rename is open
- **A stored ticker count outside 1–6 locked the stepper or emptied Markets.** Nothing writes one today, but lowering `TICKER_MAX` would have. All three reads clamp through one function in `config.js`

## v0.7.14 — 2026-09-25
*Ctrl+Z, and seventeen other ways to lose a note*

### Changed
- **Notes auth fails closed.** With no `NOTES_PASSWORD`, every `/notes*` request gets a 503 saying no authentication is configured and all access is blocked, and the server says the same once at startup. It used to wave everyone through, which on voidport.com meant one missing line in the NAS `.env` published every note. The dashboard is unaffected
- **The password is compared as SHA-256 digests.** `timingSafeEqual` on the raw strings needed a length check first, and that check returned early — which leaked the password's length. Digests are always 32 bytes
- **`/notes.html` redirects to `/notes`.** Static served it ahead of the auth gate. It was only markup — the API was always gated — but the page and its API are meant to share one gate
- **Saves carry the mtime they were based on.** A save from a copy that has since changed on disk — another tab, the phone — gets a 409 and the status line says so, instead of silently overwriting. The unload beacon is the one unconditional write, and a copy already known to be stale no longer sends it; the browser's leave-page prompt fires instead

### Fixed
- **Ctrl+Z straight after opening a note emptied it, and autosave then wrote the empty note to disk.** Loading a note was an ordinary undoable edit, so the first undo restored whatever the editor held before — nothing, on a fresh page, or the previous note's text after a switch. Each load now gets a fresh editor state with its own history
- **Two saves to one note at once could tear the file** into the new text followed by the tail of the old one (27 runs in 50). The editor now sends saves one at a time; the store serialises writes and deletes per note and writes via temp file and rename, so a power cut mid-save leaves the old version rather than half of the new one
- **`/notes/` with a trailing slash loaded no CSS and no JavaScript.** Every asset URL in `notes.html` was relative and resolved under `/notes/`. They are root-absolute now
- **One deleted note took the whole list down.** A file removed between `readdir` and `readFile` failed the entire list or search with a 500, and the page reported the service unreachable. Missing files are skipped
- **Two notes created in the same second got the same id**, and the second overwrote the first. Ids are claimed with an exclusive create now. A double-click on New used to produce two rows for one file
- **"# C#" was titled "C".** The closing `#` run of a heading only counts after whitespace, and four spaces of indent is a code block, not a title
- **Switching notes after a failed save discarded the unsaved edits.** Now the switch asks first
- **Clicking two notes quickly could leave the editor on one and the sidebar on the other.** Stale loads are dropped, and a note that fails to open says so and hands the highlight back
- **Deleting a note that wasn't open reloaded the one that was**, which sent the caret to the top
- **A note over 64 KiB was never saved by the unload beacon** — `sendBeacon` refuses anything that size, and the refusal was ignored. It now triggers the leave-page prompt
- **A failed search said "Nothing matches".** Failed searches, deletes and creates now say they failed
- **`nextId()` built note paths itself**, against the rule that only `notePath()` does. Its replacement uses `notePath()`

## v0.7.13 — 2026-09-25
*The rules, as a script, and one theme fewer*

### Added
- **`npm run lint:conventions`.** Every rule in `CLAUDE.md` that grep can answer, as a check that prints `file:line` and exits 1: no `localStorage` outside `store.js` (the inline `<head>` script excepted, and only while it reads `KEYS.theme`); `KEYS` matched against actual use in both directions; no `data-theme` selector outside `theme.css`; no hard-coded colour outside it; no `prefers-reduced-motion`; no `-webkit-` twin; the three banner formats; every theme present in `theme.css`, on both swatch rows and in `settings.css`, with the swatch hue matching `--theme-hue`; no export that nothing imports. Each check was made to fail on a planted copy of the tree before its pass was trusted, and three of them were blind the first time

### Removed
- **The beige theme.** Unloved and no longer being worked on. Its swatch had never been given a colour anyway, so it painted the browser's default button grey and looked exactly like White. A saved `beige` falls back to the default palette until another swatch is clicked. The Light-Theme Debt Rule now covers White alone

### Fixed
- **Green's swatch hue was 169.32; the theme's is 170.** Swatch lightness and chroma are tuned by eye on purpose, the hue is not. The lint holds it now
- **`@lezer/markdown` was never declared.** The CodeMirror build imports it, and it only resolved because `@codemirror/lang-markdown` — the package the build deliberately avoids, and imports nothing from — pulled it in. Swapped one for the other. `cm6.min.js` rebuilds byte-identical, and `lang-html`, `lang-css` and `lang-javascript` are out of `node_modules`
- **`npm audit` is clean.** Express 4.22.1 → 4.22.3 clears `path-to-regexp`, `body-parser` and `qs`. None was reachable — no route has two params, both body limits are valid, nothing calls `qs.stringify` — but that depended on it staying so
- **Six exports nothing imported** lost the keyword: `applyTheme`, `select`, `continueList`, `idToDate`, `markdownHighlight`, `editorTheme`. Each was only ever called from its own file
- **The render baseline had not been updated since v0.7.11.** v0.7.12's version string, range-row button and `.arrivals__title` letter-spacing accounted for 27 of 28 probe diffs, each checked against a clean checkout of v0.7.12 before re-baselining; the 28th is the swatch row above

## v0.7.12 — 2026-09-08
*A second way into Expanded Charts*

### Added
- **A collapse/expand button on the Markets range row**, right after 1Y. It's the same `expandedCharts` preference the Control Panel checkbox already owned — one click here instead of a trip to Settings. The icon shows the action available from the current state (collapse glyph while expanded, expand glyph while not), and the checkbox stays in sync if you flip it from either place

## v0.7.11 — 2026-09-07
*A table that measures itself, and a chart that stopped rebuilding every minute*

### Changed
- **The Game Deals table steps its columns down on its own width now, not the viewport's.** `.deals-section` carries `container-type: inline-size` and the three column rules are `@container` at 590, 440 and 400 — the widths the table genuinely needs, rather than 650, 500 and 425, which were those widths plus `.container`'s padding and only held while a section is full width and `.container` caps at 1024. The global breakpoint set is 425 and 700 now, two numbers that can be named. `.deals__cancel-btn` stayed on the viewport: it is in the add row, not the table, and 425 is where the phone padding changes
- **That padding change is why the old ≤425 rule was pointing the wrong way.** `.container` drops from `1rem 2rem` to `1.5rem 1rem` at 425, so crossing 426 → 425 the table gets 31px *wider* — 362px at 426, 393px at 425. The rule that hid the 90D column below 425 was therefore hiding it at the width where the table had more room and showing it at the width where it had less. No container threshold can reproduce that, because it is inverted. 400 preserves every viewport at or below 425 byte for byte and extends the drop up into 426–464, where the table is narrower than the phone ever gets it
- **Six symbols are fetched at once.** `fetchStocks()` awaited its cards in a `for` loop, so a cold load, a range change and a theme change each cost six serial round trips to Yahoo. `Promise.all` over the same cards; `fetchCard` already swallows its own errors, so no one card can reject the batch
- **A refresh sets the chart's data instead of rebuilding the chart.** `renderCardData()` destroyed the uPlot instance and its ResizeObserver and built both again on *every* call — which the 60-second timer makes every 60 seconds, per card, undoing on a timer the no-flash property `renderGrid()` diffs specifically to preserve. It calls `uplot.setData()` when an instance exists. The two paths that genuinely need a rebuild now say so themselves: `THEME_CHANGE`, because uPlot rasterizes the accent into the canvas, and Expanded Charts, because `chartHeight()` is read once at construction. Both call a new `teardownAllCharts()` first. The theme reason used to be true only as a side effect of rebuilding everything unconditionally; it is now the only thing that call does
- **Neither markets change moves a pixel, and that was the check.** The matrix ran with no `--update` and passed at 193 probes, which is what proves the `setData` path renders what the rebuild path rendered

### Fixed
- **Inline code was rounded differently in the editor than in the rendered surface.** `livepreview.js`'s `tags.monospace` carried a raw `3px`, the last raw radius left outside `theme.css` — missed by v0.7.9's sweep because it is a JS string in a `HighlightStyle`, which no stylesheet scan reaches. `.markdown code` is the same element on the other surface and matches it on background and font-size, differing only here, so this was drift between two renderings of one thing rather than a deliberate choice at small size. `TODO.md` had `--radius-xs` down as 2px and warned the change would round *less*; it is 4px, so it rounds by one pixel more. Moved `rest .notes__pane` in all four themes at w1400 and nothing else — digest only, with lightness, peak-pixel count and dimensions identical, which is what a one-pixel corner change on a small span should look like
- **The deals result was verified by breaking it first.** Zero diffs at w640, w480 and w400 is a discriminating pass rather than a vacuous one — a container query that failed to match would have left every column in place at all three widths — but that argument was checked rather than trusted. Commenting out `container-type` produced 28 diffs, the decisive one being `.deals__col-review` at w480 going from `{"hidden":true}` to a 704x68 box. The probe sees the column disappear, and `container-type` is what makes it disappear

## v0.7.10 — 2026-09-07
*The space a marker leaves behind, and five things the harness could not see*

### Fixed
- **Every heading and blockquote kept the space its marker left behind.** `livepreview.js` replaced exactly the marker node's range, and in `@lezer/markdown` `HeaderMark` and `QuoteMark` are the punctuation *only* — the space separating a marker from its text belongs to no node at all. So `## Decisions` rendered as ` Decisions`, one character right of the left edge, at every heading level and on every quote line the cursor was not sitting on. The replacement widens across that whitespace now, and the four cases differ: a *run* after an opening `#`, since `###   spaced` is legal and all three spaces go; the space *before* the closing `#` of `# Title #`, which is the same problem at the other end; exactly one space after a `>`, never a run, because CommonMark gives the quote marker a single optional space and everything past it is the content's own indentation — `>     code` is an indented code block inside the quote, and eating it would flatten one; and nothing at all for a setext underline, which is a `HeaderMark` sitting alone on its line. `#  #` needs the two marks not to claim the same two spaces twice, so each replacement is floored at the end of the last one
- **`TODO.md` said no probe covered this, and that was wrong.** The note fixture already carries `## Decisions`, `#### h4`, `##### h5` and a blockquote, and the cursor lands on line 1, so all of them are decorated in every capture: the fix moved `rest .notes__pane` in all four themes at w1400, atPeak 76375 → 76411, dimensions identical, and nothing else in the matrix. `notes-violet-w600` correctly stayed put — below 700px the editor is not the surface on screen
- **The guest footer had been baselining a scanline nobody painted.** `captureBeyondViewport` composites the document into a surface `scrollHeight` tall, and `scrollHeight` is an integer — the footer's bottom sits at 1302.296875 in a document that reports 1302, so the clip reached past the surface and the final row came back pure white, a lightness this palette does not contain anywhere. It read `L=1 atPeak=5600`, `atPeak` exactly the box width, while all seven of its structural twins read `L=0.709 atPeak=9310`. The clip is clamped to `scrollWidth`/`scrollHeight` now and the entry was *corrected* rather than updated: it reads 0.709 at 9310, byte-identical to its twins. `index-violet-w480` had four device rows of the same thing and lost them; every other probe is untouched, because the clamp is inert wherever the box already ended inside the surface
- **That is also the w640 footer's one-run-in-six flake**, which `TODO.md` had down as "reads like a capture landing before paint" and which is nothing of the kind. Whether the artifact appears is decided by which way the document's fractional height rounds — 1302.296875 floors and loses the row, 1924.59375 rounds up and does not — so a probe sitting near the boundary flips on layout jitter. Found by dumping *where* the peak pixels were rather than how many: row 595 of 596, all 5600 of them
- **`.deals__search-btn` and `.deals__cancel-btn` have never been the deals section's.** Both class names match twice in `index.html`, and the Turbo preset row comes first in document order, so every `querySelector` for them landed there — the reveal that claimed to cover them was measuring Save and Cancel in a different component. `TODO.md` blamed a missing `itad/search` fixture; the buttons needed no search at all, only a selector that could reach them. Probed by id now, and the pair is distinguishable in the baseline: `Save` is 244 device px wide, `Search` is 324

### Changed
- **The five render-matrix blind spots are closed, and each new probe was made to fail on purpose before being trusted.** `--chart-h-lg` had never been read, because Expanded Charts is off by default and no config turned it on — a reveal clicks the real toggle, waits for the 180px branch to be in the layout, and probes the grid, the card and the chart; dropping the token to 160px moved all three, 720 device px to 640. The Turbo preset row's close cross needed a preset, which the reveal now adds and removes through the app's own handlers rather than by seeding `turboPresets` — that would have cost the empty state, which is the one the panel shows by default — and the row's edit and remove controls are `opacity: 0` until hover, so reveal entries can now name a hover selector held for the duration of their probes; reddening the cross moved it 0.709 → 0.628. The notes search `<mark>` needed a `/notes/api/search` fixture and a real query; taking its radius from `--radius-xs` to 8px moved it at identical dimensions, which is what a radius change should look like. The deals search row and its results needed an `itad/search` fixture. Baseline is 193 probes, up from 175
- **The view transition is measured rather than assumed.** A same-document `startViewTransition()` builds the same pseudo elements against the same rule, so the resolved timing of `vt-fade-out var(--transition-normal) both` is readable without a navigation: 250ms, `cubic-bezier(.4, 0, .2, 1)`. Both halves of the token are read on purpose — a CSS animation carries its timing function on the *keyframes*, so `getTiming().easing` reports `linear` whatever the token says, and reading that alone would have covered the duration and reported success for the easing. Pointing the animation at a token that does not exist collapses the record to `[]` on both pages, which is the failure it exists to catch
- **A real navigation was checked too, since the probe above cannot see one.** Clicking `.nav-trigger` in both directions with a document-start script recording `document.getAnimations()`: both run `vt-fade-out` at duration 250, live from ~20ms to ~300ms into the incoming document. The outgoing page fades; it does not cut
- **`open` and `close` in the reveal sweep are awaited**, so an entry that has to wait for its own effect — a 150ms search debounce, a fetch, a chart rebuild — polls for the thing it is about to measure instead of trusting `settleFrames` to have been long enough
- **Both items v0.7.9 booked under *Known* are probed now** — the Turbo preset row's close cross and the notes search `<mark>`. The second went in reasoned rather than measured and said so; it is measured
- **The fixture carries `###   spaced and closed   ###`**, so the multi-space case is guarded by pixels rather than by argument. The closing-`#` half cannot be: it removes *trailing* whitespace, which paints nothing either way. That half was verified in a real browser by reading back the text CodeMirror renders per line and the x of each line's first glyph — 300px for a paragraph, 303.5 to 317.5 for the seven heading and quote lines before the fix, 300 for all of them after, with the indented code block inside a quote correctly keeping four of its five spaces

## v0.7.9 — 2026-09-07
*Two shared modules, and an axis that had been fixed on the other one*

### Fixed
- **Code blocks stopped overflowing the notes pane.** `.notes__pane` is a grid item of `.notes__layout` and carried `min-height: 0` but not `min-width: 0`. A grid item's automatic minimum is min-content on *both* axes, so a long line inside `.markdown pre` widened the whole `1fr` column and the `overflow-x: auto` already sitting on `pre` never got anything to overflow. Precisely the bug `min-height: 0` solves on the vertical axis, fixed on one axis and not the other. One declaration. `TODO.md` also expected `.notes__preview` to need it: it does not, and the reason is worth keeping — it is a flex item in a *column* container, where the automatic minimum applies to the block axis, not the inline one
- **The fixture that proves it carries a long line again, permanently.** It was shortened to 33 characters in v0.7.8 so the baseline would record a sane layout, which left the repro out of the tree along with the bug. At 90 characters it blows the notes page from 2400 to 3044 device px at w600 — sidebar, list, pane and statusbar all widening together, and `.nav-trigger`'s reading going with them. That is the reading the fix has to erase, and it does. The fixture now guards the fix instead of hiding from it
- **`review_score_desc` reached markup unescaped**, in a `title=""` and in the review cell's own text, under a comment asserting it was safe because Steam's review vocabulary is fixed. It is fixed *in practice*. The value is still upstream text going into `innerHTML`, and the cost of that assumption breaking is script in the page
- **Two selectors were built out of localStorage.** `.stocks__card[data-symbol="${sym}"]` and `.section[data-section-id="${id}"]` — the ticker edit field accepts a `"` inside its ten characters, and a saved layout is only JSON. Either one throws `SyntaxError` and takes the entire grid, or every section on the page, down with it. Both look their target up in a `Map` now
- **`/jellyfin/image/:itemId` spliced two unescaped values into a URL carrying the Jellyfin API key.** The route is public and unauthenticated; the key is not. `%2F` survives express's route matching and is decoded into the param, so a `/` in `itemId` reached Jellyfin endpoints this proxy never meant to expose, and an `&` in `tag` appended query parameters of the caller's choosing. Both encoded, and `tag` now goes through `URLSearchParams`. `/api/:symbol`, `/steam/price/:appid` and `/jellyfin/poster/:seriesId` had the same shape and got the same treatment
- **`/jellyfin/poster/:seriesId` had been answering 500 for every id.** It asks Jellyfin for `/Items/{id}`, which on this server returns `400 Error processing request.` — not JSON — for a valid series id as readily as for a nonsense one, so `.json()` threw every time. The failure was invisible because `arrivals.js` catches it and returns `{ tag: null }`, which is also what a genuinely image-less series looks like: every episode missing its own artwork has been showing the placeholder instead of the series poster this route exists to supply. It uses the `/Items?ids=` collection form now — the same shape `/jellyfin/recent` was already using successfully two routes up. Found by A/B-ing the route against `HEAD` while checking something else, which is the only reason it was not mistaken for damage from this release
- **`/itad/*` was the one upstream with no configuration guard.** Air quality and Jellyfin both answer 503 when their keys are unset; ITAD sent `key=undefined` to isthereanydeal.com and returned whatever came back. It 503s like the other two now
- **`DESIGN.md`'s Corner Style bullet named a token deleted in v0.7.8** and gave `--radius` as 10px, which it stopped being in that same release. The search-hit `<mark>` in the notes sidebar was also the last raw `border-radius` left outside `theme.css` — 2px against a 4/8/999 scale — and is `--radius-xs` now

### Changed
- **Two modules, for two things that were being written out by hand.** `public/js/icons.js` holds the four glyphs used by more than one feature: the close cross was byte-identical in three files, the edit pencil in two, and both carried a stray `width="800px" height="800px"` that CSS had been overriding all along. Single-use glyphs stay next to the code that draws them, where they are readable. `public/js/inline-edit.js` holds the commit protocol that the ticker rename and the Turbo preset rename had each implemented separately — the one-shot guard, Enter and Escape, and the 150ms blur delay that lets a click on the trigger land before the input is torn out from under it. The two call sites keep only what genuinely differs: what to do with the value, and what to put back
- **`search.js` registers its listeners inside `initSearch()`**, like every other module, instead of half of them at import time. It was also the only module writing single quotes, the only one with no null guard, and it had a line sitting at the wrong indentation
- **Every upstream fetch has a ten-second deadline and one user agent.** There were three UA strings — the full Chrome one, a truncated copy of it, and a bare `Mozilla/5.0` — with no reason for the upstreams to disagree. And nothing carried a timeout, so an upstream that accepts a connection and then says nothing held the request until Node gave up minutes later, with the tile sitting empty throughout
- **The whole refactor moved no painted pixels**, and that was checked rather than assumed. Four of the swapped icons sit where no probe reaches, so *no probe moved* was a question, not a result: `.stocks__edit` and `.deals__remove` are both `opacity: 0` at rest. The edit pencil was temporarily filled red until `hover .stocks__card` moved, proving that probe sees it, and only then was its unchanged digest read as evidence that dropping the two `800px` attributes changed nothing
- **`.deals__row` joined the hover sweep.** `.deals__remove` draws the shared close cross and nothing could see it — which matters more after the extraction than before, since an edit to `icons.js` now lands in three components at once and only one of them was covered. Proved the same way: the cross was reddened, `hover .deals__row` and `hover .notes__row` both moved, and it was put back. Baseline is 175 probes, up from 174

### Known
- The Turbo preset row's close cross is still unprobed — reaching it needs presets in localStorage before the page loads, which the reveal sweep has no mechanism for. The `<mark>` radius is unprobed for the same shape of reason: it only paints while a notes search has results
- `public/js/arrivals.js` still references an image on `voidport.com`, so v0.7.8's "no remote asset reference remains anywhere under `public/`" was not true when it was written. Self-hosting it needs the file, which is not in the tree

## v0.7.8 — 2026-09-06
*Self-hosted fonts, and a harness that had never loaded them*

### Fixed
- **The render matrix had never loaded the webfonts.** Not once since it was written. It intercepted `fonts.googleapis.com` and served the vendored stylesheet from `test/render/vendor/`, which looked equivalent to self-hosting and was not — measured directly with `document.fonts.check()` and per-face `status`, Chrome had fetched **two of the eleven** woff2 subsets, both Noto Sans Thai, and no Geist face at all. So the notes page baselined its body text in Noto Sans Thai, the next entry in `--notes-font`; the dashboard fell through to generic `sans-serif`; and the Josefin wordmark never once rendered in Josefin. Every baseline entry touching text was recorded in the wrong typeface. Production was never affected — it fetched from Google for real, and only the harness was blind. Fourth instance of the house lesson, and the most expensive: *a probe that cannot see its target reports success*
- **`document.fonts.ready` was the wrong signal**, which is why self-hosting alone did not fix it. It resolves once nothing is *pending*, and nothing is pending before layout has demanded a face nobody has asked for yet: awaiting it let the Josefin wordmark swap in after the capture, moving `.header` between 1052 and 1056 device px run to run while peak lightness and pixel count stayed identical. `settle()` now calls `document.fonts.load()` on all eight declared faces before it proceeds. The sample string carries a Thai character deliberately — without one, Noto Sans Thai's thai subset stays unrequested and the notes list, rows and statusbar each move a few px between runs
- **Two elements were captured mid-layout.** `.utilities__card`'s children lay out for the first time when the drawer expands, and came back 82, 86 and 88 CSS px across three runs of identical code; CodeMirror measures itself over several async cycles after mount, so the notes pane keeps growing well past `readyState === "complete"`. Both are polled to a fixed point now — a rect for the card, `scrollHeight` plus five element heights for the page — rather than slept through and hoped for
- **The narrow-screen notes layout had never engaged.** The `max-width: 700px` override was `.notes__pane .notes__editor { display: none }`, two classes, against a base rule carrying three. Same layer, so specificity decided, and the base rule always won: CodeMirror stayed visible and functional below 700px while `.notes__preview` never showed. `setValue()` compounded it by returning early in `cm6` mode before ever calling `renderPreviewNow`, so the preview element held no content anywhere it *was* reachable, and `renderPreview` was never wired to CodeMirror's update listener, so it would have gone stale on the first keystroke regardless. All three fixed; the mobile design work itself is still unstarted
- **The notes search was the one text input with the UA ring suppressed and nothing in its place.** `.notes__searchbar` has no border at rest, so `:focus-within` tints the icon to accent rather than inventing one — the structural twin of the existing `.search__input-row:focus-within .search__submit` rule
- **The render matrix could not see eight of the things this release changed.** Six tracking rules and two size changes landed against probes that were structurally incapable of reporting on them — the Control Panel and Layout Customizer never open, the Turbo panel is `display: none`, and the dock tooltip sits at `top: 100%`, outside the box its own hover probe measures. A reveal sweep now opens each with the same class its JS toggles, probes it, and closes it again before the next; the note fixture gained a fenced code block and `h4`/`h5` headings, none of which any fixture carried, and `.deals__row .deals__col-review` covers the review cell — the row's, not the header's, which is what `querySelector` had been reaching. Fifth instance of the house lesson, and the first one caught before it was baselined rather than after
- **One baseline entry had never been looking at its element.** `notes-violet-w600 rest .nav-trigger` held `L=0.9702 atPeak=102` — near-white, across a hundred pixels — for a control built from an opaque `oklch(0.18)` circle, an 8%-white hairline and a `--text-secondary` glyph. Nothing in it is 0.97. All **twelve** structural twins in the same baseline — the dashboard's nav trigger at seven configs, the settings trigger at eight, the notes trigger at four other widths — read `L=0.709` at `atPeak` 1189–1255. The entry was corrected to 0.709, not updated: it recorded a capture of something else. Found by comparing against the twin rather than by re-reading the CSS, which is the technique `CLAUDE.md` already prescribes for this exact element and which nothing had thought to point at the baseline itself
- **A probe that is not a box measurement printed as five `undefined`s.** `expanded focus .utilities__card` records `{paints, restL, focusL, focusDigest}`; formatted as a box it read `L=undefined atPeak=undefined undefinedxundefined undefined` on both sides of a real change, so a regression there was invisible in the report and only findable by opening `baseline.json`. The formatter falls back to JSON for records that are not boxes
- **Three inline `font-size` strings in `deals.js`** sized the review count and the "Mixed" label from JS, where no stylesheet scan could find them. They are a `.deals__review-count` class now
- **A `TODO.md` item rested on a miscount.** "Two `style.css` breakpoints are never exercised alone" assumed five breakpoints (425/500/584/650/1024). There are three — 425, 500, 650. `584` and `1024` are `max-width` *properties* on `.search__form` and `.container`, not media queries, and the existing 640/480/400 sweep already runs all three, 650 alone at 640

### Changed
- **Fonts and uPlot are self-hosted.** `public/js/vendor/fonts.css` plus eleven woff2 subsets, and `public/js/vendor/uPlot.iife.min.js`; the latin subsets are preloaded in both documents, because self-hosting otherwise costs a three-hop chain — HTML, then `fonts.css`, then the face. No remote asset reference remains anywhere under `public/`. Privacy and latency, and it makes the render harness honest by construction: it now serves the same files the browser does
- **`@layer reset, vendor, tokens, components`.** uPlot's stylesheet is inlined into `@layer vendor` in a new `public/vendor.css` — inlined rather than `@import`-ed, which would serialize a second round trip on the critical path. It must load after `theme.css`, which declares the order; ahead of it, `vendor` would be created before `reset`. Measured exposure was nil, but unlayered CSS beats layered CSS at any specificity, so the risk was always a *future* upstream rule winning silently for a reason nobody would think to look for. CodeMirror's theme is injected at runtime by `EditorView.theme()`, cannot be wrapped from CSS, and stays unlayered permanently — which is what the `!important`s in `livepreview.js` are for
- **Focus is a text-input treatment, and that is a decision rather than a gap.** `DESIGN.md` specified focus behaviour in five places the CSS did not implement; five controls fell back to Chrome's pure-white UA ring, a lightness the palette does not contain, and one showed nothing at all. Retracted rather than built out: the five lines are corrected, a *Focus* bullet and a Don't added, and `PRODUCT.md` now records keyboard focus indication as knowingly out of scope for a pointer-first single-user page. The two existing treatments stay — the search capsule and the deals input keep their border glow
- **Every font-size in the system is a token.** Eighteen raw values became nine, then seven named steps in `theme.css`: `--text-display` (3.6rem, 3rem ≤425px), `--text-title` (1.5), `--text-headline` (1.25), `--text-subhead` (1), `--text-body` (0.875), `--text-label` (0.8), `--text-micro` (0.72) — 61 CSS declarations and 14 in `livepreview.js`. Exactly two raw sizes survive, both deliberate: `.card__icon` at 2rem, which sizes a glyph box rather than type, and inline code at `0.9em`, which is relative to its prose by design. The workhorse tier — 0.8rem, 26 rules, the most-used size in the system — had no name at all in `DESIGN.md`, which had named the rarest step and left that one anonymous
- **Markdown headings are the same size in both surfaces, and it is now structural.** `--md-h1`–`--md-h4` are deleted: `.markdown h1`–`h3` read `--text-title` / `--text-headline` / `--text-subhead` off the shared ramp, and `livepreview.js` sets CodeMirror's decorations from those same tokens. The two surfaces cannot drift because there is one set of numbers, not two sets that agree. `h4`–`h6` stop being sizes at all — Body, bold and italic, `h5`/`h6` secondary — since three heading levels are the ones anyone writes, and rank below that is better carried by style than by 0.025rem
- **`--text-reading` lasted a day.** The notes prose base sat at 0.9rem against the dashboard's 0.875 and the difference never earned a step. Reading survives in `DESIGN.md` as a *register* of Body — same size, Noto Sans Thai in the stack, line-height 1.75 — the same "one step, register set by other properties" pattern Label uses. Worth knowing if Thai starts reading tight: `body.notes` is one declaration to put back
- **Uppercase tracking follows function, not size.** Keyed on size it ran 0.08em at 1.25rem, 0.1em at 0.875–0.8rem and 0.08em again at 0.72rem — non-monotonic, unstatable without listing exceptions. It is now one sentence: `--track-wide` for anything that names something, `--track-wider` for uppercase controls. The second half is a literal invariant — **every `--track-wider` site in the system is a `<button>`**, four rules, all pressable — so the rule is falsifiable by grep rather than by eye
- **Weight at the Label tier is settled.** `.dock__tooltip` 500 → 400 and `.settings__version` 200 → 400, which leaves uppercase-at-Label as exactly two registers with nothing between them: 400 with `--track-wide` for passive labels, 600 with `--track-wider` for buttons. Weight 200 now appears at five places in the whole system — three Headlines and the two overlay headers — so **200 means "this names a region"** and carries no other job. Mixed-case at the same size still varies (500 on a ticker delta, 600 on an arrival title); that is emphasis inside the readout register, not a third one
- **Tokens for tracking, radius, chart height and the accent bloom.** `--track-normal` / `--track-wide` / `--track-wider` (30 sites), `--radius-xs` / `--radius-pill` (12), `--bloom` (4), `--chart-h` / `--chart-h-lg` (4). `--notes-radius` is gone — `--radius` went 10px → 8px, which made the two identical. No raw `letter-spacing` value survives outside `theme.css`. `--bloom` has to sit in the `body` block rather than `:root`: a `var()` inside a custom property resolves where it is *declared*, and `--accent` is out of scope on `:root`, so declared there it computes to nothing and no glow paints — silently, which is the bad kind
- **The 0.5s Customizer save fill and the 200ms view transition are both `var(--transition-normal)`.** `12s` on `ambientPulse` is the only raw time left in the CSS, deliberately. There is no `--duration-*` token and nothing wants one: the two time tokens bundle duration *and* easing, so a bare duration would not match the pattern
- Blue swatch hue 250 → 261, matching its theme. `DESIGN.md` gains **The Perceptual Swatch Exception**, with *The One Hue Rule* amended so the two do not contradict — the hue always matches; lightness and chroma may not

### Removed
- `--md-h1`–`--md-h4`, `--notes-radius`, and `--text-reading` — each folded into a token that already existed
- `test/render/vendor/` and the four interception rules that pointed at it — `fonts.googleapis.com`, `fonts.gstatic.com`, `/__fixture__/fonts/` and `unpkg.com`. The harness serves `public/` and nothing else now

## v0.7.7 — 2026-09-06
*Comment cleanup*

### Removed
- **Comments that restated the line below them.** All fourteen `<!-- Jellyfin -->`-style labels in `index.html`, each sitting above an anchor whose visible text is the same word; the Control Panel row labels in both documents, each above a row whose `<span>` already says it; and the CSS equivalents — `/* Vertical stack, centered */` over `flex-direction: column; align-items: center`, `/* Panel */` over `.customizer`, `/* Edit button */` twice in two different sections
- **The convention audit's own paper trail.** `style.css` opened by naming the bug that started the audit, and explained that `--header-text` replaced six rules, four of them measured no-ops. All accurate, none of it anything you need while reading the file — it is in git and three entries up this page
- Design-voice commentary in `notes.css` that belongs to `DESIGN.md`; load-order preambles in all four stylesheets and both documents that `CLAUDE.md` carries; the `.nav-trigger` case study in `theme.css` that has a permanent section there since v0.7.6
- Net 273 comment lines across 32 files. The rule was: keep a "why" only if silently breaking it causes a bug you cannot see in review

### Fixed
- **Ten comments were wrong rather than merely redundant**, and every one sat in the file you would open first when acting on it. `server.js` claimed `/jellyfin/recent` returns up to 12 items for the client to slice, when it returns 6 and the client doesn't. `air-quality.js` said it reads `GET /api/air` — the one path that cannot work, since `/api/:symbol` swallows it and answers with quotes for the NYSE ticker AIR. `notes/api.js` described an expired session as a Cloudflare Access redirect; Access is not in front of `/notes` yet. `theme.css` said `.utilities__card` still carries a `:link, :visited` specificity bump, deleted one release ago. `style.css` put the deals review breakpoints at 800px and 600–799px when they are 650 and 501–650, labelled `.dock__item > svg` as working for `IMG` in a document containing no `<img>`, and carried three headings for rules that had moved to `settings.css` or ceased to exist
- **The render matrix stopped measuring hidden elements**, closing the hole booked under *Known* in v0.7.5. `measure()` called a probe hidden only on a zero-sized box, which misses both ways of being invisible that leave the layout box intact — so it screenshotted `.utilities__card` inside its `max-height: 0; opacity: 0` container and hashed the backdrop behind it, peak L 0.1354 against the card's real 0.709, reporting `protected` and `{"paints": false}` with total confidence. It now refuses to sample anything failing `checkVisibility` or clipped to nothing by an ancestor, and probes the card expanded. The unlayered canary reports it **VULNERABLE, 0.709 → 0.9702** — byte-identical to `.nav-trigger`, its structural twin, where every previous run said `protected`. Baseline is 150 probes, up from 147
- The focus sweep's `.utilities__card` row in `TODO.md` was an artifact of the same hole. Measured expanded, it paints Chrome's default white ring like the other four, so it is five controls falling back to the UA ring and one showing nothing

### Changed
- **The two stroke-width blocks are down from 8 and 13 lines to 4 and 5.** Both were written while chasing the wrong root cause and `HANDOFF.md` had flagged them as suspect since the audit began. The measurements were fine; the causal story around them was not. What survives is the instruction — the glyphs are deliberately mismatched, do not "fix" either to match the other
- **`style.css` opens with `LAYOUT` and `CARDS`** instead of leaving them stranded between `SEARCH` and `GAME DEALS`. `.container` and `.section` define the page's box and `.card` defines the unit four later sections fill, so they read first. Sorting the file before and after gives identical output — every source line is byte-identical and only the order differs
- Section rules in JS all end at column 66 now, matching the file-top rule they never quite lined up with. `search.js` had never padded at all, and `markets.js` varied by 89 bytes between its own sections
- HTML section banners are all `<!-- ════ NAME ════ -->`. The `=`-ruled form they replace wasn't even self-consistent — five rule characters in one banner, seventeen in the next
- CSS subsections are unpadded `/* ── Name ── */` everywhere, which five rules in `theme.css`'s token block were the last holdouts against

## v0.7.6 — 2026-09-05
*Convention audit, part four — docs*

### Fixed
- **The changelog was missing a `## v0.7.0` header.** *Notes app*'s entries read as part of v0.7.1's "Notes chrome" because nothing above them said otherwise. Git confirms the header was never written, not stripped later — the commit that added both entries has v0.7.1's real date in it and no v0.7.0 line at all. The date given is a placeholder inside the one window it can fall in (after v0.6.0's 2026-08-24, before v0.7.1's 2026-09-03); the per-release granularity here was never captured and isn't reconstructable, same as `HANDOFF.md` already noted for this whole stretch

### Changed
- **`CLAUDE.md` reconciled with lanes A–D.** Stylesheet order now describes the cascade-layer model (layer order beats specificity across layers; load order still only breaks ties within one) instead of load order alone; `test/render/` and `npm run test:render` are in the file tree; the cross-feature-import bullet no longer claims a single exception when `markets.js` imports two more (`THEME_CHANGE`, `SETTINGS_CHANGE`) — reworded to distinguish importing an event-name constant from importing behaviour; unprefixed-only is now recorded as the standing policy on vendor CSS prefixes; and the `:visited`/`getComputedStyle` trap that started this audit has a permanent section so it isn't walked into a third time
- `.impeccable/design.json` refreshed from `DESIGN.md`

## v0.7.5 — 2026-09-05
*Convention audit, part three — fossils*

### Removed
- **`.utilities__card:link, :visited` is gone**, and it turns out it never protected anything. Lane A's own rule says why: unlayered CSS beats layered CSS at any specificity, and the bump sits in `@layer components`, so a bare `a:link` walks straight through (0,2,0) exactly as it does through `.nav-trigger`'s (0,1,0). Against a *layered* rule, plain `.utilities__card` already wins. The colour moved onto the base rule, which is where it should have been in the first place — the pair was the only place the card's colour was declared, so deleting it outright would have handed the card `--text-primary`
- `.deals__row--low .deals__name`. The class is never applied; `renderDeals()` sets `deals__row` flat and the historical-low signal has been the fire icon for a while
- Three commented-out declarations in `.stocks__range`, dating to v0.3.0, and everything they orphaned: `all: unset` leaves `border-style: none`, so the `border-color` on `:hover` and `.active` painted nothing, and the transition was animating a border and a background that don't exist
- `body::after { display: none; }`, captioned "body::after unused". A rule suppressing a pseudo-element nothing creates
- `isReady()` in `editor.js` — exported, never imported
- Four `-webkit-mask-image` and two `-webkit-overflow-scrolling: touch`, plus the `::-webkit-scrollbar` rule. The unprefixed property sat beside all four masks already, and the four weren't even consistent about which came last, so at two of the sites the prefixed copy was the one Chrome resolved. `-webkit-overflow-scrolling` has been a no-op since iOS 13. Evergreen only, as stated
- The `prefers-reduced-motion` block shortening the view transition to 80ms. It contradicted `PRODUCT.md`, which declines to honour the query on purpose

### Changed
- The notes route serves `notes.html` without an error callback. The "Notes UI not built yet." fallback was written when it wasn't; it is now, so an ENOENT should reach the error handler like any other

### Known
- **The render matrix has been measuring `.utilities__card` against empty space.** `.utilities__content` is `max-height: 0; opacity: 0` at rest and `measure()` only counts a zero-sized box as hidden, so the card keeps its layout box inside the clipped container and the probe captures the background behind it — peak L 0.1354 against the card's actual 0.709. Four baseline entries are affected, and one of them is the `focus .utilities__card {"paints": false}` that `TODO.md` cites as a control that shows nothing when tabbed to. It shows nothing because it isn't there. The canary's `protected` verdict for that element came from the same hole, which is how the fossil above kept its reputation for two lanes

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

## v0.7.0 — 2026-09-02
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