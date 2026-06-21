/* Math_Study — ui.js
 * All rendering + the session controller. Vanilla DOM, no framework.
 */
(function () {
  "use strict";
  const APP = (window.APP = window.APP || {});
  const U = APP.util, E = APP.engine;
  const root = () => document.getElementById("app");

  // ---------- tiny DOM helper ----------
  function h(tag, attrs, kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "html") n.innerHTML = attrs[k];
      else if (k === "text") n.textContent = attrs[k];
      else if (k === "class") n.className = attrs[k];
      else if (k.slice(0, 2) === "on" && typeof attrs[k] === "function") n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    if (kids != null) (Array.isArray(kids) ? kids : [kids]).forEach(c => { if (c != null) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function mount(node) { const r = root(); r.innerHTML = ""; r.appendChild(node); window.scrollTo(0, 0); }
  function toast(msg) {
    let t = document.querySelector(".toast"); if (!t) { t = h("div", { class: "toast" }); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show"); clearTimeout(t._tm); t._tm = setTimeout(() => t.classList.remove("show"), 2200);
  }
  const dnames = () => APP.domains;

  // ---------- navigation ----------
  let activeTab = "home";
  function nav(active) {
    activeTab = active;
    const tabs = [["home", "Home"], ["practice", "Practice"], ["reference", "Reference"], ["progress", "Progress"], ["settings", "Settings"]];
    return h("div", { class: "nav" }, [
      h("div", { class: "brand" }, [
        h("div", { class: "logo", html: "Math<b>_Study</b>" }),
        h("div", { class: "tag", text: "Research-backed NWEA math trainer" })
      ]),
      h("div", { class: "tabs" }, tabs.map(([id, label]) =>
        h("button", { class: id === active ? "active" : "", onclick: () => go(id) }, label)))
    ]);
  }
  function go(screen) {
    if (screen === "home") renderHome();
    else if (screen === "practice") Session.start();
    else if (screen === "reference") renderReference();
    else if (screen === "progress") renderProgress();
    else if (screen === "settings") renderSettings();
  }
  APP.go = go;

  // ---------- charts ----------
  function sparkline(values, w, hh, color) {
    w = w || 320; hh = hh || 60; color = color || "var(--accent2)";
    if (!values.length) return h("div");
    const min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    const span = (max - min) || 1, pad = 6;
    const pts = values.map((v, i) => {
      const x = pad + (w - 2 * pad) * (values.length === 1 ? 0.5 : i / (values.length - 1));
      const y = pad + (hh - 2 * pad) * (1 - (v - min) / span);
      return [x, y];
    });
    const path = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const area = path + ` L${pts[pts.length - 1][0].toFixed(1)} ${hh - pad} L${pts[0][0].toFixed(1)} ${hh - pad} Z`;
    const svg = `<svg class="spark" viewBox="0 0 ${w} ${hh}" preserveAspectRatio="none" height="${hh}">
      <path d="${area}" fill="${color}" opacity="0.12"/>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
      ${pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.6" fill="${color}"/>`).join("")}
    </svg>`;
    return h("div", { html: svg });
  }
  function ritTrend(history) {
    const w = 600, hh = 180, padL = 38, padR = 12, padT = 14, padB = 24;
    const pts = history.map(p => p.theta);
    const sems = history.map(p => p.sem);
    let lo = Math.min.apply(null, pts.map((v, i) => v - sems[i]));
    let hi = Math.max.apply(null, pts.map((v, i) => v + sems[i]));
    lo = Math.floor(lo - 2); hi = Math.ceil(hi + 2);
    const span = (hi - lo) || 1;
    const X = i => padL + (w - padL - padR) * (history.length === 1 ? 0.5 : i / (history.length - 1));
    const Y = v => padT + (hh - padT - padB) * (1 - (v - lo) / span);
    const line = pts.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join(" ");
    const bandTop = history.map((p, i) => X(i).toFixed(1) + " " + Y(p.theta + p.sem).toFixed(1));
    const bandBot = history.map((p, i) => X(i).toFixed(1) + " " + Y(p.theta - p.sem).toFixed(1)).reverse();
    const band = "M" + bandTop.join(" L") + " L" + bandBot.join(" L") + " Z";
    const gl = [];
    for (let g = 0; g <= 4; g++) { const v = lo + span * g / 4; const y = Y(v); gl.push(`<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="var(--border)" stroke-width="1"/><text x="4" y="${y + 4}" fill="var(--faint)" font-size="11">${Math.round(v)}</text>`); }
    const svg = `<svg class="trend" viewBox="0 0 ${w} ${hh}" height="${hh}">
      ${gl.join("")}
      <path d="${band}" fill="var(--accent)" opacity="0.13"/>
      <path d="${line}" fill="none" stroke="var(--accent2)" stroke-width="2.6" stroke-linejoin="round"/>
      ${pts.map((v, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="3.2" fill="var(--accent2)"/>`).join("")}
    </svg>`;
    return h("div", { html: svg });
  }
  function heatmap(daily) {
    const days = 70, today = new Date();
    const cells = [];
    let maxC = 1;
    for (let i = 0; i < days; i++) { const k = U.todayKey(new Date(today.getTime() - i * U.DAY_MS)); maxC = Math.max(maxC, (daily[k] || {}).problems || 0); }
    for (let i = days - 1; i >= 0; i--) {
      const k = U.todayKey(new Date(today.getTime() - i * U.DAY_MS));
      const c = (daily[k] || {}).problems || 0;
      const intensity = c ? 0.2 + 0.8 * Math.min(1, c / Math.max(8, maxC)) : 0;
      const bg = c ? `rgba(99,102,241,${intensity.toFixed(2)})` : "var(--panel3)";
      cells.push(`<div class="cell" title="${k}: ${c} problems" style="background:${bg}"></div>`);
    }
    return h("div", { class: "heat", html: cells.join("") });
  }

  // ---------- HOME ----------
  function renderHome() {
    const st = APP.store.state, c = E.counts(), est = E.estimateAbility();
    const hour = new Date().getHours();
    const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const acc = st.totals.problems ? Math.round(100 * st.totals.correct / st.totals.problems) : 0;
    const days = Object.keys(st.daily).length;

    // RIT trend + delta
    const hist = st.ritHistory;
    let deltaEl = h("span", { class: "delta flat", text: "baseline" });
    if (hist.length >= 2) {
      const d = hist[hist.length - 1].theta - hist[0].theta;
      deltaEl = h("span", { class: "delta " + (d > 0.5 ? "up" : d < -0.5 ? "down" : "flat"), text: (d >= 0 ? "+" : "") + d.toFixed(1) + " since start" });
    }
    const thetas = hist.length ? hist.map(p => p.theta) : [est.theta];

    const ctaReady = c.due > 0 || c.newAvail > 0;
    const cta = h("button", { class: "cta", onclick: () => Session.start() }, [
      h("div", { class: "big", text: ctaReady ? "Start today's session" : "Extra practice session" }),
      h("div", { class: "small", html: ctaReady
        ? `${c.due} review${c.due === 1 ? "" : "s"} due · ${c.newAvail} new skill${c.newAvail === 1 ? "" : "s"} to learn`
        : `You're caught up for today — keep the edge sharp with a mixed set.` })
    ]);

    const stats = h("div", { class: "grid cols-4" }, [
      tile(st.totals.problems, "Problems"),
      tile(acc + "%", "Accuracy"),
      tile(c.mastered + "/" + c.total, "Skills mastered"),
      tile(days, "Days practiced")
    ]);

    const domBars = h("div", { class: "card" }, [
      h("h2", { class: "section", text: "Mastery by domain", style: "margin-top:2px" }),
      ...Object.keys(dnames()).map(dk => {
        const m = E.domainMastery(dk), d = dnames()[dk];
        return h("div", { class: "dombar" }, [
          h("div", { class: "top" }, [h("span", { html: `<span class="chip" style="background:${d.color}">${d.name}</span>` }), h("span", { class: "pct", text: Math.round(m * 100) + "%" })]),
          h("div", { class: "bar" }, h("span", { style: `width:${Math.round(m * 100)}%;background:${d.color}` }))
        ]);
      })
    ]);

    const ritCard = h("div", { class: "card" }, [
      h("div", { class: "rit-card" }, [
        h("div", { class: "rit-now" }, [
          h("div", { class: "num", text: Math.round(est.theta) }),
          h("div", { class: "sem", text: "± " + Math.round(est.sem) }),
          h("div", { class: "lbl", text: "Estimated RIT" })
        ]),
        h("div", { class: "rit-spark" }, [
          sparkline(thetas, 360, 60),
          h("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-top:4px" }, [
            deltaEl, h("span", { class: "faint", style: "font-size:12px", text: "baseline 264" })
          ])
        ])
      ]),
      h("div", { class: "rit-note", html: "A <b>practice-based proxy</b> from a Rasch model (the same family NWEA uses), not an official score. Honestly: a real 30-day RIT change is small and within measurement noise (±3) — trust the <b>mastery</b> numbers as the real signal." })
    ]);

    const hasWeak = E.weakSkills(1).length > 0;
    const tools = h("div", { class: "grid cols-3" }, [
      miniBtn("📘 Reference & mnemonics", () => go("reference")),
      miniBtn("📈 Progress & charts", () => go("progress")),
      hasWeak ? miniBtn("🎯 Drill weak spots", () => Session.start({ mode: "focus" }))
        : (st.errors.length ? miniBtn("🔁 Review " + st.errors.length + " missed", () => Session.start({ mode: "errors" })) : miniBtn("⚙️ Settings", () => go("settings")))
    ]);
    const calBtn = h("button", { class: "cta secondary", onclick: () => Session.start({ mode: "calibrate" }) }, [
      h("div", { class: "big", style: "font-size:15px", html: "🎯 Quick skill check (~5 min)" }),
      h("div", { class: "small", text: "No teaching — just finds which skills to drill. Missing some is expected and useful." })
    ]);

    mount(h("div", {}, [
      nav("home"),
      h("div", { class: "card" }, [
        h("div", { class: "hero" }, [
          h("div", {}, [
            h("div", { class: "greet", text: greet + "." }),
            h("div", { class: "sub", text: new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) + " — let's raise that RIT." })
          ]),
          h("div", { class: "streak" }, [h("div", { class: "big", html: (st.streak.current || 0) + " 🔥" }), h("div", { class: "lbl", text: "day streak" })])
        ])
      ]),
      cta,
      calBtn,
      ritCard,
      stats,
      h("div", { style: "height:14px" }),
      domBars,
      tools
    ]));
  }
  function tile(v, k) { return h("div", { class: "stat" }, [h("div", { class: "v", text: String(v) }), h("div", { class: "k", text: k })]); }
  function miniBtn(label, fn) { return h("button", { class: "cta secondary", onclick: fn, style: "margin:0" }, h("div", { class: "big", style: "font-size:15px", text: label })); }

  // ---------- SESSION ----------
  const Session = {
    queue: [], idx: 0, results: null, startMs: 0, theta: 264, answered: false, sinceExplain: 0, mode: "normal",
    start(opts) {
      opts = opts || {};
      this.mode = opts.mode || "normal";
      this.theta = E.estimateAbility().theta;
      if (this.mode === "errors") {
        const errs = APP.store.state.errors.slice(-12);
        this.queue = errs.map(e => ({ skillId: e.skillId, domain: APP.skillById[e.skillId].domain, kind: "relearn", isNew: false, needsLearn: false, seed: e.seed, diff: e.diff }));
        if (!this.queue.length) { renderHome(); return; }
      } else if (this.mode === "focus") {
        this.queue = E.buildFocusSession(12);
        if (!this.queue.length) { this.mode = "normal"; this.queue = E.buildSession(); }
      } else if (this.mode === "calibrate") {
        this.queue = E.buildCalibration(14);
      } else {
        this.queue = E.buildSession();
      }
      this.idx = 0; this.startMs = U.nowMs(); this.sinceExplain = 0;
      this.results = { correct: 0, total: 0, byDomain: {}, newLearned: 0, slips: 0, learnedIds: [] };
      this.present();
    },
    present() {
      if (this.idx >= this.queue.length) return this.finish();
      const item = this.queue[this.idx];
      this.current = { item, problem: E.makeProblem(item), qStart: U.nowMs(), usedHelp: false, learnShown: false };
      this.answered = false;
      if (item.needsLearn) this.renderLearn();
      else this.renderProblem();
    },
    topBar() {
      const solved = this.results.total;
      const totalEst = this.queue.length;
      const pct = Math.min(100, Math.round(100 * this.idx / Math.max(1, totalEst)));
      return h("div", { class: "sess-top" }, [
        h("button", { class: "quit", onclick: () => { if (confirm("End this session?")) Session.finish(); } }, "✕ End"),
        h("div", { class: "prog" }, h("span", { style: "width:" + pct + "%" })),
        h("div", { class: "count", text: "✓ " + solved + (this.mode === "errors" ? "" : " · " + Math.max(0, this.queue.length - this.idx) + " left") })
      ]);
    },
    renderLearn() {
      const sk = this.current.problem.skill, t = sk.teach;
      const card = h("div", { class: "qcard learn" }, [
        h("div", { class: "kicker", html: `New skill · <span style="color:${dnames()[sk.domain].color}">${dnames()[sk.domain].name}</span>` }),
        h("h2", { text: sk.name }),
        h("div", { class: "idea", html: t.idea }),
        t.mnemonic ? h("div", { class: "mnem", html: "💡 " + t.mnemonic }) : null,
        t.example ? h("div", { class: "ex" }, [
          h("div", { class: "q", html: "Example: " + t.example.stem }),
          ...(t.example.steps || []).map(s => h("div", { class: "step", html: s, style: "padding-left:18px;position:relative" }))
        ]) : null,
        h("div", { style: "margin-top:18px" }, h("button", { class: "btn big", onclick: () => { Session.current.item.needsLearn = false; Session.renderProblem(); } }, "Got it — try one →"))
      ]);
      mount(h("div", {}, [nav("practice"), this.topBar(), card]));
    },
    renderProblem() {
      const p = this.current.problem, sk = p.skill;
      const hard = sk.rit >= this.theta + 3 || p.diff >= 3 || !!p.verify;
      const head = h("div", { class: "qhead" }, [
        h("span", { html: `<span class="chip" style="background:${dnames()[sk.domain].color}">${dnames()[sk.domain].name}</span>` }),
        h("span", { class: "skill", text: sk.name }),
        p.diff >= 3 ? h("span", { class: "diffpill", text: "stretch" }) : null
      ]);
      const stem = h("div", { class: "stem", html: p.stem });
      const body = h("div", { class: "qcard" }, [head]);
      if (hard) body.appendChild(h("div", { class: "verify-pill", html: "🔍 Tougher one — estimate the answer first, then check your work before submitting." }));
      body.appendChild(stem);
      if (p.diagram) body.appendChild(h("div", { html: p.diagram }));

      const answerArea = h("div", {});
      if (p.kind === "mc") {
        const ch = h("div", { class: "choices" });
        p.input.choices.forEach((choice, i) => {
          ch.appendChild(h("button", { class: "choice", "data-i": i, html: choice.html, onclick: () => Session.submitMC(i) }));
        });
        answerArea.appendChild(ch);
      } else {
        const input = h("input", { type: "text", inputmode: p.kind === "number" ? "decimal" : "text", placeholder: p.input.placeholder, autocomplete: "off", spellcheck: "false", onkeydown: (e) => { if (e.key === "Enter") Session.submitText(); } });
        const row = h("div", { class: "answer-row" }, [input, h("button", { class: "btn", onclick: () => Session.submitText() }, "Submit")]);
        answerArea.appendChild(row);
        this.current.input = input;
        setTimeout(() => input.focus(), 30);
      }
      body.appendChild(answerArea);
      body.appendChild(h("div", { style: "margin-top:10px" }, h("button", { class: "linkbtn", onclick: () => Session.showHint() }, "Need a hint?")));
      this.current.bodyEl = body; this.current.answerArea = answerArea;
      mount(h("div", {}, [nav("practice"), this.topBar(), body]));
    },
    showHint() {
      if (this.answered) return;
      this.current.usedHelp = true;
      const p = this.current.problem;
      const hint = p.hint || (p.skill.teach && p.skill.teach.idea) || "Re-read the question carefully.";
      let hEl = this.current.bodyEl.querySelector(".hintbox");
      if (!hEl) { hEl = h("div", { class: "mnem hintbox", html: "💡 " + hint }); this.current.answerArea.appendChild(hEl); }
    },
    submitText() {
      if (this.answered) return;
      const raw = this.current.input.value;
      if (!raw.trim()) { this.current.input.focus(); return; }
      this.current.userRaw = raw;
      const correct = !!this.current.problem.check(raw);
      this.finishAnswer(correct);
    },
    submitMC(i) {
      if (this.answered) return;
      const p = this.current.problem;
      this.current.userIdx = i;
      const correct = !!p.check(null, i);
      // colorize choices
      const btns = this.current.answerArea.querySelectorAll(".choice");
      btns.forEach((b, j) => { b.disabled = true; if (p.input.choices[j].ok) b.classList.add("correct"); else if (j === i && !correct) b.classList.add("wrong"); });
      this.finishAnswer(correct);
    },
    finishAnswer(correct) {
      this.answered = true;
      const item = this.current.item, p = this.current.problem;
      const ms = U.nowMs() - this.current.qStart;
      const res = E.processResponse(item, p, correct, ms, this.current.usedHelp);
      // tally
      this.results.total++; if (correct) this.results.correct++;
      this.results.byDomain[p.skill.domain] = this.results.byDomain[p.skill.domain] || { c: 0, t: 0 };
      this.results.byDomain[p.skill.domain].t++; if (correct) this.results.byDomain[p.skill.domain].c++;
      if (item.isNew && this.results.learnedIds.indexOf(item.skillId) < 0) { this.results.newLearned++; this.results.learnedIds.push(item.skillId); }
      if (res.slip) this.results.slips++;
      // successive relearning: requeue a fresh instance of a missed skill
      if (res.requeue && this.mode !== "errors" && this.mode !== "calibrate") {
        const insertAt = Math.min(this.queue.length, this.idx + 3);
        this.queue.splice(insertAt, 0, { skillId: item.skillId, domain: item.domain, kind: "relearn", isNew: false, needsLearn: false, seed: U.newSeed() });
      }
      this.renderFeedback(correct, res, ms);
    },
    renderFeedback(correct, res, ms) {
      const p = this.current.problem;
      const fb = h("div", { class: "fb " + (correct ? "ok" : "no") });
      fb.appendChild(h("div", { class: "verdict", html: correct ? "✓ Correct" + (ms < 9000 && !this.current.usedHelp ? " — fast & clean" : "") : "✗ Not quite" }));
      if (!correct) fb.appendChild(h("div", { class: "ans", html: "Answer: <b>" + p.answerHTML + "</b>" + (res.slip ? ' <span class="muted">— looks like a careless slip; slow down and verify next time.</span>' : "") }));
      // misconception-targeted feedback: name the SPECIFIC mistake, not just "wrong"
      if (!correct && p.diagnose) {
        const miss = p.diagnose(this.current.userRaw, this.current.userIdx);
        if (miss) fb.appendChild(h("div", { class: "miss", html: "🔎 <b>Here's the mistake:</b> " + miss }));
      }
      const sol = h("div", { class: "sol" }, (p.solution || []).map(s => h("div", { class: "step", html: s })));
      fb.appendChild(sol);
      if (p.verify) fb.appendChild(h("div", { class: "mnem", html: "✓ Check: " + p.verify }));
      if (p.skill.teach && p.skill.teach.mnemonic) fb.appendChild(h("div", { class: "mnem", html: "💡 " + p.skill.teach.mnemonic }));
      if (!correct && this.mode !== "errors") fb.appendChild(h("div", { class: "muted", style: "margin-top:10px;font-size:13px", text: "↻ We'll bring this one back later in the session." }));

      // occasional self-explanation prompt (metacognition) after a correct answer
      this.sinceExplain++;
      if (correct && this.sinceExplain >= 5) {
        this.sinceExplain = 0;
        fb.appendChild(h("div", { class: "selfexplain" }, [
          h("div", { class: "muted", style: "font-size:13px;margin-bottom:5px", text: "In one line — why does this method work? (builds deep understanding; optional)" }),
          h("textarea", { placeholder: "e.g. because dividing by a negative reverses the inequality…" })
        ]));
      }

      this.current.answerArea.querySelectorAll("input,button").forEach(b => { if (!b.classList.contains("quit")) b.disabled = true; });
      this.current.bodyEl.appendChild(fb);
      const nextLabel = (this.idx + 1 >= this.queue.length) ? "Finish session →" : "Next →";
      const nb = h("button", { class: "btn big", style: "margin-top:16px", onclick: () => { Session.idx++; Session.present(); } }, nextLabel);
      this.current.bodyEl.appendChild(nb);
      setTimeout(() => nb.focus(), 30);
      // allow Enter to advance
      this._adv = (e) => { if (e.key === "Enter") { document.removeEventListener("keydown", Session._adv); Session.idx++; Session.present(); } };
      document.addEventListener("keydown", this._adv);
      fb.scrollIntoView({ behavior: "smooth", block: "nearest" });
    },
    finish() {
      if (this._adv) document.removeEventListener("keydown", this._adv);
      const est = E.endSession();
      const r = this.results || { correct: 0, total: 0, byDomain: {}, newLearned: 0, slips: 0 };
      const acc = r.total ? Math.round(100 * r.correct / r.total) : 0;
      const tips = [
        "Sleep consolidates today's practice — your brain replays it overnight. A short session before bed pays off.",
        "Spacing beats cramming: tomorrow's review at the edge of forgetting is where memories get strong.",
        "Interleaving mixed topics feels harder but roughly doubles retention vs. doing one type at a time.",
        "Retrieving an answer (even getting it wrong, then correcting) beats re-reading every time.",
        "On the real test, slow down and verify — most lost points are careless slips, not unknown skills."
      ];
      const tip = tips[(r.total + this.idx) % tips.length];
      const domLines = Object.keys(r.byDomain).map(dk =>
        h("div", { class: "dombar" }, [
          h("div", { class: "top" }, [h("span", { html: `<span class="chip" style="background:${dnames()[dk].color}">${dnames()[dk].name}</span>` }), h("span", { class: "pct", text: r.byDomain[dk].c + "/" + r.byDomain[dk].t })]),
          h("div", { class: "bar" }, h("span", { style: `width:${Math.round(100 * r.byDomain[dk].c / r.byDomain[dk].t)}%;background:${dnames()[dk].color}` }))
        ]));
      mount(h("div", {}, [
        nav("practice"),
        h("div", { class: "card summary" }, [
          h("div", { class: "ring", text: acc + "%" }),
          h("div", { class: "muted", text: r.correct + " of " + r.total + " correct" + (r.newLearned ? " · " + r.newLearned + " new skill" + (r.newLearned === 1 ? "" : "s") + " learned" : "") + (r.slips ? " · " + r.slips + " careless slip" + (r.slips === 1 ? "" : "s") : "") }),
          h("div", { style: "margin:18px 0" }, [
            h("div", { class: "muted", style: "font-size:13px;margin-bottom:6px", text: "Estimated RIT now" }),
            h("div", { style: "font-size:34px;font-weight:800", html: Math.round(est.theta) + ' <span style="font-size:15px;color:var(--muted)">± ' + Math.round(est.sem) + "</span>" })
          ]),
          domLines.length ? h("div", { style: "max-width:420px;margin:0 auto;text-align:left" }, domLines) : null,
          h("div", { class: "tip", html: "🧠 " + tip }),
          h("div", { style: "margin-top:18px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap" }, [
            h("button", { class: "btn ghost", onclick: () => renderHome() }, "Done for today"),
            h("button", { class: "btn", onclick: () => Session.start() }, "Practice more →")
          ])
        ])
      ]));
    }
  };
  APP.Session = Session;

  // ---------- REFERENCE ----------
  function renderReference() {
    const wrap = h("div", {});
    const search = h("input", { class: "ref-search", placeholder: "Search formulas, mnemonics, topics…", oninput: () => filter(search.value.toLowerCase()) });
    const list = h("div", {});
    function filter(q) {
      list.innerHTML = "";
      Object.keys(dnames()).forEach(dk => {
        const cards = APP.reference.filter(r => r.domain === dk && (!q || (r.title + " " + r.html).toLowerCase().includes(q)));
        if (!cards.length) return;
        list.appendChild(h("h2", { class: "section", html: `<span class="chip" style="background:${dnames()[dk].color}">${dnames()[dk].name}</span>` }));
        cards.forEach(r => list.appendChild(h("div", { class: "refcard" }, [h("div", { class: "t", text: r.title }), h("div", { class: "b", html: r.html })])));
      });
      if (!list.children.length) list.appendChild(h("div", { class: "muted center", text: "No matches." }));
    }
    filter("");
    mount(h("div", {}, [nav("reference"),
      h("div", { class: "card" }, [h("h2", { style: "margin:0 0 4px", text: "Reference & mnemonics" }), h("div", { class: "muted", style: "font-size:13.5px;margin-bottom:12px", html: "Meaning-anchored memory aids — tie each trick to <i>why</i> it works. ⚠ marks common traps." }), search]),
      list]));
  }

  // ---------- PROGRESS ----------
  function renderProgress() {
    const st = APP.store.state, c = E.counts(), est = E.estimateAbility();
    const hist = st.ritHistory.slice();
    if (!hist.length) hist.push({ dayKey: U.todayKey(), theta: est.theta, sem: est.sem });
    const acc = st.totals.problems ? Math.round(100 * st.totals.correct / st.totals.problems) : 0;
    const mins = Math.round(st.totals.seconds / 60);
    let totalSlip = 0, totalBug = 0;
    Object.values(st.skills).forEach(s => { totalSlip += s.slips || 0; totalBug += s.bugs || 0; });

    mount(h("div", {}, [
      nav("progress"),
      h("div", { class: "card" }, [
        h("h2", { style: "margin:0 0 2px", text: "Estimated RIT trend" }),
        h("div", { class: "muted", style: "font-size:13px;margin-bottom:10px", html: "Shaded band = uncertainty (±1 SEM). Practice-based proxy, not an official NWEA score." }),
        hist.length >= 2 ? ritTrend(hist) : h("div", { class: "muted center", style: "padding:30px", html: "Complete a few sessions across different days to see your trend line.<br>Current estimate: <b>" + Math.round(est.theta) + " ± " + Math.round(est.sem) + "</b>" })
      ]),
      h("div", { class: "grid cols-4" }, [
        tile(st.totals.problems, "Problems"),
        tile(acc + "%", "Accuracy"),
        tile(mins + "m", "Time studied"),
        tile(st.streak.longest || 0, "Best streak")
      ]),
      h("div", { style: "height:14px" }),
      h("div", { class: "card" }, [
        h("h2", { class: "section", style: "margin-top:0", text: "Skill mastery" }),
        h("div", { class: "muted", style: "font-size:13.5px;margin-bottom:12px", html: `<b>${c.mastered}</b> of ${c.total} skills mastered · <b>${c.introduced}</b> started. A skill counts as mastered once it survives a 3-week recall interval with good accuracy.` }),
        ...Object.keys(dnames()).map(dk => {
          const m = E.domainMastery(dk), d = dnames()[dk];
          const ids = APP.skills.filter(s => s.domain === dk);
          const mastered = ids.filter(s => E.isMastered(s.id)).length;
          return h("div", { class: "dombar" }, [
            h("div", { class: "top" }, [h("span", { html: `<span class="chip" style="background:${d.color}">${d.name}</span>` }), h("span", { class: "pct", text: mastered + "/" + ids.length + " mastered" })]),
            h("div", { class: "bar" }, h("span", { style: `width:${Math.round(m * 100)}%;background:${d.color}` }))
          ]);
        })
      ]),
      (function () {
        const weak = E.weakSkills(6);
        if (!weak.length) return null;
        return h("div", { class: "card" }, [
          h("h2", { class: "section", style: "margin-top:0", text: "Focus areas — your weakest skills" }),
          h("div", { class: "muted", style: "font-size:13.5px;margin-bottom:10px", html: "Your highest-leverage skills to drill — half-learned, not yet locked in. This is where your next RIT points are hiding." }),
          ...weak.map(s => {
            const r = st.skills[s.id]; const a = r.attempts ? Math.round(100 * r.correct / r.attempts) : 0;
            return h("div", { class: "focus-skill" }, [
              h("span", { html: `<span class="chip" style="background:${dnames()[s.domain].color};font-size:10px">${dnames()[s.domain].name}</span>&nbsp; ${s.name}` }),
              h("span", { class: "acc", text: a + "% · " + r.attempts + " tries" })
            ]);
          }),
          h("button", { class: "btn", style: "margin-top:14px", onclick: () => Session.start({ mode: "focus" }) }, "🎯 Drill these weak spots")
        ]);
      })(),
      h("div", { class: "card" }, [
        h("h2", { class: "section", style: "margin-top:0", text: "Practice calendar (last 10 weeks)" }),
        heatmap(st.daily),
        h("div", { class: "legend" }, [
          h("span", { class: "k", html: '<span class="dot" style="background:var(--panel3)"></span> none' }),
          h("span", { class: "k", html: '<span class="dot" style="background:rgba(99,102,241,.4)"></span> some' }),
          h("span", { class: "k", html: '<span class="dot" style="background:rgba(99,102,241,1)"></span> lots' })
        ])
      ]),
      h("div", { class: "card" }, [
        h("h2", { class: "section", style: "margin-top:0", text: "Error analysis" }),
        h("div", { class: "muted", style: "font-size:13.5px", html: `<b>${totalSlip}</b> careless <b>slips</b> (knew it, missed it) vs <b>${totalBug}</b> concept <b>gaps</b>. Slips → slow down & verify on the real test. Gaps → keep practicing those skills.<br>${st.errors.length ? "" : "No missed problems logged yet."}` }),
        st.errors.length ? h("button", { class: "btn ghost", style: "margin-top:12px", onclick: () => Session.start({ mode: "errors" }) }, "🔁 Review " + st.errors.length + " missed problems") : null
      ])
    ]));
  }

  // ---------- SETTINGS ----------
  function renderSettings() {
    const st = APP.store.state, s = st.settings;
    function rangeRow(label, desc, key, min, max, step, fmt) {
      const val = h("span", { style: "font-weight:700;min-width:42px;text-align:right", text: fmt(s[key]) });
      const r = h("input", { type: "range", min, max, step, value: s[key], oninput: () => { s[key] = parseFloat(r.value); val.textContent = fmt(s[key]); APP.store.save(); } });
      return h("div", { class: "set-row" }, [h("div", {}, [h("div", { class: "lbl", text: label }), h("div", { class: "desc", text: desc })]), h("div", { style: "display:flex;align-items:center;gap:12px;min-width:180px" }, [r, val])]);
    }
    const io = h("textarea", { class: "io", placeholder: "Paste exported JSON here to import…" });
    mount(h("div", {}, [
      nav("settings"),
      h("div", { class: "card" }, [
        h("h2", { style: "margin:0 0 8px", text: "Settings" }),
        rangeRow("New skills per day", "How many brand-new skills to introduce daily. Lower = lighter load.", "dailyNew", 2, 16, 1, v => v),
        rangeRow("Session length", "Target problems per session (~30–60s each).", "sessionTarget", 8, 40, 2, v => v),
        rangeRow("Target retention", "Desired recall probability the scheduler aims for. 90% is the research sweet spot.", "desiredRetention", 0.8, 0.97, 0.01, v => Math.round(v * 100) + "%"),
        rangeRow("Baseline RIT", "Your starting NWEA math RIT — anchors the early estimate.", "baselineRIT", 200, 290, 1, v => v)
      ]),
      h("div", { class: "card" }, [
        h("h2", { class: "section", style: "margin-top:0", text: "Your data" }),
        h("div", { class: "muted", style: "font-size:13px;margin-bottom:10px", text: "Everything is stored locally in this browser. Export to back up or move devices." }),
        h("div", { style: "display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px" }, [
          h("button", { class: "btn ghost", onclick: () => { io.value = APP.store.exportJSON(); io.select(); toast("Exported — copy the text below."); } }, "⬇ Export"),
          h("button", { class: "btn ghost", onclick: () => { try { APP.store.importJSON(io.value); toast("Imported ✓"); renderHome(); } catch (e) { toast("Import failed: invalid JSON"); } } }, "⬆ Import"),
          h("button", { class: "btn ghost danger", onclick: () => { if (confirm("Erase ALL progress and start over? This cannot be undone.")) { APP.store.reset(); toast("Reset done"); renderHome(); } } }, "🗑 Reset all")
        ]),
        io
      ]),
      h("div", { class: "card" }, [
        h("h2", { class: "section", style: "margin-top:0", text: "About" }),
        h("div", { class: "muted", style: "font-size:13.5px", html: "Math_Study is built on spaced repetition (FSRS-5), retrieval practice, interleaving, and successive relearning — targeting the NWEA math RIT 261–280 growth band. See <kbd>README.md</kbd> for the science and citations." })
      ])
    ]));
  }

  APP.ui = { renderHome, go, toast };
})();
