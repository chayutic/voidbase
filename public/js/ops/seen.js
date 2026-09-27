// ═══════════════════════════════════════════════════════════════
//  SEEN — which rows changed since the last visit
// ═══════════════════════════════════════════════════════════════
//
//  A visit counts once the tab has been visible for VISIT_MS, and from
//  then on it records the `generated` of each board it shows. The next
//  visit lights every row whose `since` is later. Both times come from
//  the collector's clock, so a browser's own clock can't skew it.

import * as store from "../store.js";
import { KEYS }   from "../store.js";

const VISIT_MS = 5_000;

let before  = store.str(KEYS.opsSeen);
let counted = false;
let showing = null;
let timer;

function record() {
  if (counted && showing) store.set(KEYS.opsSeen, showing);
}

function startVisit() {
  before  = store.str(KEYS.opsSeen);
  counted = false;
  clearTimeout(timer);
  timer = setTimeout(() => {
    counted = true;
    record();
  }, VISIT_MS);
}

/** Whether a row that changed at `since` is news to this visit. The
 *  first visit ever has nothing to compare with, so nothing is. */
export function isNew(since) {
  return before !== null && Date.parse(since) > Date.parse(before);
}

/** The board on screen now came from a health.json of this date. */
export function shown(generated) {
  showing = generated;
  record();
}

export function initSeen() {
  if (document.visibilityState === "visible") startVisit();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      startVisit();
    } else {
      clearTimeout(timer);
      counted = false;
    }
  });
}
