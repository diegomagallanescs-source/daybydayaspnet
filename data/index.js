/* ============================================================
   data/index.js — combines all days into a single ALL_DAYS array
   and attaches it to the window for the page scripts to read.
   ============================================================ */
window.ALL_DAYS = []
  .concat(typeof DAYS_1_9 !== 'undefined' ? DAYS_1_9 : [])
  .concat(typeof DAYS_10_17 !== 'undefined' ? DAYS_10_17 : [])
  .concat(typeof DAYS_18_25 !== 'undefined' ? DAYS_18_25 : []);
