# Math_Study — a research-backed NWEA math trainer

A private web app built for **one job: raise your NWEA MAP Growth *math* RIT** (starting point: **264**). It is not a generic quiz app — every design decision is grounded in cognitive-science evidence and aimed at the specific math skills that move a RIT in the **261–280** range.

> **🌐 Live site:** once this repo is published to GitHub Pages, it's playable at `https://<your-username>.github.io/<repo-name>/` — open that link in **any browser, phone or computer**, and your progress saves in that browser. (See [Put it online](#put-it-online-github-pages) below.) The `.bat` launchers are only for running it **locally on Windows** and don't apply to the live site.

---

## How to use it

1. **Double-click `Start Math_Study.bat`** (or just open `index.html` in any browser). It runs fully offline — no internet, no install, no account.
2. Press **“Start today's session.”** Answer each problem, read the worked solution, hit **Next**.
3. **Do it every day.** A session is ~15–25 minutes. Consistency is the whole game.

Your progress is saved automatically in your browser (locally — nothing leaves your computer). Use **Settings → Export** to back it up.

> ⚠️ **Pick one launcher and stick with it.** `Start Math_Study.bat` (opens the file directly) and `serve.bat` (runs a local server) keep *separate* saved progress because the browser treats them as different sites. Use the same one each day. If the plain launcher ever fails to remember your progress, switch to `serve.bat` permanently.

### The 30-day plan
- **Week 1–2:** the app introduces the 91 skills, **front-loading the high-yield 261–270 growth band** (with a few easier warm-ups). Expect several new skills a day; lower "New skills per day" in Settings if it feels like a lot.
- **Days 7–30:** mostly *spaced reviews* — the scheduler resurfaces each skill right as you're about to forget it, plus any skills you missed. This is where durable learning happens.
- **Don't skip days.** The schedule assumes daily contact; a missed day pushes reviews into a pile-up.
- Aim to study a little **before sleep** — your brain consolidates the day's practice overnight.

---

## What's inside

- **91 skill generators** across the 5 NWEA/CCSS math strands, each producing a **fresh problem every time** (you learn the principle, never a memorized answer) — including NWEA-style **word/application problems**.
- **Adaptive difficulty** — every problem self-scales (easy/medium/hard) to sit right at *your* edge for that skill, where growth happens.
- **Misconception-targeted feedback** — when you miss, it names the *specific* mistake (sign error, used area vs. circumference, forgot to flip the inequality…), not just "wrong."
- **Worked solutions + meaning-anchored mnemonics** on every problem.
- **A Reference tab** of formulas and mnemonics (with the common *traps* flagged).
- **A Progress tab**: an estimated-RIT trend line, per-domain mastery, a practice calendar, a **slip-vs-gap error analysis**, and **Focus Areas** that surface (and drill) your weakest skills.
- **A "Quick skill check"** — an optional ~5-minute diagnostic that finds which skills to drill.
- **Settings**: tune new-skills-per-day, session length, target retention, and your baseline RIT; export/import/reset your data.

### Content focus (where the RIT points are)
Concentrated on the **RIT 261–270 growth band**, with **271–280** stretch skills:
quadratics & factoring · the quadratic formula, discriminant & completing the square · systems (elimination & substitution) · inequalities (compound & absolute-value) · exponents, radicals & rational exponents · function transformations, composition & piecewise · sequences & rate of change · exponential growth, decay & half-life · word/application problems (mixtures, projectiles, interest) · right-triangle trig (SOH-CAH-TOA) & special triangles · circles (arc, sector, inscribed angles, equations, power of a point) · similar figures & solids · surface area & composite volume · conditional probability, two-way tables & expected value · standard deviation, box plots & lines of best fit · and stretch topics: complex numbers, logarithms, law of sines/cosines, the unit circle, z-scores. Everything is tagged to its **CCSS / California** standard.

---

## The science (and why each feature exists)

