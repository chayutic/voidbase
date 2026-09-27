// ═══════════════════════════════════════════════════════════════
//  OPS — entry point
// ═══════════════════════════════════════════════════════════════

import { initTheme }    from "../theme.js";
import { initSettings } from "../settings.js";
import { initHealth }   from "./health.js";

initTheme();
initSettings();
initHealth();
