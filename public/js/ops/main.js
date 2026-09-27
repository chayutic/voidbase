// ═══════════════════════════════════════════════════════════════
//  OPS — entry point
// ═══════════════════════════════════════════════════════════════

import { initTheme }    from "../theme.js";
import { initSettings } from "../settings.js";
import { initClock }    from "../clock.js";
import { initHealth }   from "./health.js";
import { initSeen }     from "./seen.js";

initTheme();
initSettings();
initClock();
initHealth();
initSeen();
