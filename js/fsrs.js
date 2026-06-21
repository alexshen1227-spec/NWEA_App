/* Math_Study — fsrs.js
 * FSRS-5 spaced-repetition scheduler (Free Spaced Repetition Scheduler).
 * Implements the DSR model (Difficulty, Stability, Retrievability) with the
 * official FSRS-5 default weights. Used at the SKILL level: each "card" is a
 * math skill; a successful/failed review updates that skill's memory state and
 * sets the next due date. Reference: open-spaced-repetition / Expertium.
 */
(function () {
  "use strict";
  const APP = (window.APP = window.APP || {});

  // FSRS-5 default weights (19 params). Do not mix with other versions' formulas.
  const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046,
    1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898,
    0.51655, 0.6621];

  const DECAY = -0.5;
  const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // = 19/81 ≈ 0.2346, so R(S,S)=0.9
  const S_MIN = 0.05, S_MAX = 3650, D_MIN = 1, D_MAX = 10;

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  // Retrievability after t days given stability S
  function retrievability(t, S) {
    if (S <= 0) return 0;
    return Math.pow(1 + FACTOR * (t / S), DECAY);
  }
  // Interval (days) to reach desired retention r from stability S
  function interval(S, r) {
    r = r || 0.9;
    return (S / FACTOR) * (Math.pow(r, 1 / DECAY) - 1);
  }

  function initStability(G) { return clamp(W[G - 1], S_MIN, S_MAX); }
  function initDifficulty(G) { return clamp(W[4] - Math.exp(W[5] * (G - 1)) + 1, D_MIN, D_MAX); }
  function D0at4() { return W[4] - Math.exp(W[5] * 3) + 1; }

  function nextDifficulty(D, G) {
    const dd = -W[6] * (G - 3);
    let Dp = D + dd * ((10 - D) / 9);          // linear damping
    let Dpp = W[7] * D0at4() + (1 - W[7]) * Dp; // mean reversion toward easy edge
    return clamp(Dpp, D_MIN, D_MAX);
  }
  function nextStabilitySuccess(D, S, R, G) {
    const hard = G === 2 ? W[15] : 1;
    const easy = G === 4 ? W[16] : 1;
    const inc = 1 + Math.exp(W[8]) * (11 - D) * Math.pow(S, -W[9]) *
      (Math.exp(W[10] * (1 - R)) - 1) * hard * easy;
    return clamp(S * inc, S_MIN, S_MAX);
  }
  function nextStabilityFail(D, S, R) {
    const sf = W[11] * Math.pow(D, -W[12]) * (Math.pow(S + 1, W[13]) - 1) * Math.exp(W[14] * (1 - R));
    return clamp(Math.min(sf, S), S_MIN, S_MAX);
  }

  // mem: {S, D, reps, lapses, lastMs, dueMs} or null for brand new.
  // grade G in 1..4 (Again/Hard/Good/Easy). nowMs, desiredRetention.
  // Returns a NEW mem object (does not mutate).
  function review(mem, G, nowMs, desiredRetention) {
    const r = desiredRetention || 0.9;
    let S, D, reps, lapses;
    if (!mem || mem.S == null) {
      S = initStability(G);
      D = initDifficulty(G);
      reps = 1;
      lapses = G === 1 ? 1 : 0;
    } else {
      const t = Math.max(0, (nowMs - mem.lastMs) / 86400000);
      const R = retrievability(t, mem.S);
      D = nextDifficulty(mem.D, G);
      if (G === 1) {
        S = nextStabilityFail(mem.D, mem.S, R);
        lapses = (mem.lapses || 0) + 1;
        reps = (mem.reps || 0) + 1;
      } else {
        S = nextStabilitySuccess(mem.D, mem.S, R, G);
        lapses = mem.lapses || 0;
        reps = (mem.reps || 0) + 1;
      }
    }
    let ivl = interval(S, r);
    // On a lapse, schedule soon (relearning). Floor/ceil intervals to whole days >= 1
    // except a lapse which we allow same-next-day.
    let dueMs;
    if (G === 1) {
      dueMs = nowMs + Math.max(0.007, Math.min(ivl, 1)) * 86400000; // within a day
    } else {
      const days = Math.max(1, Math.round(ivl));
      dueMs = nowMs + days * 86400000;
    }
    return { S, D, reps, lapses, lastMs: nowMs, dueMs };
  }

  // Derive a 1..4 grade from correctness + response time + whether it lapsed.
  // Keeps user friction low (no manual self-grading required), per research note
  // that SM-2's 0..5 scale is hard to apply consistently.
  function deriveGrade(correct, ms, opts) {
    opts = opts || {};
    if (!correct) return 1; // Again
    const fast = opts.fastMs || 12000;
    const slow = opts.slowMs || 40000;
    if (ms <= fast && !opts.usedHelp) return 4;  // Easy: quick & clean
    if (ms >= slow || opts.usedHelp) return 2;   // Hard: slow or needed a hint
    return 3;                                     // Good
  }

  APP.fsrs = {
    review, retrievability, interval, deriveGrade,
    initStability, initDifficulty, weights: W, DECAY, FACTOR
  };
})();
