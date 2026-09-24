# Render matrix

Painted-pixel regression detection for both pages, across the states a
fresh browser never reaches.

```bash
npm run test:render            # check against the baseline
npm run test:render -- --update    # rewrite the baseline
node test/render/matrix.js --only=notes-violet   # one config
```

Two things about `--update`. **Bump `VERSION` in `public/js/config.js`
first** — the footer renders it, so re-baselining before the bump leaves
three `.footer` probes failing on the version string alone. And `--only=`
is a *substring* match that combines badly with `--update`: it writes a
baseline containing only the matched configs and silently discards the
rest.

## Why pixels and not `getComputedStyle`

`getComputedStyle` reports the **unvisited** colour for `:visited`, always,
in every browser. It is deliberate anti-history-sniffing behaviour, not a
bug. During the v0.7.2 diagnosis it reported L 0.71 for the notes glyph
while the pixel on screen was genuinely 0.97, and that sent the
investigation after the wrong cause for a session and a half.

So nothing here trusts the DOM for a colour. Every number in
`baseline.json` is decoded back out of a PNG screenshot and converted to
OKLCH L, so it compares directly against the tokens in `theme.css`.

## Why `:link` stands in for `:visited`

A fresh browser profile cannot reproduce a `:visited` bug at all — it never
populates the visited-links table, so it renders the unvisited style
forever. Two attempts to reproduce that way returned false negatives.
`CSS.forcePseudoState` cannot force it either; the CDP domain does not
support it, for the same anti-sniffing reason.

`:link` is the exact structural twin: same `(0,1,1)` specificity, same
declaration, and the two match mutually exclusively. Injecting
`a:link { color: inherit }` exercises the identical cascade path with no
history required. That substitution is what actually proved the v0.7.2 root
cause, and it is what `linkCanary()` runs every time.

It runs against `.nav-trigger` and, in the expanded pass, `.utilities__card`.
Both report **vulnerable** to an unlayered rule and **protected** against a
layered one, at identical values — 0.709 to 0.9702. At `(0,1,0)` and
`(0,2,0)` respectively, neither outranks a bare `a:link`, and v0.7.2's
deletion fixed the instance rather than the class; what flips them to
protected is the cascade layer, not their specificity.

`.utilities__card` reported `protected` in both variants until v0.7.7,
which was a probe artifact and not a property of the CSS — see *Hidden
elements* below.

## Hidden elements

`measure()` refuses to sample an element that is not painting, and reports
`{hidden: true}` instead. Three ways to be invisible, only one of which is a
zero-sized box:

- `display: none` or `visibility: hidden`, anywhere up the tree
- zero effective opacity, anywhere up the tree
- clipped to nothing by an `overflow`-clipping ancestor

The first two are `checkVisibility({opacityProperty, visibilityProperty})`;
the third intersects the element's rect with each clipping ancestor's.

This matters because the missing cases leave the layout box intact. Until
v0.7.7 the probe screenshotted `.utilities__card` inside a
`max-height: 0; opacity: 0` container and hashed the backdrop behind it —
peak L 0.1354 against the card's real 0.709 — reporting `protected` and
`{paints: false}` with total confidence. Capture geometry is deliberately
unchanged by this: a partially clipped element still hashes over its whole
box, so nothing that was already looking at its target moved.

The utilities grid is the only collapsed-by-default section on either page,
so it gets an `expanded` pass at the end of `index-violet-w1400` rather than
a general mechanism. It runs last because `body`'s gradient paints over the
whole scrollable canvas: growing the page restretches it and shifts every
element's backdrop.

## Determinism

Every one of these exists because violating it makes the baseline drift for
reasons that have nothing to do with CSS. In rough order of how much
trouble each caused:

- **`--disable-gpu`.** The backdrop is two full-viewport radial gradients on
  a `will-change: opacity` compositing layer. Under GPU rasterization the
  dither pattern varies between captures — identical to the eye, identical
  in peak lightness and pixel counts, never byte-equal. Software
  rasterization is stable.
- **Animations are pinned.** `ambientPulse` runs `12s infinite alternate`,
  so every capture would otherwise sample a different phase.
- **`Date` is frozen** at a fixed instant. The header renders a live clock
  and the notes sidebar renders relative timestamps. Only the zero-argument
  forms are pinned — `format.js` builds real `Date`s from note ids and
  mtimes and has to keep working.
- **Every upstream route is fulfilled from `fixtures/`.** Prices, the
  Jellyfin library and notes all change between runs. A plain static server
  would 404 them instead, which is stable but baselines the dashboard's
  *error* states rather than its real ones.
- **Fonts and uPlot are self-hosted under `public/`**, so the static host
  serves them like any other asset and nothing reaches the network. Until
  v0.7.8 this was done by intercepting `fonts.googleapis.com` and unpkg
  instead, which looked equivalent and was not: Chrome fetched two of the
  eleven woff2 files and no Geist face at all, so every text pixel in the
  baseline was recorded in a fallback typeface. Font-swap timing moves
  every text pixel, so verify with `document.fonts.check()`, never by
  reading the stylesheet.
