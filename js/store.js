/* Math_Study — store.js
 * State + localStorage persistence. One source of truth: APP.store.state.
 */
(function () {
  "use strict";
  const APP = (window.APP = window.APP || {});
  const U = APP.util;
  const KEY = "mathstudy.v1";

  function defaultState() {
    return {
      version: 1,
      createdMs: U.nowMs(),
      settings: { dailyNew: 8, sessionTarget: 24, desiredRetention: 0.9, baselineRIT: 264 },
      skills: {},            // id -> { mem, introduced, attempts, correct, slips, bugs, lastMs }
      log: [],               // response log (capped)
      daily: {},             // dateKey -> { problems, correct, seconds, newIntroduced }
      ritHistory: [],        // [{dayKey, ms, theta, sem}]
      errors: [],            // recent misses [{skillId, seed, ms}]
      streak: { current: 0, longest: 0, lastDay: null },
      totals: { problems: 0, correct: 0, seconds: 0, sessions: 0 }
    };
  }

  let state = null;
  let saveTimer = null;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { state = migrate(JSON.parse(raw)); }
      else { state = defaultState(); }
    } catch (e) { state = defaultState(); }
    return state;
  }
  function migrate(s) {
    const d = defaultState();
    // shallow-merge to tolerate older/newer shapes
    s.settings = Object.assign(d.settings, s.settings || {});
    for (const k of ["skills", "daily"]) s[k] = s[k] || {};
    for (const k of ["log", "ritHistory", "errors"]) s[k] = Array.isArray(s[k]) ? s[k] : [];
    s.streak = Object.assign(d.streak, s.streak || {});
    s.totals = Object.assign(d.totals, s.totals || {});
    s.version = 1;
    return s;
  }
  function save() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 250);
  }
  function flush() {
    try {
      // cap log/errors to keep storage small
      if (state.log.length > 2000) state.log = state.log.slice(-2000);
      if (state.errors.length > 60) state.errors = state.errors.slice(-60);
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      // Don't fail silently: tell the user once that progress isn't being saved
      // (e.g. private-browsing mode, storage blocked, or quota exceeded).
      if (!flush._warned) {
        flush._warned = true;
        if (APP.ui && APP.ui.toast) APP.ui.toast("⚠ Progress could NOT be saved (private mode or storage full). Use Settings → Export to back up.");
        try { console.warn("mathstudy: persist failed", e); } catch (_) { }
      }
    }
  }

  function skillRec(id) {
    if (!state.skills[id]) {
      state.skills[id] = { mem: null, introduced: false, attempts: 0, correct: 0, slips: 0, bugs: 0, lastMs: 0 };
    }
    return state.skills[id];
  }
  function dailyRec(key) {
    key = key || U.todayKey();
    if (!state.daily[key]) state.daily[key] = { problems: 0, correct: 0, seconds: 0, newIntroduced: 0 };
    return state.daily[key];
  }

  function reset() { state = defaultState(); flush(); }
  function exportJSON() { return JSON.stringify(state, null, 2); }
  function importJSON(str) {
    const obj = JSON.parse(str);
    state = migrate(obj); flush(); return true;
  }

  APP.store = { load, save, flush, reset, exportJSON, importJSON, skillRec, dailyRec, defaultState, get state() { return state; } };
})();
