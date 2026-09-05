// ═══════════════════════════════════════════════════════════════
//  MAIN — entry point
// ═══════════════════════════════════════════════════════════════
//
//  Loaded as <script type="module">, so it runs after the document is
//  parsed. Every module can query the DOM at import time; none of them
//  need a DOMContentLoaded guard.
//
//  Order matters in two places:
//    · theme first, so the palette is on <body> before anything paints
//    · customizer next, so section order and visibility are settled
//      before the data-fetching features start filling them in
//  The rest are independent.

import { initTheme }      from "./theme.js";
import { initCustomizer } from "./customizer.js";
import { initSettings }   from "./settings.js";
import { initClock }      from "./clock.js";
import { initAirQuality } from "./air-quality.js";
import { initDock }       from "./dock.js";
import { initSearch }     from "./search.js";
import { initUtilities }  from "./utilities.js";
import { initMarkets }    from "./markets.js";
import { initDeals }      from "./deals.js";
import { initArrivals }   from "./arrivals.js";

// Layout and chrome
initTheme();
initCustomizer();
initSettings();

// Header and navigation
initClock();
initAirQuality();
initDock();
initSearch();
initUtilities();

// Data sections
initMarkets();
initDeals();
initArrivals();
