/* Math_Study — engine.js
 * Session construction + response processing. Glues the FSRS scheduler, the
 * skill catalog, and the ability estimator together, implementing the
 * research-backed loop: interleaved due reviews + a capped number of new skills,
 * successive relearning (wrong -> requeue same session), slip-vs-bug tracking,
 * and a fresh problem instance every time.
 */
(function () {
  "use strict";
  const APP = (window.APP = window.APP || {});
  const U = APP.util, fsrs = APP.fsrs, ability = APP.ability;

  function S() { return APP.store.state; }

  // ---- ability (estimated RIT proxy) ----
  function estimateAbility() {
    const st = S();
    const resp = ability.fromLog(st.log, { halfLifeDays: 21, maxN: 400, nowMs: U.nowMs() });
    return ability.estimate(resp, { mean: st.settings.baselineRIT, sd: 30 });
  }

  // ---- mastery helpers ----
  function skillStrength(id) {
    const r = S().skills[id];
    if (!r || !r.introduced || !r.mem) return 0;
    return U.clamp(r.mem.S / 21, 0, 1); // ~3-week stability counts as full strength
  }
  function isMastered(id) {
    const r = S().skills[id];
    return !!(r && r.mem && r.mem.S >= 21 && r.attempts >= 2 && r.correct / r.attempts >= 0.7);
  }
  function domainMastery(domain) {
    const ids = APP.skills.filter(s => s.domain === domain).map(s => s.id);
    if (!ids.length) return 0;
    return ids.reduce((a, id) => a + skillStrength(id), 0) / ids.length;
  }
  function predictedRecall(id) {
    const r = S().skills[id];
    if (!r || !r.mem) return 0;
    const t = U.daysBetween(r.mem.lastMs, U.nowMs());
    return fsrs.retrievability(t, r.mem.S);
  }
  // accuracy over the most recent n attempts of a single skill (from the log)
  function recentAccuracy(id, n) {
    const log = S().log; let seen = 0, correct = 0;
    for (let i = log.length - 1; i >= 0 && seen < (n || 6); i--) {
      if (log[i].skillId === id) { seen++; if (log[i].correct) correct++; }
    }
    return seen ? correct / seen : null;
  }
  // adaptive within-skill difficulty (1=easy, 2=medium, 3=hard): keep every rep
  // at the student's edge. Brand-new -> gentle; acing it -> push; struggling -> ease.
  function targetDifficulty(id) {
    const r = S().skills[id];
    if (!r || !r.introduced || (r.attempts || 0) === 0) return 1;
    const acc = recentAccuracy(id, 6); const strength = skillStrength(id);
    if (acc == null) return 1;
    if (acc >= 0.8 && strength >= 0.45) return 3;
    if (acc < 0.5 || strength < 0.2) return 1;
    return 2;
  }
  // the student's weakest introduced skills (their highest-leverage practice)
  function weakSkills(n) {
    return APP.skills.filter(s => { const r = S().skills[s.id]; return r && r.introduced && (r.attempts || 0) >= 1; })
      .map(s => {
        const r = S().skills[s.id];
        const acc = r.attempts ? r.correct / r.attempts : 0;
        const weakness = (1 - skillStrength(s.id)) * 0.5 + (1 - acc) * 0.5 + (r.bugs || 0) * 0.02;
        return { skill: s, weakness };
      })
      .sort((a, b) => b.weakness - a.weakness)
      .slice(0, n || 8).map(x => x.skill);
  }

  // ---- session construction ----
  function dueList(now) {
    return APP.skills.filter(s => {
      const r = S().skills[s.id];
      return r && r.introduced && r.mem && r.mem.dueMs <= now;
    }).sort((a, b) => S().skills[a.id].mem.dueMs - S().skills[b.id].mem.dueMs);
  }
  function newCandidates(target) {
    // Introduce skills closest to the growth edge first (a few points below the
    // student's baseline = desirable-difficulty zone), so the high-yield 261-270
    // band appears immediately rather than after days of easy review. Trivial and
    // far-stretch skills come last. Tie-break easiest-first.
    const t = target == null ? (S().settings.baselineRIT - 2) : target;
    return APP.skills.filter(s => !S().skills[s.id] || !S().skills[s.id].introduced)
      .sort((a, b) => (Math.abs(a.rit - t) - Math.abs(b.rit - t)) || (a.rit - b.rit));
  }
  // spread items so the same domain isn't back-to-back where avoidable (interleaving)
  function spreadByDomain(items) {
    const out = [];
    const pool = items.slice();
    let guard = 0;
    while (pool.length && guard++ < 10000) {
      let idx = 0;
      const lastDom = out.length ? out[out.length - 1].domain : null;
      if (lastDom) { const j = pool.findIndex(it => it.domain !== lastDom); if (j >= 0) idx = j; }
      out.push(pool.splice(idx, 1)[0]);
    }
    return out;
  }

  function buildSession(opts) {
    opts = opts || {};
    const st = S();
    const now = U.nowMs();
    const target = opts.target || st.settings.sessionTarget;
    const todayKey = U.todayKey();
    const introducedToday = (st.daily[todayKey] || {}).newIntroduced || 0;

    const due = dueList(now).slice(0, target).map(s => ({ skillId: s.id, domain: s.domain, kind: "due", isNew: false, needsLearn: false }));

    let remaining = Math.max(0, target - due.length);
    // First-ever session: introduce more so the 261-270 growth band shows up on day one.
    const firstDay = st.totals.problems === 0;
    const newCap = firstDay ? Math.min(target, 16) : st.settings.dailyNew;
    const newAllowed = Math.max(0, newCap - introducedToday);
    const newItems = newCandidates().slice(0, Math.min(newAllowed, remaining))
      .map(s => ({ skillId: s.id, domain: s.domain, kind: "new", isNew: true, needsLearn: true }));

    let items = due.concat(newItems);

    // If the day is light, add reinforcement: introduced skills with the lowest
    // predicted recall (extra retrieval practice — they still update normally).
    if (items.length < Math.min(10, target)) {
      const have = new Set(items.map(i => i.skillId));
      const reinforce = APP.skills.filter(s => { const r = st.skills[s.id]; return r && r.introduced && !have.has(s.id); })
        .sort((a, b) => predictedRecall(a.id) - predictedRecall(b.id))
        .slice(0, Math.min(10, target) - items.length)
        .map(s => ({ skillId: s.id, domain: s.domain, kind: "reinforce", isNew: false, needsLearn: false }));
      items = items.concat(reinforce);
    }

    items = spreadByDomain(items);
    // attach a fresh problem seed + adaptive difficulty to each (new skills start gentle)
    items.forEach(it => { it.seed = U.newSeed(); it.diff = it.isNew ? 1 : targetDifficulty(it.skillId); });
    return items;
  }

  // a focused session built from the student's weakest skills (their fruit)
  function buildFocusSession(n) {
    return weakSkills(n || 12).map(s => ({
      skillId: s.id, domain: s.domain, kind: "focus", isNew: false, needsLearn: false,
      seed: U.newSeed(), diff: targetDifficulty(s.id)
    }));
  }

  // a quick diagnostic: one problem from a spread of skills across difficulty &
  // domain, no teaching, one-shot — seeds the ability estimate and finds weak spots fast.
  function buildCalibration(n) {
    n = n || 14;
    const sorted = APP.skills.slice().sort((a, b) => a.rit - b.rit);
    const picked = []; const seen = new Set();
    const step = sorted.length / n;
    for (let i = 0; i < n; i++) { const s = sorted[Math.min(sorted.length - 1, Math.floor(i * step))]; if (!seen.has(s.id)) { seen.add(s.id); picked.push(s); } }
    // ensure at least 2 per domain
    const byDom = {}; APP.skills.forEach(s => { (byDom[s.domain] = byDom[s.domain] || []).push(s); });
    Object.keys(byDom).forEach(d => {
      while (picked.filter(s => s.domain === d).length < 2) {
        const s = byDom[d].find(x => !seen.has(x.id)); if (!s) break; seen.add(s.id); picked.push(s);
      }
    });
    return picked.map(s => ({ skillId: s.id, domain: s.domain, kind: "calibrate", isNew: false, needsLearn: false, seed: U.newSeed(), diff: 2 }));
  }

  // build the actual problem object for an item (fresh instance from its seed + difficulty)
  function makeProblem(item) {
    const skill = APP.skillById[item.skillId];
    const rng = U.makeRng(item.seed);
    const diff = item.diff != null ? item.diff : targetDifficulty(item.skillId);
    const p = skill.gen(rng, diff);
    p.skill = skill;
    p.item = item;
    p.diff = diff;
    return p;
  }

  // ---- response processing ----
  // returns { grade, correct, requeue, slip }
  function processResponse(item, problem, correct, msTaken, usedHelp) {
    const st = S();
    const skill = APP.skillById[item.skillId];
    const r = APP.store.skillRec(item.skillId);
    const now = U.nowMs();

    // slip vs bug: a miss on a skill you usually know (fast + historically accurate) is a slip.
    let slip = false;
    if (!correct) {
      const acc = r.attempts ? r.correct / r.attempts : 0;
      const knew = (r.mem && predictedRecall(item.skillId) > 0.8) || (r.attempts >= 3 && acc > 0.8);
      slip = knew && msTaken < 25000;
      if (slip) r.slips++; else r.bugs++;
    }

    const grade = fsrs.deriveGrade(correct, msTaken, { usedHelp });
    const wasIntroduced = r.introduced;
    r.mem = fsrs.review(r.mem, grade, now, st.settings.desiredRetention);
    r.introduced = true;
    r.attempts++; if (correct) r.correct++;
    r.lastMs = now;

    // log (drives ability estimate)
    st.log.push({ ms: now, skillId: item.skillId, d: skill.rit, correct: correct ? 1 : 0, taken: msTaken, grade, seed: item.seed, diff: item.diff });

    // daily + totals
    const day = APP.store.dailyRec();
    day.problems++; if (correct) day.correct++; day.seconds += Math.round(msTaken / 1000);
    if (!wasIntroduced && item.isNew) day.newIntroduced++;
    st.totals.problems++; if (correct) st.totals.correct++; st.totals.seconds += Math.round(msTaken / 1000);

    // error log for missed problems (store seed + difficulty to regenerate exact item)
    if (!correct) st.errors.push({ skillId: item.skillId, seed: item.seed, diff: item.diff, ms: now });

    APP.store.save();
    return { grade, correct, requeue: !correct, slip };
  }

  // call at the end of a session: update streak + snapshot estimated RIT for the day
  function endSession() {
    const st = S();
    const todayKey = U.todayKey();
    // streak
    const last = st.streak.lastDay;
    if (last !== todayKey) {
      const yesterday = U.todayKey(new Date(U.nowMs() - U.DAY_MS));
      st.streak.current = (last === yesterday) ? st.streak.current + 1 : 1;
      st.streak.longest = Math.max(st.streak.longest, st.streak.current);
      st.streak.lastDay = todayKey;
    }
    st.totals.sessions++;
    // RIT snapshot (one per day, replace with latest)
    const est = estimateAbility();
    const existing = st.ritHistory.find(h => h.dayKey === todayKey);
    if (existing) { existing.theta = est.theta; existing.sem = est.sem; existing.ms = U.nowMs(); }
    else st.ritHistory.push({ dayKey: todayKey, ms: U.nowMs(), theta: est.theta, sem: est.sem });
    APP.store.flush();
    return est;
  }

  function counts() {
    const now = U.nowMs();
    const todayKey = U.todayKey();
    const introducedToday = (S().daily[todayKey] || {}).newIntroduced || 0;
    return {
      due: dueList(now).length,
      newAvail: Math.max(0, S().settings.dailyNew - introducedToday),
      newRemaining: newCandidates().length,
      mastered: APP.skills.filter(s => isMastered(s.id)).length,
      introduced: APP.skills.filter(s => { const r = S().skills[s.id]; return r && r.introduced; }).length,
      total: APP.skills.length,
      practicedToday: (S().daily[todayKey] || {}).problems || 0
    };
  }

  APP.engine = {
    estimateAbility, buildSession, buildFocusSession, buildCalibration, makeProblem, processResponse, endSession, counts,
    skillStrength, isMastered, domainMastery, predictedRecall, targetDifficulty, weakSkills, recentAccuracy
  };
})();
