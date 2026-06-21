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
  function mkMC(rng, correctHTML, distractors) {
    const seen = new Set([correctHTML]);
    const ds = [];
    for (const d of distractors) { if (!seen.has(d)) { seen.add(d); ds.push(d); } }
    let choices = [{ html: correctHTML, ok: true }].concat(ds.slice(0, 3).map(h => ({ html: h, ok: false })));
    return rng.shuffle(choices);
  }
  function numProblem(o) {
    return {
      kind: "number", stem: o.stem, diagram: o.diagram || null,
      input: { kind: "number", placeholder: o.placeholder || "answer", suffix: o.suffix || "" },
      answerHTML: o.answerHTML, solution: o.solution, hint: o.hint || null, verify: o.verify || null,
      _test: { raw: String(o.answer), bad: String(o.answer + 9.123) },
      check: (raw) => approxEq(parseNum(raw), o.answer, o.tol == null ? 0.01 : o.tol)
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
      }
    };
  }
  function mcProblem(o, choices) {
    return {
      kind: "mc", stem: o.stem, diagram: o.diagram || null,
      input: { kind: "mc", choices: choices },
      answerHTML: o.answerHTML || (choices.find(c => c.ok) || {}).html,
      solution: o.solution, hint: o.hint || null, verify: o.verify || null,
      _test: { idx: choices.findIndex(c => c.ok), nchoices: choices.length, nok: choices.filter(c => c.ok).length },
      check: (raw, idx) => !!(choices[idx] && choices[idx].ok)
    };
  }
  const pm = (n) => (n < 0 ? "&minus; " + Math.abs(n) : "+ " + n);   // " + 3" / " − 3"
  const neg = (n) => (n < 0 ? "&minus;" + Math.abs(n) : "" + n);

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
    gen(rng) {
      const k = rng.int(2, 4), d = rng.pick([2, 3]), n = rng.int(2, 3);
      const base = Math.pow(k, d), val = Math.pow(k, n);
      return numProblem({
        stem: `Evaluate:&nbsp; ${base}${sup(`${n}/${d}`)}`,
        answer: val, answerHTML: `${val}`,
        solution: [`${base}^(${n}/${d}) = (${d}√${base})${sup(n)} = ${k}${sup(n)}`, `= <b>${val}</b>`]
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
          mkMC(rng, correct, [`Domain: x ≤ ${c}`, `Domain: x > ${c}`, `All real numbers`]));
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
    gen(rng) {
      const a1 = rng.int(1, 5), r = rng.int(2, 3), n = rng.int(4, 7);
      const an = a1 * Math.pow(r, n - 1);
      return numProblem({
        stem: `Geometric sequence: a₁ = ${a1}, ratio r = ${r}. Find a${sub(n)}.`,
        answer: an, answerHTML: `a${sub(n)} = ${an}`,
        solution: [`aₙ = a₁·r^(n−1) = ${a1}·${r}${sup(n - 1)}`, `= ${a1}·${Math.pow(r, n - 1)} = <b>${an}</b>`]
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
      }, mkMC(rng, correct, [`f⁻¹(x) = (x ${pm(b)}) / ${a}`, `f⁻¹(x) = ${a}x ${pm(-b)}`, `f⁻¹(x) = (x ${pm(-b)}) · ${a}`]));
    }
  });

  S.push({
    id: "logarithm", name: "Logarithms", domain: "functions", rit: 272, tag: "F-LE.4", stretch: true,
    teach: {
      idea: "log_b(x) asks “b to WHAT power gives x?”. logs and exponents are inverses: log_b(x) = y ⇔ bʸ = x.",
      example: { stem: "log₂(32)", steps: ["2 to what power is 32? 2⁵ = 32 → <b>5</b>"] }
    },
    gen(rng) {
      const b = rng.pick([2, 3, 5]); const e = rng.int(2, 5); const x = Math.pow(b, e);
      return numProblem({
        stem: `Evaluate:&nbsp; log<sub>${b}</sub>(${x})`,
        answer: e, answerHTML: `${e}`,
        solution: [`${b} to what power = ${x}?`, `${b}${sup(e)} = ${x} → <b>${e}</b>`]
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
    gen(rng) {
      const triples = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [6, 8, 10], [9, 12, 15], [9, 40, 41], [20, 21, 29]];
      const [a, b, c] = rng.pick(triples); const findHyp = rng.bool(0.6);
      if (findHyp) return numProblem({
        stem: `A right triangle has legs ${a} and ${b}. Find the hypotenuse.`,
        diagram: svgRight(a, b, "?"), answer: c, answerHTML: `${c}`, tol: 0.02,
        solution: [`c² = ${a}² + ${b}² = ${a * a} + ${b * b} = ${c * c}`, `c = √${c * c} = <b>${c}</b>`]
      });
      return numProblem({
        stem: `A right triangle has hypotenuse ${c} and one leg ${a}. Find the other leg.`,
        diagram: svgRight("?", a, c), answer: b, answerHTML: `${b}`, tol: 0.02,
        solution: [`b² = ${c}² − ${a}² = ${c * c} − ${a * a} = ${b * b}`, `b = <b>${b}</b>`]
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
      }, mkMC(rng, correct, [`Center (${-h}, ${-k}), r = ${r}`, `Center (${h}, ${k}), r = ${r * r}`, `Center (${-h}, ${-k}), r = ${r * r}`]));
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
      }, mkMC(rng, correct, [`(${t.f[1]}, ${t.f[0]})`, `(${-t.f[0]}, ${t.f[1]})`, `(${x}, ${y})`]));
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
    gen(rng) {
      const n = rng.int(4, 8), r = rng.int(2, Math.min(4, n - 1)); const perm = rng.bool();
      function fact(x) { let f = 1; for (let i = 2; i <= x; i++) f *= i; return f; }
      const val = perm ? fact(n) / fact(n - r) : fact(n) / (fact(r) * fact(n - r));
      return numProblem({
        stem: `${perm ? "How many ordered arrangements" : "How many ways to choose (order doesn't matter)"} of ${r} from ${n} ${perm ? "items" : "items"}? (${perm ? "₍" + n + "₎P₍" + r + "₎" : "₍" + n + "₎C₍" + r + "₎"})`,
        answer: val, answerHTML: `${val}`, tol: 0.02,
        solution: [perm ? `nPr = n!/(n−r)! = ${n}!/${n - r}!` : `nCr = n!/(r!(n−r)!)`, `= <b>${val}</b>`]
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
      const t = rng.pick([
        { d: "As x increases, y steadily increases.", a: "Strong positive correlation" },
        { d: "As x increases, y steadily decreases.", a: "Strong negative correlation" },
        { d: "Points are scattered with no pattern.", a: "No correlation" }
      ]);
      return mcProblem({
        stem: `A scatterplot shows: “${t.d}” Which best describes the correlation?`,
        solution: [`<b>${t.a}</b>`]
      }, mkMC(rng, t.a, ["Strong positive correlation", "Strong negative correlation", "No correlation"].filter(x => x !== t.a)));
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
    gen(rng) {
      const x = rng.int(2, 9);
      if (rng.bool()) {
        const correct = radicalHTML(x, 2);
        return mcProblem({ stem: `A 45-45-90 triangle has legs of length ${x}. Find the hypotenuse.`,
          solution: [`hyp = leg·√2 = ${x}√2`, `<b>${correct}</b>`] },
          mkMC(rng, correct, [radicalHTML(x, 3), `${2 * x}`, `${x}`]));
      }
      const ask = rng.bool();
      const correct = ask ? radicalHTML(x, 3) : `${2 * x}`;
      return mcProblem({ stem: `A 30-60-90 triangle has a short leg of length ${x}. Find the ${ask ? "longer leg" : "hypotenuse"}.`,
        solution: [ask ? `long leg = short·√3 = ${x}√3` : `hyp = 2·short = ${2 * x}`, `<b>${correct}</b>`] },
        mkMC(rng, correct, [radicalHTML(x, 2), ask ? `${2 * x}` : radicalHTML(x, 3), `${x}`]));
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
