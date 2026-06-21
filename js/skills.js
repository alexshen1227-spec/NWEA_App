/* Math_Study — skills.js
 * The content catalog. Each skill = one spaced-repetition "card" with:
 *   - metadata (domain, RIT difficulty, CCSS tag)
 *   - teaching content (key idea + meaning-anchored mnemonic + worked example)
 *   - a parametric generator gen(rng) producing a FRESH problem each review
 *     (varied practice -> learn the principle, not a memorized instance).
 *
 * Content is concentrated on the NWEA math RIT 261-270 growth band, with 271-280
 * stretch skills, per the research. Difficulties (rit) feed the Rasch estimator.
 */
(function () {
  "use strict";
  const APP = (window.APP = window.APP || {});
  const U = APP.util;
  const { poly, quad, lin, sup, sqrtHTML, fracHTML, radicalHTML, simplifyRadical, round, approxEq, parseNum, parseNumList } = U;

  // ----- Domains (mapped to NWEA / CCSS instructional strands) -----
  APP.domains = {
    algebra:   { name: "Algebra & Equations",          strand: "Operations & Algebraic Thinking — CCSS A-REI · A-SSE · A-APR", color: "#6366f1" },
    numbers:   { name: "Numbers, Exponents & Radicals", strand: "The Real & Complex Number Systems — CCSS N-RN · N-CN · N-Q",   color: "#0ea5e9" },
    functions: { name: "Functions & Sequences",         strand: "Functions — CCSS F-IF · F-BF · F-LE",                          color: "#10b981" },
    geometry:  { name: "Geometry & Trigonometry",       strand: "Geometry — CCSS G-SRT · G-C · G-GPE · G-GMD",                  color: "#f59e0b" },
    stats:     { name: "Statistics & Probability",      strand: "Statistics & Probability — CCSS S-ID · S-CP",                  color: "#ef4444" }
  };

  // ----- helpers -----
  // distractors: array of strings OR { html, miss } where miss = a targeted
  // explanation of the misconception that produces that wrong choice.
  function mkMC(rng, correctHTML, distractors) {
    const seen = new Set([correctHTML]);
    const ds = [];
    for (const d of distractors) {
      const html = typeof d === "string" ? d : (d && d.html);
      const miss = (d && typeof d === "object") ? (d.miss || null) : null;
      if (!html || seen.has(html)) continue;
      seen.add(html); ds.push({ html, ok: false, miss });
    }
    let choices = [{ html: correctHTML, ok: true, miss: null }].concat(ds.slice(0, 3));
    return rng.shuffle(choices);
  }
  // o.misses (optional): [{ near: value, tol?, msg } | { when: (v)=>bool, msg }]
  // diagnose(raw) returns a targeted explanation if the wrong answer matches a
  // known mistake, else o.miss, else null.
  function numMisses(o, raw) {
    const v = parseNum(raw); if (isNaN(v)) return o.miss || null;
    for (const m of (o.misses || [])) {
      if (m.when && m.when(v)) return m.msg;
      if (m.near != null && approxEq(v, m.near, m.tol == null ? (o.tol == null ? 0.01 : o.tol) : m.tol)) return m.msg;
    }
    return o.miss || null;
  }
  function numProblem(o) {
    return {
      kind: "number", stem: o.stem, diagram: o.diagram || null,
      input: { kind: "number", placeholder: o.placeholder || "answer", suffix: o.suffix || "" },
      answerHTML: o.answerHTML, solution: o.solution, hint: o.hint || null, verify: o.verify || null,
      _test: { raw: String(o.answer), bad: String(o.answer + 9.123) },
      check: (raw) => approxEq(parseNum(raw), o.answer, o.tol == null ? 0.01 : o.tol),
      diagnose: (raw) => numMisses(o, raw)
    };
  }
  function listProblem(o) {
    return {
      kind: "list", stem: o.stem, diagram: o.diagram || null,
      input: { kind: "text", placeholder: o.placeholder || "e.g. 3, -2" },
      answerHTML: o.answerHTML, solution: o.solution, hint: o.hint || null, verify: o.verify || null,
      _test: { raw: o.targets.join(", "), bad: "917, 918" },
      check: (raw) => {
        const got = parseNumList(raw); const tol = o.tol == null ? 0.03 : o.tol;
        if (o.ordered) return o.targets.every((t, i) => got[i] != null && approxEq(got[i], t, tol));
        return got.length >= o.targets.length && o.targets.every(t => got.some(v => approxEq(v, t, tol)));
      },
      diagnose: (raw) => { const got = parseNumList(raw); for (const m of (o.misses || [])) { if (m.when && m.when(got)) return m.msg; } return o.miss || null; }
    };
  }
  function mcProblem(o, choices) {
    return {
      kind: "mc", stem: o.stem, diagram: o.diagram || null,
      input: { kind: "mc", choices: choices },
      answerHTML: o.answerHTML || (choices.find(c => c.ok) || {}).html,
      solution: o.solution, hint: o.hint || null, verify: o.verify || null,
      _test: { idx: choices.findIndex(c => c.ok), nchoices: choices.length, nok: choices.filter(c => c.ok).length },
      check: (raw, idx) => !!(choices[idx] && choices[idx].ok),
      diagnose: (raw, idx) => (choices[idx] && !choices[idx].ok && choices[idx].miss) ? choices[idx].miss : (o.miss || null)
    };
  }
  const pm = (n) => (n < 0 ? "&minus; " + Math.abs(n) : "+ " + n);   // " + 3" / " − 3"
  const neg = (n) => (n < 0 ? "&minus;" + Math.abs(n) : "" + n);
  // pick a value by difficulty level (1=easy, 2=medium, 3=hard). Generators
  // accept an optional 2nd arg gen(rng, diff); legacy generators ignore it.
  const D = (diff, easy, med, hard) => (diff <= 1 ? easy : (diff >= 3 ? hard : med));

  // small right-triangle / shape SVG helpers
  function svgRight(aLabel, bLabel, cLabel) {
    return `<svg viewBox="0 0 180 130" class="diagram" width="180" height="130">
      <polygon points="20,110 160,110 20,20" fill="rgba(99,102,241,.10)" stroke="currentColor" stroke-width="2"/>
      <rect x="20" y="96" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"/>
      <text x="90" y="125" text-anchor="middle" class="dlbl">${bLabel || ""}</text>
      <text x="8" y="68" text-anchor="middle" class="dlbl">${aLabel || ""}</text>
      <text x="98" y="58" text-anchor="middle" class="dlbl">${cLabel || ""}</text>
    </svg>`;
  }

  // =========================================================================
  // SKILL CATALOG
  // =========================================================================
  const S = [];

  // ---------------------------- ALGEBRA ------------------------------------
  S.push({
    id: "lin-multi", name: "Multi-step linear equations", domain: "algebra", rit: 250, tag: "A-REI.3",
    teach: {
      idea: "Undo operations in reverse order (reverse PEMDAS): clear addition/subtraction first, then multiplication/division. Whatever you do to one side, do to the other.",
      example: { stem: "Solve 3x + 7 = 22", steps: ["3x = 22 − 7 = 15", "x = 15 ÷ 3 = <b>5</b>"] }
    },
    gen(rng) {
      const x = rng.int(-9, 9), a = rng.nonzero(2, 9), b = rng.int(-12, 12), c = a * x + b;
      return numProblem({
        stem: `Solve for x:&nbsp; ${a}x ${pm(b)} = ${c}`,
        answer: x, answerHTML: `x = ${x}`,
        solution: [`${a}x = ${c} ${pm(-b)} = ${c - b}`, `x = ${neg(c - b)} ÷ ${a} = <b>${x}</b>`]
      });
    }
  });

  S.push({
    id: "lin-bothsides", name: "Variables on both sides", domain: "algebra", rit: 256, tag: "A-REI.3",
    teach: {
      idea: "Collect variable terms on one side and constants on the other, then divide. Moving a term across the equals sign flips its sign.",
      example: { stem: "Solve 5x − 4 = 2x + 11", steps: ["5x − 2x = 11 + 4", "3x = 15", "x = <b>5</b>"] }
    },
    gen(rng) {
      const x = rng.int(-8, 8); let a = rng.nonzero(2, 9), c = rng.nonzero(-8, 8);
      while (a === c) c = rng.nonzero(-8, 8);
      const b = rng.int(-10, 10); const d = (a - c) * x + b;
      return numProblem({
        stem: `Solve for x:&nbsp; ${a}x ${pm(b)} = ${c}x ${pm(d)}`,
        answer: x, answerHTML: `x = ${x}`,
        solution: [`${a}x ${c < 0 ? "+ " + Math.abs(c) : "− " + c}x = ${d} ${pm(-b)}`,
        `${a - c}x = ${d - b}`, `x = <b>${x}</b>`]
      });
    }
  });

  S.push({
    id: "lin-inequality", name: "Linear inequalities (flip rule)", domain: "algebra", rit: 261, tag: "A-REI.3",
    teach: {
      idea: "Solve like an equation — but <b>flip the inequality sign whenever you multiply or divide by a negative number</b>.",
      mnemonic: "Negative flip: −2x &lt; 6 → x &gt; −3 (sign flipped).",
      example: { stem: "Solve −2x + 1 < 9", steps: ["−2x < 8", "Divide by −2 → <b>flip</b>:  x > −4"] }
    },
    gen(rng) {
      const a = rng.nonzero(2, 6) * rng.sign(), b = rng.int(-8, 8), kx = rng.int(-6, 6);
      const c = a * kx + b; const ops = ["<", ">", "≤", "≥"]; const op = rng.pick(ops);
      // solving a x + b op c -> x ? (c-b)/a, flip if a<0
      const flip = { "<": ">", ">": "<", "≤": "≥", "≥": "≤" };
      const resOp = a < 0 ? flip[op] : op;
      const bound = (c - b) / a;
      const correct = `x ${resOp} ${bound}`;
      const distract = [`x ${op} ${bound}`, `x ${resOp} ${round((c - b) * a, 2)}`, `x ${flip[resOp]} ${bound}`];
      return mcProblem({
        stem: `Solve:&nbsp; ${a}x ${pm(b)} ${op} ${c}`,
        solution: [`${a}x ${op} ${c - b}`,
        a < 0 ? `Divide by ${a} (negative) → <b>flip the sign</b>` : `Divide by ${a}`,
        `<b>x ${resOp} ${bound}</b>`],
        verify: "Did you remember to flip the sign if you divided by a negative?"
      }, mkMC(rng, correct, distract));
    }
  });

  S.push({
    id: "sys-linear", name: "Systems of linear equations", domain: "algebra", rit: 263, tag: "A-REI.6",
    teach: {
      idea: "Use elimination (add/subtract equations to cancel a variable) or substitution. The solution (x, y) is where the two lines cross.",
      example: { stem: "x + y = 7,  x − y = 1", steps: ["Add: 2x = 8 → x = 4", "y = 7 − 4 = <b>3</b> → (4, 3)"] }
    },
    gen(rng) {
      const x = rng.int(-6, 6), y = rng.int(-6, 6);
      const a1 = rng.nonzero(1, 5), b1 = rng.nonzero(1, 5), c1 = a1 * x + b1 * y;
      let a2 = rng.nonzero(1, 5), b2 = rng.nonzero(1, 5);
      while (a1 * b2 - a2 * b1 === 0) { a2 = rng.nonzero(1, 5); b2 = rng.nonzero(1, 5); }
      const c2 = a2 * x + b2 * y;
      const eq = (a, b, c) => `${a}x ${pm(b)}y = ${c}`;
      return {
        kind: "list", stem: `Solve the system. Enter x, y:<br>${eq(a1, b1, c1)}<br>${eq(a2, b2, c2)}`,
        input: { kind: "text", placeholder: "x, y  (e.g. 4, 3)" },
        answerHTML: `(${x}, ${y})`, hint: "Multiply an equation so one variable cancels when you add.",
        verify: "Plug (x, y) back into BOTH equations — do both hold?",
        solution: [`Solve by elimination/substitution.`, `x = ${x},  y = ${y}`, `Solution: <b>(${x}, ${y})</b>`],
        _test: { raw: `${x}, ${y}`, bad: "99, 99" },
        check: (raw) => { const g = parseNumList(raw); return g[0] != null && approxEq(g[0], x, 0.03) && approxEq(g[1], y, 0.03); }
      };
    }
  });

  S.push({
    id: "binom-mult", name: "Multiply binomials (FOIL)", domain: "algebra", rit: 261, tag: "A-APR.1",
    teach: {
      idea: "FOIL = First, Outer, Inner, Last. It is just the distributive property applied twice — anchor it to an area model (a rectangle split into 4 pieces).",
      mnemonic: "FOIL: (a+b)(c+d) = ac + ad + bc + bd.",
      example: { stem: "(x + 3)(x − 5)", steps: ["x·x + x·(−5) + 3·x + 3·(−5)", "x² − 5x + 3x − 15", "<b>x² − 2x − 15</b>"] }
    },
    gen(rng) {
      const p = rng.nonzero(-7, 7), q = rng.nonzero(-7, 7);
      const b = p + q, c = p * q;
      const correct = quad(1, b, c);
      const d1 = quad(1, p * q, p + q), d2 = quad(1, b, -c), d3 = quad(1, p - q, c);
      return mcProblem({
        stem: `Expand:&nbsp; (x ${pm(p)})(x ${pm(q)})`,
        solution: [`First/Outer/Inner/Last: x² ${pm(p)}x ${pm(q)}x ${pm(c)}`, `<b>${correct}</b>`]
      }, mkMC(rng, correct, [d1, d2, d3]));
    }
  });

  S.push({
    id: "factor-quad", name: "Factor quadratics", domain: "algebra", rit: 262, tag: "A-SSE.3",
    teach: {
      idea: "To factor x² + bx + c, find two numbers that <b>multiply to c</b> and <b>add to b</b>. Difference of squares: a² − b² = (a+b)(a−b).",
      example: { stem: "Factor x² + 7x + 12", steps: ["Need product 12, sum 7 → 3 and 4", "<b>(x + 3)(x + 4)</b>"] }
    },
    gen(rng) {
      const p = rng.nonzero(-8, 8), q = rng.nonzero(-8, 8);
      const b = p + q, c = p * q;
      const f = (r) => `(x ${pm(r)})`;
      const correct = `${f(p)}${f(q)}`;
      const distract = [`${f(-p)}${f(-q)}`, `${f(p)}${f(-q)}`, `(x ${pm(b)})(x ${pm(c / (b || 1) | 0)})`];
      return mcProblem({
        stem: `Factor:&nbsp; ${quad(1, b, c)}`,
        solution: [`Two numbers with product ${c}, sum ${b}: ${p} and ${q}`, `<b>${correct}</b>`],
        verify: "Multiply your factors back out — do you recover the original?"
      }, mkMC(rng, correct, distract));
    }
  });

  S.push({
    id: "quad-factor", name: "Solve quadratics by factoring", domain: "algebra", rit: 264, tag: "A-REI.4",
    teach: {
      idea: "Set the equation = 0, factor, then use the <b>Zero-Product Property</b>: if AB = 0 then A = 0 or B = 0.",
      example: { stem: "x² − x − 6 = 0", steps: ["(x − 3)(x + 2) = 0", "x = 3 or x = −2"] }
    },
    gen(rng) {
      const p = rng.int(-8, 8), q = rng.int(-8, 8);
      const b = -(p + q), c = p * q;
      return listProblem({
        stem: `Solve (enter both roots):&nbsp; ${quad(1, b, c)} = 0`,
        targets: [p, q], answerHTML: `x = ${p}, ${q}`,
        solution: [`Factor: (x ${pm(-p)})(x ${pm(-q)}) = 0`, `Zero-product → x = ${p} or x = ${q}`]
      });
    }
  });

  S.push({
    id: "quad-formula", name: "Quadratic formula", domain: "algebra", rit: 267, tag: "A-REI.4",
    teach: {
      idea: "For ax² + bx + c = 0:  x = (−b ± √(b² − 4ac)) / (2a). Works for every quadratic.",
      mnemonic: "Sing it to <i>Pop Goes the Weasel</i>: “x equals negative b, plus or minus the square root, of b-squared minus four-a-c, all over two-a.”",
      example: { stem: "x² − 4x + 1 = 0", steps: ["a=1, b=−4, c=1; disc = 16 − 4 = 12", "x = (4 ± √12)/2 = 2 ± √3 ≈ 3.73, 0.27"] }
    },
    gen(rng) {
      let a, b, c, disc, r1, r2;
      do {
        a = rng.pick([1, 1, 1, 2]); b = rng.nonzero(-9, 9); c = rng.int(-8, 8);
        disc = b * b - 4 * a * c;
      } while (disc <= 0 || disc > 400);
      r1 = (-b - Math.sqrt(disc)) / (2 * a); r2 = (-b + Math.sqrt(disc)) / (2 * a);
      return listProblem({
        stem: `Solve with the quadratic formula. Round roots to 2 decimals:&nbsp; ${quad(a, b, c)} = 0`,
        targets: [round(r1, 2), round(r2, 2)], tol: 0.03, answerHTML: `x ≈ ${round(r1, 2)}, ${round(r2, 2)}`,
        hint: "x = (−b ± √(b²−4ac)) / 2a",
        solution: [`a=${a}, b=${b}, c=${c}`, `discriminant = ${b}² − 4(${a})(${c}) = ${disc}`,
        `x = (${-b} ± √${disc}) / ${2 * a}`, `<b>x ≈ ${round(r1, 2)} and ${round(r2, 2)}</b>`]
      });
    }
  });

  S.push({
    id: "discriminant", name: "The discriminant", domain: "algebra", rit: 264, tag: "A-REI.4b",
    teach: {
      idea: "The discriminant Δ = b² − 4ac tells how many <i>real</i> solutions a quadratic has, without solving it.",
      mnemonic: "Δ &gt; 0 → two real roots · Δ = 0 → one (repeated) root · Δ &lt; 0 → no real roots (two complex).",
      example: { stem: "x² + 2x + 5: Δ = 4 − 20 = −16 < 0 → no real solutions." }
    },
    gen(rng) {
      const a = rng.pick([1, 1, 2]); const b = rng.int(-7, 7); const c = rng.int(-6, 8);
      const disc = b * b - 4 * a * c;
      const ans = disc > 0 ? "Two real solutions" : disc === 0 ? "One real solution" : "No real solutions";
      return mcProblem({
        stem: `How many real solutions?&nbsp; ${quad(a, b, c)} = 0`,
        solution: [`Δ = b² − 4ac = ${b}² − 4(${a})(${c}) = ${disc}`,
        `${disc > 0 ? "Δ > 0" : disc === 0 ? "Δ = 0" : "Δ < 0"} → <b>${ans}</b>`]
      }, mkMC(rng, ans, ["Two real solutions", "One real solution", "No real solutions"].filter(x => x !== ans)));
    }
  });

  S.push({
    id: "vertex-form", name: "Vertex of a parabola", domain: "algebra", rit: 266, tag: "F-IF.8",
    teach: {
      idea: "For y = ax² + bx + c, the vertex x-coordinate is h = −b/(2a); plug it in for k. Vertex = (h, k); axis of symmetry is x = h.",
      example: { stem: "y = x² − 6x + 5", steps: ["h = −(−6)/2 = 3", "k = 9 − 18 + 5 = −4 → vertex (3, −4)"] }
    },
    gen(rng) {
      const a = rng.pick([1, 1, 2]); const h = rng.int(-5, 5); const k = rng.int(-8, 8);
      const b = -2 * a * h, c = a * h * h + k;
      return {
        kind: "list", stem: `Find the vertex (enter h, k):&nbsp; y = ${quad(a, b, c)}`,
        input: { kind: "text", placeholder: "h, k" }, answerHTML: `(${h}, ${k})`,
        hint: "h = −b / (2a), then k = y(h).",
        solution: [`h = −b/2a = ${-b}/${2 * a} = ${h}`, `k = ${a}(${h})² ${pm(b * h)} ${pm(c)} = ${k}`, `Vertex <b>(${h}, ${k})</b>`],
        _test: { raw: `${h}, ${k}`, bad: "99, 99" },
        check: (raw) => { const g = parseNumList(raw); return g[0] != null && approxEq(g[0], h, 0.03) && approxEq(g[1], k, 0.03); }
      };
    }
  });

  S.push({
    id: "sys-lin-quad", name: "Line–parabola intersections", domain: "algebra", rit: 270, tag: "A-REI.7",
    teach: {
      idea: "Set the line equal to the parabola, move everything to one side, and solve the resulting quadratic. The x-solutions are the intersection x-values.",
      example: { stem: "y = x² and y = x + 6", steps: ["x² = x + 6 → x² − x − 6 = 0", "(x−3)(x+2)=0 → x = 3, −2"] }
    },
    gen(rng) {
      const p = rng.int(-5, 5), q = rng.int(-5, 5); const m = p + q, b = -p * q;
      return listProblem({
        stem: `Find the intersection x-values of&nbsp; y = x²&nbsp; and&nbsp; y = ${lin(m, b)} :`,
        targets: [p, q], answerHTML: `x = ${p}, ${q}`,
        solution: [`x² = ${lin(m, b)}`, `x² ${pm(-m)}x ${pm(-b)} = 0`, `(x ${pm(-p)})(x ${pm(-q)}) = 0`, `<b>x = ${p}, ${q}</b>`]
      });
    }
  });

  // -------------------- NUMBERS / EXPONENTS / RADICALS ---------------------
  S.push({
    id: "exp-rules", name: "Exponent rules", domain: "numbers", rit: 256, tag: "N-RN.1",
    teach: {
      idea: "Same base: multiply → ADD exponents; divide → SUBTRACT; power of a power → MULTIPLY. Also a⁰ = 1 and a⁻ⁿ = 1/aⁿ.",
      mnemonic: "Don't memorize — derive: a³·a² = (aaa)(aa) = a⁵.",
      example: { stem: "(2³ · 2⁴) / 2⁵", steps: ["2^(3+4−5) = 2² = <b>4</b>"] }
    },
    gen(rng) {
      const base = rng.pick([2, 3, 5]); const e1 = rng.int(2, 5), e2 = rng.int(1, 4), e3 = rng.int(1, 4);
      const exp = e1 + e2 - e3; const val = Math.pow(base, exp);
      return numProblem({
        stem: `Evaluate:&nbsp; ( ${base}${sup(e1)} · ${base}${sup(e2)} ) ÷ ${base}${sup(e3)}`,
        answer: val, answerHTML: `${base}${sup(exp)} = ${val}`,
        solution: [`Add/subtract exponents: ${base}^(${e1}+${e2}−${e3}) = ${base}${sup(exp)}`, `= <b>${val}</b>`]
      });
    }
  });

  S.push({
    id: "rational-exp", name: "Rational exponents", domain: "numbers", rit: 265, tag: "N-RN.1",
    teach: {
      idea: "a^(m/n) = (ⁿ√a)^m = ⁿ√(aᵐ). The denominator is the root, the numerator is the power.",
      example: { stem: "27^(2/3)", steps: ["³√27 = 3", "3² = <b>9</b>"] }
    },
    gen(rng, diff) {
      const k = rng.int(2, D(diff, 4, 5, 6));
      const d = rng.pick(D(diff, [2, 3], [2, 3], [2, 3, 4]));
      let n = rng.int(2, D(diff, 3, 4, 4)); if (n === d) n = (d === 2 ? 3 : 2);
      const base = Math.pow(k, d), powVal = Math.pow(k, n);
      const negative = diff >= 2 && rng.bool(0.35);
      const expHTML = negative ? `&minus;${n}/${d}` : `${n}/${d}`;
      const misses = [{ near: base * n / d, msg: "Don't multiply base × exponent — the denominator is a ROOT, the numerator is a POWER." }];
      if (negative) misses.push({ near: powVal, msg: "A NEGATIVE exponent means take the reciprocal — the answer is 1 over that." });
      return numProblem({
        stem: `Evaluate:&nbsp; ${base}${sup(expHTML)}`,
        answer: negative ? 1 / powVal : powVal,
        answerHTML: negative ? fracHTML(1, powVal) : `${powVal}`, tol: negative ? 0.0005 : 0.01,
        solution: [`The ${d}th root of ${base} is ${k}`, `${k}${sup((negative ? "&minus;" : "") + n)} = <b>${negative ? fracHTML(1, powVal) : powVal}</b>`],
        misses
      });
    }
  });

  S.push({
    id: "simplify-radical", name: "Simplify radicals", domain: "numbers", rit: 264, tag: "N-RN.2",
    teach: {
      idea: "Pull out the largest perfect-square factor: √(a²·b) = a√b.",
      example: { stem: "√72", steps: ["72 = 36 · 2", "√36 · √2 = <b>6√2</b>"] }
    },
    gen(rng) {
      let n; do { n = rng.int(8, 200); } while (U.isPerfectSquare(n) || simplifyRadical(n).coef === 1);
      const { coef, rad } = simplifyRadical(n);
      const correct = radicalHTML(coef, rad);
      const distract = [radicalHTML(coef * 2, Math.max(1, Math.round(rad / 4))), radicalHTML(1, n), radicalHTML(coef, rad * 2)];
      return mcProblem({
        stem: `Simplify:&nbsp; ${sqrtHTML(n)}`,
        solution: [`${n} = ${coef * coef} · ${rad}`, `${sqrtHTML(coef * coef)} · ${sqrtHTML(rad)} = <b>${correct}</b>`]
      }, mkMC(rng, correct, distract));
    }
  });

  S.push({
    id: "radical-ops", name: "Operations with radicals", domain: "numbers", rit: 267, tag: "N-RN.2",
    teach: {
      idea: "Multiply radicals: √a · √b = √(ab), then simplify. Add/subtract only LIKE radicals (same radicand), like combining like terms.",
      example: { stem: "2√3 · √6", steps: ["2√18 = 2·3√2 = <b>6√2</b>"] }
    },
    gen(rng) {
      const a = rng.int(1, 4), b = rng.pick([2, 3, 5, 6]), c = rng.int(1, 4), d = rng.pick([2, 3, 5, 6]);
      const insideRaw = b * d; const { coef, rad } = simplifyRadical(insideRaw);
      const outCoef = a * c * coef;
      const correct = radicalHTML(outCoef, rad);
      const distract = [radicalHTML(a * c, insideRaw), radicalHTML(outCoef + 1, rad), radicalHTML(a + c, rad)];
      return mcProblem({
        stem: `Simplify:&nbsp; ${radicalHTML(a, b)} · ${radicalHTML(c, d)}`,
        solution: [`${a * c}·√(${b}·${d}) = ${a * c}√${insideRaw}`, `√${insideRaw} = ${coef}√${rad}`, `<b>${correct}</b>`]
      }, mkMC(rng, correct, distract));
    }
  });

  S.push({
    id: "proportion", name: "Proportions & scale", domain: "numbers", rit: 252, tag: "N-Q.1",
    teach: {
      idea: "A proportion sets two ratios equal: a/b = c/d. Cross-multiply (a·d = b·c) and solve.",
      example: { stem: "3/4 = x/20", steps: ["4x = 60", "x = <b>15</b>"] }
    },
    gen(rng) {
      const k = rng.int(2, 9), a = rng.int(2, 9), b = rng.int(2, 9); const c = a * k, d = b * k;
      // a/b = x/d  -> x = a*d/b ; choose so integer
      const x = a * d / b;
      return numProblem({
        stem: `Solve the proportion:&nbsp; ${fracHTML(a, b)} = ${fracHTML("x", d)}`,
        answer: x, answerHTML: `x = ${x}`, tol: 0.02,
        solution: [`Cross-multiply: ${b}x = ${a}·${d} = ${a * d}`, `x = <b>${x}</b>`]
      });
    }
  });

  S.push({
    id: "percent", name: "Percents & percent change", domain: "numbers", rit: 254, tag: "N-Q.1",
    teach: {
      idea: "“% of” means multiply by the decimal. Percent change = (new − old)/old × 100%.",
      example: { stem: "18% of 250", steps: ["0.18 × 250 = <b>45</b>"] }
    },
    gen(rng) {
      if (rng.bool()) {
        const p = rng.pick([5, 10, 12, 15, 18, 20, 25, 30, 40]); const base = rng.int(2, 40) * 5;
        const val = p / 100 * base;
        return numProblem({ stem: `What is ${p}% of ${base}?`, answer: val, answerHTML: `${val}`, tol: 0.01,
          solution: [`${p}% = ${p / 100}`, `${p / 100} × ${base} = <b>${val}</b>`] });
      } else {
        const old = rng.int(2, 20) * 10; const pc = rng.pick([10, 15, 20, 25, 50]); const up = rng.bool();
        const neu = up ? old * (1 + pc / 100) : old * (1 - pc / 100);
        return numProblem({ stem: `A value ${up ? "increases" : "decreases"} from ${old} to ${round(neu, 2)}. What is the percent change? (just the number)`,
          answer: up ? pc : -pc, answerHTML: `${up ? "" : "−"}${pc}%`, tol: 0.5,
          solution: [`change = ${round(neu - old, 2)}`, `${round(neu - old, 2)} / ${old} × 100 = <b>${up ? "" : "−"}${pc}%</b>`] });
      }
    }
  });

  S.push({
    id: "sci-notation", name: "Scientific notation", domain: "numbers", rit: 258, tag: "N-Q",
    teach: {
      idea: "a × 10ⁿ with 1 ≤ a < 10. Multiplying: multiply the fronts, ADD the exponents; dividing: divide the fronts, SUBTRACT the exponents. Renormalize so 1 ≤ a < 10.",
      example: { stem: "(3 × 10⁴)(2 × 10³)", steps: ["6 × 10⁷"] }
    },
    gen(rng) {
      const a = rng.int(2, 9), b = rng.int(2, 9), e1 = rng.int(2, 6), e2 = rng.int(1, 5);
      let front = a * b, exp = e1 + e2;
      while (front >= 10) { front /= 10; exp += 1; }
      const correct = `${round(front, 2)} × 10${sup(exp)}`;
      const distract = [`${a * b} × 10${sup(e1 + e2)}`, `${round(front, 2)} × 10${sup(e1 * e2)}`, `${round(front, 2)} × 10${sup(exp - 1)}`];
      return mcProblem({
        stem: `Simplify to scientific notation:&nbsp; (${a} × 10${sup(e1)})(${b} × 10${sup(e2)})`,
        solution: [`Fronts: ${a}·${b} = ${a * b}; exponents: ${e1}+${e2} = ${e1 + e2}`,
        `Renormalize → <b>${correct}</b>`]
      }, mkMC(rng, correct, distract));
    }
  });

  S.push({
    id: "complex-num", name: "Complex numbers", domain: "numbers", rit: 273, tag: "N-CN.1", stretch: true,
    teach: {
      idea: "i = √(−1), so i² = −1. Simplify √(−n) = i√n. Add/subtract by combining real and imaginary parts separately.",
      mnemonic: "Powers of i cycle every 4: i, −1·… actually i¹=i, i²=−1, i³=−i, i⁴=1, then repeat.",
      example: { stem: "√(−12)", steps: ["√(−1)·√12 = i·2√3 = <b>2i√3</b>"] }
    },
    gen(rng) {
      if (rng.bool()) {
        let n; do { n = rng.int(2, 80); } while (U.isPerfectSquare(n) || simplifyRadical(n).coef === 1);
        const { coef, rad } = simplifyRadical(n);
        const correct = `${coef}i${sqrtHTML(rad)}`;
        return mcProblem({ stem: `Simplify:&nbsp; ${sqrtHTML("&minus;" + n)}`,
          solution: [`√(−${n}) = i√${n} = i·${coef}√${rad}`, `<b>${correct}</b>`] },
          mkMC(rng, correct, [`${coef}${sqrtHTML(rad)}`, `${coef * 2}i${sqrtHTML(rad)}`, `i${sqrtHTML(n)}`]));
      } else {
        const a = rng.nonzero(-6, 6), b = rng.nonzero(-6, 6), c = rng.nonzero(-6, 6), d = rng.nonzero(-6, 6);
        const re = a + c, im = b + d;
        const fmt = (r, i) => `${r} ${i < 0 ? "−" : "+"} ${Math.abs(i)}i`;
        const correct = fmt(re, im);
        return mcProblem({ stem: `Add:&nbsp; (${fmt(a, b)}) + (${fmt(c, d)})`,
          solution: [`Real: ${a}+${c}=${re}; Imag: ${b}+${d}=${im}`, `<b>${correct}</b>`] },
          mkMC(rng, correct, [fmt(re + 1, im), fmt(a + b, c + d), fmt(re, -im)]));
      }
    }
  });

  // ----------------------------- FUNCTIONS ---------------------------------
  S.push({
    id: "func-eval", name: "Function notation & evaluation", domain: "functions", rit: 255, tag: "F-IF.2",
    teach: {
      idea: "f(k) means substitute k for every x and compute. f(x) is just a rule, not multiplication.",
      example: { stem: "f(x)=2x²−3x+1, find f(4)", steps: ["2(16) − 12 + 1 = 32 − 12 + 1 = <b>21</b>"] }
    },
    gen(rng) {
      const a = rng.nonzero(1, 3), b = rng.int(-5, 5), c = rng.int(-6, 6), k = rng.int(-4, 5);
      const val = a * k * k + b * k + c;
      return numProblem({
        stem: `Given f(x) = ${quad(a, b, c)}, find f(${k}).`,
        answer: val, answerHTML: `f(${k}) = ${val}`,
        solution: [`f(${k}) = ${a}(${k})² ${pm(b)}(${k}) ${pm(c)}`, `= ${a * k * k} ${pm(b * k)} ${pm(c)} = <b>${val}</b>`]
      });
    }
  });

  S.push({
    id: "slope-line", name: "Slope from two points", domain: "functions", rit: 256, tag: "F-IF.6",
    teach: {
      idea: "Slope m = (y₂ − y₁)/(x₂ − x₁) = rise/run. Positive = uphill, negative = downhill.",
      example: { stem: "(1, 2) and (4, 11)", steps: ["m = (11−2)/(4−1) = 9/3 = <b>3</b>"] }
    },
    gen(rng) {
      let x1 = rng.int(-6, 6), x2 = rng.int(-6, 6); while (x2 === x1) x2 = rng.int(-6, 6);
      const m = rng.nonzero(-4, 4); const y1 = rng.int(-6, 6); const y2 = y1 + m * (x2 - x1);
      return numProblem({
        stem: `Find the slope of the line through (${x1}, ${y1}) and (${x2}, ${y2}).`,
        answer: m, answerHTML: `m = ${m}`, tol: 0.02,
        solution: [`m = (${y2} − ${y1}) / (${x2} − ${x1}) = ${y2 - y1}/${x2 - x1}`, `= <b>${m}</b>`]
      });
    }
  });

  S.push({
    id: "linear-eq", name: "Equation of a line", domain: "functions", rit: 257, tag: "F-LE.2",
    teach: {
      idea: "Slope-intercept form y = mx + b. Find m, then use a point to solve for b (the y-intercept).",
      example: { stem: "slope 2 through (3, 5)", steps: ["5 = 2(3) + b → b = −1", "y = 2x − 1"] }
    },
    gen(rng) {
      const m = rng.nonzero(-4, 4), b = rng.int(-6, 6), x1 = rng.nonzero(-5, 5); const y1 = m * x1 + b;
      const correct = `y = ${lin(m, b)}`;
      return mcProblem({
        stem: `Write the equation of the line with slope ${m} through (${x1}, ${y1}).`,
        solution: [`y = ${m}x + b; plug in: ${y1} = ${m}(${x1}) + b → b = ${b}`, `<b>${correct}</b>`]
      }, mkMC(rng, correct, [`y = ${lin(m, -b)}`, `y = ${lin(-m, b)}`, `y = ${lin(b, m)}`]));
    }
  });

  S.push({
    id: "domain-range", name: "Domain & range", domain: "functions", rit: 266, tag: "F-IF.1",
    teach: {
      idea: "Domain = allowed x-inputs; range = possible y-outputs. √ needs a non-negative inside; fractions can't divide by 0; a parabola's range starts at its vertex.",
      example: { stem: "y = √(x − 4)", steps: ["Inside ≥ 0 → x ≥ 4; outputs ≥ 0 → range y ≥ 0"] }
    },
    gen(rng) {
      const type = rng.pick(["sqrt", "rational", "parabola"]);
      if (type === "sqrt") {
        const c = rng.int(1, 8); const correct = `Domain: x ≥ ${c}`;
        return mcProblem({ stem: `Domain of&nbsp; y = ${sqrtHTML("x &minus; " + c)} ?`,
          solution: [`Need x − ${c} ≥ 0`, `<b>x ≥ ${c}</b>`] },
          mkMC(rng, correct, [
            { html: `Domain: x ≤ ${c}`, miss: "Flipped — the inside of a square root must be ≥ 0, so x − c ≥ 0 gives x ≥ c." },
            `Domain: x > ${c}`, `All real numbers`]));
      } else if (type === "rational") {
        const c = rng.nonzero(-6, 6); const correct = `All reals except x = ${c}`;
        return mcProblem({ stem: `Domain of&nbsp; y = ${fracHTML(1, "x " + pm(-c))} ?`,
          solution: [`Denominator ≠ 0 → x ≠ ${c}`, `<b>${correct}</b>`] },
          mkMC(rng, correct, [`All real numbers`, `x = ${c} only`, `x ≥ ${c}`]));
      } else {
        const k = rng.int(-6, 6); const up = rng.bool();
        const correct = up ? `Range: y ≥ ${k}` : `Range: y ≤ ${k}`;
        return mcProblem({ stem: `Range of&nbsp; y = ${up ? "" : "&minus;"}x² ${pm(k)} ?`,
          solution: [`Vertex y-value is ${k}; parabola opens ${up ? "up" : "down"}`, `<b>${correct}</b>`] },
          mkMC(rng, correct, [up ? `Range: y ≤ ${k}` : `Range: y ≥ ${k}`, `All real numbers`, `Range: y ≥ 0`]));
      }
    }
  });

  S.push({
    id: "transformations", name: "Function transformations", domain: "functions", rit: 267, tag: "F-BF.3",
    teach: {
      idea: "From y = f(x): (x − h) shifts RIGHT h (opposite of the sign), + k shifts UP k; a negative in front reflects over the x-axis; a coefficient >1 stretches vertically.",
      mnemonic: "Inside the parentheses lies, outside tells the truth: (x−3) moves right 3, +2 outside moves up 2.",
      example: { stem: "y = (x − 4)² + 3 vs y = x²", steps: ["Right 4, up 3"] }
    },
    gen(rng) {
      const h = rng.nonzero(-5, 5), k = rng.nonzero(-5, 5);
      const correct = `Right ${h >= 0 ? h : `${Math.abs(h)} (left)`}, ${k >= 0 ? "up " + k : "down " + Math.abs(k)}`;
      const hword = h >= 0 ? `Right ${h}` : `Left ${Math.abs(h)}`;
      const kword = k >= 0 ? `up ${k}` : `down ${Math.abs(k)}`;
      const c2 = `${hword}, ${kword}`;
      return mcProblem({
        stem: `Describe the transformation of&nbsp; y = (x ${pm(-h)})² ${pm(k)}&nbsp; from&nbsp; y = x².`,
        answerHTML: c2,
        solution: [`(x ${pm(-h)}) → shift <b>${hword.toLowerCase()}</b> (opposite of the sign inside)`,
        `${pm(k)} outside → <b>${kword}</b>`]
      }, mkMC(rng, c2, [`${h >= 0 ? "Left" : "Right"} ${Math.abs(h)}, ${kword}`, `${hword}, ${k >= 0 ? "down" : "up"} ${Math.abs(k)}`, `${h >= 0 ? "Left" : "Right"} ${Math.abs(h)}, ${k >= 0 ? "down" : "up"} ${Math.abs(k)}`]));
    }
  });

  S.push({
    id: "arith-seq", name: "Arithmetic sequences", domain: "functions", rit: 257, tag: "F-LE.2",
    teach: {
      idea: "Constant difference d. nth term: aₙ = a₁ + (n − 1)d.",
      example: { stem: "3, 7, 11, … find a₁₀", steps: ["a₁=3, d=4", "3 + 9·4 = <b>39</b>"] }
    },
    gen(rng) {
      const a1 = rng.int(-6, 10), d = rng.nonzero(-6, 7), n = rng.int(6, 20);
      const an = a1 + (n - 1) * d;
      return numProblem({
        stem: `Arithmetic sequence: a₁ = ${a1}, common difference d = ${d}. Find a${sub(n)}.`,
        answer: an, answerHTML: `a${sub(n)} = ${an}`,
        solution: [`aₙ = a₁ + (n−1)d = ${a1} + (${n}−1)(${d})`, `= ${a1} + ${(n - 1) * d} = <b>${an}</b>`]
      });
    }
  });

  S.push({
    id: "geo-seq", name: "Geometric sequences", domain: "functions", rit: 265, tag: "F-LE.2",
    teach: {
      idea: "Constant ratio r. nth term: aₙ = a₁ · r^(n−1).",
      example: { stem: "2, 6, 18, … find a₅", steps: ["a₁=2, r=3", "2·3⁴ = 2·81 = <b>162</b>"] }
    },
    gen(rng, diff) {
      const a1 = rng.int(1, D(diff, 4, 6, 9));
      const r = rng.pick(D(diff, [2, 3], [2, 3, 4], [2, 3, 4, 5]));
      const n = rng.int(4, D(diff, 6, 7, 8));
      const an = a1 * Math.pow(r, n - 1);
      return numProblem({
        stem: `Geometric sequence: a₁ = ${a1}, ratio r = ${r}. Find a${sub(n)}.`,
        answer: an, answerHTML: `a${sub(n)} = ${an}`,
        solution: [`aₙ = a₁·r^(n−1) = ${a1}·${r}${sup(n - 1)}`, `= ${a1}·${Math.pow(r, n - 1)} = <b>${an}</b>`],
        misses: [
          { near: a1 + r * (n - 1), msg: "That's an arithmetic step — geometric sequences MULTIPLY by r each time: a₁·r^(n−1)." },
          { near: a1 * Math.pow(r, n), msg: "Off by one in the exponent — it's r^(n−1), not r^n." }
        ]
      });
    }
  });

  S.push({
    id: "exp-growth", name: "Exponential growth & interest", domain: "functions", rit: 266, tag: "F-LE.1",
    teach: {
      idea: "Growth/decay: A = P(1 ± r)ᵗ, where r is the rate per period as a decimal. Compound interest is the same formula.",
      example: { stem: "$500 at 8%/yr for 3 yr", steps: ["500(1.08)³ = 500(1.2597) ≈ <b>$629.86</b>"] }
    },
    gen(rng) {
      const P = rng.int(2, 20) * 100; const rate = rng.pick([5, 6, 8, 10, 12]); const t = rng.int(2, 6); const grow = rng.bool(0.6);
      const A = P * Math.pow(1 + (grow ? 1 : -1) * rate / 100, t);
      return numProblem({
        stem: `A quantity starts at ${P} and ${grow ? "grows" : "decays"} ${rate}% each year. What is its value after ${t} years? (round to 2 decimals)`,
        answer: round(A, 2), answerHTML: `≈ ${round(A, 2)}`, tol: 0.5,
        hint: "A = P(1 ± r)ᵗ",
        solution: [`A = ${P}(1 ${grow ? "+" : "−"} ${rate / 100})${sup(t)} = ${P}(${round(1 + (grow ? 1 : -1) * rate / 100, 2)})${sup(t)}`, `≈ <b>${round(A, 2)}</b>`]
      });
    }
  });

  S.push({
    id: "compare-growth", name: "Linear vs exponential vs quadratic", domain: "functions", rit: 264, tag: "F-LE.3",
    teach: {
      idea: "Linear: constant differences. Quadratic: constant SECOND differences. Exponential: constant RATIO (each term × a fixed number).",
      example: { stem: "2, 6, 18, 54", steps: ["×3 each time → exponential"] }
    },
    gen(rng) {
      const type = rng.pick(["linear", "exponential", "quadratic"]);
      let seq, label;
      if (type === "linear") { const a = rng.int(1, 5), d = rng.int(2, 5); seq = [a, a + d, a + 2 * d, a + 3 * d]; label = "Linear"; }
      else if (type === "exponential") { const a = rng.int(1, 4), r = rng.int(2, 3); seq = [a, a * r, a * r * r, a * r * r * r]; label = "Exponential"; }
      else { seq = [1, 4, 9, 16].map(v => v * rng.int(1, 2)); label = "Quadratic"; }
      return mcProblem({
        stem: `What kind of growth is this sequence?&nbsp; ${seq.join(", ")}, …`,
        solution: [`Check differences and ratios of ${seq.join(", ")}`, `<b>${label}</b>`]
      }, mkMC(rng, label, ["Linear", "Exponential", "Quadratic"].filter(x => x !== label)));
    }
  });

  S.push({
    id: "inverse-linear", name: "Inverse of a linear function", domain: "functions", rit: 266, tag: "F-BF.4",
    teach: {
      idea: "To invert: swap x and y, then solve for y. The inverse undoes the original function.",
      example: { stem: "f(x) = 2x + 6", steps: ["x = 2y + 6 → y = (x − 6)/2", "f⁻¹(x) = x/2 − 3"] }
    },
    gen(rng) {
      const a = rng.nonzero(2, 5), b = rng.int(-8, 8);
      const correct = `f⁻¹(x) = (x ${pm(-b)}) / ${a}`;
      return mcProblem({
        stem: `Find the inverse of&nbsp; f(x) = ${lin(a, b)}.`,
        solution: [`Swap: x = ${a}y ${pm(b)}`, `Solve: y = (x ${pm(-b)})/${a}`, `<b>${correct}</b>`]
      }, mkMC(rng, correct, [
        { html: `f⁻¹(x) = (x ${pm(b)}) / ${a}`, miss: "Sign error — after swapping x and y, move b across the equals sign, which flips its sign before you divide." },
        { html: `f⁻¹(x) = ${a}x ${pm(-b)}`, miss: "That's not an inverse — you must swap x and y and solve for y (divide by a), not reuse the original." },
        `f⁻¹(x) = (x ${pm(-b)}) · ${a}`]));
    }
  });

  S.push({
    id: "logarithm", name: "Logarithms", domain: "functions", rit: 272, tag: "F-LE.4", stretch: true,
    teach: {
      idea: "log_b(x) asks “b to WHAT power gives x?”. logs and exponents are inverses: log_b(x) = y ⇔ bʸ = x.",
      example: { stem: "log₂(32)", steps: ["2 to what power is 32? 2⁵ = 32 → <b>5</b>"] }
    },
    gen(rng, diff) {
      const b = rng.pick(D(diff, [2, 3, 5], [2, 3, 4, 5, 10], [2, 3, 4, 5, 6, 7, 10]));
      const e = rng.int(2, D(diff, 4, 5, 6)); const x = Math.pow(b, e);
      const solveForm = diff >= 2 && rng.bool();
      const misses = [{ near: x / b, msg: `A log gives the EXPONENT, not a division — ask "${b} to what power equals ${x}?"` }];
      if (solveForm) return numProblem({
        stem: `Solve for x:&nbsp; ${b}${sup("x")} = ${x}`,
        answer: e, answerHTML: `x = ${e}`,
        solution: [`${b} to what power = ${x}?`, `${b}${sup(e)} = ${x} → <b>x = ${e}</b>`], misses
      });
      return numProblem({
        stem: `Evaluate:&nbsp; log<sub>${b}</sub>(${x})`,
        answer: e, answerHTML: `${e}`,
        solution: [`${b} to what power = ${x}?`, `${b}${sup(e)} = ${x} → <b>${e}</b>`], misses
      });
    }
  });

  // ----------------------------- GEOMETRY ----------------------------------
  S.push({
    id: "pythagorean", name: "Pythagorean theorem", domain: "geometry", rit: 258, tag: "G-SRT.8",
    teach: {
      idea: "In a right triangle, a² + b² = c² where c is the hypotenuse (across from the right angle). Solve for the missing side.",
      example: { stem: "legs 6 and 8", steps: ["c² = 36 + 64 = 100", "c = <b>10</b>"] }
    },
    gen(rng, diff) {
      // mix: scaled Pythagorean triples (clean answers) + random legs (irrational hyp, rounded)
      if (diff >= 2 && rng.bool(0.45)) {
        const a = rng.int(D(diff, 4, 5, 6), D(diff, 10, 15, 22)), b = rng.int(D(diff, 4, 5, 6), D(diff, 10, 15, 22));
        const c = Math.sqrt(a * a + b * b);
        return numProblem({
          stem: `A right triangle has legs ${a} and ${b}. Find the hypotenuse (round to 2 decimals).`,
          diagram: svgRight(a, b, "?"), answer: round(c, 2), answerHTML: `≈ ${round(c, 2)}`, tol: 0.02,
          solution: [`c² = ${a}² + ${b}² = ${a * a + b * b}`, `c = √${a * a + b * b} ≈ <b>${round(c, 2)}</b>`],
          misses: [{ near: a + b, msg: "You added the legs — Pythagoras is a² + b² = c², then take the square root." }]
        });
      }
      const base = rng.pick([[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29], [9, 40, 41]]);
      const k = rng.int(1, D(diff, 2, 3, 4));
      const a = base[0] * k, b = base[1] * k, c = base[2] * k; const findHyp = rng.bool(0.6);
      if (findHyp) return numProblem({
        stem: `A right triangle has legs ${a} and ${b}. Find the hypotenuse.`,
        diagram: svgRight(a, b, "?"), answer: c, answerHTML: `${c}`, tol: 0.02,
        solution: [`c² = ${a}² + ${b}² = ${a * a} + ${b * b} = ${c * c}`, `c = √${c * c} = <b>${c}</b>`],
        misses: [{ near: a + b, msg: "You added the legs — it's a² + b² = c², not a + b = c." }]
      });
      return numProblem({
        stem: `A right triangle has hypotenuse ${c} and one leg ${a}. Find the other leg.`,
        diagram: svgRight("?", a, c), answer: b, answerHTML: `${b}`, tol: 0.02,
        solution: [`b² = ${c}² − ${a}² = ${c * c} − ${a * a} = ${b * b}`, `b = <b>${b}</b>`],
        misses: [{ near: c - a, msg: "You subtracted the sides directly — use b² = c² − a², THEN square-root." }]
      });
    }
  });

  S.push({
    id: "right-trig", name: "Right-triangle trigonometry", domain: "geometry", rit: 267, tag: "G-SRT.6",
    teach: {
      idea: "Label sides relative to the angle, then pick the ratio.",
      mnemonic: "<b>SOH-CAH-TOA</b>: Sin = Opp/Hyp, Cos = Adj/Hyp, Tan = Opp/Adj.",
      example: { stem: "angle 30°, hypotenuse 10, find opposite", steps: ["sin30° = opp/10", "opp = 10·0.5 = <b>5</b>"] }
    },
    gen(rng) {
      const ang = rng.pick([20, 25, 30, 35, 40, 45, 50, 55, 60, 65]); const hyp = rng.int(6, 20);
      const which = rng.pick(["opp", "adj"]);
      const val = which === "opp" ? hyp * Math.sin(ang * Math.PI / 180) : hyp * Math.cos(ang * Math.PI / 180);
      const ratio = which === "opp" ? "sin" : "cos";
      return numProblem({
        stem: `In a right triangle, an angle is ${ang}° and the hypotenuse is ${hyp}. Find the ${which === "opp" ? "opposite" : "adjacent"} side (round to 1 decimal).`,
        diagram: svgRight(which === "opp" ? "?" : "", which === "opp" ? "" : "?", hyp + " (hyp), " + ang + "°"),
        answer: round(val, 1), answerHTML: `≈ ${round(val, 1)}`, tol: 0.15,
        hint: "SOH-CAH-TOA",
        solution: [`${ratio}(${ang}°) = ${which === "opp" ? "opp" : "adj"} / ${hyp}`, `${which === "opp" ? "opp" : "adj"} = ${hyp}·${ratio}(${ang}°) ≈ <b>${round(val, 1)}</b>`]
      });
    }
  });

  S.push({
    id: "similar-tri", name: "Similar triangles", domain: "geometry", rit: 264, tag: "G-SRT.5",
    teach: {
      idea: "Similar figures have proportional corresponding sides. Set up a ratio and solve. The scale factor multiplies every length.",
      example: { stem: "△ABC ~ △DEF, AB=6→DE=9 (scale 1.5), BC=8→EF?", steps: ["EF = 8·1.5 = <b>12</b>"] }
    },
    gen(rng) {
      const k = rng.pick([1.5, 2, 2.5, 3]); const s1 = rng.int(2, 9) * 2; const s2 = rng.int(2, 9) * 2;
      const big1 = s1 * k, ans = s2 * k;
      return numProblem({
        stem: `Two triangles are similar. A side of length ${s1} corresponds to ${big1}. Find the length that corresponds to ${s2}.`,
        answer: ans, answerHTML: `${ans}`, tol: 0.05,
        solution: [`Scale factor = ${big1}/${s1} = ${k}`, `${s2} × ${k} = <b>${ans}</b>`]
      });
    }
  });

  S.push({
    id: "dist-midpoint", name: "Distance & midpoint", domain: "geometry", rit: 258, tag: "G-GPE.7",
    teach: {
      idea: "Distance = √((x₂−x₁)² + (y₂−y₁)²) (Pythagoras on the coordinate plane). Midpoint = ((x₁+x₂)/2, (y₁+y₂)/2) — just average.",
      example: { stem: "(1,2) to (4,6)", steps: ["√(3² + 4²) = √25 = <b>5</b>"] }
    },
    gen(rng) {
      if (rng.bool()) {
        const trip = rng.pick([[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17]]);
        const x1 = rng.int(-5, 5), y1 = rng.int(-5, 5); const sx = rng.sign(), sy = rng.sign();
        const x2 = x1 + sx * trip[0], y2 = y1 + sy * trip[1];
        return numProblem({
          stem: `Find the distance between (${x1}, ${y1}) and (${x2}, ${y2}).`,
          answer: trip[2], answerHTML: `${trip[2]}`, tol: 0.02,
          solution: [`d = √((${x2 - x1})² + (${y2 - y1})²) = √(${trip[0] * trip[0]} + ${trip[1] * trip[1]})`, `= √${trip[2] * trip[2]} = <b>${trip[2]}</b>`]
        });
      } else {
        const x1 = rng.int(-8, 8), y1 = rng.int(-8, 8), x2 = rng.int(-8, 8), y2 = rng.int(-8, 8);
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        return {
          kind: "list", stem: `Find the midpoint of (${x1}, ${y1}) and (${x2}, ${y2}). Enter x, y:`,
          input: { kind: "text", placeholder: "x, y" }, answerHTML: `(${mx}, ${my})`,
          solution: [`Average the coordinates`, `((${x1}+${x2})/2, (${y1}+${y2})/2) = <b>(${mx}, ${my})</b>`],
          _test: { raw: `${mx}, ${my}`, bad: "99, 99" },
          check: (raw) => { const g = parseNumList(raw); return g[0] != null && approxEq(g[0], mx, 0.02) && approxEq(g[1], my, 0.02); }
        };
      }
    }
  });

  S.push({
    id: "angles", name: "Angle relationships", domain: "geometry", rit: 255, tag: "G-CO.10",
    teach: {
      idea: "Triangle angles sum to 180°. A polygon with n sides sums to (n−2)·180°. Parallel lines make equal corresponding/alternate angles; a straight line is 180°.",
      example: { stem: "Triangle with 50° and 60°", steps: ["third = 180 − 110 = <b>70°</b>"] }
    },
    gen(rng) {
      const type = rng.pick(["tri", "poly", "straight"]);
      if (type === "tri") { const a = rng.int(30, 80), b = rng.int(30, 80); const c = 180 - a - b;
        return numProblem({ stem: `Two angles of a triangle are ${a}° and ${b}°. Find the third angle (degrees).`,
          answer: c, answerHTML: `${c}°`, tol: 0.5, solution: [`180 − ${a} − ${b} = <b>${c}°</b>`] });
      } else if (type === "poly") { const n = rng.int(5, 10); const sum = (n - 2) * 180;
        return numProblem({ stem: `What is the sum of the interior angles of a ${n}-sided polygon? (degrees)`,
          answer: sum, answerHTML: `${sum}°`, tol: 0.5, solution: [`(n−2)·180 = (${n}−2)·180 = <b>${sum}°</b>`] });
      } else { const a = rng.int(40, 140);
        return numProblem({ stem: `Two angles form a straight line (linear pair). One is ${a}°. Find the other (degrees).`,
          answer: 180 - a, answerHTML: `${180 - a}°`, tol: 0.5, solution: [`180 − ${a} = <b>${180 - a}°</b>`] });
      }
    }
  });

  S.push({
    id: "circle-arc", name: "Arc length & sector area", domain: "geometry", rit: 268, tag: "G-C.5",
    teach: {
      idea: "A central angle of θ° cuts off a fraction θ/360 of the circle. Arc length = (θ/360)·2πr. Sector area = (θ/360)·πr².",
      example: { stem: "r = 6, θ = 90°", steps: ["arc = (90/360)·2π·6 = (1/4)·12π ≈ 9.42"] }
    },
    gen(rng) {
      const r = rng.int(3, 12); const theta = rng.pick([30, 45, 60, 90, 120, 135, 180, 270]); const wantArc = rng.bool();
      const val = wantArc ? (theta / 360) * 2 * Math.PI * r : (theta / 360) * Math.PI * r * r;
      return numProblem({
        stem: `A circle has radius ${r}. Find the ${wantArc ? "arc length" : "sector area"} for a central angle of ${theta}°. (round to 2 decimals)`,
        answer: round(val, 2), answerHTML: `≈ ${round(val, 2)}`, tol: 0.05,
        hint: wantArc ? "arc = (θ/360)·2πr" : "sector = (θ/360)·πr²",
        solution: [`fraction = ${theta}/360 = ${round(theta / 360, 3)}`,
        wantArc ? `arc = ${round(theta / 360, 3)}·2π·${r} ≈ <b>${round(val, 2)}</b>` : `area = ${round(theta / 360, 3)}·π·${r}² ≈ <b>${round(val, 2)}</b>`]
      });
    }
  });

  S.push({
    id: "circle-angles", name: "Inscribed & central angles", domain: "geometry", rit: 267, tag: "G-C.2",
    teach: {
      idea: "An inscribed angle is HALF the central angle that subtends the same arc (and half the arc's measure).",
      example: { stem: "arc = 80°", steps: ["inscribed angle = 80/2 = <b>40°</b>"] }
    },
    gen(rng) {
      const arc = rng.int(4, 17) * 10; const findInscribed = rng.bool();
      if (findInscribed) return numProblem({ stem: `An inscribed angle subtends an arc of ${arc}°. Find the inscribed angle (degrees).`,
        answer: arc / 2, answerHTML: `${arc / 2}°`, tol: 0.5, solution: [`inscribed = arc / 2 = ${arc}/2 = <b>${arc / 2}°</b>`] });
      const ins = rng.int(15, 80);
      return numProblem({ stem: `An inscribed angle measures ${ins}°. Find the central angle subtending the same arc (degrees).`,
        answer: 2 * ins, answerHTML: `${2 * ins}°`, tol: 0.5, solution: [`central = 2 × inscribed = 2·${ins} = <b>${2 * ins}°</b>`] });
    }
  });

  S.push({
    id: "circle-equation", name: "Equation of a circle", domain: "geometry", rit: 269, tag: "G-GPE.1",
    teach: {
      idea: "A circle with center (h, k) and radius r: (x − h)² + (y − k)² = r². Read off center and radius (note the sign flips).",
      example: { stem: "(x−2)² + (y+3)² = 25", steps: ["center (2, −3), radius √25 = 5"] }
    },
    gen(rng) {
      const h = rng.int(-6, 6), k = rng.int(-6, 6), r = rng.int(2, 9);
      const correct = `Center (${h}, ${k}), r = ${r}`;
      return mcProblem({
        stem: `Identify the center and radius:&nbsp; (x ${pm(-h)})² + (y ${pm(-k)})² = ${r * r}`,
        solution: [`Center is (h, k) with signs flipped: (${h}, ${k})`, `r = √${r * r} = ${r}`, `<b>${correct}</b>`]
      }, mkMC(rng, correct, [
        { html: `Center (${-h}, ${-k}), r = ${r}`, miss: "Sign flip: in (x − h)², the center's x-value is +h — read the OPPOSITE sign of what's in the parentheses." },
        { html: `Center (${h}, ${k}), r = ${r * r}`, miss: "That's r², not r — the right side is r², so take its square root for the radius." },
        `Center (${-h}, ${-k}), r = ${r * r}`]));
    }
  });

  S.push({
    id: "volume", name: "Volume of solids", domain: "geometry", rit: 259, tag: "G-GMD.3",
    teach: {
      idea: "Cylinder = πr²h · Cone = ⅓πr²h · Sphere = 4⁄3πr³ · Prism/box = (base area)·height · Pyramid = ⅓(base)·height.",
      example: { stem: "cylinder r=3, h=5", steps: ["π·9·5 = 45π ≈ <b>141.37</b>"] }
    },
    gen(rng) {
      const type = rng.pick(["cylinder", "cone", "sphere", "box"]);
      let val, stem, sol;
      if (type === "cylinder") { const r = rng.int(2, 8), h = rng.int(3, 12); val = Math.PI * r * r * h;
        stem = `Volume of a cylinder with radius ${r} and height ${h}? (2 decimals)`; sol = [`V = πr²h = π·${r}²·${h} = ${r * r * h}π`, `≈ <b>${round(val, 2)}</b>`]; }
      else if (type === "cone") { const r = rng.int(2, 8), h = rng.int(3, 12); val = Math.PI * r * r * h / 3;
        stem = `Volume of a cone with radius ${r} and height ${h}? (2 decimals)`; sol = [`V = ⅓πr²h = (1/3)π·${r}²·${h}`, `≈ <b>${round(val, 2)}</b>`]; }
      else if (type === "sphere") { const r = rng.int(2, 7); val = 4 / 3 * Math.PI * r * r * r;
        stem = `Volume of a sphere with radius ${r}? (2 decimals)`; sol = [`V = 4⁄3πr³ = (4/3)π·${r}³`, `≈ <b>${round(val, 2)}</b>`]; }
      else { const l = rng.int(2, 9), w = rng.int(2, 9), h = rng.int(2, 9); val = l * w * h;
        stem = `Volume of a box ${l} × ${w} × ${h}?`; sol = [`V = lwh = ${l}·${w}·${h} = <b>${val}</b>`]; }
      return numProblem({ stem, answer: round(val, 2), answerHTML: `≈ ${round(val, 2)}`, tol: 0.1, solution: sol });
    }
  });

  S.push({
    id: "area-poly", name: "Area of figures", domain: "geometry", rit: 256, tag: "G-GPE.7",
    teach: {
      idea: "Triangle = ½bh · Rectangle = bh · Parallelogram = bh · Trapezoid = ½(b₁+b₂)h · Circle = πr².",
      example: { stem: "trapezoid bases 6, 10, height 4", steps: ["½(6+10)·4 = ½·16·4 = <b>32</b>"] }
    },
    gen(rng) {
      const type = rng.pick(["triangle", "trapezoid", "parallelogram", "circle"]);
      if (type === "triangle") { const b = rng.int(3, 16), h = rng.int(3, 16); return numProblem({
        stem: `Area of a triangle with base ${b} and height ${h}?`, answer: b * h / 2, answerHTML: `${b * h / 2}`, tol: 0.02,
        solution: [`½bh = ½·${b}·${h} = <b>${b * h / 2}</b>`] }); }
      if (type === "trapezoid") { const a = rng.int(3, 12), b = rng.int(3, 12), h = rng.int(3, 12); return numProblem({
        stem: `Area of a trapezoid with bases ${a} and ${b}, height ${h}?`, answer: (a + b) / 2 * h, answerHTML: `${(a + b) / 2 * h}`, tol: 0.02,
        solution: [`½(b₁+b₂)h = ½(${a}+${b})·${h} = <b>${(a + b) / 2 * h}</b>`] }); }
      if (type === "parallelogram") { const b = rng.int(3, 16), h = rng.int(3, 16); return numProblem({
        stem: `Area of a parallelogram with base ${b} and height ${h}?`, answer: b * h, answerHTML: `${b * h}`, tol: 0.02,
        solution: [`bh = ${b}·${h} = <b>${b * h}</b>`] }); }
      const r = rng.int(2, 10); return numProblem({ stem: `Area of a circle with radius ${r}? (2 decimals)`,
        answer: round(Math.PI * r * r, 2), answerHTML: `≈ ${round(Math.PI * r * r, 2)}`, tol: 0.05,
        solution: [`πr² = π·${r}² = ${r * r}π ≈ <b>${round(Math.PI * r * r, 2)}</b>`] });
    }
  });

  S.push({
    id: "transform-geo", name: "Coordinate transformations", domain: "geometry", rit: 265, tag: "G-CO.5",
    teach: {
      idea: "Reflect over x-axis: (x, y)→(x, −y). Over y-axis: (x, y)→(−x, y). Rotate 180°: (x, y)→(−x, −y). Rotate 90° CCW: (x, y)→(−y, x). Translate: add to coordinates.",
      example: { stem: "Reflect (3, 5) over the x-axis", steps: ["(3, −5)"] }
    },
    gen(rng) {
      const x = rng.nonzero(-7, 7), y = rng.nonzero(-7, 7);
      const t = rng.pick([
        { d: "reflected over the x-axis", f: [x, -y] },
        { d: "reflected over the y-axis", f: [-x, y] },
        { d: "rotated 180° about the origin", f: [-x, -y] },
        { d: "rotated 90° counterclockwise about the origin", f: [-y, x] }
      ]);
      const correct = `(${t.f[0]}, ${t.f[1]})`;
      return mcProblem({
        stem: `The point (${x}, ${y}) is ${t.d}. What is the image?`,
        solution: [`Apply the rule for “${t.d}”`, `<b>${correct}</b>`]
      }, mkMC(rng, correct, [
        { html: `(${t.f[1]}, ${t.f[0]})`, miss: "You swapped the x and y of the answer — apply the rule to the coordinates in order." },
        `(${-t.f[0]}, ${t.f[1]})`,
        { html: `(${x}, ${y})`, miss: "That's the original point unchanged — the transformation does move it." }]));
    }
  });

  // ----------------------- STATISTICS & PROBABILITY ------------------------
  S.push({
    id: "central-tendency", name: "Mean, median & range", domain: "stats", rit: 252, tag: "S-ID.2",
    teach: {
      idea: "Mean = sum ÷ count. Median = middle value when sorted (average the two middle if even count). Range = max − min.",
      example: { stem: "4, 8, 6, 10, 2", steps: ["mean = 30/5 = 6; sorted 2,4,6,8,10 → median 6; range 8"] }
    },
    gen(rng) {
      const n = rng.pick([5, 5, 7]); const data = Array.from({ length: n }, () => rng.int(1, 20));
      const which = rng.pick(["mean", "median", "range"]);
      const sorted = data.slice().sort((a, b) => a - b);
      let val;
      if (which === "mean") val = data.reduce((s, v) => s + v, 0) / n;
      else if (which === "median") val = sorted[(n - 1) / 2];
      else val = sorted[n - 1] - sorted[0];
      return numProblem({
        stem: `Data set: ${data.join(", ")}. Find the <b>${which}</b>.`,
        answer: round(val, 2), answerHTML: `${round(val, 2)}`, tol: 0.02,
        solution: [which === "mean" ? `sum = ${data.reduce((s, v) => s + v, 0)}, ÷ ${n}` : `sorted: ${sorted.join(", ")}`, `<b>${round(val, 2)}</b>`]
      });
    }
  });

  S.push({
    id: "probability", name: "Probability", domain: "stats", rit: 257, tag: "S-CP.1",
    teach: {
      idea: "P(event) = favorable ÷ total. Independent AND → multiply. Mutually exclusive OR → add. Enter a fraction or decimal.",
      example: { stem: "P(two heads in 2 flips)", steps: ["½ · ½ = ¼ = 0.25"] }
    },
    gen(rng) {
      const type = rng.pick(["marble", "dice", "dieface"]);
      if (type === "marble") { const r = rng.int(2, 8), b = rng.int(2, 8), g = rng.int(2, 8); const tot = r + b + g; const pick = rng.pick([["red", r], ["blue", b], ["green", g]]);
        return numProblem({ stem: `A bag has ${r} red, ${b} blue, ${g} green marbles. P(${pick[0]})? (fraction or decimal)`,
          answer: pick[1] / tot, answerHTML: fracHTML(pick[1], tot), tol: 0.01, solution: [`favorable ${pick[1]} / total ${tot}`, `= <b>${fracHTML(pick[1], tot)} ≈ ${round(pick[1] / tot, 3)}</b>`] }); }
      if (type === "dice") { const target = rng.pick([7, 6, 8, 5, 9]); const ways = { 5: 4, 6: 5, 7: 6, 8: 5, 9: 4 }[target];
        return numProblem({ stem: `Roll two dice. P(sum = ${target})? (fraction or decimal)`, answer: ways / 36, answerHTML: fracHTML(ways, 36), tol: 0.01,
          solution: [`${ways} ways out of 36`, `= <b>${fracHTML(ways, 36)} ≈ ${round(ways / 36, 3)}</b>`] }); }
      const ev = rng.pick([["an even number", 3], ["a number > 4", 2], ["a multiple of 3", 2]]);
      return numProblem({ stem: `Roll one die. P(${ev[0]})? (fraction or decimal)`, answer: ev[1] / 6, answerHTML: fracHTML(ev[1], 6), tol: 0.01,
        solution: [`${ev[1]} favorable / 6`, `= <b>${fracHTML(ev[1], 6)} ≈ ${round(ev[1] / 6, 3)}</b>`] });
    }
  });

  S.push({
    id: "two-way-table", name: "Two-way tables & conditional probability", domain: "stats", rit: 268, tag: "S-CP.4",
    teach: {
      idea: "Conditional probability P(A | B) restricts you to the B row/column: favorable ÷ that row/column total — not the grand total.",
      example: { stem: "P(likes math | is a girl)", steps: ["girls who like math ÷ total girls"] }
    },
    gen(rng) {
      const a = rng.int(8, 30), b = rng.int(8, 30), c = rng.int(8, 30), d = rng.int(8, 30);
      const rowTot = a + b;
      const table = `<table class="twoway"><tr><th></th><th>Likes</th><th>Dislikes</th><th>Total</th></tr>
        <tr><th>Boys</th><td>${a}</td><td>${b}</td><td>${a + b}</td></tr>
        <tr><th>Girls</th><td>${c}</td><td>${d}</td><td>${c + d}</td></tr>
        <tr><th>Total</th><td>${a + c}</td><td>${b + d}</td><td>${a + b + c + d}</td></tr></table>`;
      return numProblem({
        stem: `Using the table, find P(Likes | Boy) — the probability a student likes it, given they are a boy. (fraction or decimal)`,
        diagram: table, answer: a / rowTot, answerHTML: fracHTML(a, rowTot), tol: 0.01,
        verify: "Did you divide by the BOY total, not the grand total?",
        solution: [`Restrict to boys: ${rowTot} of them`, `Boys who like it: ${a}`, `P = ${a}/${rowTot} = <b>${round(a / rowTot, 3)}</b>`]
      });
    }
  });

  S.push({
    id: "permutations", name: "Permutations & combinations", domain: "stats", rit: 266, tag: "S-CP.9", stretch: true,
    teach: {
      idea: "Order matters → permutation nPr = n!/(n−r)!. Order doesn't matter → combination nCr = n!/(r!(n−r)!).",
      example: { stem: "Choose 3 of 5 (order matters)", steps: ["5·4·3 = <b>60</b>"] }
    },
    gen(rng, diff) {
      const n = rng.int(D(diff, 4, 5, 6), D(diff, 8, 10, 12));
      const r = rng.int(2, Math.min(D(diff, 3, 4, 5), n - 1));
      function fact(x) { let f = 1; for (let i = 2; i <= x; i++) f *= i; return f; }
      const perm = rng.bool();
      const val = perm ? fact(n) / fact(n - r) : fact(n) / (fact(r) * fact(n - r));
      const permCtx = [`arrange ${r} of ${n} books in a row`, `award the top ${r} of ${n} runners distinct medals`, `seat ${r} of ${n} people in ${r} numbered chairs`, `fill ${r} ranked offices (president, VP, …) from ${n} students`];
      const combCtx = [`choose ${r} of ${n} pizza toppings`, `form a committee of ${r} from ${n} people`, `pick ${r} lottery numbers from ${n}`, `select ${r} of ${n} books to bring (order doesn't matter)`];
      const ctx = perm ? rng.pick(permCtx) : rng.pick(combCtx);
      return numProblem({
        stem: `In how many ways can you ${ctx}?&nbsp; (${n}${perm ? "P" : "C"}${r})`,
        answer: val, answerHTML: `${val}`, tol: 0.02,
        solution: [perm ? `Order matters → ${n}P${r} = ${n}! / (${n}−${r})!` : `Order doesn't matter → ${n}C${r} = ${n}! / (${r}!·(${n}−${r})!)`, `= <b>${val}</b>`],
        misses: perm
          ? [{ near: fact(n) / (fact(r) * fact(n - r)), msg: "Order MATTERS here, so use a permutation — don't divide by r! the way a combination does." }]
          : [{ near: fact(n) / fact(n - r), msg: "Order does NOT matter here — divide by r! to remove the duplicate orderings (use a combination)." }]
      });
    }
  });

  S.push({
    id: "scatter-corr", name: "Scatterplots & correlation", domain: "stats", rit: 263, tag: "S-ID.8",
    teach: {
      idea: "Correlation r ranges −1 to 1. Near +1: strong positive (up). Near −1: strong negative (down). Near 0: no linear relationship. Correlation ≠ causation.",
      example: { stem: "hours studied vs test score, points rise together → positive r." }
    },
    gen(rng) {
      const ctxs = [
        ["hours studied", "test score", "pos"], ["daily high temperature", "ice-cream sales", "pos"],
        ["a car's age", "its resale value", "neg"], ["hours of TV watched", "exam score", "neg"],
        ["a person's height", "their shoe size", "pos"], ["altitude up a mountain", "air temperature", "neg"],
        ["weekly practice hours", "free-throw %", "pos"], ["a phone's age", "its battery life", "neg"],
        ["fertilizer used", "plant height", "pos"], ["outdoor temperature", "heating bill", "neg"],
        ["calories eaten per day", "body weight", "pos"], ["a car's speed", "time to arrive", "neg"],
        ["years of work experience", "salary", "pos"], ["distance driven", "fuel left in the tank", "neg"],
        ["a student's ID number", "their test score", "none"], ["shoe size", "math grade", "none"],
        ["day of the month", "temperature that day", "none"], ["a person's age", "letters in their name", "none"],
        ["hours of sleep", "reaction time on a test", "neg"], ["amount of rain", "umbrella sales", "pos"]
      ];
      const c = rng.pick(ctxs);
      const map = { pos: "Positive correlation", neg: "Negative correlation", none: "No correlation" };
      const correct = map[c[2]];
      const distractors = ["Positive correlation", "Negative correlation", "No correlation"].filter(o => o !== correct).map(o => {
        if (c[2] !== "none" && ((c[2] === "pos" && o === "Negative correlation") || (c[2] === "neg" && o === "Positive correlation")))
          return { html: o, miss: `Wrong direction — as ${c[0]} increases, ${c[1]} ${c[2] === "pos" ? "increases (positive)" : "decreases (negative)"}.` };
        if (c[2] === "none" && o !== "No correlation") return { html: o, miss: "These two variables aren't really related, so there's no trend either way." };
        return o;
      });
      return mcProblem({
        stem: `A scatterplot plots <b>${c[0]}</b> (x) against <b>${c[1]}</b> (y). What correlation would you expect?`,
        solution: [c[2] === "none" ? "These aren't really related, so the points show no trend." : `As ${c[0]} increases, ${c[1]} tends to ${c[2] === "pos" ? "increase" : "decrease"}.`, `<b>${correct}</b>`]
      }, mkMC(rng, correct, distractors));
    }
  });

  S.push({
    id: "zscore", name: "Z-scores & normal distribution", domain: "stats", rit: 274, tag: "S-ID.4", stretch: true,
    teach: {
      idea: "A z-score says how many standard deviations a value is from the mean: z = (x − μ)/σ. Empirical rule: ~68% within 1σ, ~95% within 2σ, ~99.7% within 3σ.",
      example: { stem: "x=85, μ=70, σ=5", steps: ["z = (85−70)/5 = <b>3</b>"] }
    },
    gen(rng) {
      const mu = rng.int(50, 90), sigma = rng.pick([4, 5, 6, 8, 10]); const z = rng.pick([-2, -1.5, -1, 1, 1.5, 2, 2.5]);
      const x = mu + z * sigma;
      return numProblem({
        stem: `A distribution has mean ${mu} and standard deviation ${sigma}. Find the z-score of x = ${x}.`,
        answer: z, answerHTML: `z = ${z}`, tol: 0.02,
        solution: [`z = (x − μ)/σ = (${x} − ${mu})/${sigma}`, `= ${x - mu}/${sigma} = <b>${z}</b>`]
      });
    }
  });

  // ---------------------- ADDITIONAL GROWTH-BAND SKILLS --------------------
  S.push({
    id: "abs-value-eq", name: "Absolute-value equations", domain: "algebra", rit: 262, tag: "A-REI.1",
    teach: {
      idea: "|X| = c (with c ≥ 0) means X = c OR X = −c — distance c from zero, in both directions. So you get two solutions.",
      example: { stem: "|x − 1| = 4", steps: ["x − 1 = 4 → x = 5", "x − 1 = −4 → x = −3"] }
    },
    gen(rng) {
      let p, q;
      do { p = rng.int(-8, 8); q = rng.int(-8, 8); } while (p === q || ((p + q) % 2 !== 0) || (p + q) === 0);
      const m = (p + q) / 2, c = Math.abs(q - p) / 2;
      return listProblem({
        stem: `Solve (enter both):&nbsp; |x ${pm(-m)}| = ${c}`,
        targets: [p, q], answerHTML: `x = ${p}, ${q}`,
        solution: [`x ${pm(-m)} = ${c}  or  x ${pm(-m)} = ${-c}`, `x = ${m + c} or x = ${m - c}`, `<b>x = ${p}, ${q}</b>`]
      });
    }
  });

  S.push({
    id: "complete-square", name: "Completing the square", domain: "algebra", rit: 268, tag: "A-REI.4a",
    teach: {
      idea: "Move c over, add (b/2)² to both sides to form a perfect square (x + b/2)², then square-root both sides.",
      example: { stem: "x² + 6x − 1 = 0", steps: ["x² + 6x = 1", "add (3)²=9: (x+3)² = 10", "x = −3 ± √10"] }
    },
    gen(rng) {
      const evens = [-8, -6, -4, -2, 2, 4, 6, 8]; let b, c, disc;
      do { b = rng.pick(evens); c = rng.int(-6, 8); disc = b * b - 4 * c; } while (disc <= 0 || disc > 200);
      const half = b / 2; const r1 = (-b - Math.sqrt(disc)) / 2, r2 = (-b + Math.sqrt(disc)) / 2;
      return listProblem({
        stem: `Solve by completing the square (round to 2 decimals):&nbsp; ${quad(1, b, c)} = 0`,
        targets: [round(r1, 2), round(r2, 2)], tol: 0.03, answerHTML: `x ≈ ${round(r1, 2)}, ${round(r2, 2)}`,
        hint: "Add (b/2)² to both sides.",
        solution: [`x² ${pm(b)}x = ${-c}`, `add (${half})² = ${half * half}: (x ${pm(half)})² = ${half * half - c}`,
        `x ${pm(half)} = ±√${disc / 1} ... = ±${round(Math.sqrt(disc), 2)}`, `<b>x ≈ ${round(r1, 2)}, ${round(r2, 2)}</b>`]
      });
    }
  });

  S.push({
    id: "poly-add", name: "Add & subtract polynomials", domain: "algebra", rit: 260, tag: "A-APR.1",
    teach: {
      idea: "Combine like terms (same variable & power). To subtract, distribute the minus sign to EVERY term first.",
      example: { stem: "(2x² + 3x) − (x² − 5x)", steps: ["2x² + 3x − x² + 5x", "x² + 8x"] }
    },
    gen(rng) {
      const a1 = rng.int(1, 5), b1 = rng.nonzero(-6, 6), c1 = rng.nonzero(-6, 6);
      const a2 = rng.int(1, 5), b2 = rng.nonzero(-6, 6), c2 = rng.nonzero(-6, 6);
      const sub2 = rng.bool(); const s = sub2 ? -1 : 1; const op = sub2 ? "&minus;" : "+";
      const a = a1 + s * a2, b = b1 + s * b2, c = c1 + s * c2;
      const correct = quad(a, b, c);
      return mcProblem({
        stem: `Simplify:&nbsp; (${quad(a1, b1, c1)}) ${op} (${quad(a2, b2, c2)})`,
        solution: [sub2 ? "Distribute the minus, then combine like terms." : "Combine like terms.", `<b>${correct}</b>`],
        verify: sub2 ? "Did you flip the sign of EVERY term in the second polynomial?" : null
      }, mkMC(rng, correct, [quad(a1 - s * a2, b1 - s * b2, c1 - s * c2), quad(a, b, -c), quad(a, -b, c)]));
    }
  });

  S.push({
    id: "special-right", name: "Special right triangles", domain: "geometry", rit: 266, tag: "G-SRT.6",
    teach: {
      idea: "45-45-90: legs are equal, hypotenuse = leg·√2. 30-60-90: sides are x (short, opp 30°), x√3 (long, opp 60°), 2x (hyp).",
      mnemonic: "45-45-90 → ×√2 to the hypotenuse. 30-60-90 → short, short·√3, short·2.",
      example: { stem: "45-45-90 with legs 5", steps: ["hypotenuse = 5√2"] }
    },
    gen(rng, diff) {
      const x = rng.int(2, D(diff, 9, 14, 20));
      const kind = rng.int(0, 4);
      if (kind === 0) { // 45-45-90: legs -> hyp
        const correct = radicalHTML(x, 2);
        return mcProblem({ stem: `A 45-45-90 triangle has legs of length ${x}. Find the hypotenuse.`,
          solution: [`hyp = leg·√2`, `<b>${correct}</b>`] },
          mkMC(rng, correct, [{ html: radicalHTML(x, 3), miss: "×√3 is the 30-60-90 ratio. A 45-45-90 hypotenuse is leg·√2." }, `${2 * x}`, `${x}`]));
      }
      if (kind === 1) { // 30-60-90: short -> long
        const correct = radicalHTML(x, 3);
        return mcProblem({ stem: `A 30-60-90 triangle has a short leg of length ${x}. Find the longer leg.`,
          solution: [`long leg = short·√3`, `<b>${correct}</b>`] },
          mkMC(rng, correct, [{ html: radicalHTML(x, 2), miss: "√2 is for 45-45-90. The long leg of a 30-60-90 is short·√3." }, `${2 * x}`, `${x}`]));
      }
      if (kind === 2) { // 30-60-90: short -> hyp
        const correct = `${2 * x}`;
        return mcProblem({ stem: `A 30-60-90 triangle has a short leg of length ${x}. Find the hypotenuse.`,
          solution: [`hyp = 2·short`, `<b>${correct}</b>`] },
          mkMC(rng, correct, [{ html: radicalHTML(x, 3), miss: "×√3 gives the LONG leg. The hypotenuse is 2·(short leg)." }, radicalHTML(x, 2), `${x}`]));
      }
      // 30-60-90: hypotenuse given -> short or long
      const h = 2 * x; const askLong = rng.bool();
      const correct = askLong ? radicalHTML(x, 3) : `${x}`;
      return mcProblem({ stem: `A 30-60-90 triangle has hypotenuse ${h}. Find the ${askLong ? "longer leg" : "shorter leg"}.`,
        solution: [`short leg = hyp ÷ 2 = ${x}`, askLong ? `long leg = short·√3 = <b>${correct}</b>` : `<b>shorter leg = ${x}</b>`] },
        mkMC(rng, correct, [askLong ? `${h}` : radicalHTML(x, 3), radicalHTML(x, 2), askLong ? `${x}` : `${h}`]));
    }
  });

  S.push({
    id: "surface-area", name: "Surface area", domain: "geometry", rit: 260, tag: "G-GMD.1",
    teach: {
      idea: "Add up the areas of all faces. Box: SA = 2(lw + lh + wh). Cylinder: SA = 2πr² + 2πrh (two circles + the wrap-around).",
      example: { stem: "box 2×3×4", steps: ["2(6 + 8 + 12) = 2·26 = 52"] }
    },
    gen(rng) {
      if (rng.bool()) {
        const l = rng.int(2, 9), w = rng.int(2, 9), hh = rng.int(2, 9);
        const sa = 2 * (l * w + l * hh + w * hh);
        return numProblem({ stem: `Surface area of a box ${l} × ${w} × ${hh}?`, answer: sa, answerHTML: `${sa}`, tol: 0.02,
          solution: [`2(lw + lh + wh) = 2(${l * w} + ${l * hh} + ${w * hh})`, `= <b>${sa}</b>`] });
      }
      const r = rng.int(2, 7), hh = rng.int(3, 10); const sa = 2 * Math.PI * r * r + 2 * Math.PI * r * hh;
      return numProblem({ stem: `Surface area of a cylinder with radius ${r} and height ${hh}? (2 decimals)`,
        answer: round(sa, 2), answerHTML: `≈ ${round(sa, 2)}`, tol: 0.1,
        solution: [`2πr² + 2πrh = 2π·${r}² + 2π·${r}·${hh}`, `≈ <b>${round(sa, 2)}</b>`] });
    }
  });

  S.push({
    id: "boxplot-iqr", name: "Quartiles & IQR", domain: "stats", rit: 263, tag: "S-ID.1",
    teach: {
      idea: "Sort the data. The median splits it in half; Q1 = median of the lower half, Q3 = median of the upper half. IQR = Q3 − Q1 (the spread of the middle 50%).",
      example: { stem: "2,4,6,8,10,12,14", steps: ["median 8; Q1 = 4, Q3 = 12; IQR = 12 − 4 = 8"] }
    },
    gen(rng) {
      const arr = rng.sample(Array.from({ length: 40 }, (_, i) => i + 1), 7).sort((a, b) => a - b);
      const Q1 = arr[1], med = arr[3], Q3 = arr[5], IQR = Q3 - Q1;
      const which = rng.pick([["median", med], ["interquartile range (IQR)", IQR], ["first quartile (Q1)", Q1], ["third quartile (Q3)", Q3]]);
      const shown = rng.shuffle(arr);
      return numProblem({
        stem: `Data: ${shown.join(", ")}. Find the <b>${which[0]}</b>.`,
        answer: which[1], answerHTML: `${which[1]}`, tol: 0.02,
        solution: [`Sorted: ${arr.join(", ")}`, `Q1 = ${Q1}, median = ${med}, Q3 = ${Q3}`, `<b>${which[0]} = ${which[1]}</b>`]
      });
    }
  });

  // subscript helper for sequence terms
  function sub(n) { return `<sub>${n}</sub>`; }

  // ===================================================================
  // AUTHORED SKILLS (overnight expansion) — 38 new generators
  // ===================================================================
S.push({
  id: "sys-substitution", name: "Systems by substitution", domain: "algebra", rit: 262, tag: "A-REI.6",
  teach: {
    idea: "When one equation gives y (or x) alone, substitute that expression into the other equation, solve for one variable, then back-substitute.",
    mnemonic: "Isolate, substitute, solve, back-substitute.",
    example: { stem: "y = 2x − 1, &nbsp; 3x + y = 9", steps: ["3x + (2x − 1) = 9", "5x = 10, so x = 2", "y = 2(2) − 1 = <b>3</b> → (2, 3)"] }
  },
  gen(rng, diff) {
    const x = rng.int(D(diff,-4,-6,-8), D(diff,4,6,8));
    const m = rng.nonzero(D(diff,-3,-4,-5), D(diff,3,4,5));
    const b = rng.int(D(diff,-5,-7,-9), D(diff,5,7,9));
    const y = m*x + b;
    let A = rng.nonzero(2, D(diff,4,5,6));
    let B = rng.nonzero(1, D(diff,3,4,5));
    const C = A*x + B*y;
    return listProblem({
      stem: `Solve by substitution (give x, y):<br>y = ${lin(m,b)}<br>${poly([{c:A,v:"x"},{c:B,v:"y"}])} = ${C}`,
      targets: [x, y], ordered: true, placeholder: "x, y",
      answerHTML: `x = ${x},&nbsp; y = ${y}`,
      solution: [
        `Substitute: ${A}x ${B<0?"&minus; "+Math.abs(B):"+ "+B}(${lin(m,b)}) = ${C}`,
        `${A+B*m}x ${pm(B*b)} = ${C}, so x = <b>${x}</b>`,
        `y = ${m}(${x}) ${pm(b)} = <b>${y}</b>`
      ],
      misses: [
        { when:(g)=> g.length>=2 && approxEq(g[0],y) && approxEq(g[1],x), msg: "You swapped x and y — report x first, then y." }
      ]
    });
  }
});

S.push({
  id: "abs-ineq-compound", name: "Absolute value inequalities", domain: "algebra", rit: 264, tag: "A-REI.3",
  teach: {
    idea: "|x + b| &lt; c (c &gt; 0) becomes the compound −c &lt; x + b &lt; c. |x + b| &gt; c becomes x + b &lt; −c OR x + b &gt; c.",
    mnemonic: "&lt; is AND (between); &gt; is OR (outside).",
    example: { stem: "|x − 1| &lt; 4", steps: ["−4 &lt; x − 1 &lt; 4", "add 1: −3 &lt; x &lt; 5", "<b>−3 &lt; x &lt; 5</b>"] }
  },
  gen(rng, diff) {
    const less = rng.bool();
    const b = rng.nonzero(D(diff,-4,-6,-9), D(diff,4,6,9));
    const c = rng.int(D(diff,2,4,6), D(diff,6,9,12));
    const bStr = b < 0 ? `&minus; ${Math.abs(b)}` : `+ ${b}`;
    const lo = -c - b, hi = c - b;
    let correct, sol;
    if (less) {
      correct = `${lo} &lt; x &lt; ${hi}`;
      sol = [`&minus;${c} &lt; x ${bStr} &lt; ${c}`, `subtract ${b<0?`(${b})`:b}: <b>${lo} &lt; x &lt; ${hi}</b>`];
    } else {
      correct = `x &lt; ${lo} or x &gt; ${hi}`;
      sol = [`x ${bStr} &lt; &minus;${c} or x ${bStr} &gt; ${c}`, `<b>x &lt; ${lo} or x &gt; ${hi}</b>`];
    }
    const dA = less
      ? `x &lt; ${lo} or x &gt; ${hi}`
      : `${lo} &lt; x &lt; ${hi}`;
    const dB = less
      ? `${-c+b} &lt; x &lt; ${c+b}`
      : `x &lt; ${-c+b} or x &gt; ${c+b}`;
    const dC = less
      ? `${lo-1} &lt; x &lt; ${hi+1}`
      : `x &lt; ${lo-1} or x &gt; ${hi+1}`;
    return mcProblem({
      stem: `Solve: |x ${bStr}| ${less ? "&lt;" : "&gt;"} ${c}`,
      solution: sol
    }, mkMC(rng, correct, [
      { html: dA, miss: less ? "&lt; gives an AND (between), not an OR." : "&gt; gives an OR (outside), not a between." },
      { html: dB, miss: "Sign error moving the constant: subtract b from both sides, not add." },
      dC
    ]));
  }
});

S.push({
  id: "compound-ineq", name: "Compound inequalities (and/or)", domain: "algebra", rit: 261, tag: "A-REI.3",
  teach: {
    idea: "A three-part inequality a &lt; mx + b &lt; c is solved by doing the same operation to all three parts. Dividing by a negative flips both inequality signs.",
    mnemonic: "Same move to all three; flip if you divide by a negative.",
    example: { stem: "−6 &lt; 2x + 2 &lt; 10", steps: ["subtract 2: −8 &lt; 2x &lt; 8", "÷2: <b>−4 &lt; x &lt; 4</b>"] }
  },
  gen(rng, diff) {
    const m = rng.int(2, D(diff,3,4,5));
    const b = rng.int(D(diff,-4,-6,-8), D(diff,4,6,8));
    const xlo = rng.int(D(diff,-6,-8,-10), -1);
    const xhi = xlo + rng.int(2, D(diff,4,6,8));
    const a = m*xlo + b, c = m*xhi + b;
    const correct = `${xlo} &lt; x &lt; ${xhi}`;
    const dA = `${a-b} &lt; x &lt; ${c-b}`;
    return mcProblem({
      stem: `Solve: ${a} &lt; ${lin(m,b)} &lt; ${c}`,
      solution: [
        `Subtract ${b<0?`(${b})`:b}: ${a-b} &lt; ${m}x &lt; ${c-b}`,
        `Divide by ${m}: <b>${xlo} &lt; x &lt; ${xhi}</b>`
      ]
    }, mkMC(rng, correct, [
      { html: dA, miss: `You subtracted b but forgot to divide all parts by ${m}.` },
      { html: `${-xhi} &lt; x &lt; ${-xlo}`, miss: "Sign of the bounds is flipped — only flip when dividing by a negative." },
      { html: `x &lt; ${xlo} or x &gt; ${xhi}`, miss: "A between (AND) inequality, not an OR." }
    ]));
  }
});

S.push({
  id: "literal-equations", name: "Literal equations (solve for a variable)", domain: "algebra", rit: 263, tag: "A-CED.4",
  teach: {
    idea: "To solve a formula for one letter, treat every other letter as a number and undo operations in reverse order until that letter is alone.",
    mnemonic: "Same algebra, the other letters just ride along.",
    example: { stem: "Solve A = ½bh for h", steps: ["multiply by 2: 2A = bh", "divide by b: <b>h = 2A / b</b>"] }
  },
  gen(rng, diff) {
    const forms = [
      // ---- single-step (easier) ----
      () => ({ stem: "Solve d = rt for t", correct: fracHTML("d", "r"),
        ds: [{ html: fracHTML("r", "d"), miss: "Inverted — divide d by r, not r by d." }, { html: `d &minus; r`, miss: "r is multiplied by t, so divide by r — don't subtract." }, fracHTML("d", "rt")] }),
      () => ({ stem: "Solve A = lw for w", correct: fracHTML("A", "l"),
        ds: [{ html: fracHTML("l", "A"), miss: "Inverted — divide A by l." }, { html: `A &minus; l`, miss: "l multiplies w, so divide by l — don't subtract." }, fracHTML("A", "lw")] }),
      () => ({ stem: "Solve F = ma for a", correct: fracHTML("F", "m"),
        ds: [{ html: fracHTML("m", "F"), miss: "Inverted — divide F by m." }, { html: `Fm`, miss: "m multiplies a, so divide by m — don't multiply." }, { html: `F &minus; m`, miss: "m is a factor (divide), not a term to subtract." }] }),
      () => ({ stem: "Solve y = kx for x", correct: fracHTML("y", "k"),
        ds: [{ html: fracHTML("k", "y"), miss: "Inverted — divide y by k." }, { html: `yk`, miss: "Divide by k, don't multiply." }, { html: `y &minus; k`, miss: "k multiplies x, so divide." }] }),
      () => ({ stem: "Solve W = Fd for d", correct: fracHTML("W", "F"),
        ds: [{ html: fracHTML("F", "W"), miss: "Inverted — divide W by F." }, { html: `WF`, miss: "Divide by F, don't multiply." }, { html: `W &minus; F`, miss: "F multiplies d, so divide." }] }),
      () => ({ stem: "Solve P = IV for V", correct: fracHTML("P", "I"),
        ds: [{ html: fracHTML("I", "P"), miss: "Inverted — divide P by I." }, { html: `PI`, miss: "Divide by I, don't multiply." }, { html: `P &minus; I`, miss: "I multiplies V, so divide." }] }),
      () => ({ stem: "Solve A = ½bh for h", correct: fracHTML("2A", "b"),
        ds: [{ html: fracHTML("A", "2b"), miss: "Multiply both sides by 2 first — that puts 2 in the numerator." }, { html: fracHTML("A", "b"), miss: "You dropped the 2 — multiply by 2 to clear the ½." }, fracHTML("2A", "bh")] }),
      // ---- multi-step ----
      () => ({ stem: "Solve P = 2l + 2w for w", correct: fracHTML(`P &minus; 2l`, "2"),
        ds: [{ html: fracHTML("P", "2"), miss: "Subtract 2l from P first, then divide by 2." }, { html: fracHTML(`P &minus; 2l`, "4"), miss: "Divide by 2, not 4." }, { html: `P &minus; 2l &minus; 2`, miss: "The 2 is a coefficient (divide), not a term to subtract." }] }),
      () => ({ stem: "Solve y = mx + b for x", correct: fracHTML(`y &minus; b`, "m"),
        ds: [{ html: fracHTML("y", "m"), miss: "Subtract b from y before dividing by m." }, { html: `m(y &minus; b)`, miss: "m multiplies x, so divide by m — don't multiply." }, { html: fracHTML(`y + b`, "m"), miss: "Move +b to the other side as −b." }] }),
      () => ({ stem: "Solve V = lwh for h", correct: fracHTML("V", "lw"),
        ds: [{ html: `V &minus; lw`, miss: "l and w multiply h, so divide by lw — don't subtract." }, { html: fracHTML("lw", "V"), miss: "Inverted — divide V by lw." }, fracHTML("V", "lwh")] }),
      () => ({ stem: "Solve I = Prt for r", correct: fracHTML("I", "Pt"),
        ds: [{ html: fracHTML("I", "P"), miss: "Both P and t multiply r — divide by Pt, not just P." }, { html: fracHTML("Pt", "I"), miss: "Inverted — divide I by Pt." }, { html: `I &minus; Pt`, miss: "Pt multiplies r, so divide." }] }),
      () => ({ stem: "Solve C = 2πr for r", correct: fracHTML("C", "2π"),
        ds: [{ html: fracHTML("C", "π"), miss: "Don't drop the 2 — divide by the whole 2π." }, { html: fracHTML("2π", "C"), miss: "Inverted — divide C by 2π." }, { html: `C &minus; 2π`, miss: "2π multiplies r, so divide." }] }),
      () => ({ stem: "Solve v = u + at for t", correct: fracHTML(`v &minus; u`, "a"),
        ds: [{ html: fracHTML("v", "a"), miss: "Subtract u from v first, then divide by a." }, { html: `a(v &minus; u)`, miss: "a multiplies t, so divide by a — don't multiply." }, { html: fracHTML(`v + u`, "a"), miss: "Move +u across as −u." }] }),
      () => ({ stem: "Solve ax + c = d for x", correct: fracHTML(`d &minus; c`, "a"),
        ds: [{ html: fracHTML("d", "a"), miss: "Subtract c first, then divide by a." }, { html: fracHTML(`d + c`, "a"), miss: "Move +c across as −c." }, { html: `a(d &minus; c)`, miss: "a multiplies x, so divide by a." }] }),
      () => ({ stem: `Solve K = ½mv${sup(2)} for m`, correct: fracHTML("2K", `v${sup(2)}`),
        ds: [{ html: fracHTML("K", `2v${sup(2)}`), miss: "Multiply by 2 first — the 2 goes on top." }, { html: fracHTML("2K", "v"), miss: "It's v², not v — divide by v²." }, { html: fracHTML("K", `v${sup(2)}`), miss: "Clear the ½ by multiplying both sides by 2." }] })
    ];
    const pool = diff <= 1 ? forms.slice(0, 7) : forms;
    const f = rng.pick(pool)();
    return mcProblem({
      stem: f.stem,
      solution: [`Isolate the target variable by undoing operations in reverse.`, `Result: <b>${f.correct}</b>`]
    }, mkMC(rng, f.correct, f.ds));
  }
});

S.push({
  id: "quad-square-roots", name: "Quadratics by square roots", domain: "algebra", rit: 260, tag: "A-REI.4",
  teach: {
    idea: "If x² = k (k ≥ 0), then x = ±√k. For (x − h)² = k, take the square root of both sides and add h: x = h ± √k. Remember BOTH signs.",
    mnemonic: "Square root both sides — and don't forget the ±.",
    example: { stem: "(x − 3)² = 16", steps: ["x − 3 = ±4", "x = 3 ± 4", "x = 7 or <b>x = −1</b>"] }
  },
  gen(rng, diff) {
    const r = rng.int(D(diff,2,3,4), D(diff,6,8,11));
    const k = r*r;
    const h = diff <= 1 ? 0 : rng.int(D(diff,-3,-5,-7), D(diff,3,5,7));
    const x1 = h + r, x2 = h - r;
    const stem = h === 0
      ? `Solve: x${sup(2)} = ${k}`
      : `Solve: (x ${h<0?"+ "+Math.abs(h):"&minus; "+h})${sup(2)} = ${k}`;
    return listProblem({
      stem,
      targets: [x1, x2], placeholder: "both values",
      answerHTML: `x = ${x1} or x = ${x2}`,
      solution: h === 0
        ? [`x = ±${sqrtHTML(k)} = ±${r}`, `x = ${x1} or <b>x = ${x2}</b>`]
        : [`x ${h<0?"+ "+Math.abs(h):"&minus; "+h} = ±${r}`, `x = ${h} ± ${r}`, `x = ${x1} or <b>x = ${x2}</b>`],
      misses: [
        { when:(g)=> g.length===1, msg: "There are two solutions (±) — give both." },
        { when:(g)=> g.length>=1 && g.every(v=> v>=0) && (x2<0||x1<0), msg: "Don't drop the negative root — square root gives ±." }
      ]
    });
  }
});

S.push({
  id: "factor-lead-coef", name: "Factor with a ≠ 1 (MC)", domain: "algebra", rit: 266, tag: "A-SSE.3",
  teach: {
    idea: "To factor ax² + bx + c (a ≠ 1), find two numbers that multiply to a·c and add to b, split the middle term, then factor by grouping.",
    mnemonic: "Multiply to a·c, add to b, split, group.",
    example: { stem: "Factor 2x² + 7x + 3", steps: ["a·c = 6, need +1 and +6", "2x² + x + 6x + 3", "x(2x + 1) + 3(2x + 1)", "<b>(2x + 1)(x + 3)</b>"] }
  },
  gen(rng, diff) {
    const p = rng.int(2, D(diff,2,3,4));
    const r = rng.int(1, D(diff,2,3,3));
    const q = rng.nonzero(D(diff,-3,-4,-6), D(diff,3,4,6));
    let s = rng.nonzero(D(diff,-3,-4,-6), D(diff,3,4,6));
    const a = p*r, b = p*s + r*q, c = q*s;
    const fac = (P,Q,R,Sx) => `(${poly([{c:P,v:"x"},{c:Q,v:""}])})(${poly([{c:R,v:"x"},{c:Sx,v:""}])})`;
    const correct = fac(p,q,r,s);
    const dA = fac(p,-q,r,s);
    const dB = fac(p,q,r,-s);
    const dC = fac(p,-q,r,-s);
    return mcProblem({
      stem: `Factor completely: ${quad(a,b,c)}`,
      solution: [
        `a·c = ${a*c}; need two numbers with product ${a*c} and sum ${b}: ${r*q} and ${p*s}`,
        `Split and group → <b>${correct}</b>`
      ]
    }, mkMC(rng, correct, [
      { html: dA, miss: "Check the signs — expand to confirm the middle term matches b." },
      { html: dC, miss: "Both signs are wrong: this gives the opposite middle term (−b)." },
      { html: dB, miss: "Check the sign of the second constant — expand to verify the middle term." }
    ]));
  }
});

  // ----------------------------------------------------------------

S.push({
  id: "word-linear-eq", name: "Linear equation word problems", domain: "algebra", rit: 258, tag: "A-CED.1",
  teach: {
    idea: "Translate the words into one linear equation, then solve. 'Per' or 'each' signals the rate (the coefficient); a one-time amount is the constant.",
    mnemonic: "Rate · count + fixed = total.",
    example: { stem: "A gym charges a $30 fee plus $8 per visit. A member paid $94. How many visits?", steps: ["30 + 8v = 94", "8v = 64", "v = <b>8</b>"] }
  },
  gen(rng, diff) {
    const rate = rng.int(D(diff, 4, 6, 7), D(diff, 8, 11, 15));
    const fixed = rng.int(D(diff, 10, 15, 20), D(diff, 30, 45, 70));
    const count = rng.int(D(diff, 4, 6, 8), D(diff, 9, 13, 18));
    const total = fixed + rate * count;
    const ctx = rng.pick([
      { who: "A gym", verb: "charges", unit: "visit", q: "visits" },
      { who: "A plumber", verb: "charges", unit: "hour", q: "hours" },
      { who: "A car rental", verb: "costs", unit: "day", q: "days" }
    ]);
    return numProblem({
      stem: `${ctx.who} ${ctx.verb} a $${fixed} fee plus $${rate} per ${ctx.unit}. The total bill was $${total}. How many ${ctx.q}?`,
      answer: count, answerHTML: `${count} ${ctx.q}`,
      solution: [`${fixed} + ${rate}n = ${total}`, `${rate}n = ${total - fixed}`, `n = <b>${count}</b>`],
      misses: [
        { near: total / rate, msg: "You divided the total by the rate without first subtracting the fixed fee." },
        { near: total - fixed, msg: "You subtracted the fee but forgot to divide by the per-unit rate." }
      ]
    });
  }
});

S.push({
  id: "word-system-eq", name: "System word problems (coins / two unknowns)", domain: "algebra", rit: 264, tag: "A-REI.6",
  teach: {
    idea: "Two unknowns need two equations: one for the total count, one for the total value (or a second relationship). Solve by substitution or elimination.",
    mnemonic: "Count equation + value equation.",
    example: { stem: "30 coins (nickels & dimes) worth $2.30. How many dimes?", steps: ["n + d = 30, 5n + 10d = 230", "5(30−d)+10d=230 → 5d=80", "d = <b>16</b>"] }
  },
  gen(rng, diff) {
    const mode = rng.pick(["coins", "tickets"]);
    if (mode === "coins") {
      const total = rng.int(D(diff, 12, 18, 25), D(diff, 20, 30, 45));
      const dimes = rng.int(3, total - 3);
      const nickels = total - dimes;
      const value = 5 * nickels + 10 * dimes; // cents
      return numProblem({
        stem: `A jar has ${total} coins made of nickels and dimes worth $${(value/100).toFixed(2)} in total. How many dimes are there?`,
        answer: dimes, answerHTML: `${dimes} dimes`,
        solution: [`n + d = ${total}, &nbsp; 5n + 10d = ${value}`, `5(${total}−d) + 10d = ${value} → 5d = ${value - 5*total}`, `d = <b>${dimes}</b>`],
        misses: [
          { near: nickels, msg: "That's the number of nickels — the question asks for dimes." },
          { near: total / 2, msg: "You assumed an even split; use the value equation to find the exact count." }
        ]
      });
    } else {
      const adultP = rng.int(D(diff, 7, 9, 11), D(diff, 9, 12, 15));
      const kidP = rng.int(3, adultP - 2);
      const adults = rng.int(D(diff, 4, 6, 8), D(diff, 9, 13, 18));
      const kids = rng.int(D(diff, 4, 6, 8), D(diff, 9, 13, 18));
      const tickets = adults + kids;
      const money = adultP * adults + kidP * kids;
      return numProblem({
        stem: `${tickets} tickets were sold for a total of $${money}. Adult tickets cost $${adultP} and child tickets cost $${kidP}. How many adult tickets were sold?`,
        answer: adults, answerHTML: `${adults} adult tickets`,
        solution: [`a + c = ${tickets}, &nbsp; ${adultP}a + ${kidP}c = ${money}`, `${adultP}a + ${kidP}(${tickets}−a) = ${money}`, `a = <b>${adults}</b>`],
        misses: [
          { near: kids, msg: "That's the number of child tickets — the question asks for adult tickets." }
        ]
      });
    }
  }
});

S.push({
  id: "word-exp-decay", name: "Growth / decay & compound interest", domain: "algebra", rit: 268, tag: "F-LE.5",
  teach: {
    idea: "Repeated percent change uses a multiplier: grow by r% → ×(1+r/100); decay by r% → ×(1−r/100); over t periods raise it to the t power. Final = P·(multiplier)<sup>t</sup>.",
    mnemonic: "Start × (1 ± rate)^time.",
    example: { stem: "$500 at 4% interest compounded yearly for 3 years (round to cent).", steps: ["500·(1.04)³", "= 500·1.124864", "≈ <b>562.43</b>"] }
  },
  gen(rng, diff) {
    const grow = rng.bool();
    const P = rng.int(D(diff, 2, 4, 6), D(diff, 8, 12, 20)) * 100;
    const r = rng.pick(grow ? [4, 5, 6, 8, 10] : [5, 10, 15, 20, 25]);
    const t = rng.int(D(diff, 2, 3, 4), D(diff, 3, 4, 6));
    const mult = grow ? (1 + r / 100) : (1 - r / 100);
    const final = U.round(P * Math.pow(mult, t), 2);
    const ctx = grow
      ? `An investment of $${P} earns ${r}% interest compounded yearly. What is its value after ${t} years?`
      : `A car worth $${P} loses ${r}% of its value each year. What is it worth after ${t} years?`;
    const simple = grow ? U.round(P * (1 + r * t / 100), 2) : U.round(P * (1 - r * t / 100), 2);
    return numProblem({
      stem: `${ctx} (Round to the nearest cent.)`,
      answer: final, answerHTML: `$${final.toFixed(2)}`, tol: 0.02,
      solution: [`Multiplier = ${grow ? "1 + " : "1 − "}${r}/100 = ${mult}`, `${P} · (${mult})${sup(t)}`, `≈ <b>$${final.toFixed(2)}</b>`],
      misses: [
        { near: simple, tol: 0.5, msg: "You applied the percent only once (simple, linear) instead of compounding each year." }
      ]
    });
  }
});

S.push({
  id: "word-unit-rate", name: "Proportional reasoning / unit rate", domain: "algebra", rit: 258, tag: "7.RP.A.2",
  teach: {
    idea: "Set up a proportion of equal rates: (part / whole) = (part / whole). Cross-multiply and solve. Keep matching units across from each other.",
    mnemonic: "Cross-multiply: a/b = c/x → x = bc/a.",
    example: { stem: "3 lb of apples cost $7.50. What do 8 lb cost?", steps: ["7.50/3 = x/8", "x = 8·2.50", "= <b>20</b>"] }
  },
  gen(rng, diff) {
    const mode = rng.pick(["price", "speed", "recipe"]);
    if (mode === "price") {
      const unit = rng.int(D(diff, 2, 3, 4), D(diff, 5, 7, 9));
      const baseQty = rng.int(2, D(diff, 4, 6, 8));
      const newQty = rng.int(D(diff, 5, 7, 9), D(diff, 10, 14, 20));
      const baseCost = unit * baseQty;
      const ans = unit * newQty;
      return numProblem({
        stem: `${baseQty} lb of coffee costs $${baseCost}. At the same rate, what is the cost of ${newQty} lb? (dollars)`,
        answer: ans, answerHTML: `$${ans}`,
        solution: [`Unit rate = ${baseCost}/${baseQty} = $${unit}/lb`, `${unit} · ${newQty}`, `= <b>$${ans}</b>`],
        misses: [
          { near: baseCost + (newQty - baseQty), msg: "You added the extra pounds instead of scaling by the unit rate." }
        ]
      });
    } else if (mode === "speed") {
      const speed = rng.int(D(diff, 30, 40, 45), D(diff, 55, 65, 75));
      const hours = rng.int(D(diff, 2, 3, 4), D(diff, 4, 6, 8));
      const dist = speed * hours;
      return numProblem({
        stem: `A car travels ${dist} miles in ${hours} hours at a constant speed. How far does it travel in 1 hour? (miles)`,
        answer: speed, answerHTML: `${speed} miles`,
        solution: [`Rate = distance / time`, `${dist} / ${hours}`, `= <b>${speed} miles/hour</b>`],
        misses: [
          { near: dist * hours, msg: "You multiplied distance by time instead of dividing." }
        ]
      });
    } else {
      const per = rng.int(2, D(diff, 3, 4, 5));
      const baseCups = rng.int(2, D(diff, 3, 5, 6));
      const scale = rng.int(D(diff, 2, 3, 4), D(diff, 4, 6, 8));
      const baseFlour = per * baseCups;
      const newCups = baseCups * scale;
      const ans = per * newCups;
      return numProblem({
        stem: `A recipe uses ${baseFlour} cups of flour to make ${baseCups} loaves. How many cups of flour are needed for ${newCups} loaves?`,
        answer: ans, answerHTML: `${ans} cups`,
        solution: [`Flour per loaf = ${baseFlour}/${baseCups} = ${per}`, `${per} · ${newCups}`, `= <b>${ans} cups</b>`],
        misses: [
          { near: baseFlour + (newCups - baseCups), msg: "You added loaves instead of scaling by the per-loaf rate." }
        ]
      });
    }
  }
});

S.push({
  id: "word-quad-app", name: "Quadratic applications (area / projectile)", domain: "algebra", rit: 266, tag: "A-CED.1",
  teach: {
    idea: "Area problems: set length·width = area with one side written in terms of the other, giving a quadratic. Projectile: h = −16t² + v·t + h₀; substitute and solve.",
    mnemonic: "Build the quadratic, then solve for the positive root.",
    example: { stem: "A rectangle is 3 m longer than it is wide and has area 40 m². Find the width.", steps: ["w(w+3)=40", "w²+3w−40=0 → (w+8)(w−5)=0", "w = <b>5</b>"] }
  },
  gen(rng, diff) {
    const mode = rng.pick(["area", "projectile"]);
    if (mode === "area") {
      const w = rng.int(D(diff, 4, 6, 7), D(diff, 8, 11, 15));
      const extra = rng.int(D(diff, 2, 3, 4), D(diff, 4, 6, 8));
      const area = w * (w + extra);
      return numProblem({
        stem: `A rectangular garden is ${extra} m longer than it is wide. Its area is ${area} m². Find its width (m).`,
        answer: w, answerHTML: `${w} m`,
        solution: [`w(w + ${extra}) = ${area}`, `w² + ${extra}w − ${area} = 0`, `w = <b>${w} m</b> (reject the negative root)`],
        misses: [
          { near: w + extra, msg: "That's the length — the question asks for the width." }
        ]
      });
    } else {
      const t = rng.int(D(diff, 1, 2, 2), D(diff, 2, 3, 4));
      const v = 16 * rng.int(D(diff, 2, 3, 4), D(diff, 4, 5, 7));
      const h0 = rng.int(D(diff, 0, 4, 6), D(diff, 6, 20, 40));
      const h = -16 * t * t + v * t + h0;
      return numProblem({
        stem: `A ball is launched upward; its height is h = −16t² + ${v}t + ${h0} (feet, t in seconds). What is its height at t = ${t} s? (feet)`,
        answer: h, answerHTML: `${h} ft`,
        solution: [`h = −16(${t})² + ${v}(${t}) + ${h0}`, `= ${-16*t*t} + ${v*t} + ${h0}`, `= <b>${h} ft</b>`],
        misses: [
          { near: -16 * t + v * t + h0, msg: "You forgot to square t in the −16t² term." }
        ]
      });
    }
  }
});

S.push({
  id: "word-mixture", name: "Mixture & concentration word problems", domain: "algebra", rit: 270, tag: "A-CED.1",
  teach: {
    idea: "Track the amount of the pure substance: (rate × amount) for each part adds to the rate × total of the mixture. Set up one equation in the unknown amount.",
    mnemonic: "Pure-in + pure-in = pure-out.",
    example: { stem: "How many L of 50% acid added to 4 L of 20% acid gives 30%?", steps: ["0.5x + 0.2·4 = 0.3(x+4)", "0.2x = 0.4", "x = <b>2</b> L"] }
  },
  gen(rng, diff) {
    const cHigh = rng.pick([50, 60, 80, 100]);
    const cLow = rng.pick([10, 20, 25]);
    const target = rng.pick([30, 40].filter(t => t > cLow && t < cHigh));
    const baseAmt = rng.int(D(diff, 3, 4, 5), D(diff, 6, 9, 12));
    let x = null, base;
    for (let b = baseAmt; b <= baseAmt + 20; b++) {
      const num = b * (target - cLow);
      const den = (cHigh - target);
      if (num % den === 0) { x = num / den; base = b; break; }
    }
    if (x == null) { base = baseAmt; x = base * (target - cLow) / (cHigh - target); }
    return numProblem({
      stem: `How many liters of a ${cHigh}% acid solution must be added to ${base} L of a ${cLow}% acid solution to produce a ${target}% solution? (liters)`,
      answer: x, answerHTML: `${x} L`, tol: 0.05,
      solution: [`${cHigh/100}x + ${cLow/100}(${base}) = ${target/100}(x + ${base})`, `${(cHigh-target)/100}x = ${((target-cLow)*base/100).toFixed(2)}`, `x = <b>${x} L</b>`],
      misses: [
        { near: base, msg: "That's the amount already present, not the amount to add — solve the equation for x." }
      ]
    });
  }
});

  // ----------------------------------------------------------------

// ============ SKILL 1: Integer operations & order of operations with negatives ============
S.push({
  id: "int-pemdas-neg", name: "Order of operations with negatives", domain: "numbers", rit: 254, tag: "7.NS.A",
  teach: {
    idea: "Do operations in PEMDAS order, and track every negative sign. Multiply/divide before add/subtract, and go left-to-right within the same level.",
    mnemonic: "PEMDAS: ×/÷ beat +/−; a negative times a negative is positive.",
    example: { stem: "&minus;3 + 4 × (&minus;2)", steps: ["4 × (&minus;2) = &minus;8", "&minus;3 + (&minus;8)", "<b>&minus;11</b>"] }
  },
  gen(rng, diff) {
    const b = rng.nonzero(2, D(diff, 5, 7, 9));
    const c = rng.nonzero(2, D(diff, 5, 8, 11)) * (rng.bool() ? 1 : -1);
    const a = rng.int(D(diff,-6,-9,-12), D(diff,9,9,12));
    if (diff <= 1) {
      const ans = a + b * c;
      return numProblem({
        stem: `${neg(a)} + ${b} &times; (${neg(c)})`,
        answer: ans, answerHTML: `${ans}`,
        solution: [`${b} &times; (${neg(c)}) = ${b*c}`, `${neg(a)} + (${neg(b*c)})`, `<b>${ans}</b>`],
        misses: [{ near: (a + b) * c, msg: "You added before multiplying — multiplication comes first (PEMDAS)." }]
      });
    }
    const d = rng.nonzero(2, D(diff, 6, 6, 10)) * (rng.bool() ? 1 : -1);
    const ans = a - b * c + d;
    return numProblem({
      stem: `${neg(a)} &minus; ${b} &times; (${neg(c)}) + (${neg(d)})`,
      answer: ans, answerHTML: `${ans}`,
      solution: [`${b} &times; (${neg(c)}) = ${b*c}`, `${neg(a)} &minus; (${neg(b*c)}) + (${neg(d)})`, `<b>${ans}</b>`],
      misses: [
        { near: a - b * c - d, msg: "Sign slip on the last term — you subtracted it instead of adding." },
        { near: (a - b) * c + d, msg: "You worked left-to-right ignoring PEMDAS — multiply before subtracting." }
      ]
    });
  }
});

// ============ SKILL 2: Fraction operations (+ − × ÷) ============
S.push({
  id: "frac-four-ops", name: "Fraction operations (+ − × ÷)", domain: "numbers", rit: 252, tag: "7.NS.A.2",
  teach: {
    idea: "Add/subtract fractions over a common denominator. Multiply across the top and bottom. Divide by multiplying by the reciprocal (flip the second fraction).",
    mnemonic: "Keep–Change–Flip for division; common denominator for +/−.",
    example: { stem: `${fracHTML(2,3)} &divide; ${fracHTML(4,5)}`, steps: ["Flip: × 5/4", "(2×5)/(3×4) = 10/12", "<b>= 0.8333…</b>"] }
  },
  gen(rng, diff) {
    const op = rng.pick(diff <= 1 ? ["+","×"] : ["+","−","×","÷"]);
    const hi = D(diff, 6, 9, 12);
    let a = rng.int(1, hi), b = rng.int(2, hi), c = rng.int(1, hi), d = rng.int(2, hi);
    let val, sym, work;
    if (op === "+") { val = a/b + c/d; sym = "+"; work = `${a*d} + ${c*b} over ${b*d}`; }
    else if (op === "−") { val = a/b - c/d; sym = "&minus;"; work = `${a*d} &minus; ${c*b} over ${b*d}`; }
    else if (op === "×") { val = (a/b) * (c/d); sym = "&times;"; work = `(${a}&times;${c}) / (${b}&times;${d})`; }
    else { val = (a/b) / (c/d); sym = "&divide;"; work = `${a}/${b} &times; ${d}/${c}`; }
    const ans = U.round(val, 4);
    return numProblem({
      stem: `Compute (round to 3 decimals): ${fracHTML(a,b)} ${sym} ${fracHTML(c,d)}`,
      answer: ans, answerHTML: `${ans}`, tol: 0.005,
      solution: [op === "÷" ? `Keep–Change–Flip: ${fracHTML(a,b)} &times; ${fracHTML(d,c)}` : `Combine: ${work}`, `= ${val}`, `<b>&asymp; ${ans}</b>`],
      misses: op === "÷"
        ? [{ near: U.round((a/b)*(c/d),4), msg: "You multiplied straight across instead of flipping the second fraction." }]
        : (op === "+"
          ? [{ near: U.round((a+c)/(b+d),4), msg: "You added numerators and denominators — you need a common denominator." }]
          : [])
    });
  }
});

// ============ SKILL 3: GCF and LCM ============
S.push({
  id: "gcf-lcm", name: "GCF and LCM", domain: "numbers", rit: 250, tag: "6.NS.B.4",
  teach: {
    idea: "The GCF (greatest common factor) is the biggest number dividing both. The LCM (least common multiple) is the smallest number both divide into. They satisfy GCF × LCM = a × b.",
    mnemonic: "GCF shrinks (a divisor); LCM grows (a multiple).",
    example: { stem: "GCF and LCM of 12 and 18", steps: ["GCF = 6", "LCM = 12×18/6 = 36", "<b>GCF 6, LCM 36</b>"] }
  },
  gen(rng, diff) {
    const g = rng.int(D(diff, 2, 3, 4), D(diff, 6, 9, 12));
    let m = rng.int(2, D(diff, 6, 8, 10)), n = rng.int(2, D(diff, 7, 9, 12));
    while (U.gcd(m, n) !== 1) { n = rng.int(2, D(diff, 7, 9, 12)); }
    const a = g * m, b = g * n;
    const askLCM = rng.bool();
    const gcf = U.gcd(a, b);
    const lcm = a * b / gcf;
    if (askLCM) {
      return numProblem({
        stem: `Find the LCM (least common multiple) of ${a} and ${b}.`,
        answer: lcm, answerHTML: `${lcm}`,
        solution: [`GCF(${a}, ${b}) = ${gcf}`, `LCM = ${a}&times;${b} / ${gcf}`, `<b>${lcm}</b>`],
        misses: [{ near: gcf, msg: "That's the GCF — the LCM is the smallest common multiple, which is larger." },
                 { near: a * b, msg: "You used the full product — divide a×b by the GCF to get the LCM." }]
      });
    }
    return numProblem({
      stem: `Find the GCF (greatest common factor) of ${a} and ${b}.`,
      answer: gcf, answerHTML: `${gcf}`,
      solution: [`Common factors of ${a} and ${b}`, `Greatest is <b>${gcf}</b>`],
      misses: [{ near: lcm, msg: "That's the LCM — the GCF is a divisor of both, which is smaller." }]
    });
  }
});

// ============ SKILL 4: Scientific notation (convert & compare) ============
S.push({
  id: "sci-notation-convert", name: "Scientific notation: convert & compare", domain: "numbers", rit: 256, tag: "8.EE.A.4",
  teach: {
    idea: "Scientific notation is a × 10ⁿ with 1 ≤ |a| < 10. A positive exponent moves the decimal right (big number); a negative exponent moves it left (small number).",
    mnemonic: "Negative exponent = tiny number, not a negative number.",
    example: { stem: "Write 0.00042 in scientific notation", steps: ["Move decimal 4 places right: 4.2", "Exponent is &minus;4", "<b>4.2 × 10⁻⁴</b>"] }
  },
  gen(rng, diff) {
    const mode = rng.pick(diff <= 1 ? ["toSci","toStd"] : ["toSci","toStd","compare"]);
    const a = rng.int(1, 9), b = rng.int(0, 9);
    const mant = parseFloat(`${a}.${b}`);
    const exp = rng.pick(diff <= 1 ? [2,3,4,-2,-3] : [3,4,5,6,-3,-4,-5]);
    const sciHTML = `${mant} &times; 10${sup(exp)}`;
    const stdVal = mant * Math.pow(10, exp);
    const stdStr = (exp >= 0)
      ? String(Math.round(stdVal))
      : stdVal.toFixed(Math.abs(exp) + 1).replace(/0+$/,'').replace(/\.$/,'');
    if (mode === "toSci") {
      const wrongExpA = `${mant} &times; 10${sup(exp + (exp>=0?1:-1))}`;
      const wrongExpB = `${mant} &times; 10${sup(-exp)}`;
      const wrongMant = `${mant*10} &times; 10${sup(exp-1)}`;
      return mcProblem({
        stem: `Write ${stdStr} in scientific notation.`,
        solution: [`Mantissa between 1 and 10: ${mant}`, `Decimal moved ${Math.abs(exp)} places`, `<b>${sciHTML}</b>`]
      }, mkMC(rng, sciHTML, [
        { html: wrongExpB, miss: "You flipped the sign of the exponent — check whether the number is big or small." },
        { html: wrongMant, miss: "Mantissa must be between 1 and 10; rewrite so there's one nonzero digit before the decimal." },
        { html: wrongExpA, miss: "Off-by-one on the exponent — recount the decimal places moved." }
      ]));
    }
    if (mode === "toStd") {
      const wrongA = (exp >= 0) ? String(Math.round(mant * Math.pow(10, exp-1))) : stdVal.toFixed(Math.abs(exp)).replace(/0+$/,'').replace(/\.$/,'');
      const wrongB = (exp >= 0) ? String(Math.round(mant * Math.pow(10, -exp))) : String(mant * Math.pow(10, -exp));
      const wrongC = String(mant * Math.pow(10, exp >= 0 ? exp+1 : exp-1));
      return mcProblem({
        stem: `Write ${sciHTML} in standard (decimal) form.`,
        solution: [`Move the decimal ${Math.abs(exp)} places ${exp>=0?"right":"left"}`, `<b>${stdStr}</b>`]
      }, mkMC(rng, stdStr, [
        { html: wrongB, miss: "You moved the decimal the wrong direction — a negative exponent makes a small number." },
        { html: wrongA, miss: "Off-by-one: you moved the decimal one place too few." },
        { html: wrongC, miss: "Off-by-one: you moved the decimal one place too many." }
      ]));
    }
    const a2 = rng.int(1, 9), b2 = rng.int(0, 9);
    const mant2 = parseFloat(`${a2}.${b2}`);
    let exp2 = rng.pick([3,4,5,6,-3,-4,-5]);
    let v1 = mant * Math.pow(10, exp), v2 = mant2 * Math.pow(10, exp2);
    while (Math.abs(v1 - v2) < 1e-12 || exp2 === exp) { exp2 = rng.pick([3,4,5,6,-3,-4,-5]); v2 = mant2 * Math.pow(10, exp2); }
    const n1 = `${mant} &times; 10${sup(exp)}`, n2 = `${mant2} &times; 10${sup(exp2)}`;
    const bigger = v1 > v2 ? n1 : n2;
    const smaller = v1 > v2 ? n2 : n1;
    return mcProblem({
      stem: `Which is larger: ${n1} or ${n2}?`,
      solution: [`Compare exponents first, then mantissas`, `<b>${bigger}</b> is larger`]
    }, mkMC(rng, bigger, [
      { html: smaller, miss: "Compare the powers of 10 first — a bigger exponent wins regardless of the mantissa." },
      { html: "They are equal", miss: "They have different values — line up the powers of 10 to compare." },
      { html: "Cannot be determined", miss: "You always can compare: bigger exponent first, then bigger mantissa." }
    ]));
  }
});

// ============ SKILL 5: Absolute value & opposites ============
S.push({
  id: "absval-opposites", name: "Absolute value & opposites", domain: "numbers", rit: 250, tag: "6.NS.C.7",
  teach: {
    idea: "Absolute value |x| is the distance from 0, so it's never negative. The opposite of x is −x. Watch a minus sign OUTSIDE the bars: −|x| stays negative.",
    mnemonic: "Bars = distance (always ≥ 0); a sign outside the bars survives.",
    example: { stem: "Evaluate &minus;|&minus;3 + 7|", steps: ["Inside: &minus;3 + 7 = 4", "|4| = 4", "Outside minus: <b>&minus;4</b>"] }
  },
  gen(rng, diff) {
    if (diff <= 1) {
      const x = rng.nonzero(-12, 12);
      const ans = Math.abs(x);
      return numProblem({
        stem: `Evaluate: |${neg(x)}|`,
        answer: ans, answerHTML: `${ans}`,
        solution: [`Distance of ${neg(x)} from 0`, `<b>${ans}</b>`],
        misses: [{ near: x, msg: "Absolute value is never negative — it's the distance from 0." }]
      });
    }
    const p = rng.nonzero(-9, 9), q = rng.nonzero(-9, 9);
    const outsideNeg = rng.bool();
    const inside = p + q;
    const ans = (outsideNeg ? -1 : 1) * Math.abs(inside);
    const lead = outsideNeg ? "&minus;" : "";
    return numProblem({
      stem: `Evaluate: ${lead}|${neg(p)} + (${neg(q)})|`,
      answer: ans, answerHTML: `${ans}`,
      solution: [`Inside: ${neg(p)} + (${neg(q)}) = ${inside}`, `|${inside}| = ${Math.abs(inside)}`, `<b>${ans}</b>`],
      misses: [
        { near: inside, msg: "You skipped the absolute value — take the distance from 0 first." },
        ...(outsideNeg ? [{ near: Math.abs(inside), msg: "There's a minus sign OUTSIDE the bars — it makes the result negative." }] : [])
      ]
    });
  }
});

// ============ SKILL 6: Rationalizing a denominator ============
S.push({
  id: "rationalize-denom", name: "Rationalizing a denominator", domain: "numbers", rit: 260, tag: "N-RN.A.2",
  teach: {
    idea: "To clear a square root from a denominator, multiply the fraction by √b/√b. This keeps the value the same (you multiply by 1) but moves the radical to the numerator.",
    mnemonic: "Multiply by √b over √b — a sneaky form of 1.",
    example: { stem: `Rationalize ${fracHTML(3, sqrtHTML(5))}`, steps: ["× √5/√5", "= 3√5 / 5", "<b>3√5 ⁄ 5</b>"] }
  },
  gen(rng, diff) {
    const rads = diff <= 1 ? [2,3,5] : (diff === 2 ? [2,3,5,6,7] : [3,5,6,7,10,11]);
    let b = rng.pick(rads);
    while (U.isPerfectSquare(b)) b = rng.pick(rads);
    const a = rng.int(2, D(diff, 6, 9, 12));
    const g = U.gcd(a, b);
    const numCoef = a / g, den = b / g;
    const correct = den === 1 ? `${numCoef === 1 ? "" : numCoef}${sqrtHTML(b)}` : `${fracHTML(`${numCoef === 1 ? "" : numCoef}${sqrtHTML(b)}`, den)}`;
    const wrongFlip = `${fracHTML(a, sqrtHTML(b))}`;
    const wrongNoCoef = `${fracHTML(sqrtHTML(b), b)}`;
    const wrongSq = `${fracHTML(`${a}${sqrtHTML(b)}`, b*b)}`;
    return mcProblem({
      stem: `Rationalize the denominator: ${fracHTML(a, sqrtHTML(b))}`,
      solution: [`Multiply by ${fracHTML(sqrtHTML(b), sqrtHTML(b))}`, `= ${fracHTML(`${a}${sqrtHTML(b)}`, b)}`, `<b>${correct}</b>`]
    }, mkMC(rng, correct, [
      { html: wrongFlip, miss: "That's the original — you still have a radical in the denominator." },
      { html: wrongNoCoef, miss: "You dropped the numerator; multiply the whole fraction by √b/√b." },
      { html: wrongSq, miss: "√b × √b = b, not b²; the denominator becomes b." }
    ]));
  }
});

  // ----------------------------------------------------------------

S.push({
  id: "func-compose-eval", name: "Composition f(g(x)) at a number", domain: "functions", rit: 264, tag: "F-BF.1",
  teach: {
    idea: "To find f(g(a)), evaluate the <i>inner</i> function g at a first, then plug that result into f.",
    mnemonic: "Inside-out: g goes first, then f.",
    example: { stem: "f(x)=2x+1, g(x)=x−3. Find f(g(5)).", steps: ["g(5) = 5 − 3 = 2", "f(2) = 2·2 + 1 = 5", "<b>5</b>"] }
  },
  gen(rng, diff) {
    const a = rng.int(2, D(diff, 4, 5, 7));
    const m1 = rng.nonzero(2, D(diff, 3, 4, 5)), b1 = rng.int(D(diff,-3,-6,-9), D(diff,3,6,9));
    const m2 = rng.nonzero(2, D(diff, 3, 4, 5)), b2 = rng.int(D(diff,-3,-6,-9), D(diff,3,6,9));
    const g = m2 * a + b2;
    const ans = m1 * g + b1;
    return numProblem({
      stem: `f(x) = ${lin(m1,b1)},&nbsp; g(x) = ${lin(m2,b2)}.&nbsp; Find f(g(${a})).`,
      answer: ans, answerHTML: `f(g(${a})) = ${ans}`,
      solution: [`g(${a}) = ${m2}·${a} ${pm(b2)} = ${g}`, `f(${g}) = ${m1}·${g} ${pm(b1)} = <b>${ans}</b>`],
      misses: [
        { near: m2 * (m1*a+b1) + b2, msg: "You computed g(f(a)) — the inside function g must be evaluated first." },
        { near: a, msg: "Substitute the number into g, then that result into f; don't just return the input." }
      ]
    });
  }
});

S.push({
  id: "piecewise-eval", name: "Piecewise function evaluation", domain: "functions", rit: 262, tag: "F-IF.2",
  teach: {
    idea: "Pick the rule whose condition the input satisfies, then substitute. Watch which interval contains the number.",
    mnemonic: "Match the input to its interval before you plug in.",
    example: { stem: "f(x)= 2x+1 if x<0, else x². Find f(3).", steps: ["3 ≥ 0, so use x²", "f(3) = 3² = 9", "<b>9</b>"] }
  },
  gen(rng, diff) {
    const c = rng.int(D(diff,-1,-3,-4), D(diff,2,4,5));
    const m1 = rng.nonzero(2,4), b1 = rng.int(-5,5);
    const m2 = rng.nonzero(2,4), b2 = rng.int(-5,5);
    const below = rng.bool();
    const x = below ? rng.int(c - D(diff,4,6,8), c - 1) : rng.int(c, c + D(diff,3,4,5));
    const f1 = (t) => m1 * t + b1;
    const f2 = (t) => m2 * t * t + b2;
    const ans = below ? f1(x) : f2(x);
    const other = below ? f2(x) : f1(x);
    return numProblem({
      stem: `f(x) = ${lin(m1,b1)} if x &lt; ${c},&nbsp; ${m2}x${sup(2)} ${pm(b2)} if x &ge; ${c}.&nbsp; Find f(${x}).`,
      answer: ans, answerHTML: `f(${x}) = ${ans}`,
      solution: [
        below ? `${x} &lt; ${c}, so use ${lin(m1,b1)}` : `${x} &ge; ${c}, so use ${m2}x${sup(2)} ${pm(b2)}`,
        `f(${x}) = <b>${ans}</b>`
      ],
      misses: [{ near: other, msg: "You used the wrong piece — check whether the input is below or at/above the boundary." }]
    });
  }
});

S.push({
  id: "avg-rate-change", name: "Average rate of change on [a,b]", domain: "functions", rit: 266, tag: "F-IF.6",
  teach: {
    idea: "Average rate of change of f on [a,b] is (f(b) − f(a)) / (b − a) — the slope between the two endpoints.",
    mnemonic: "Rise over run: difference of outputs ÷ difference of inputs.",
    example: { stem: "f(x)=x². Average rate of change on [1,4].", steps: ["f(4)−f(1) = 16 − 1 = 15", "÷ (4 − 1) = 15/3 = 5", "<b>5</b>"] }
  },
  gen(rng, diff) {
    const p = rng.nonzero(1, D(diff,1,2,3));
    const q = rng.int(D(diff,-2,-4,-6), D(diff,2,4,6));
    const r = rng.int(-5,5);
    let a = rng.int(D(diff,-2,-4,-6), 1);
    let len = rng.int(2, D(diff,3,4,5));
    let b = a + len;
    const f = (t) => p*t*t + q*t + r;
    const ans = (f(b) - f(a)) / (b - a);
    return numProblem({
      stem: `f(x) = ${quad(p,q,r)}.&nbsp; Find the average rate of change on [${a}, ${b}].`,
      answer: ans, answerHTML: `${ans}`, tol: 0.02,
      solution: [
        `f(${b}) = ${f(b)},&nbsp; f(${a}) = ${f(a)}`,
        `(${f(b)} &minus; ${f(a)}) / (${b} &minus; ${a}) = ${f(b)-f(a)}/${b-a}`,
        `<b>${ans}</b>`
      ],
      misses: [
        { near: f(b) - f(a), msg: "You forgot to divide by (b − a); rate of change is rise OVER run." },
        { near: (f(b)-f(a))/(b+a), msg: "Divide by (b − a), not (b + a)." }
      ]
    });
  }
});

S.push({
  id: "variation-direct-inverse", name: "Direct & inverse variation", domain: "functions", rit: 263, tag: "A-CED.2",
  teach: {
    idea: "Direct: y = kx (y/x is constant). Inverse: y = k/x (xy is constant). Find k from the given pair, then use it.",
    mnemonic: "Direct multiplies; inverse divides. Direct grows together, inverse trades off.",
    example: { stem: "y varies inversely with x; y=6 when x=4. Find y when x=8.", steps: ["k = xy = 4·6 = 24", "y = 24/8 = 3", "<b>3</b>"] }
  },
  gen(rng, diff) {
    const direct = rng.bool();
    const k = rng.int(D(diff,2,3,4), D(diff,8,12,18));
    if (direct) {
      const x1 = rng.int(2, D(diff,5,7,9));
      const y1 = k * x1;
      const x2 = rng.int(2, D(diff,6,9,12));
      const ans = k * x2;
      return numProblem({
        stem: `y varies directly with x.&nbsp; y = ${y1} when x = ${x1}.&nbsp; Find y when x = ${x2}.`,
        answer: ans, answerHTML: `y = ${ans}`,
        solution: [`k = y/x = ${y1}/${x1} = ${k}`, `y = ${k}·${x2} = <b>${ans}</b>`],
        misses: [{ near: y1 + (x2 - x1), msg: "Direct variation scales by a constant factor k, not by adding the change in x." }]
      });
    } else {
      const divs = [];
      for (let d = 2; d <= k; d++) if (k % d === 0) divs.push(d);
      const x1 = rng.pick(divs), x2 = rng.pick(divs.filter(d => d !== x1).length ? divs.filter(d => d !== x1) : divs);
      const y1 = k / x1;
      const ans = k / x2;
      return numProblem({
        stem: `y varies inversely with x.&nbsp; y = ${y1} when x = ${x1}.&nbsp; Find y when x = ${x2}.`,
        answer: ans, answerHTML: `y = ${ans}`,
        solution: [`k = x·y = ${x1}·${y1} = ${k}`, `y = ${k}/${x2} = <b>${ans}</b>`],
        misses: [{ near: y1 * (x2 / x1), msg: "For inverse variation y = k/x: when x doubles, y halves — they move oppositely." }]
      });
    }
  }
});

S.push({
  id: "halflife-doubling", name: "Half-life & doubling", domain: "functions", rit: 268, tag: "F-LE.2",
  teach: {
    idea: "Half-life: A = A₀·(1/2)^(t/h). Doubling: A = A₀·2^(t/d). The exponent counts how many periods have passed.",
    mnemonic: "Count the periods (t ÷ length), then halve or double that many times.",
    example: { stem: "200 g, half-life 5 yr. Amount after 15 yr.", steps: ["periods = 15/5 = 3", "200·(1/2)³ = 200/8 = 25", "<b>25</b>"] }
  },
  gen(rng, diff) {
    const doubling = rng.bool();
    const periods = rng.int(2, D(diff,3,4,5));
    const len = rng.int(2, D(diff,4,6,8));
    const t = periods * len;
    if (doubling) {
      const A0 = rng.int(D(diff,2,3,5), D(diff,9,15,30)) * 10;
      const ans = A0 * Math.pow(2, periods);
      return numProblem({
        stem: `A culture starts at ${A0} cells and doubles every ${len} hours.&nbsp; How many cells after ${t} hours?`,
        answer: ans, answerHTML: `${ans} cells`,
        solution: [`periods = ${t}/${len} = ${periods}`, `${A0}·2${sup(periods)} = ${A0}·${Math.pow(2,periods)} = <b>${ans}</b>`],
        misses: [
          { near: A0 * 2 * periods, msg: "Doubling is repeated multiplication (×2 each period), not multiplying by 2 once or adding." },
          { near: A0 * periods, msg: "Each period multiplies by 2; raise 2 to the number of periods." }
        ]
      });
    } else {
      const A0 = rng.int(2, D(diff,5,8,12)) * Math.pow(2, periods);
      const ans = A0 / Math.pow(2, periods);
      return numProblem({
        stem: `A ${A0} mg sample has a half-life of ${len} days.&nbsp; How much remains after ${t} days?`,
        answer: ans, answerHTML: `${ans} mg`, tol: 0.05,
        solution: [`periods = ${t}/${len} = ${periods}`, `${A0}·(1/2)${sup(periods)} = ${A0}/${Math.pow(2,periods)} = <b>${ans}</b>`],
        misses: [
          { near: A0 / (2 * periods), msg: "Each period HALVES the amount; divide by 2 raised to the number of periods." },
          { near: A0 - A0 / 2 * periods, msg: "Half-life is repeated halving (×1/2 each period), not subtracting a fixed amount." }
        ]
      });
    }
  }
});

S.push({
  id: "recursive-explicit-term", name: "Recursive & explicit sequence term", domain: "functions", rit: 265, tag: "F-BF.2",
  teach: {
    idea: "A recursive rule aₙ = aₙ₋₁ + d (or ·r) with a first term defines an arithmetic/geometric sequence. Convert to explicit aₙ = a₁ + (n−1)d (or a₁·r^(n−1)) to jump to a term.",
    mnemonic: "Recursive = step-by-step; explicit = teleport to term n.",
    example: { stem: "a₁=3, aₙ=aₙ₋₁+4. Find a₆.", steps: ["explicit: aₙ = 3 + (n−1)·4", "a₆ = 3 + 5·4 = 23", "<b>23</b>"] }
  },
  gen(rng, diff) {
    const arithmetic = rng.bool();
    const a1 = rng.int(D(diff,1,2,3), D(diff,4,6,8));
    const n = rng.int(D(diff,5,6,7), D(diff,6,8,10));
    if (arithmetic) {
      const d = rng.nonzero(2, D(diff,3,5,7)) * rng.sign();
      const ans = a1 + (n - 1) * d;
      return numProblem({
        stem: `a${sub(1)} = ${a1},&nbsp; a${sub("n")} = a${sub("n−1")} ${pm(d)}.&nbsp; Find a${sub(n)}.`,
        answer: ans, answerHTML: `a${sub(n)} = ${ans}`,
        solution: [`explicit: a${sub("n")} = ${a1} + (n − 1)·(${d})`, `a${sub(n)} = ${a1} + ${n-1}·${d} = <b>${ans}</b>`],
        misses: [{ near: a1 + n * d, msg: "Use (n − 1) steps from the first term, not n." }]
      });
    } else {
      const r = rng.int(2, D(diff,2,3,3));
      const nn = rng.int(3, D(diff,4,5,5));
      const ans = a1 * Math.pow(r, nn - 1);
      return numProblem({
        stem: `a${sub(1)} = ${a1},&nbsp; a${sub("n")} = ${r}·a${sub("n−1")}.&nbsp; Find a${sub(nn)}.`,
        answer: ans, answerHTML: `a${sub(nn)} = ${ans}`,
        solution: [`explicit: a${sub("n")} = ${a1}·${r}${sup("(n−1)")}`, `a${sub(nn)} = ${a1}·${r}${sup(nn-1)} = <b>${ans}</b>`],
        misses: [{ near: a1 * r * nn, msg: "Geometric jumps multiply by r each step: raise r to (n − 1), don't multiply by n." }]
      });
    }
  }
});
function sub(s){ return `<sub>${s}</sub>`; }

  // ----------------------------------------------------------------

S.push({
  id: "surface-area-solids", name: "Surface area of cone / pyramid / sphere", domain: "geometry", rit: 264, tag: "G-GMD.3",
  teach: {
    idea: "Cone: S = πr² + πrℓ (ℓ = slant). Square pyramid: S = b² + 2bℓ (ℓ = slant height of a triangular face). Sphere: S = 4πr².",
    mnemonic: "Sphere is 'four pies': S = 4πr².",
    example: { stem: "Cone with r = 3, slant ℓ = 5. Surface area?", steps: ["S = πr² + πrℓ = π·9 + π·15", "= 24π ≈ <b>75.40</b>"] }
  },
  gen(rng, diff) {
    const which = rng.pick(["cone", "pyramid", "sphere"]);
    if (which === "sphere") {
      const r = rng.int(D(diff, 3, 5, 8), D(diff, 6, 10, 15));
      const S = U.round(4 * Math.PI * r * r, 2);
      return numProblem({
        stem: `Find the surface area of a sphere with radius ${r}. Round to 2 decimals.`,
        answer: S, answerHTML: `${S}`, tol: 0.05,
        solution: [`S = 4πr² = 4π·${r}²`, `= ${4 * r * r}π`, `≈ <b>${S}</b>`],
        misses: [{ near: U.round(Math.PI * r * r, 2), msg: "That's πr² — a sphere's surface area is 4πr²." }]
      });
    }
    if (which === "cone") {
      const r = rng.int(D(diff, 3, 4, 5), D(diff, 5, 7, 9));
      const l = rng.int(r + 2, r + D(diff, 5, 8, 12));
      const S = U.round(Math.PI * r * r + Math.PI * r * l, 2);
      return numProblem({
        stem: `Find the surface area of a cone with radius ${r} and slant height ${l}. Round to 2 decimals.`,
        answer: S, answerHTML: `${S}`, tol: 0.05,
        solution: [`S = πr² + πrℓ = π·${r}² + π·${r}·${l}`, `= ${r * r + r * l}π`, `≈ <b>${S}</b>`],
        misses: [{ near: U.round(Math.PI * r * l, 2), msg: "You found only the lateral area πrℓ — add the base πr²." }]
      });
    }
    // square pyramid
    const b = rng.int(D(diff, 4, 6, 8), D(diff, 6, 9, 12));
    const l = rng.int(b, b + D(diff, 4, 7, 10));
    const S = b * b + 2 * b * l;
    return numProblem({
      stem: `Find the surface area of a square pyramid with base edge ${b} and slant height ${l}.`,
      answer: S, answerHTML: `${S}`,
      solution: [`S = b² + 2bℓ = ${b}² + 2·${b}·${l}`, `= ${b * b} + ${2 * b * l}`, `= <b>${S}</b>`],
      misses: [{ near: b * b + 4 * b * l, msg: "Each of the 4 triangular faces has area ½·b·ℓ, so the lateral total is 2bℓ, not 4bℓ." }]
    });
  }
});

S.push({
  id: "volume-composite", name: "Volume of a composite solid", domain: "geometry", rit: 268, tag: "G-GMD.3",
  teach: {
    idea: "Break the solid into known pieces and ADD their volumes. Cylinder V = πr²h; cone V = ⅓πr²h; hemisphere V = ⅔πr³.",
    example: { stem: "Cylinder (r = 2, h = 5) topped by a cone (r = 2, h = 3). Volume?", steps: ["Cyl = π·4·5 = 20π; Cone = ⅓·π·4·3 = 4π", "Total = 24π ≈ <b>75.40</b>"] }
  },
  gen(rng, diff) {
    const r = rng.int(D(diff, 2, 3, 4), D(diff, 4, 5, 7));
    const hc = rng.int(D(diff, 4, 5, 6), D(diff, 7, 9, 12)); // cylinder height
    const combo = rng.pick(["cone", "hemisphere"]);
    if (combo === "cone") {
      const hk = rng.int(3, D(diff, 6, 9, 12)); // cone height
      const V = U.round(Math.PI * r * r * hc + (1 / 3) * Math.PI * r * r * hk, 2);
      return numProblem({
        stem: `A cylinder of radius ${r} and height ${hc} is topped by a cone of the same radius and height ${hk}. Find the total volume. Round to 2 decimals.`,
        answer: V, answerHTML: `${V}`, tol: 0.05,
        solution: [`Cylinder = πr²h = π·${r}²·${hc} = ${r * r * hc}π`, `Cone = ⅓πr²h = ⅓·π·${r}²·${hk} = ${U.round(r * r * hk / 3, 4)}π`, `Total = ${U.round(r * r * hc + r * r * hk / 3, 4)}π ≈ <b>${V}</b>`],
        misses: [{ near: U.round(Math.PI * r * r * hc + Math.PI * r * r * hk, 2), msg: "Forgot the ⅓ on the cone — a cone is one-third of the cylinder with the same base and height." }]
      });
    }
    // hemisphere on top of cylinder
    const V = U.round(Math.PI * r * r * hc + (2 / 3) * Math.PI * r * r * r, 2);
    return numProblem({
      stem: `A cylinder of radius ${r} and height ${hc} is capped by a hemisphere of the same radius. Find the total volume. Round to 2 decimals.`,
      answer: V, answerHTML: `${V}`, tol: 0.05,
      solution: [`Cylinder = πr²h = π·${r}²·${hc} = ${r * r * hc}π`, `Hemisphere = ⅔πr³ = ⅔·π·${r}³ = ${U.round(2 * r * r * r / 3, 4)}π`, `Total = ${U.round(r * r * hc + 2 * r * r * r / 3, 4)}π ≈ <b>${V}</b>`],
      misses: [{ near: U.round(Math.PI * r * r * hc + (4 / 3) * Math.PI * r * r * r, 2), msg: "A hemisphere is HALF a sphere: ⅔πr³, not the full ⁴⁄₃πr³." }]
    });
  }
});

S.push({
  id: "similar-solids-ratio", name: "Similar solids: area & volume ratios", domain: "geometry", rit: 266, tag: "G-GMD.5",
  teach: {
    idea: "If two similar solids have scale factor a:b (linear), then their surface areas are in ratio a²:b² and their volumes in ratio a³:b³.",
    mnemonic: "Length¹, Area², Volume³ — square it for area, cube it for volume.",
    example: { stem: "Scale factor 2:3. Volume ratio?", steps: ["Cube the linear ratio: 2³:3³", "= <b>8:27</b>"] }
  },
  gen(rng, diff) {
    const a = rng.int(2, D(diff, 4, 5, 6));
    let b = rng.int(a + 1, a + D(diff, 3, 5, 7));
    const g = U.gcd(a, b); const a2 = a / g, b2 = b / g; // reduced scale
    const ask = rng.pick(["area", "volume"]);
    if (ask === "area") {
      const num = a2 * a2, den = b2 * b2;
      return mcProblem({
        stem: `Two similar solids have scale factor ${a2}:${b2}. What is the ratio of their surface areas?`,
        solution: [`Square the scale factor: ${a2}²:${b2}²`, `= <b>${num}:${den}</b>`]
      }, mkMC(rng, `${num}:${den}`, [
        { html: `${a2}:${b2}`, miss: "That's the linear ratio — surface area scales as the SQUARE of the scale factor." },
        { html: `${a2 * a2 * a2}:${b2 * b2 * b2}`, miss: "That's the VOLUME ratio (cubed). Area is squared." },
        `${2 * a2}:${2 * b2}`
      ]));
    }
    const num = a2 * a2 * a2, den = b2 * b2 * b2;
    return mcProblem({
      stem: `Two similar solids have scale factor ${a2}:${b2}. What is the ratio of their volumes?`,
      solution: [`Cube the scale factor: ${a2}³:${b2}³`, `= <b>${num}:${den}</b>`]
    }, mkMC(rng, `${num}:${den}`, [
      { html: `${a2}:${b2}`, miss: "That's the linear ratio — volume scales as the CUBE of the scale factor." },
      { html: `${a2 * a2}:${b2 * b2}`, miss: "That's the AREA ratio (squared). Volume is cubed." },
      `${3 * a2}:${3 * b2}`
    ]));
  }
});

S.push({
  id: "law-sines-cosines", name: "Law of Sines / Cosines", domain: "geometry", rit: 274, tag: "G-SRT.11", stretch: true,
  teach: {
    idea: "Law of Sines: a/sin A = b/sin B. Law of Cosines: c² = a² + b² − 2ab·cos C (use when you know two sides + the included angle, or all three sides).",
    mnemonic: "Two sides and the angle BETWEEN → Cosines. A matching side-angle PAIR → Sines.",
    example: { stem: "Sides a = 7, b = 9, included angle C = 40°. Find c.", steps: ["c² = 49 + 81 − 2·7·9·cos40°", "c² = 130 − 126·0.766 ≈ 33.5", "c ≈ <b>5.79</b>"] }
  },
  gen(rng, diff) {
    const mode = rng.pick(["cos-side", "sin-side"]);
    if (mode === "cos-side") {
      const a = rng.int(D(diff, 6, 7, 8), D(diff, 9, 11, 14));
      const b = rng.int(D(diff, 6, 7, 8), D(diff, 9, 11, 14));
      const C = rng.int(D(diff, 35, 40, 50), D(diff, 70, 85, 110));
      const c2 = a * a + b * b - 2 * a * b * Math.cos(C * Math.PI / 180);
      const c = U.round(Math.sqrt(c2), 2);
      return numProblem({
        stem: `In a triangle, sides a = ${a} and b = ${b} include angle C = ${C}°. Find side c. Round to 2 decimals.`,
        answer: c, answerHTML: `${c}`, tol: 0.05,
        solution: [`c² = a² + b² − 2ab·cos C`, `= ${a * a + b * b} − ${2 * a * b}·cos${C}° ≈ ${U.round(c2, 3)}`, `c ≈ <b>${c}</b>`],
        misses: [{ near: U.round(Math.sqrt(a * a + b * b + 2 * a * b * Math.cos(C * Math.PI / 180)), 2), msg: "Sign error: the Law of Cosines SUBTRACTS 2ab·cos C." }]
      });
    }
    // law of sines: find a side given angle A, angle B, and side b
    const A = rng.int(D(diff, 35, 40, 45), D(diff, 60, 70, 75));
    const B = rng.int(D(diff, 35, 40, 45), D(diff, 60, 70, 75));
    const b = rng.int(D(diff, 6, 8, 10), D(diff, 12, 16, 20));
    const a = U.round(b * Math.sin(A * Math.PI / 180) / Math.sin(B * Math.PI / 180), 2);
    return numProblem({
      stem: `In a triangle, angle A = ${A}°, angle B = ${B}°, and side b = ${b} (opposite B). Find side a (opposite A). Round to 2 decimals.`,
      answer: a, answerHTML: `${a}`, tol: 0.05,
      solution: [`a/sin A = b/sin B`, `a = b·sin A / sin B = ${b}·sin${A}° / sin${B}°`, `≈ <b>${a}</b>`],
      misses: [{ near: U.round(b * Math.sin(B * Math.PI / 180) / Math.sin(A * Math.PI / 180), 2), msg: "You flipped the ratio — a = b·sin A / sin B, with sin of the angle opposite the side you want on top." }]
    });
  }
});

S.push({
  id: "unit-circle-radians", name: "Radians, degrees & reference angles", domain: "geometry", rit: 272, tag: "F-TF.1", stretch: true,
  teach: {
    idea: "180° = π radians, so multiply degrees by π/180 to get radians (and by 180/π to go back). A reference angle is the acute angle to the nearest x-axis.",
    mnemonic: "Radians = degrees × π/180. ('π over 180, degrees go in.')",
    example: { stem: "Convert 135° to radians.", steps: ["135 · π/180 = 135π/180", "= <b>3π/4</b>"] }
  },
  gen(rng, diff) {
    const mode = rng.pick(["deg2rad", "rad2deg", "refangle"]);
    if (mode === "deg2rad") {
      const deg = rng.pick(D(diff, [30, 45, 60, 90], [120, 135, 150, 210], [225, 240, 300, 330]));
      const [n, d] = U.simplifyFrac(deg, 180);
      return numProblem({
        stem: `Convert ${deg}° to radians (the exact value is ${n === 1 ? "" : n}π/${d}). Enter the decimal, rounded to 3 decimals.`,
        answer: U.round(deg * Math.PI / 180, 3), answerHTML: `${n === 1 ? "" : n}π/${d} ≈ ${U.round(deg * Math.PI / 180, 3)}`, tol: 0.01,
        solution: [`${deg}·π/180 = ${n}π/${d}`, `≈ <b>${U.round(deg * Math.PI / 180, 3)}</b>`],
        misses: [{ near: U.round(deg * 180 / Math.PI, 3), msg: "You multiplied by 180/π — to go FROM degrees TO radians, multiply by π/180." }]
      });
    }
    if (mode === "rad2deg") {
      // radians given as n·π/d
      const d = rng.pick([2, 3, 4, 6]);
      const n = rng.int(1, D(diff, 3, 5, 7));
      const deg = U.round(n * 180 / d, 2);
      return numProblem({
        stem: `Convert ${n === 1 ? "" : n}π/${d} radians to degrees.`,
        answer: deg, answerHTML: `${deg}°`, tol: 0.05,
        solution: [`(${n}π/${d})·(180/π) = ${n}·180/${d}`, `= <b>${deg}°</b>`],
        misses: [{ near: U.round(n * Math.PI / d * Math.PI / 180, 4), msg: "To go FROM radians TO degrees, multiply by 180/π (not π/180)." }]
      });
    }
    // reference angle (degrees)
    const angle = rng.pick(D(diff, [120, 150, 210, 240], [135, 225, 300, 330], [160, 200, 290, 340]));
    let ref;
    if (angle < 90) ref = angle;
    else if (angle < 180) ref = 180 - angle;
    else if (angle < 270) ref = angle - 180;
    else ref = 360 - angle;
    return numProblem({
      stem: `Find the reference angle of ${angle}° (in degrees).`,
      answer: ref, answerHTML: `${ref}°`,
      solution: [`${angle}° is in quadrant ${angle < 180 ? "II" : (angle < 270 ? "III" : "IV")}.`, `Reference angle = ${angle < 180 ? "180 − " + angle : (angle < 270 ? angle + " − 180" : "360 − " + angle)}`, `= <b>${ref}°</b>`]
    });
  }
});

S.push({
  id: "power-of-point", name: "Chord / secant / tangent (power of a point)", domain: "geometry", rit: 270, tag: "G-C.2",
  teach: {
    idea: "Two chords crossing inside: a·b = c·d. Two secants from an outside point: (whole₁)(near₁) = (whole₂)(near₂). Tangent + secant: t² = (whole)(near).",
    mnemonic: "Always 'outer × whole' for secants from outside; equal products for chords inside.",
    example: { stem: "Chords cross: one is split into 4 and 6, the other into 3 and x. Find x.", steps: ["4·6 = 3·x", "24 = 3x", "x = <b>8</b>"] }
  },
  gen(rng, diff) {
    const mode = rng.pick(["chord", "tangent"]);
    if (mode === "chord") {
      // a*b = c*x ; pick so x integer
      const a = rng.int(D(diff, 2, 3, 4), D(diff, 6, 8, 10));
      const b = rng.int(D(diff, 4, 5, 6), D(diff, 9, 12, 15));
      const c = rng.pick([1, 2, 3, 4, 6].filter(k => (a * b) % k === 0));
      const x = (a * b) / c;
      return numProblem({
        stem: `Two chords intersect inside a circle. One is divided into segments ${a} and ${b}; the other into ${c} and x. Find x.`,
        answer: x, answerHTML: `x = ${x}`,
        solution: [`${a}·${b} = ${c}·x`, `${a * b} = ${c}x`, `x = <b>${x}</b>`],
        misses: [{ near: a * b - c, msg: "Use the product rule (multiply the two known segments, then divide), not subtraction." }]
      });
    }
    // tangent-secant: t^2 = whole * near ; pick whole, near so t^2 is perfect square
    const tries = [[2, 8], [4, 9], [3, 12], [1, 9], [2, 18], [4, 16], [5, 20], [3, 27], [6, 24]];
    const pick = rng.pick(tries.filter(p => U.isPerfectSquare(p[0] * p[1])));
    const near = pick[0], whole = pick[1]; const far = whole - near; const t = Math.round(Math.sqrt(near * whole));
    return numProblem({
      stem: `From an external point, a tangent of length t and a secant are drawn. The secant's external segment is ${near} and its far segment is ${far} (so the whole secant is ${whole}). Find t.`,
      answer: t, answerHTML: `t = ${t}`,
      solution: [`t² = (external)(whole) = ${near}·${whole}`, `t² = ${near * whole}`, `t = <b>${t}</b>`],
      misses: [{ near: near * whole, msg: "That's t² — take the square root to get t." }, { near: Math.round(Math.sqrt(near * far) * 100) / 100, msg: "Use the WHOLE secant (external × whole), not external × far." }]
    });
  }
});

S.push({
  id: "parallel-perp-line", name: "Parallel / perpendicular line through a point", domain: "geometry", rit: 262, tag: "G-GPE.5",
  teach: {
    idea: "Parallel lines share the SAME slope. Perpendicular lines have slopes that are NEGATIVE RECIPROCALS (m and −1/m). Then use point-slope: y − y₁ = m(x − x₁).",
    mnemonic: "Parallel = same slope. Perpendicular = flip and negate.",
    example: { stem: "Line through (1, 2) perpendicular to y = 2x + 5.", steps: ["Perp slope = −1/2", "y − 2 = −½(x − 1) → y = <b>−½x + 5/2</b>"] }
  },
  gen(rng, diff) {
    // slope of given line: integer magnitude >= 2 so negative reciprocal is always a proper fraction
    const m = rng.sign() * rng.int(2, D(diff, 3, 4, 5));
    const px = rng.sign() * rng.int(1, D(diff, 3, 5, 7)); // nonzero so sign-slip intercept differs
    const py = rng.int(D(diff, -3, -5, -7), D(diff, 3, 5, 7));
    const givenB = rng.int(-9, 9);
    const kind = rng.pick(["parallel", "perpendicular"]);
    if (kind === "parallel") {
      const b = py - m * px; // same slope, integer
      const perpS = `${-m < 0 ? "&minus;" : ""}1/${Math.abs(m)}`;
      return mcProblem({
        stem: `Find the equation of the line through (${px}, ${py}) parallel to y = ${lin(m, givenB)}.`,
        solution: [`Parallel → same slope m = ${m}`, `y ${py < 0 ? "+ " + Math.abs(py) : "− " + py} = ${m}(x ${px < 0 ? "+ " + Math.abs(px) : "− " + px})`, `y = <b>${lin(m, b)}</b>`]
      }, mkMC(rng, `y = ${lin(m, b)}`, [
        { html: `y = ${lin(-m, py + m * px)}`, miss: "You negated the slope — parallel lines keep the SAME slope." },
        { html: `y = ${lin(m, py + m * px)}`, miss: "Sign slip in the intercept: b = y₁ − m·x₁, so b = " + py + " − (" + m + ")(" + px + ")." },
        { html: `y = ${perpS}x ${b >= 0 ? "+ " + b : "&minus; " + Math.abs(b)}`, miss: "That's the PERPENDICULAR slope — for parallel you keep slope m unchanged." }
      ]));
    }
    // perpendicular: slope = -1/m, a proper fraction since |m| >= 2
    const perpNeg = (-1 / m) < 0; // is the correct perpendicular slope negative?
    const correctS = `${perpNeg ? "&minus;" : ""}1/${Math.abs(m)}`;
    const wrongSignS = `${perpNeg ? "" : "&minus;"}1/${Math.abs(m)}`;
    return mcProblem({
      stem: `What is the slope of the line through (${px}, ${py}) that is perpendicular to y = ${lin(m, givenB)}?`,
      solution: [`Given slope = ${m}`, `Perpendicular slope = negative reciprocal of ${m} = −1/(${m})`, `= <b>${correctS}</b>`]
    }, mkMC(rng, correctS, [
      { html: `${m}`, miss: "That's the original slope — perpendicular needs the NEGATIVE RECIPROCAL." },
      { html: `${-m}`, miss: "You only negated; you must also take the reciprocal (flip the fraction)." },
      { html: wrongSignS, miss: "You took the reciprocal but used the wrong sign — negate it." }
    ]));
  }
});

  // ----------------------------------------------------------------

S.push({
  id: "expected-value", name: "Expected value of a distribution", domain: "stats", rit: 262, tag: "S-MD.2",
  teach: {
    idea: "Expected value = sum of (each value &times; its probability). It is the long-run average outcome.",
    mnemonic: "Multiply each payoff by its chance, then add them all up.",
    example: { stem: "Win $0 (p=0.5), $2 (p=0.3), $10 (p=0.2). E(X)?", steps: ["0(.5) + 2(.3) + 10(.2)", "0 + 0.6 + 2.0", "<b>2.6</b>"] }
  },
  gen(rng, diff) {
    const k = D(diff, 3, 3, 4);
    let parts = [];
    let rem = 10;
    for (let i = 0; i < k - 1; i++) { const p = rng.int(1, rem - (k - 1 - i)); parts.push(p); rem -= p; }
    parts.push(rem);
    parts = rng.shuffle(parts);
    const vals = [];
    const used = new Set();
    for (let i = 0; i < k; i++) { let v; do { v = rng.int(D(diff,0,0,-4), D(diff,8,12,15)); } while (used.has(v)); used.add(v); vals.push(v); }
    let ev = 0;
    const rows = [];
    for (let i = 0; i < k; i++) { ev += vals[i] * (parts[i] / 10); rows.push(`${vals[i]} (p=${(parts[i]/10).toFixed(1)})`); }
    ev = U.round(ev, 2);
    const terms = vals.map((v,i) => `${v}(${(parts[i]/10).toFixed(1)})`).join(" + ");
    const sumVals = vals.reduce((a,b)=>a+b,0);
    return numProblem({
      stem: `A variable X takes these values with the given probabilities:<br>${rows.join(", ")}.<br>Find the expected value E(X) (2 decimals).`,
      answer: ev, answerHTML: `E(X) = ${ev}`, tol: 0.02,
      solution: [`E(X) = &Sigma; value &times; probability`, `= ${terms}`, `= <b>${ev}</b>`],
      misses: [{ near: U.round(sumVals / k, 2), msg: "You averaged the values evenly &mdash; weight each by its probability instead." }]
    });
  }
});

S.push({
  id: "population-sd", name: "Population standard deviation", domain: "stats", rit: 270, tag: "S-ID.2",
  teach: {
    idea: "Population SD: find the mean, square each deviation from the mean, average those squares (variance), then take the square root.",
    mnemonic: "Deviation, square, average, root.",
    example: { stem: "Data 2,4,6 (population). SD?", steps: ["mean = 4", "deviations 2,0,2 &rarr; squares 4,0,4", "variance = 8/3 &asymp; 2.667", "SD = &radic;2.667 &asymp; <b>1.63</b>"] }
  },
  gen(rng, diff) {
    const n = D(diff, 4, 5, 6);
    const mean = rng.int(D(diff,5,8,10), D(diff,10,15,20));
    let devs = [];
    let s = 0;
    for (let i = 0; i < n - 1; i++) { const d = rng.int(D(diff,-3,-5,-7), D(diff,3,5,7)); devs.push(d); s += d; }
    devs.push(-s);
    const data = devs.map(d => mean + d);
    const ss = devs.reduce((a,d)=>a+d*d,0);
    const variance = ss / n;
    const sd = U.round(Math.sqrt(variance), 2);
    return numProblem({
      stem: `Find the population standard deviation of this data set (round to 2 decimals):<br>${data.join(", ")}`,
      answer: sd, answerHTML: `&sigma; = ${sd}`, tol: 0.03,
      solution: [`mean = ${mean}`, `&sigma;&sup2; = &Sigma;(x&minus;mean)&sup2; / n = ${ss}/${n} = ${U.round(variance,3)}`, `&sigma; = &radic;${U.round(variance,3)} = <b>${sd}</b>`],
      misses: [
        { near: U.round(Math.sqrt(ss/(n-1)),2), msg: "You divided by n&minus;1 (sample SD). For population SD divide by n." },
        { near: U.round(variance,2), msg: "That is the variance &mdash; take its square root to get the standard deviation." }
      ]
    });
  }
});

S.push({
  id: "mean-abs-dev", name: "Mean absolute deviation", domain: "stats", rit: 260, tag: "S-ID.2",
  teach: {
    idea: "MAD = average distance from the mean. Find the mean, take the |deviation| of each point, then average those distances.",
    mnemonic: "Absolute value, not squares &mdash; MAD measures plain distance.",
    example: { stem: "Data 3,7,8,10. MAD?", steps: ["mean = 7", "|distances| = 4,0,1,3", "MAD = 8/4 = <b>2</b>"] }
  },
  gen(rng, diff) {
    const n = D(diff, 4, 5, 5);
    const mean = rng.int(6, D(diff,12,15,20));
    let devs, absSum;
    let guard = 0;
    do {
      devs = []; let s = 0;
      for (let i = 0; i < n - 1; i++) { const d = rng.int(D(diff,-4,-6,-8), D(diff,4,6,8)); devs.push(d); s += d; }
      devs.push(-s);
      absSum = devs.reduce((a,d)=>a+Math.abs(d),0);
      guard++;
    } while ((absSum % n !== 0 || absSum === 0) && guard < 200);
    const data = devs.map(d => mean + d);
    const mad = U.round(absSum / n, 2);
    return numProblem({
      stem: `Find the mean absolute deviation (MAD) of this data set:<br>${data.join(", ")}`,
      answer: mad, answerHTML: `MAD = ${mad}`, tol: 0.02,
      solution: [`mean = ${mean}`, `|deviations| = ${devs.map(d=>Math.abs(d)).join(", ")}`, `MAD = ${absSum}/${n} = <b>${mad}</b>`],
      misses: [{ near: U.round(devs.reduce((a,d)=>a+d*d,0)/n,2), msg: "You squared the deviations &mdash; MAD uses absolute values, not squares." }]
    });
  }
});

S.push({
  id: "five-num-summary", name: "Five-number summary & boxplot", domain: "stats", rit: 264, tag: "S-ID.1",
  teach: {
    idea: "Order the data. The median splits it; Q1 is the median of the lower half, Q3 the median of the upper half (excluding the overall median when n is odd).",
    mnemonic: "Min, Q1, median, Q3, max &mdash; quarters of the sorted data.",
    example: { stem: "Data 2,4,5,7,9,10,12 (n=7). Find Q1.", steps: ["median = 7 (middle)", "lower half = 2,4,5", "Q1 = median of lower = <b>4</b>"] }
  },
  gen(rng, diff) {
    const n = D(diff, 7, 7, 9);
    const data = [];
    let cur = rng.int(1, 6);
    for (let i = 0; i < n; i++) { data.push(cur); cur += rng.int(1, 4); }
    const sorted = data.slice();
    const med = sorted[(n-1)/2];
    const lower = sorted.slice(0, (n-1)/2);
    const upper = sorted.slice((n+1)/2);
    function medOf(arr){ const m=arr.length; return m%2? arr[(m-1)/2] : (arr[m/2-1]+arr[m/2])/2; }
    const q1 = medOf(lower), q3 = medOf(upper);
    const iqr = q3 - q1;
    const ask = D(diff, "Q1", "Q3", "the interquartile range (IQR = Q3 &minus; Q1)");
    const answer = D(diff, q1, q3, iqr);
    const aLabel = D(diff, "Q1", "Q3", "IQR");
    return numProblem({
      stem: `For this data set, find ${ask}:<br>${data.join(", ")}`,
      answer: answer, answerHTML: `${aLabel} = ${answer}`,
      solution: [`sorted: ${sorted.join(", ")}`, `median = ${med}, Q1 = ${q1}, Q3 = ${q3}`, `${aLabel} = <b>${answer}</b>`],
      misses: [{ near: med, msg: "That is the median &mdash; re-read which value the question asks for." }]
    });
  }
});

S.push({
  id: "line-best-fit", name: "Line of best fit & predict", domain: "stats", rit: 266, tag: "S-ID.6",
  teach: {
    idea: "A best-fit line y = mx + b summarizes a trend. Plug an x-value into the equation to predict y.",
    mnemonic: "Substitute x, multiply by the slope, add the intercept.",
    example: { stem: "y = 3x + 5. Predict y when x = 4.", steps: ["y = 3(4) + 5", "y = 12 + 5", "<b>17</b>"] }
  },
  gen(rng, diff) {
    const m = rng.nonzero(2, D(diff,5,7,9)) * (diff >= 3 ? rng.sign() : 1);
    const b = rng.int(D(diff,1,-5,-10), D(diff,12,15,20));
    const x = rng.int(D(diff,3,5,6), D(diff,8,12,16));
    const y = m * x + b;
    return mcProblem({
      stem: `The line of best fit is y = ${lin(m,b)}. Use it to predict y when x = ${x}.`,
      solution: [`y = ${m}(${x}) ${pm(b)}`, `y = ${m*x} ${pm(b)}`, `y = <b>${y}</b>`]
    }, mkMC(rng, `${y}`, [
      { html: `${m * x}`, miss: "You forgot to add the y-intercept b." },
      { html: `${m + x + b}`, miss: "You added m, x, and b &mdash; you must multiply m by x first." },
      { html: `${m * (x + b)}`, miss: "You added b to x before multiplying; substitute only x into mx, then add b." }
    ]));
  }
});

S.push({
  id: "two-way-relfreq", name: "Two-way relative frequency", domain: "stats", rit: 268, tag: "S-ID.5",
  teach: {
    idea: "A conditional relative frequency divides a cell by its row (or column) total &mdash; not the grand total. 'Of the people who X, what fraction also Y?' uses the X group as the denominator.",
    mnemonic: "Conditional = part of its OWN row/column total, not the whole table.",
    example: { stem: "Of 40 dog owners, 30 also like cats. Fraction?", steps: ["denominator = 40 (dog owners)", "30 / 40", "<b>0.75</b>"] }
  },
  gen(rng, diff) {
    const part = rng.int(D(diff,6,8,9), D(diff,18,24,30));
    const rowTotal = part + rng.int(D(diff,4,6,9), D(diff,12,18,28));
    const other = rng.int(D(diff,5,8,10), D(diff,20,30,40));
    const otherTotal = other + rng.int(5, 30);
    const grand = rowTotal + otherTotal;
    const ans = U.round(part / rowTotal, 2);
    return numProblem({
      stem: `A survey of ${grand} students. Among the ${rowTotal} who walk to school, ${part} also bring lunch from home. ` +
            `What is the relative frequency of bringing lunch <b>given</b> that a student walks to school? (2 decimals)`,
      answer: ans, answerHTML: `${ans}`, tol: 0.01,
      solution: [`condition on walkers &rarr; denominator = ${rowTotal}`, `${part} / ${rowTotal}`, `= <b>${ans}</b>`],
      misses: [
        { near: U.round(part / grand, 2), msg: "You divided by the grand total &mdash; a conditional frequency divides by the row total." }
      ]
    });
  }
});

S.push({
  id: "prob-replacement", name: "Probability with/without replacement", domain: "stats", rit: 268, tag: "S-CP.8",
  teach: {
    idea: "For successive draws, multiply the probabilities. WITHOUT replacement, the counts shrink after each draw &mdash; both the favorable count and the total drop by 1.",
    mnemonic: "No replacement = remember to remove the item: total AND favorable both go down.",
    example: { stem: "Bag: 4 red, 6 blue. P(red then red) without replacement?", steps: ["1st: 4/10", "2nd: 3/9 (one red gone)", "(4/10)(3/9) = 12/90 = <b>0.13</b>"] }
  },
  gen(rng, diff) {
    const target = rng.int(D(diff,3,4,5), D(diff,5,6,7));
    const otherC = rng.int(D(diff,3,4,5), D(diff,6,7,9));
    const total = target + otherC;
    const withRepl = rng.bool();
    let p;
    if (withRepl) p = (target / total) * (target / total);
    else p = (target / total) * ((target - 1) / (total - 1));
    const ans = U.round(p, 3);
    const wrongNoReduce = U.round((target / total) * (target / total), 3);
    return numProblem({
      stem: `A bag has ${target} green and ${otherC} yellow marbles. You draw two marbles ${withRepl ? "<b>with</b>" : "<b>without</b>"} replacement. ` +
            `Find P(both green) as a decimal (3 decimals).`,
      answer: ans, answerHTML: `${ans}`, tol: 0.002,
      solution: withRepl
        ? [`with replacement, total stays ${total}`, `(${target}/${total}) &times; (${target}/${total})`, `= <b>${ans}</b>`]
        : [`without replacement, counts drop`, `(${target}/${total}) &times; (${target-1}/${total-1})`, `= <b>${ans}</b>`],
      misses: withRepl ? [] : [
        { near: wrongNoReduce, msg: "Without replacement you must reduce BOTH counts: the second draw is (g&minus;1)/(total&minus;1)." }
      ]
    });
  }
});

  // index the catalog
  const byId = {};
  S.forEach(sk => { byId[sk.id] = sk; });
  APP.skills = S;
  APP.skillById = byId;

  // =========================================================================
  // REFERENCE / FORMULA CARDS (for the Reference screen) — meaning-anchored,
  // with the research-flagged pitfalls surfaced.
  // =========================================================================
  APP.reference = [
    { domain: "algebra", title: "Quadratic formula", html: "x = (−b ± √(b² − 4ac)) / 2a — works for every quadratic. <i>Sing it to “Pop Goes the Weasel.”</i>" },
    { domain: "algebra", title: "Discriminant Δ = b² − 4ac", html: "Δ &gt; 0 → 2 real roots · Δ = 0 → 1 repeated root · Δ &lt; 0 → no real roots." },
    { domain: "algebra", title: "Factoring x² + bx + c", html: "Find two numbers that multiply to c and add to b. Difference of squares: a² − b² = (a+b)(a−b)." },
    { domain: "algebra", title: "Zero-Product Property", html: "If AB = 0 then A = 0 or B = 0. Always set the quadratic = 0 before factoring." },
    { domain: "algebra", title: "⚠ Order of operations (PEMDAS)", html: "× and ÷ are EQUAL — do them left to right. + and − are EQUAL — left to right. <i>18 ÷ 9 × 2 = 4, not 1.</i>" },
    { domain: "numbers", title: "Exponent rules", html: "aᵐ·aⁿ = a^(m+n) · aᵐ/aⁿ = a^(m−n) · (aᵐ)ⁿ = a^(mn) · a⁰ = 1 · a⁻ⁿ = 1/aⁿ. Derive, don't memorize." },
    { domain: "numbers", title: "Rational exponents", html: "a^(m/n) = ⁿ√(aᵐ) = (ⁿ√a)ᵐ. Denominator = root, numerator = power." },
    { domain: "numbers", title: "Simplify radicals", html: "Pull out the largest perfect square: √(a²b) = a√b. √a·√b = √(ab)." },
    { domain: "numbers", title: "Complex numbers", html: "i = √(−1), i² = −1. √(−n) = i√n. Powers of i cycle: i, −1, −i, 1, …" },
    { domain: "numbers", title: "⚠ Sign rules (× ÷)", html: "Same signs → +, different signs → −. <b>Does NOT apply to addition/subtraction.</b>" },
    { domain: "functions", title: "Slope & line", html: "m = (y₂−y₁)/(x₂−x₁) = rise/run. Slope-intercept: y = mx + b." },
    { domain: "functions", title: "Transformations of f(x)", html: "f(x−h)+k: right h (opposite sign inside), up k. −f(x) flips over x-axis. a·f(x) stretches. <i>Inside lies, outside tells the truth.</i>" },
    { domain: "functions", title: "Sequences", html: "Arithmetic: aₙ = a₁ + (n−1)d (constant difference). Geometric: aₙ = a₁·r^(n−1) (constant ratio)." },
    { domain: "functions", title: "Exponential / interest", html: "A = P(1 ± r)ᵗ. r as a decimal. Linear=constant difference, Exponential=constant ratio, Quadratic=constant 2nd difference." },
    { domain: "geometry", title: "Pythagorean theorem", html: "a² + b² = c² (c = hypotenuse). Triples: 3-4-5, 5-12-13, 8-15-17, 7-24-25." },
    { domain: "geometry", title: "Right-triangle trig — SOH-CAH-TOA", html: "Sin = Opp/Hyp · Cos = Adj/Hyp · Tan = Opp/Adj. Quadrant signs: <b>A</b>ll <b>S</b>tudents <b>T</b>ake <b>C</b>alculus." },
    { domain: "geometry", title: "Special right triangles", html: "45-45-90: legs x, x, hyp x√2. 30-60-90: sides x, x√3, 2x." },
    { domain: "geometry", title: "Circles", html: "C = 2πr · A = πr². Arc = (θ/360)·2πr · Sector = (θ/360)·πr². Inscribed angle = ½ central angle. Equation: (x−h)²+(y−k)²=r²." },
    { domain: "geometry", title: "Distance & midpoint", html: "d = √((x₂−x₁)²+(y₂−y₁)²). Midpoint = average the coordinates." },
    { domain: "geometry", title: "Volume", html: "Cylinder πr²h · Cone ⅓πr²h · Sphere 4⁄3πr³ · Prism (base)(height) · Pyramid ⅓(base)(height)." },
    { domain: "geometry", title: "Coordinate transformations", html: "x-axis: (x,−y) · y-axis: (−x,y) · 180°: (−x,−y) · 90° CCW: (−y,x)." },
    { domain: "stats", title: "Center & spread", html: "Mean = sum/count. Median = middle (sorted). Range = max − min. z = (x−μ)/σ." },
    { domain: "stats", title: "Probability", html: "P = favorable/total. Independent AND → multiply. Exclusive OR → add. Conditional P(A|B): divide by the B subtotal, not the grand total." },
    { domain: "stats", title: "Counting", html: "Order matters → permutation nPr = n!/(n−r)!. Order doesn't → combination nCr = n!/(r!(n−r)!)." },
    { domain: "stats", title: "Correlation", html: "r from −1 to 1. +1 strong up, −1 strong down, 0 none. Correlation ≠ causation." },
    { domain: "algebra", title: "Absolute-value equations", html: "|X| = c (c ≥ 0) → X = c OR X = −c. Two solutions. If c &lt; 0, no solution." },
    { domain: "algebra", title: "Completing the square", html: "x² + bx → add (b/2)² to make (x + b/2)². Move c first, add to both sides, then square-root." },
    { domain: "algebra", title: "Adding polynomials", html: "Combine like terms. To SUBTRACT, distribute the minus to every term of the second polynomial first." },
    { domain: "geometry", title: "Surface area", html: "Box: 2(lw + lh + wh). Cylinder: 2πr² + 2πrh. Add the area of every face." },
    { domain: "stats", title: "Quartiles & IQR", html: "Sort. Median splits in half; Q1 = median of lower half, Q3 = median of upper half. IQR = Q3 − Q1." }
  ];
})();
