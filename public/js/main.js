// ═══════════════════════════════════════════════════════════════
//  MAIN — entry point
// ═══════════════════════════════════════════════════════════════
//
//  Init order does not matter. Theme, display toggles and section
//  layout are applied by inline scripts in index.html before first
//  paint, so nothing below waits on anything else.

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
