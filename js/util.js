/* Math_Study — util.js
 * Shared helpers: seedable RNG, math-fact helpers, math->HTML rendering,
 * answer parsing/checking, date helpers. No dependencies. Attaches to window.APP.
 */
(function () {
  "use strict";
  const APP = (window.APP = window.APP || {});

  // ---------- Seedable RNG (mulberry32) ----------
  // A reproducible RNG so a generated problem can be regenerated from its seed
  // (used by the error log to re-show the exact problem the user missed).
  function makeRng(seed) {
    let a = (seed >>> 0) || 1;
    function next() {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      raw: next,
      float: (lo, hi) => lo + (hi - lo) * next(),
      int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()), // inclusive
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      bool: (p) => next() < (p == null ? 0.5 : p),
      sign: () => (next() < 0.5 ? -1 : 1),
      nonzero: (lo, hi) => { let v = 0; do { v = Math.floor(lo + (hi - lo + 1) * next()); } while (v === 0); return v; },
      shuffle: (arr) => {
        const a2 = arr.slice();
        for (let i = a2.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          [a2[i], a2[j]] = [a2[j], a2[i]];
        }
        return a2;
      },
      sample: (arr, k) => {
        const a2 = arr.slice();
        for (let i = a2.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          [a2[i], a2[j]] = [a2[j], a2[i]];
        }
        return a2.slice(0, k);
      }
    };
  }
  function newSeed() { return (Math.floor(Math.random() * 0xFFFFFFFF)) >>> 0; }

  // ---------- Number theory / fractions ----------
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; }
  function simplifyFrac(n, d) {
    if (d < 0) { n = -n; d = -d; }
    const g = gcd(n, d);
    return [n / g, d / g];
  }
  // factor a positive integer into largest square * remainder, for radical simplification
  function simplifyRadical(n) {
    // returns {coef, rad} meaning coef*sqrt(rad)
    if (n < 0) n = -n;
    let coef = 1, rad = n;
    for (let f = 2; f * f <= rad; f++) {
      while (rad % (f * f) === 0) { coef *= f; rad /= (f * f); }
    }
    return { coef, rad };
  }
  function isPerfectSquare(n) { const r = Math.round(Math.sqrt(n)); return r * r === n; }

  // round to n decimals, drop trailing zeros
  function round(x, n) {
    const f = Math.pow(10, n == null ? 2 : n);
    return Math.round((x + Number.EPSILON) * f) / f;
  }

  // ---------- Math -> HTML rendering helpers ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  // signed coefficient term for polynomials, e.g. termFirst(3,'x^2'), termNext(-2,'x')
  function sup(s) { return `<sup>${s}</sup>`; }
  function powHTML(base, exp) {
    if (exp === 1) return `${base}`;
    if (exp === 0) return `1`;
    return `${base}${sup(exp)}`;
  }
  function sqrtHTML(inner) {
    return `<span class="sqrt"><span class="sqrt-sym">&radic;</span><span class="radicand">${inner}</span></span>`;
  }
  function fracHTML(n, d) {
    return `<span class="frac"><span class="num">${n}</span><span class="den">${d}</span></span>`;
  }
  // radical value coef*sqrt(rad) as HTML (handles coef=1, rad=1)
  function radicalHTML(coef, rad) {
    if (rad === 1) return `${coef}`;
    if (coef === 1) return sqrtHTML(rad);
    if (coef === -1) return `-${sqrtHTML(rad)}`;
    return `${coef}${sqrtHTML(rad)}`;
  }

  // Build a polynomial string from terms [{c, v}] where v is variable HTML ('' for constant)
  function poly(terms) {
    let out = "";
    let first = true;
    for (const t of terms) {
      let c = t.c;
      if (c === 0) continue;
      const v = t.v || "";
      let piece;
      const mag = Math.abs(c);
      const coefStr = (mag === 1 && v) ? "" : String(mag);
      if (first) {
        piece = (c < 0 ? "&minus;" : "") + coefStr + v;
        first = false;
      } else {
        piece = (c < 0 ? " &minus; " : " + ") + coefStr + v;
      }
      out += piece;
    }
    return out === "" ? "0" : out;
  }
  // common variable pieces
  const X2 = `x${sup(2)}`;
  function quad(a, b, c) { return poly([{ c: a, v: X2 }, { c: b, v: "x" }, { c: c, v: "" }]); }
  function lin(m, b) { return poly([{ c: m, v: "x" }, { c: b, v: "" }]); }

  // ---------- Answer parsing & checking ----------
  // parse a user numeric answer; supports fractions "a/b", decimals, leading "x=", pi, %
  function parseNum(str) {
    if (str == null) return NaN;
    let s = String(str).trim().toLowerCase();
    if (s === "") return NaN;
    s = s.replace(/^[a-z]\s*=\s*/, "");      // strip leading "x="
    s = s.replace(/\s+/g, "");
    s = s.replace(/π|pi/g, "*" + Math.PI);
    s = s.replace(/%$/, "");                  // trailing percent handled by caller if needed
    s = s.replace(/[−–—]/g, "-");             // unicode minus
    // fraction a/b
    const fm = s.match(/^(-?\d*\.?\d+)\/(-?\d*\.?\d+)$/);
    if (fm) { const n = parseFloat(fm[1]), d = parseFloat(fm[2]); return d === 0 ? NaN : n / d; }
    // simple a*b (for pi substitution)
    const mm = s.match(/^(-?\d*\.?\d+)\*(-?\d*\.?\d+)$/);
    if (mm) return parseFloat(mm[1]) * parseFloat(mm[2]);
    const v = parseFloat(s);
    return isNaN(v) ? NaN : v;
  }
  function approxEq(a, b, tol) {
    if (isNaN(a) || isNaN(b)) return false;
    tol = tol == null ? 0.01 : tol;
    return Math.abs(a - b) <= tol + 1e-9 * Math.max(1, Math.abs(b));
  }
  // parse a list of numbers (comma / space / "and" separated), e.g. quadratic roots
  function parseNumList(str) {
    if (str == null) return [];
    return String(str).toLowerCase()
      .replace(/x\s*=/g, " ").replace(/\band\b/g, ",").replace(/[;]/g, ",")
      .split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
      .map(parseNum).filter(v => !isNaN(v));
  }
  // normalize a typed expression for loose string comparison (remove spaces, lower, unify minus/×)
  function normExpr(str) {
    return String(str || "").toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[−–—]/g, "-")
      .replace(/\*/g, "")
      .replace(/·/g, "")
      .replace(/\^/g, "");
  }

  // ---------- Dates ----------
  const DAY_MS = 86400000;
  function todayKey(d) { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function nowMs() { return Date.now(); }
  function daysBetween(aMs, bMs) { return (bMs - aMs) / DAY_MS; }
  function addDays(ms, days) { return ms + days * DAY_MS; }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  APP.util = {
    makeRng, newSeed, gcd, simplifyFrac, simplifyRadical, isPerfectSquare, round,
    esc, sup, powHTML, sqrtHTML, fracHTML, radicalHTML, poly, quad, lin, X2,
    parseNum, approxEq, parseNumList, normExpr,
    DAY_MS, todayKey, nowMs, daysBetween, addDays, clamp
  };
})();