- **Every declared face is loaded explicitly**, not merely awaited.
  `document.fonts.ready` resolves once nothing is *pending*, which is true
  before layout has demanded a face nobody has asked for yet — the Josefin
  wordmark swapped in after the capture and moved `.header` between 1052
  and 1056 device px. `ENSURE_FONTS` calls `document.fonts.load()` on all
  eight. Its sample string has to cover every unicode-range in use: drop
  the Thai character and Noto Sans Thai's thai subset stays unrequested,
  which moves the notes list, rows and statusbar a few px per run.
- **Geometry is polled until it stops changing**, twice. `settle()` waits
  for `scrollHeight` plus five element heights to agree across four
  consecutive frames, because CodeMirror measures itself over several async
  cycles after mount and the notes pane keeps growing past `readyState`
  complete. The `.utilities__card` probe polls its own rect after expanding
  the drawer — the children lay out for the first time there, and came back
  82, 86 and 88 CSS px across three runs of identical code.
- **The capture is clamped to the painted surface.**
  `captureBeyondViewport` composites the document into a surface
  `scrollHeight` tall, and `scrollHeight` is an integer: a footer whose
  bottom sits at 1302.296875 in a document reporting 1302 gets a final
  scanline nobody painted, and an unpainted pixel decodes as pure white —
  a lightness this palette does not contain anywhere. Whether it happens
  is decided by which way the fraction rounds, so guest mode had it
  permanently (`L=1`, `atPeak` exactly the box width, against `L=0.709`
  at all seven of its structural twins) while w640 sat near the boundary
  and flipped about one run in six. `measure()` clamps the clip to
  `scrollWidth`/`scrollHeight`, which is inert everywhere the box already
  ended inside the surface.
- **Every painting-relevant `localStorage` key is written explicitly**,
  before the inline anti-flash script runs, so the baseline records an
  intended state rather than whatever a fresh profile produced.

A missing fixture fails the run loudly rather than 404ing, because a
silently empty section looks exactly like a passing capture.

## Revealed states

Anything closed, collapsed or empty at rest is invisible to the rest
pass, so `REVEALED` opens each one with the class or the click its own JS
uses, probes it, and closes it again before the next. Each entry may name
a `hover` selector, forced for the duration of its probes: the Turbo
preset row's edit and remove controls are `opacity: 0` until the row is
hovered, and the remove one draws the shared close cross from `icons.js`.

`open` and `close` are awaited, so an entry that has to wait for its own
effect polls for it rather than trusting `settleFrames` to be long
enough — the notes search waits for a `<mark>` to exist, Expanded Charts
waits for the 180px branch to be in the layout, and the deals search
waits for a result row.

Two of these are probed by id rather than by class, deliberately.
`.deals__search-btn` and `.deals__cancel-btn` each match twice in
`index.html` — the Turbo preset row carries the same two class names and
comes first in document order — so every `querySelector` for them had
been landing on the preset row and never on the section they are named
for. The pair is distinguishable in the baseline: `Save` is 244 device px
wide, `Search` is 324.

## The view transition

`theme.css` animates `::view-transition-old(root)` with
`vt-fade-out var(--transition-normal) both`. If that `var()` failed to
resolve inside the pseudo tree the shorthand would be invalid at
computed-value time, `animation-duration` would fall back to `0s`, and
the outgoing page would cut instead of fading — silently, and no capture
can see it, because this harness navigates directly and never clicks
between pages.

`viewTransitionTiming()` starts a *same-document* transition, which
builds the same pseudo elements against the same rule, and records the
resolved duration and easing. Both come from the token, and both are
read: a CSS animation carries its timing function on the keyframes, so
`getTiming().easing` reports `linear` no matter what the token says and
would have covered half the token while reporting success for the other
half. Breaking the token on purpose collapses the record to `[]`.

What that still cannot answer is whether Chrome runs a transition on a
real navigation. Checked once, out of band, by clicking `.nav-trigger` in
both directions with a document-start script recording
`document.getAnimations()`: both directions run `vt-fade-out` at duration
250, live from ~20ms to ~300ms after the incoming document starts.

## What the matrix covers, and what it deliberately does not

Not a full cross product. Verified precondition: **no stylesheet contains a
`data-theme` selector inside any `@media` block**, so themes and breakpoints
are orthogonal and crossing them measures nothing extra. Themes sweep at one
width, widths sweep at one theme — 13 configs rather than 384.

- **Themes:** violet, blue, pink, green. Black and white are out of
  scope while the light theme is WIP.
- **Widths:** 1400 / 640 / 480 / 400 on the dashboard, one just below each
  of `style.css`'s 650, 500 and 425 breakpoints. Notes has a single
  breakpoint at 700, so it runs 1400 and 600.
- **DPR** is not a page-level axis — it changes rasterization, not layout.
  It runs on the glyph coverage probe only, at 1 and 2.
- **Guest Mode** is dashboard-only. `body.guest-mode .section--homelab` is
  the only rule of its kind and notes has no such section, so running it
  there would capture an identical page twice.

## The coverage counts

`atPeak` is the number of pixels reaching the peak lightness. It is the
figure the stroke-width comments in `index.html` and `notes.html` assert,
and the only way to check them. At DPR 1 the current baseline reads:

| Glyph | pixels at full token value |
| --- | --- |
| `index.html` `.nav-trigger` | 19 |
| `notes.html` `.nav-trigger` | 28 |
| `.settings-trigger` (both) | 16 |

which is exactly what both comments claim.
