# Render matrix

Painted-pixel regression detection for both pages, across the states a
fresh browser never reaches.

```bash
npm run test:render            # check against the baseline
npm run test:render -- --update    # rewrite the baseline
node test/render/matrix.js --only=notes-violet   # one config
```

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

The canary currently reports `.nav-trigger` as **vulnerable**: at `(0,1,0)`
it is still outranked by any bare `a:link`/`a:visited` rule. v0.7.2 deleted
the offending rule, which fixed the instance but not the class. Lane A's
cascade layers are what flip this to `protected`; `.utilities__card` is
already protected, by the `:link, :visited` specificity bump that Lane B is
weighing.

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
- **Fonts and uPlot come from `vendor/`**, never the network. Font-swap
  timing moves every text pixel.
- **Every painting-relevant `localStorage` key is written explicitly**,
  before the inline anti-flash script runs, so the baseline records an
  intended state rather than whatever a fresh profile produced.

A missing fixture fails the run loudly rather than 404ing, because a
silently empty section looks exactly like a passing capture.

## What the matrix covers, and what it deliberately does not

Not a full cross product. Verified precondition: **no stylesheet contains a
`data-theme` selector inside any `@media` block**, so themes and breakpoints
are orthogonal and crossing them measures nothing extra. Themes sweep at one
width, widths sweep at one theme — 13 configs rather than 384.

- **Themes:** violet, blue, pink, green. Black, white and beige are out of
  scope while the light themes are WIP.
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
