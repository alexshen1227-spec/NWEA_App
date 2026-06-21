/* Node test harness for Math_Study. Loads the browser modules with a window
 * shim and exhaustively exercises every generator + the FSRS/ability math.
 *   run:  node tools/test.js
 */
const fs = require("fs");
const path = require("path");
const win = {};
function load(rel) {
  const code = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
  // run with `window` bound to our shim (avoids strict-mode global assignment issues)
  new Function("window", code)(win);
}
["js/util.js", "js/fsrs.js", "js/ability.js", "js/skills.js"].forEach(load);
const APP = win.APP;

let pass = 0, fail = 0;
const fails = [];
function check(cond, msg) { if (cond) pass++; else { fail++; fails.push(msg); } }

// ---- 1. Generators ----
const ITER = 400;
const stemHas = (s) => typeof s === "string" && s.replace(/<[^>]*>/g, "").trim().length > 0;
for (const sk of APP.skills) {
  check(stemHas(sk.name), `skill ${sk.id}: missing name`);
  check(typeof sk.rit === "number" && sk.rit > 150 && sk.rit < 300, `skill ${sk.id}: bad rit ${sk.rit}`);
  check(!!APP.domains[sk.domain], `skill ${sk.id}: unknown domain ${sk.domain}`);
  check(sk.teach && stemHas(sk.teach.idea), `skill ${sk.id}: missing teach.idea`);
  let okCorrect = 0, okWrong = 0, errs = 0, mcBad = 0, n = 0;
  for (let i = 0; i < ITER; i++) {
    const rng = APP.util.makeRng(APP.util.newSeed());
    let p;
    try { p = sk.gen(rng); } catch (e) { errs++; if (errs <= 2) fails.push(`${sk.id} threw: ${e.message}`); continue; }
    n++;
    if (!stemHas(p.stem)) { fails.push(`${sk.id}: empty stem`); fail++; }
    if (!Array.isArray(p.solution) || p.solution.length === 0) { fails.push(`${sk.id}: empty solution`); fail++; }
    if (p.kind === "mc") {
      const t = p._test;
      if (t.nchoices >= 2 && t.nchoices <= 4 && t.nok === 1) { /*ok*/ } else mcBad++;
      if (p.check(null, t.idx) === true) okCorrect++;
      const wrongIdx = (t.idx + 1) % t.nchoices;
      if (p.check(null, wrongIdx) === false) okWrong++;
    } else {
      if (p._test && p.check(p._test.raw) === true) okCorrect++;
      if (p._test && p.check(p._test.bad) === false) okWrong++;
    }
  }
  check(errs === 0, `skill ${sk.id}: ${errs} generator exceptions`);
  check(mcBad === 0, `skill ${sk.id}: ${mcBad} MC problems with bad choice counts`);
  check(okCorrect === n, `skill ${sk.id}: correct-answer accepted ${okCorrect}/${n}`);
  check(okWrong === n, `skill ${sk.id}: wrong-answer rejected ${okWrong}/${n}`);
}

// ---- 2. FSRS sanity ----
(function () {
  const now = Date.now();
  let m = APP.fsrs.review(null, 3, now, 0.9);
  check(m.S > 0 && m.D >= 1 && m.D <= 10, "fsrs: init state in range");
  check(m.dueMs > now, "fsrs: first due in future");
  // a string of "Good" reviews should grow the interval (stability)
  let prevS = m.S, grew = true;
  for (let i = 0; i < 5; i++) {
    const t = m.dueMs;
    const m2 = APP.fsrs.review(m, 3, t, 0.9);
    if (m2.S <= prevS) grew = false;
    prevS = m2.S; m = m2;
  }
  check(grew, "fsrs: stability grows across successful reviews");
  // a lapse should not increase stability
  const beforeFail = m.S;
  const mf = APP.fsrs.review(m, 1, m.dueMs, 0.9);
  check(mf.S <= beforeFail, "fsrs: lapse does not increase stability");
  check(mf.dueMs - m.dueMs <= 86400000 * 1.1, "fsrs: lapse reschedules within ~a day");
  // grade derivation
  check(APP.fsrs.deriveGrade(false, 5000) === 1, "fsrs: wrong -> Again");
  check(APP.fsrs.deriveGrade(true, 3000) === 4, "fsrs: fast correct -> Easy");
  check(APP.fsrs.deriveGrade(true, 50000) === 2, "fsrs: slow correct -> Hard");
})();

// ---- 3. Ability estimator: should recover a known theta ----
(function () {
  const trueTheta = 268;
  const skills = APP.skills.map(s => s.rit);
  function trial(d) { return Math.random() < APP.ability.pCorrect(trueTheta, d) ? 1 : 0; }
  const responses = [];
  for (let i = 0; i < 600; i++) { const d = skills[i % skills.length]; responses.push({ d, x: trial(d) }); }
  const est = APP.ability.estimate(responses, { mean: 250, sd: 40 });
  check(Math.abs(est.theta - trueTheta) < 8, `ability: recovered theta ${est.theta.toFixed(1)} (true ${trueTheta})`);
  check(est.sem > 0 && est.sem < 15, `ability: sem reasonable ${est.sem.toFixed(2)}`);
  // monotonic: more correct -> higher theta
  const allRight = APP.ability.estimate(skills.map(d => ({ d, x: 1 })), { mean: 250, sd: 40 });
  const allWrong = APP.ability.estimate(skills.map(d => ({ d, x: 0 })), { mean: 250, sd: 40 });
  check(allRight.theta > allWrong.theta, "ability: all-correct > all-wrong");
})();

// ---- report ----
const total = pass + fail;
console.log(`\nMath_Study self-test: ${pass}/${total} checks passed.`);
console.log(`Skills: ${APP.skills.length}  ·  Reference cards: ${APP.reference.length}  ·  Domains: ${Object.keys(APP.domains).length}`);
if (fail) { console.log(`\n${fail} FAILURES:`); [...new Set(fails)].slice(0, 40).forEach(f => console.log("  ✗ " + f)); process.exit(1); }
else console.log("ALL GREEN ✓");
