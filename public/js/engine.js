/* Complex Numbers Review engine: problem generators + answer checker.
   Works in the browser (window.Engine) and in Node (globalThis.Engine) for testing. */
(function (root) {
  'use strict';

  const MINUS = '\u2212';
  const STD = 'MA.912.NSO.2.1';
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; };
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const nz = (a, b) => { let v; do { v = rnd(a, b); } while (v === 0); return v; };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const chance = (p) => Math.random() < p;
  const sgnPick = () => (chance(0.5) ? 1 : -1);

  class ParseError extends Error {}

  // ---------- formatting ----------
  const fmtNum = (n) => (n < 0 ? MINUS + Math.abs(n) : String(n));
  const fmtFrac = (n, d) => {
    const g = gcd(n, d) || 1; n /= g; d /= g;
    if (d < 0) { n = -n; d = -d; }
    return d === 1 ? fmtNum(n) : fmtNum(n) + '/' + d;
  };
  // imaginary part as a standalone term, e.g. 3i, −i, 4/5 i
  function imTerm(n, d, first) {
    const g = gcd(n, d) || 1; n /= g; d /= g;
    if (d < 0) { n = -n; d = -d; }
    const a = Math.abs(n);
    const body = d === 1 ? (a === 1 ? 'i' : a + 'i') : a + '/' + d + ' i';
    if (first) return (n < 0 ? MINUS : '') + body;
    return (n < 0 ? ' ' + MINUS + ' ' : ' + ') + body;
  }
  // standard form a + bi from rational parts (reN/reD) + (imN/imD)i
  function fmtCx(reN, imN, reD = 1, imD = 1) {
    if (imN === 0) return fmtFrac(reN, reD);
    if (reN === 0) return imTerm(imN, imD, true);
    return fmtFrac(reN, reD) + imTerm(imN, imD, false);
  }
  const bin = (a, b) => fmtCx(a, b);              // integer complex in a + bi form
  const par = (s) => '(' + s + ')';
  const coefI = (k) => (k === 1 ? 'i' : k === -1 ? MINUS + 'i' : fmtNum(k) + 'i');
  const coefIH = (k, n) => coefI(k) + '<sup>' + n + '</sup>';
  const coefIT = (k, n) => coefI(k) + '^' + n;
  const fracH = (num, den) => '<span class="frac"><span class="fn">' + num + '</span><span class="fd">' + den + '</span></span>';
  const radNeg = (p) => '\u221a' + MINUS + p;

  // ---------- answer parser (single complex value) ----------
  function normalize(s) {
    return String(s).toLowerCase()
      .replace(/[\u2212\u2013\u2014]/g, '-')
      .replace(/[\u00d7\u00b7\u2022]/g, '*')
      .replace(/\u00b2/g, '^2').replace(/\u00b3/g, '^3').replace(/\u2074/g, '^4')
      .replace(/\u221a/g, 'sqrt')
      .replace(/\s+/g, '');
  }
  const C = (re, im = 0) => ({ re, im });
  const cadd = (a, b) => C(a.re + b.re, a.im + b.im);
  const csub = (a, b) => C(a.re - b.re, a.im - b.im);
  const cmul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
  const cdiv = (a, b) => { const d = b.re * b.re + b.im * b.im; return C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
  const tiny = (x) => Math.abs(x) < 1e-9;
  const isInt = (x) => Math.abs(x - Math.round(x)) < 1e-9;

  function parseComplex(raw) {
    let s = normalize(raw);
    s = s.replace(/^[a-z]?=/, ''); // allow "x = ..." / "= ..."
    if (!s) throw new ParseError('Type your answer first.');
    if (/[,;]/.test(s)) throw new ParseError('Enter one answer in a + bi form.');
    if (s.includes('=')) throw new ParseError('Enter just the simplified answer (no equals sign).');
    const toks = [];
    let i = 0;
    const flags = { power: false, iDen: false, negRad: false, unexpanded: false, combine: false, unreduced: false, decimal: false };
    while (i < s.length) {
      const ch = s[i];
      if (/[0-9.]/.test(ch)) {
        let j = i;
        while (j < s.length && /[0-9.]/.test(s[j])) j++;
        const txt = s.slice(i, j), v = parseFloat(txt);
        if (isNaN(v) || (txt.match(/\./g) || []).length > 1) throw new ParseError('I could not read the number "' + txt + '".');
        if (txt.includes('.')) flags.decimal = true;
        toks.push({ t: 'num', v }); i = j;
      } else if (s.startsWith('sqrt', i)) { toks.push({ t: 'sqrt' }); i += 4; }
      else if (ch === 'i') { toks.push({ t: 'i' }); i++; }
      else if ('+-*/^()'.includes(ch)) { toks.push({ t: ch }); i++; }
      else if (ch === 'x' || ch === 'j') throw new ParseError('Use the letter i for the imaginary unit.');
      else throw new ParseError('I do not understand "' + ch + '". Use numbers, i, + \u2212, / and parentheses.');
    }
    let p = 0;
    const peek = () => (toks[p] ? toks[p].t : null);

    // node: { v: complex, sumGroup: bool }
    function expr(top) {
      const terms = [];
      let first = term();
      terms.push(first.v);
      let v = first.v;
      let count = 1;
      while (peek() === '+' || peek() === '-') {
        const op = toks[p++].t;
        const r = term();
        const rv = op === '-' ? C(-r.v.re, -r.v.im) : r.v;
        terms.push(rv);
        v = cadd(v, rv);
        count++;
      }
      if (top) {
        const nonzero = terms.filter((t) => !tiny(t.re) || !tiny(t.im));
        const realOnly = nonzero.filter((t) => tiny(t.im)).length;
        const imOnly = nonzero.filter((t) => tiny(t.re)).length;
        const mixed = nonzero.length - realOnly - imOnly;
        if (realOnly > 1 || imOnly > 1 || (mixed > 0 && nonzero.length > 1)) flags.combine = true;
      }
      return { v, sum: count > 1 };
    }
    function term() {
      let node = unary();
      for (;;) {
        const t = peek();
        if (t === '*' || t === 'num' || t === 'i' || t === 'sqrt' || t === '(') {
          if (t === '*') p++;
          const r = t === '*' ? unary() : power();
          if (node.group || r.group) flags.unexpanded = true;
          node = { v: cmul(node.v, r.v) };
        } else if (t === '/') {
          p++;
          const d = unary();
          if (tiny(d.v.re) && tiny(d.v.im)) throw new ParseError('You cannot divide by zero.');
          if (!tiny(d.v.im)) flags.iDen = true;
          else if (tiny(d.v.im) && isInt(d.v.re) && Math.abs(d.v.re) > 1 && isInt(node.v.re) && isInt(node.v.im)) {
            if (gcd(gcd(Math.round(node.v.re), Math.round(node.v.im)), Math.round(d.v.re)) > 1) flags.unreduced = true;
          }
          node = { v: cdiv(node.v, d.v) };
        } else break;
      }
      return node;
    }
    function unary() {
      if (peek() === '-') { p++; const u = unary(); return { v: C(-u.v.re, -u.v.im), group: u.group }; }
      if (peek() === '+') { p++; return unary(); }
      return power();
    }
    function power() {
      let base = atom();
      if (peek() === '^') {
        p++;
        let neg = false;
        if (peek() === '-') { p++; neg = true; }
        const e = toks[p++];
        if (!e || e.t !== 'num' || !Number.isInteger(e.v) || e.v > 400) throw new ParseError('Exponents must be whole numbers, like i^2.');
        const n = neg ? -e.v : e.v;
        if (!tiny(base.v.im) && Math.abs(n) >= 2) flags.power = true;
        if (!tiny(base.v.im) && n < 0) flags.iDen = true;
        let r = C(1, 0);
        for (let k = 0; k < Math.abs(n); k++) r = cmul(r, base.v);
        if (n < 0) r = cdiv(C(1, 0), r);
        base = { v: r };
      }
      return base;
    }
    function atom() {
      const t = toks[p++];
      if (!t) throw new ParseError('That answer looks unfinished.');
      if (t.t === 'num') return { v: C(t.v) };
      if (t.t === 'i') return { v: C(0, 1) };
      if (t.t === 'sqrt') {
        let inner;
        if (peek() === '(') {
          p++; inner = expr(false).v;
          if (peek() !== ')') throw new ParseError('Check your parentheses \u2014 one is missing.');
          p++;
        } else {
          let neg = false;
          if (peek() === '-') { p++; neg = true; }
          if (peek() !== 'num') throw new ParseError('Put a number after the square root sign.');
          inner = C((neg ? -1 : 1) * toks[p++].v);
        }
        if (!tiny(inner.im)) throw new ParseError('I can only read square roots of real numbers.');
        if (inner.re < 0) { flags.negRad = true; return { v: C(0, Math.sqrt(-inner.re)) }; }
        return { v: C(Math.sqrt(inner.re)) };
      }
      if (t.t === '(') {
        const e = expr(false);
        if (peek() !== ')') throw new ParseError('Check your parentheses \u2014 one is missing.');
        p++;
        return { v: e.v, group: e.sum };
      }
      throw new ParseError('That answer looks unfinished or has a typo.');
    }
    const out = expr(true);
    if (p < toks.length) throw new ParseError('Check your parentheses or typing \u2014 something does not fit.');
    return { v: out.v, flags };
  }

  const near = (a, b, tol = 1e-7) => Math.hypot(a.re - b.re, a.im - b.im) < tol;

  function checkComplex(input, expected, mistakes, wrongHint) {
    let parsed;
    try { parsed = parseComplex(input); }
    catch (e) { if (e instanceof ParseError) return { status: 'invalid', msg: e.message }; throw e; }
    const u = parsed.v, f = parsed.flags;
    if (near(u, expected)) {
      if (f.negRad) return { status: 'partial', msg: 'Right value, but rewrite the square root of a negative using i (for example, \u221a\u221249 = 7i).' };
      if (f.power) return { status: 'partial', msg: 'Right value, but simplify the power of i. Remember i\u00b2 = \u22121.' };
      if (f.iDen) return { status: 'partial', msg: 'Right value, but there is still an i in the denominator. Write the answer in a + bi form.' };
      if (f.unexpanded) return { status: 'partial', msg: 'Right value, but multiply it out so the answer is in a + bi form.' };
      if (f.combine) return { status: 'partial', msg: 'Right value, but combine like terms: one real part and one imaginary part.' };
      if (f.unreduced) return { status: 'partial', msg: 'Right value, but a fraction can still be reduced.' };
      if (f.decimal) return { status: 'partial', msg: 'Right value, but write it with exact fractions instead of decimals.' };
      return { status: 'correct' };
    }
    for (const m of mistakes || []) if (near(u, m.v)) return { status: 'incorrect', msg: m.msg };
    if (near(u, expected, 0.02)) return { status: 'incorrect', msg: 'Close, but give the exact answer using fractions, not rounded decimals.' };
    if (!tiny(expected.im) && near(u, C(expected.re, -expected.im))) return { status: 'incorrect', msg: 'The real part is right, but the imaginary part has the wrong sign.' };
    if (!(tiny(expected.re) && tiny(expected.im)) && near(u, C(-expected.re, -expected.im))) return { status: 'incorrect', msg: 'Check your signs \u2014 your answer is the opposite of the correct one.' };
    if (!tiny(expected.im) && Math.abs(u.re - expected.re) < 1e-7) return { status: 'incorrect', msg: 'Your real part is right. Check the imaginary part.' };
    if (!tiny(expected.re) && Math.abs(u.im - expected.im) < 1e-7) return { status: 'incorrect', msg: 'Your imaginary part is right. Check the real part.' };
    return { status: 'incorrect', msg: wrongHint || 'Not quite. Check each step, especially every place i\u00b2 appears.' };
  }

  // ---------- generators ----------
  const IPOW = [C(1), C(0, 1), C(-1), C(0, -1)];
  const IPOW_TXT = ['1', 'i', MINUS + '1', MINUS + 'i'];
  const powStep = (n) => {
    const q = Math.floor(n / 4), r = n % 4;
    return n + ' \u00f7 4 = ' + q + ' remainder ' + r + ', so i^' + n + ' = ' + (r === 0 ? '1' : 'i^' + r + ' = ' + IPOW_TXT[r]) + '.';
  };
  const bigN = () => (chance(0.25) ? rnd(100, 250) : rnd(5, 99));

  function make(topic, o) {
    return {
      topic, std: STD, inputKind: 'cx',
      prompt: o.prompt || 'Simplify. Write your answer in a + bi form.',
      display: o.display, html: o.html || o.display,
      answerText: o.answerText, steps: o.steps, hint: o.hint,
      check: (inp) => checkComplex(inp, o.value, o.mistakes, o.wrongHint)
    };
  }

  function genPowersI() {
    const v = Math.random();
    const POW_HINT = 'Divide the exponent by 4. The remainder tells you the answer: 0 \u2192 1, 1 \u2192 i, 2 \u2192 \u22121, 3 \u2192 \u2212i.';
    const wrong = 'Not quite. Divide the exponent by 4 and use the remainder: 0 \u2192 1, 1 \u2192 i, 2 \u2192 \u22121, 3 \u2192 \u2212i.';
    if (v < 0.4) {
      const n = bigN();
      const val = IPOW[n % 4];
      return make('powers-i', {
        prompt: 'Simplify.', display: 'i^' + n, html: 'i<sup>' + n + '</sup>', value: val,
        answerText: IPOW_TXT[n % 4], steps: ['The powers of i repeat every 4: i, \u22121, \u2212i, 1.', powStep(n), 'Answer: ' + IPOW_TXT[n % 4] + '.'],
        hint: POW_HINT, wrongHint: wrong
      });
    }
    if (v < 0.6) {
      const k = nz(-9, 9), n = bigN();
      const kk = Math.abs(k) === 1 ? k * pick([2, 3, 4, 5]) : k;
      const val = C(kk * IPOW[n % 4].re, kk * IPOW[n % 4].im);
      const ans = bin(val.re, val.im);
      return make('powers-i', {
        prompt: 'Simplify.', display: coefIT(kk, n), html: coefIH(kk, n), value: val, answerText: ans,
        steps: [powStep(n), 'Multiply by the coefficient: ' + fmtNum(kk) + ' \u00b7 ' + IPOW_TXT[n % 4] + ' = ' + ans + '.', 'Answer: ' + ans + '.'],
        hint: 'Simplify the power of i first, then multiply by ' + fmtNum(kk) + '.', wrongHint: wrong
      });
    }
    if (v < 0.75) {
      const a = rnd(3, 60), b = rnd(3, 60), n = a + b;
      return make('powers-i', {
        prompt: 'Simplify.', display: 'i^' + a + ' \u00b7 i^' + b, html: 'i<sup>' + a + '</sup> \u00b7 i<sup>' + b + '</sup>',
        value: IPOW[n % 4], answerText: IPOW_TXT[n % 4],
        steps: ['When multiplying powers with the same base, add the exponents: i^' + a + ' \u00b7 i^' + b + ' = i^' + n + '.', powStep(n), 'Answer: ' + IPOW_TXT[n % 4] + '.'],
        hint: 'Add the exponents first, then divide the new exponent by 4.', wrongHint: wrong
      });
    }
    // sum / difference of powers -> complex result
    let a, b, k1, k2, val;
    do {
      a = bigN(); b = bigN();
      k1 = chance(0.5) ? 1 : nz(-6, 6); k2 = nz(-6, 6);
      val = cadd(C(k1 * IPOW[a % 4].re, k1 * IPOW[a % 4].im), C(k2 * IPOW[b % 4].re, k2 * IPOW[b % 4].im));
    } while ((a % 4) % 2 === (b % 4) % 2 && chance(0.7) || (tiny(val.re) && tiny(val.im)));
    const t2 = k2 < 0 ? ' ' + MINUS + ' ' + coefI(-k2) : ' + ' + coefI(k2);
    const display = coefIT(k1, a) + t2 + '^' + b;
    const html = coefIH(k1, a) + t2 + '<sup>' + b + '</sup>';
    const ans = bin(val.re, val.im);
    const p1 = C(k1 * IPOW[a % 4].re, k1 * IPOW[a % 4].im), p2 = C(k2 * IPOW[b % 4].re, k2 * IPOW[b % 4].im);
    return make('powers-i', {
      display, html, value: val, answerText: ans,
      steps: [powStep(a), powStep(b),
        'Substitute: ' + bin(p1.re, p1.im) + ' + ' + par(bin(p2.re, p2.im)) + '.',
        'Combine like terms: ' + ans + '.'],
      hint: 'Simplify each power of i separately, then combine the real parts and the imaginary parts.',
      wrongHint: wrong
    });
  }

  function genAddSub() {
    const v = Math.random();
    let display, value, steps, mistakes = [];
    const n = () => nz(-12, 12);
    if (v < 0.3) {
      const a = n(), b = n(), c = n(), d = n();
      display = par(bin(a, b)) + ' + ' + par(bin(c, d));
      value = C(a + c, b + d);
      steps = ['Combine the real parts: ' + fmtNum(a) + ' + ' + par(fmtNum(c)) + ' = ' + fmtNum(a + c) + '.',
        'Combine the imaginary parts: ' + coefI(b) + ' + ' + par(coefI(d)) + ' = ' + (b + d === 0 ? '0' : coefI(b + d)) + '.'];
    } else if (v < 0.6) {
      const a = n(), b = n(), c = n(), d = n();
      display = par(bin(a, b)) + ' ' + MINUS + ' ' + par(bin(c, d));
      value = C(a - c, b - d);
      steps = ['Distribute the subtraction to both parts: ' + MINUS + par(bin(c, d)) + ' = ' + bin(-c, -d) + '.',
        'Combine the real parts: ' + fmtNum(a) + ' + ' + par(fmtNum(-c)) + ' = ' + fmtNum(a - c) + '.',
        'Combine the imaginary parts: ' + coefI(b) + ' + ' + par(coefI(-d)) + ' = ' + (b - d === 0 ? '0' : coefI(b - d)) + '.'];
      mistakes.push({ v: C(a - c, b + d), msg: 'Subtract both parts. ' + MINUS + par(bin(c, d)) + ' means ' + bin(-c, -d) + '.' });
      mistakes.push({ v: C(a + c, b - d), msg: 'Subtract both parts. ' + MINUS + par(bin(c, d)) + ' means ' + bin(-c, -d) + '.' });
    } else if (v < 0.75) {
      const a = n(), b = n(), c = n(), d = n(), e = n(), f = n();
      display = par(bin(a, b)) + ' ' + MINUS + ' ' + par(bin(c, d)) + ' + ' + par(bin(e, f));
      value = C(a - c + e, b - d + f);
      steps = ['Distribute the subtraction: ' + MINUS + par(bin(c, d)) + ' = ' + bin(-c, -d) + '.',
        'Real parts: ' + fmtNum(a) + ' + ' + par(fmtNum(-c)) + ' + ' + par(fmtNum(e)) + ' = ' + fmtNum(value.re) + '.',
        'Imaginary parts: ' + coefI(b) + ' + ' + par(coefI(-d)) + ' + ' + par(coefI(f)) + ' = ' + (value.im === 0 ? '0' : coefI(value.im)) + '.'];
      mistakes.push({ v: C(a - c + e, b + d + f), msg: 'Subtract both parts of the middle number: ' + MINUS + par(bin(c, d)) + ' = ' + bin(-c, -d) + '.' });
    } else if (v < 0.9) {
      const a = n(), c = n(), k1 = rnd(1, 10), k2 = rnd(1, 10), s1 = sgnPick(), s2 = sgnPick(), sub = chance(0.6);
      const term = (r, s, k) => fmtNum(r) + (s > 0 ? ' + ' : ' ' + MINUS + ' ') + radNeg(k * k);
      display = par(term(a, s1, k1)) + (sub ? ' ' + MINUS + ' ' : ' + ') + par(term(c, s2, k2));
      const z1 = C(a, s1 * k1), z2 = C(c, s2 * k2);
      value = sub ? csub(z1, z2) : cadd(z1, z2);
      steps = ['Rewrite each square root using i: ' + radNeg(k1 * k1) + ' = ' + coefI(k1) + ' and ' + radNeg(k2 * k2) + ' = ' + coefI(k2) + '.',
        'Now the problem is ' + par(bin(z1.re, z1.im)) + (sub ? ' ' + MINUS + ' ' : ' + ') + par(bin(z2.re, z2.im)) + '.'];
      if (sub) steps.push('Distribute the subtraction: ' + MINUS + par(bin(z2.re, z2.im)) + ' = ' + bin(-z2.re, -z2.im) + '.');
      steps.push('Combine real parts and imaginary parts.');
      if (sub) mistakes.push({ v: C(z1.re - z2.re, z1.im + z2.im), msg: 'Subtract both parts: ' + MINUS + par(bin(z2.re, z2.im)) + ' = ' + bin(-z2.re, -z2.im) + '.' });
    } else {
      const a = n(), c = n(), d = n();
      if (chance(0.5)) {
        display = fmtNum(a) + ' ' + MINUS + ' ' + par(bin(c, d));
        value = C(a - c, -d);
        steps = ['Distribute the subtraction: ' + MINUS + par(bin(c, d)) + ' = ' + bin(-c, -d) + '.',
          'Combine the real parts: ' + fmtNum(a) + ' + ' + par(fmtNum(-c)) + ' = ' + fmtNum(a - c) + '.',
          'The only imaginary part is ' + coefI(-d) + '.'];
        mistakes.push({ v: C(a - c, d), msg: 'Subtract both parts: ' + MINUS + par(bin(c, d)) + ' = ' + bin(-c, -d) + '.' });
      } else {
        const b = n();
        display = par(bin(c, d)) + ' ' + MINUS + ' ' + coefI(b).replace(/^\u2212/, '(' + MINUS) + (b < 0 ? ')' : '');
        value = C(c, d - b);
        steps = ['Subtract the imaginary parts: ' + coefI(d) + ' ' + MINUS + ' ' + par(coefI(b)) + ' = ' + (d - b === 0 ? '0' : coefI(d - b)) + '.',
          'The real part ' + fmtNum(c) + ' stays the same.'];
      }
    }
    const ans = bin(value.re, value.im);
    steps.push('Answer: ' + ans + '.');
    return make('add-sub', {
      display, value, answerText: ans, steps, mistakes,
      hint: 'Treat i like a variable: combine real parts with real parts and imaginary parts with imaginary parts. When subtracting, distribute the negative to both parts.'
    });
  }

  const RAD_PAIRS = [[4, 9], [4, 25], [9, 16], [1, 36], [3, 12], [2, 8], [5, 20], [2, 18], [6, 6], [7, 7], [3, 27], [2, 32], [5, 5], [10, 10], [8, 18]];
  function genMultiply() {
    const v = Math.random();
    let display, value, steps, mistakes = [];
    const I2 = 'Replace i\u00b2 with \u22121: ';
    if (v < 0.25) {
      // monomial x binomial: ki(c + di)  or  (ki)(mi)
      const k = nz(-8, 8);
      if (chance(0.2)) {
        const m = nz(-9, 9);
        display = par(coefI(k)) + par(coefI(m));
        value = C(-k * m, 0);
        steps = ['Multiply the coefficients and the i\u2019s: ' + fmtNum(k * m) + 'i\u00b2.', I2 + fmtNum(k * m) + '(\u22121) = ' + fmtNum(-k * m) + '.'];
        mistakes.push({ v: C(k * m, 0), msg: 'i \u00b7 i = i\u00b2 = \u22121, so the sign changes.' });
      } else {
        const c = nz(-9, 9), d = nz(-9, 9);
        display = coefI(k) + par(bin(c, d));
        value = C(-k * d, k * c);
        steps = ['Distribute ' + coefI(k) + ' to both terms: ' + coefI(k) + ' \u00b7 ' + fmtNum(c) + ' = ' + coefI(k * c) + ' and ' + coefI(k) + ' \u00b7 ' + coefI(d) + ' = ' + fmtNum(k * d) + 'i\u00b2.',
          I2 + fmtNum(k * d) + 'i\u00b2 = ' + fmtNum(-k * d) + '.',
          'Write in a + bi form (real part first).'];
        mistakes.push({ v: C(k * d, k * c), msg: 'Remember i\u00b2 = \u22121, not 1. The real part should be ' + fmtNum(-k * d) + '.' });
      }
    } else if (v < 0.6) {
      const a = nz(-9, 9), b = nz(-9, 9), c = nz(-9, 9), d = nz(-9, 9);
      display = par(bin(a, b)) + par(bin(c, d));
      value = C(a * c - b * d, a * d + b * c);
      steps = ['FOIL. First: ' + fmtNum(a) + ' \u00b7 ' + fmtNum(c) + ' = ' + fmtNum(a * c) + '.',
        'Outer: ' + fmtNum(a) + ' \u00b7 ' + coefI(d) + ' = ' + coefI(a * d) + '.  Inner: ' + coefI(b) + ' \u00b7 ' + fmtNum(c) + ' = ' + coefI(b * c) + '.',
        'Last: ' + coefI(b) + ' \u00b7 ' + coefI(d) + ' = ' + fmtNum(b * d) + 'i\u00b2 = ' + fmtNum(-b * d) + '.',
        'Combine: real ' + fmtNum(a * c) + ' + ' + par(fmtNum(-b * d)) + ' = ' + fmtNum(value.re) + ', imaginary ' + coefI(a * d) + ' + ' + par(coefI(b * c)) + ' = ' + (value.im ? coefI(value.im) : '0') + '.'];
      mistakes.push({ v: C(a * c + b * d, a * d + b * c), msg: 'Check the Last term: ' + coefI(b) + ' \u00b7 ' + coefI(d) + ' = ' + fmtNum(b * d) + 'i\u00b2, and i\u00b2 = \u22121.' });
      if (a * d + b * c !== 0) mistakes.push({ v: C(a * c - b * d, 0), msg: 'You are missing the Outer and Inner products. FOIL gives four products.' });
    } else if (v < 0.72) {
      const a = nz(-9, 9), b = nz(1, 9), s = sgnPick();
      display = par(bin(a, s * b)) + par(bin(a, -s * b));
      value = C(a * a + b * b, 0);
      steps = ['These are conjugates, so the middle terms cancel: ' + par(bin(a, s * b)) + par(bin(a, -s * b)) + ' = ' + fmtNum(a) + '\u00b2 ' + MINUS + ' ' + par(coefI(b)) + '\u00b2.',
        par(coefI(b)) + '\u00b2 = ' + (b * b) + 'i\u00b2 = ' + MINUS + (b * b) + '.',
        fmtNum(a * a) + ' ' + MINUS + ' ' + par(MINUS + (b * b)) + ' = ' + (a * a + b * b) + '.'];
      if (a * a !== b * b) mistakes.push({ v: C(a * a - b * b, 0), msg: 'The last product is ' + MINUS + (b * b) + 'i\u00b2 = +' + (b * b) + ', because i\u00b2 = \u22121.' });
    } else if (v < 0.86) {
      const a = nz(-9, 9), b = nz(-8, 8);
      display = par(bin(a, b)) + '^2';
      value = C(a * a - b * b, 2 * a * b);
      steps = ['Write it as a product: ' + par(bin(a, b)) + par(bin(a, b)) + '.',
        'FOIL: ' + fmtNum(a * a) + ' + ' + coefI(a * b) + ' + ' + coefI(a * b) + ' + ' + (b * b) + 'i\u00b2.',
        I2 + (b * b) + 'i\u00b2 = ' + MINUS + (b * b) + '.',
        'Combine: ' + fmtNum(a * a) + ' ' + MINUS + ' ' + (b * b) + ' = ' + fmtNum(a * a - b * b) + ' and ' + coefI(2 * a * b) + '.'];
      mistakes.push({ v: C(a * a - b * b, 0), msg: 'Squaring a binomial does not just square each term. Write it as ' + par(bin(a, b)) + par(bin(a, b)) + ' and FOIL.' });
      mistakes.push({ v: C(a * a + b * b, 0), msg: 'Write it as ' + par(bin(a, b)) + par(bin(a, b)) + ' and FOIL \u2014 there is a middle term, and i\u00b2 = \u22121.' });
      mistakes.push({ v: C(a * a + b * b, 2 * a * b), msg: 'Check the last term: ' + par(coefI(b)) + '\u00b2 = ' + (b * b) + 'i\u00b2 = ' + MINUS + (b * b) + '.' });
    } else {
      const [p, q] = pick(RAD_PAIRS);
      const r = Math.round(Math.sqrt(p * q));
      const k1 = chance(0.35) ? nz(-5, 5) : 1, k2 = chance(0.35) ? rnd(2, 5) : 1;
      const lead = (k) => (k === 1 ? '' : k === -1 ? MINUS : fmtNum(k));
      display = lead(k1) + radNeg(p) + ' \u00b7 ' + lead(k2) + radNeg(q);
      value = C(-k1 * k2 * r, 0);
      const ip = (x) => { const s = Math.sqrt(x); return Number.isInteger(s) ? coefI(s) : 'i\u221a' + x; };
      steps = ['Rewrite each square root with i first: ' + radNeg(p) + ' = ' + ip(p) + ' and ' + radNeg(q) + ' = ' + ip(q) + '.',
        'Multiply: ' + (k1 * k2 === 1 ? '' : fmtNum(k1 * k2) + ' \u00b7 ') + 'i\u00b2 \u00b7 \u221a' + (p * q) + ' = ' + (k1 * k2 === 1 ? '' : fmtNum(k1 * k2) + ' \u00b7 ') + '(\u22121) \u00b7 ' + r + '.',
        'Result: ' + fmtNum(-k1 * k2 * r) + '.'];
      mistakes.push({ v: C(k1 * k2 * r, 0), msg: 'Careful: \u221a(\u2212a) \u00b7 \u221a(\u2212b) is not \u221a(ab). Write each as i\u221a first; i \u00b7 i = \u22121 makes the result negative.' });
    }
    const ans = bin(value.re, value.im);
    steps.push('Answer: ' + ans + '.');
    return make('multiply', {
      display, html: display.replace(/\^2$/, '<sup>2</sup>'), value, answerText: ans, steps, mistakes,
      hint: 'Distribute or FOIL like you would with variables, then replace every i\u00b2 with \u22121 and combine like terms.'
    });
  }

  // a + bi divided by complex z (integers), returns rational parts and formatted answer
  function divParts(a, b, c, d) {
    const D = c * c + d * d;
    const reN = a * c + b * d, imN = b * c - a * d;
    return { D, reN, imN, value: C(reN / D, imN / D), ans: fmtCx(reN, imN, D, D) };
  }

  function genDivMono() {
    const v = Math.random();
    let num, den, display, html, value, ans, steps, mistakes = [];
    if (v < 0.6) {
      // (a + bi) / (ki)
      const k = pick([1, 2, 3, 4, 5, 6, -1, -2, -3, -4, -5]);
      let a, b;
      if (chance(0.5) && Math.abs(k) > 1) { a = nz(-6, 6) * k; b = nz(-6, 6) * k; } else { a = nz(-12, 12); b = nz(-12, 12); }
      num = bin(a, b); den = coefI(k);
      const pr = divParts(a, b, 0, k);
      value = pr.value; ans = pr.ans;
      steps = ['Multiply the numerator and denominator by i to clear i from the denominator.',
        'Numerator: ' + par(num) + ' \u00b7 i = ' + coefI(a) + ' + ' + par(fmtNum(b) + 'i\u00b2') + ' = ' + bin(-b, a) + '.',
        'Denominator: ' + coefI(k) + ' \u00b7 i = ' + fmtNum(k) + 'i\u00b2 = ' + fmtNum(-k) + '.',
        'Divide each part by ' + fmtNum(-k) + ': ' + fmtFrac(-b, -k) + ' and ' + imTerm(a, -k, true) + '.'];
      mistakes.push({ v: C(-b / k, a / k), msg: 'Check the denominator: ' + coefI(k) + ' \u00b7 i = ' + fmtNum(k) + 'i\u00b2 = ' + fmtNum(-k) + ', which is negative.' });
    } else if (v < 0.85) {
      // m / (ki)
      const k = pick([2, 3, 4, 5, 6, 7, 8, -2, -3, -4, -5]), m = chance(0.5) ? nz(-6, 6) * k : nz(-15, 15);
      num = fmtNum(m); den = coefI(k);
      const pr = divParts(m, 0, 0, k);
      value = pr.value; ans = pr.ans;
      steps = ['Multiply the numerator and denominator by i.',
        'Numerator: ' + fmtNum(m) + ' \u00b7 i = ' + coefI(m) + '.',
        'Denominator: ' + coefI(k) + ' \u00b7 i = ' + fmtNum(k) + 'i\u00b2 = ' + fmtNum(-k) + '.',
        'Simplify: ' + coefI(m) + ' \u00f7 ' + par(fmtNum(-k)) + ' = ' + ans + '.'];
      mistakes.push({ v: C(0, m / k), msg: 'Check the sign: ' + coefI(k) + ' \u00b7 i = ' + fmtNum(-k) + ', not ' + fmtNum(k) + '.' });
    } else {
      // (a + bi) / k, real monomial
      const k = pick([2, 3, 4, 5, 6, -2, -3, -4]);
      let a, b;
      do { a = nz(-20, 20); b = nz(-20, 20); } while (a % k !== 0 && b % k !== 0 && chance(0.5));
      num = bin(a, b); den = fmtNum(k);
      const pr = divParts(a, b, k, 0);
      value = pr.value; ans = pr.ans;
      steps = ['The denominator is a real number, so divide each part of the numerator by ' + fmtNum(k) + '.',
        'Real part: ' + fmtFrac(a, k) + '. Imaginary part: ' + imTerm(b, k, true) + '.'];
    }
    display = par(num) + ' / ' + par(den);
    html = fracH(num, den);
    steps.push('Answer: ' + ans + '.');
    return make('div-mono', {
      display, html, value, answerText: ans, steps, mistakes,
      hint: 'Multiply the top and bottom by i. The bottom becomes a real number because i\u00b2 = \u22121. Then split into a + bi form and reduce.'
    });
  }

  function genDivBinom() {
    let c, d;
    do { c = nz(-6, 6); d = nz(-5, 5); } while (c * c + d * d > 50);
    const v = Math.random();
    let a, b;
    if (v < 0.4) {
      let p, q;
      do { p = rnd(-6, 6); q = rnd(-6, 6); a = p * c - q * d; b = p * d + q * c; } while ((p === 0 && q === 0) || Math.abs(a) > 40 || Math.abs(b) > 40 || (a === 0 && b === 0));
    } else if (v < 0.75) { a = nz(-10, 10); b = nz(-10, 10); }
    else if (v < 0.9) { a = nz(-15, 15); b = 0; }
    else { a = 0; b = nz(-15, 15); }
    const num = bin(a, b), den = bin(c, d), conj = bin(c, -d);
    const pr = divParts(a, b, c, d);
    const D = pr.D;
    const steps = ['Multiply the numerator and denominator by the conjugate of the denominator, ' + conj + '.'];
    if (a !== 0 && b !== 0) {
      steps.push('Numerator (FOIL): ' + par(num) + par(conj) + ' = ' + fmtNum(a * c) + ' + ' + par(coefI(-a * d)) + ' + ' + par(coefI(b * c)) + ' + ' + par(fmtNum(-b * d) + 'i\u00b2') + '.');
      steps.push('Replace i\u00b2 with \u22121 and combine: ' + bin(pr.reN, pr.imN) + '.');
    } else if (b === 0) {
      steps.push('Numerator: ' + fmtNum(a) + par(conj) + ' = ' + bin(pr.reN, pr.imN) + '.');
    } else {
      steps.push('Numerator: ' + coefI(b) + par(conj) + ' = ' + coefI(b * c) + ' + ' + par(fmtNum(-b * d) + 'i\u00b2') + ' = ' + bin(pr.reN, pr.imN) + '.');
    }
    steps.push('Denominator: ' + par(den) + par(conj) + ' = ' + fmtNum(c) + '\u00b2 ' + MINUS + ' ' + par(coefI(d)) + '\u00b2 = ' + (c * c) + ' + ' + (d * d) + ' = ' + D + '.');
    steps.push('Split into real and imaginary parts: ' + fmtNum(pr.reN) + '/' + D + ' and ' + fmtNum(pr.imN) + '/' + D + ' i, then reduce each fraction.');
    steps.push('Answer: ' + pr.ans + '.');
    const mistakes = [];
    const D2 = c * c - d * d;
    if (D2 !== 0) mistakes.push({ v: C(pr.reN / D2, pr.imN / D2), msg: 'Check the denominator: ' + par(den) + par(conj) + ' = ' + (c * c) + ' + ' + (d * d) + ' = ' + D + ', because ' + MINUS + par(coefI(d)) + '\u00b2 = +' + (d * d) + '.' });
    mistakes.push({ v: C((a * c - b * d) / D, (b * c + a * d) / D), msg: 'Multiply by the conjugate ' + conj + ' (change the sign of the imaginary part), and check your i\u00b2 term.' });
    return make('div-binom', {
      display: par(num) + ' / ' + par(den), html: fracH(num, den), value: pr.value, answerText: pr.ans, steps, mistakes,
      hint: 'Multiply the top and bottom by the conjugate of the denominator. The bottom becomes c\u00b2 + d\u00b2, a real number. Then split into a + bi form and reduce.'
    });
  }

  const TOPICS = [
    { id: 'powers-i', name: 'Simplify powers of i', example: 'i^43, 3i^26, i^14 + i^23', std: STD, gen: genPowersI },
    { id: 'add-sub', name: 'Add and subtract', example: '(4 \u2212 3i) \u2212 (\u22122 + 5i)', std: STD, gen: genAddSub },
    { id: 'multiply', name: 'Multiply', example: '(2 + 3i)(4 \u2212 i), \u221a\u22124 \u00b7 \u221a\u22129', std: STD, gen: genMultiply },
    { id: 'div-mono', name: 'Divide by a monomial', example: '(6 + 4i) / (2i)', std: STD, gen: genDivMono },
    { id: 'div-binom', name: 'Divide by a binomial', example: '(3 + 2i) / (1 \u2212 i)', std: STD, gen: genDivBinom }
  ];

  const api = { TOPICS, STD, checkComplex, parseComplex, ParseError };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