| Feature in the app | Evidence it's based on |
|---|---|
| **Spaced repetition** (FSRS-5 scheduler, per *skill*) | The spacing effect — distributed practice beats massing; optimal gaps expand with the retention horizon. *Cepeda et al. 2006, 2008.* FSRS is the modern Anki default. |
| **You must produce an answer before seeing it** | The testing effect / retrieval practice — retrieving beats re-reading (≈80% vs 36% recall at one week). *Roediger & Karpicke 2006; Karpicke & Blunt 2011.* |
| **Interleaved, mixed-domain sessions** | Interleaving math problem types ≈ doubles later test scores vs. blocking, because it trains *choosing* the right method. *Rohrer & Taylor 2007; Rohrer et al. 2020 (d ≈ 0.83).* |
| **Wrong answers are re-queued the same session until correct** | Successive relearning — recall-to-criterion + spacing ≈ a full letter grade on exams. *Rawson & Dunlosky 2013.* |
| **Practice at the edge — adaptive per-skill difficulty + "tougher one" prompts** | Desirable difficulties — practice calibrated just past current ability builds stronger, more transferable memory. *Bjork & Bjork 2011.* |
| **Misconception-targeted feedback (names the *specific* error)** | Learning from a specifically-identified error beats a generic "wrong"; confidently-held errors are corrected best (hypercorrection). *Metcalfe 2017; Booth et al.* |
| **Worked example → try one (faded guidance)** | Worked-example effect + expertise reversal — show structure, then fade it as you improve. *Sweller & Cooper 1985; Kalyuga 2007.* |
| **Occasional "why does this work?" prompts** | Self-explanation effect (g ≈ 0.55), strongest when *you* generate the explanation. *Chi et al. 1994; Bisra et al. 2018.* |
| **Slip-vs-gap error analysis; "verify your work" on hard items** | Careless **slips** (knew it, missed it) need a checking habit; concept **gaps** need re-teaching — different fixes. High achievers slip *more*. *VanLehn; Baker et al.* |
| **Meaning-anchored mnemonics (SOH-CAH-TOA, quadratic-formula song…)** | Mnemonics help for fixed facts/procedures — but only when tied to the underlying meaning. Traps (PEMDAS left-to-right, etc.) are surfaced. |
| **Estimated-RIT proxy via a Rasch model** | The same item-response-theory family NWEA uses. Honest: it's a *proxy*, not your real score. |

### Honest expectations about your RIT
A real NWEA math RIT has a standard error of about **±3 points**, and at the high-school level a *full year* of normal growth is only a few RIT points. So a one-month change of a few points is **within measurement noise** — and you start at 264 (~88th–93rd percentile for a high schooler), where the scale compresses. **Don't chase the number.** The honest signal that you're improving is the **mastery** stats: more skills surviving long review intervals, higher accuracy on the 261–280 band, and fewer careless slips. Do that, and the score takes care of itself.

NWEA's own position: you can't "cram" for MAP because it measures broad achievement built over time — durable, daily skill-building is exactly the right approach, and the right one this app is built around.

---

## Privacy & data
Everything is stored **locally in your browser** (`localStorage`). The app makes **no network calls and has no tracking** — your practice data never leaves your browser, whether you run it locally or from the hosted page. Back up or transfer with **Settings → Export / Import**.

## For the curious (developer notes)
- Pure HTML/CSS/JS, zero dependencies. Files: `index.html`, `styles.css`, `js/{util,fsrs,ability,skills,store,engine,ui,app}.js`.
- `js/fsrs.js` — FSRS-5 scheduler. `js/ability.js` — Rasch ability/RIT estimator. `js/skills.js` — the 91 parametric problem generators (difficulty-aware, misconception-tagged) + teaching content + reference cards.
- Run the self-tests (verifies every generator's answers, the scheduler, and the estimator):
  ```
  node tools/test.js
  ```

## Put it online (GitHub Pages)
A static site — no build step, no server, no secrets. To host it so you can practice from any device:
1. Create a new GitHub repo and push these files to it. **`index.html` must be at the repo root.**
2. On GitHub: **Settings → Pages → Build and deployment → Source: “Deploy from a branch” → Branch: `main` / `(root)` → Save.**
3. Wait ~1 minute, then open `https://<your-username>.github.io/<repo-name>/` and bookmark it.

Notes:
- Progress is saved per-browser via `localStorage`, so use the **same browser/device** to keep your streak — or move it with **Settings → Export / Import**.
- The `.bat` launchers and `serve.bat` are for local Windows use and are harmless on the live site (they just don't do anything there).

*Built to be used, not admired. Open it tomorrow.*
