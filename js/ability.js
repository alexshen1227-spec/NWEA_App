/* Math_Study — ability.js
 * Rasch (1-parameter logistic / IRT) ability estimation — the same family of
 * model NWEA MAP uses to produce a RIT score. We estimate the student's ability
 * theta (on the RIT scale) by maximum likelihood over their recent responses,
 * each response being a Bernoulli trial at a skill of known RIT difficulty.
 *
 * Honest disclaimer (surfaced in the UI): this is a *practice-based proxy*, not
 * an official NWEA score. But it is a principled one: P(correct) = logistic of
 * (theta - difficulty), MLE-fit, with a Fisher-information standard error.
 *
 * Scale convention: 1 logit = 10 RIT points (the historical RIT<->logit linear
 * transform). So P = 1 / (1 + exp(-(theta - d)/10)).
 */
(function () {
  "use strict";
  const APP = (window.APP = window.APP || {});
  const SCALE = 10; // RIT points per logit

  function pCorrect(theta, d) { return 1 / (1 + Math.exp(-(theta - d) / SCALE)); }

  // responses: array of {d: difficultyRIT, x: 0|1, w?: weight}
  // prior: {mean, sd} weak Gaussian prior to stabilize early estimates.
  // Returns {theta, sem, n}.
  function estimate(responses, prior) {
    prior = prior || { mean: 250, sd: 40 };
    let theta = prior.mean;
    if (!responses || responses.length === 0) {
      return { theta, sem: prior.sd, n: 0 };
    }
    const priorPrec = 1 / (prior.sd * prior.sd);
    // Newton-Raphson on penalized log-likelihood
    for (let iter = 0; iter < 60; iter++) {
      let g = -priorPrec * (theta - prior.mean); // gradient from prior
      let h = -priorPrec;                         // hessian from prior
      for (const r of responses) {
        const w = r.w == null ? 1 : r.w;
        const p = pCorrect(theta, r.d);
        g += w * (r.x - p) / SCALE;
        h += -w * p * (1 - p) / (SCALE * SCALE);
      }
      if (Math.abs(h) < 1e-9) break;
      const step = g / h;
      theta -= step;
      theta = Math.max(120, Math.min(320, theta));
      if (Math.abs(step) < 1e-4) break;
    }
    // Fisher information (data only) for SEM
    let info = 0;
    for (const r of responses) {
      const w = r.w == null ? 1 : r.w;
      const p = pCorrect(theta, r.d);
      info += w * p * (1 - p) / (SCALE * SCALE);
    }
    info += priorPrec;
    const sem = Math.sqrt(1 / Math.max(info, 1e-9));
    return { theta, sem, n: responses.length };
  }

  // Build weighted responses from a response log with recency time-decay.
  // log entries: {d, correct, ms (timestamp)}. halfLifeDays controls decay.
  function fromLog(log, opts) {
    opts = opts || {};
    const halfLife = opts.halfLifeDays || 14;
    const maxN = opts.maxN || 400;
    const now = opts.nowMs || Date.now();
    const recent = log.slice(-maxN);
    return recent.map(e => {
      const ageDays = Math.max(0, (now - e.ms) / 86400000);
      const w = Math.pow(0.5, ageDays / halfLife);
      return { d: e.d, x: e.correct ? 1 : 0, w };
    });
  }

  APP.ability = { estimate, fromLog, pCorrect, SCALE };
})();
