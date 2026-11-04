(function () {
  'use strict';
  const { TOPICS } = window.Engine;
  const $ = (id) => document.getElementById(id);
  const TRACK_URL = '/api/track';
  const IDLE_MS = 60000;      // stop counting time after 60s with no activity
  const HEARTBEAT_MS = 30000; // save progress at least this often while active

  const uid = () => {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  };

  // ---------- session state ----------
  const S = {
    id: uid(), name: '', period: '',
    startedAt: new Date().toISOString(), practiceStartedAt: '',
    activeSeconds: 0, status: 'opened', topics: [], log: [],
    cur: null, lastInteraction: Date.now(), lastSent: 0
  };

  // ---------- tracking ----------
  function payload() {
    return {
      id: S.id, name: S.name, period: S.period,
      startedAt: S.startedAt, practiceStartedAt: S.practiceStartedAt,
      lastActiveAt: new Date().toISOString(),
      activeSeconds: S.activeSeconds, status: S.status,
      topics: S.topics, log: S.log.slice(-400)
    };
  }
  function send(useBeacon) {
    S.lastSent = Date.now();
    const body = JSON.stringify(payload());
    try {
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(TRACK_URL, new Blob([body], { type: 'application/json' }));
      } else {
        fetch(TRACK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
      }
    } catch (e) { /* tracking must never break practice */ }
  }
  let saveTimer = null;
  function markDirty() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => send(false), 800);
  }
  const touch = () => { S.lastInteraction = Date.now(); };
  ['pointerdown', 'keydown', 'input', 'touchstart'].forEach((ev) => document.addEventListener(ev, touch, { passive: true }));

  setInterval(() => {
    const active = document.visibilityState === 'visible' && Date.now() - S.lastInteraction < IDLE_MS;
    if (!active) return;
    S.activeSeconds++;
    if (S.cur && !S.cur.done) S.cur.seconds++;
    if (Date.now() - S.lastSent >= HEARTBEAT_MS) send(false);
  }, 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') send(true); });
  window.addEventListener('pagehide', () => send(true));
  send(false); // records that the page was opened

  // ---------- helpers ----------
  function stats() {
    const by = {};
    TOPICS.forEach((t) => { by[t.id] = { n: 0, first: 0, correct: 0 }; });
    S.log.forEach((e) => { const b = by[e.topic]; if (!b) return; b.n++; if (e.firstTry) b.first++; if (e.correct) b.correct++; });
    return by;
  }
  function show(screen) {
    ['start', 'practice', 'results'].forEach((s) => { $('screen-' + s).hidden = s !== screen; });
    window.scrollTo(0, 0);
  }
  const topicById = (id) => TOPICS.find((t) => t.id === id);
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  function fmtTime(sec) {
    const m = Math.floor(sec / 60), s = sec % 60;
    return m >= 60 ? Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm' : m + ':' + String(s).padStart(2, '0');
  }

  // ---------- start screen ----------
  const list = $('topic-list');
  TOPICS.forEach((t) => {
    const label = document.createElement('label');
    label.className = 'topic';
    label.innerHTML = '<input type="checkbox" value="' + t.id + '" checked><span><b></b><span class="ex"></span><span class="chip std"></span></span>';
    label.querySelector('b').textContent = t.name;
    label.querySelector('.ex').textContent = t.example;
    label.querySelector('.chip').textContent = t.std;
    list.appendChild(label);
  });
  const boxes = () => Array.from(list.querySelectorAll('input[type=checkbox]'));
  $('all-topics').onclick = () => boxes().forEach((b) => { b.checked = true; });
  $('no-topics').onclick = () => boxes().forEach((b) => { b.checked = false; });

  $('start-btn').onclick = () => {
    const name = $('name').value.trim().replace(/\s+/g, ' ');
    const period = $('period').value;
    const picked = boxes().filter((b) => b.checked).map((b) => b.value);
    const err = $('start-error');
    let msg = '';
    if (name.length < 2) msg = 'Enter your first name and last initial.';
    else if (!period) msg = 'Choose your class period.';
    else if (!picked.length) msg = 'Choose at least one topic.';
    err.hidden = !msg; err.textContent = msg;
    if (msg) return;
    S.name = name; S.period = period; S.topics = picked;
    if (!S.practiceStartedAt) S.practiceStartedAt = new Date().toISOString();
    S.status = 'practicing';
    markDirty();
    show('practice');
    newProblem();
  };

  // ---------- practice ----------
  function chooseTopic() {
    const by = stats();
    const weights = S.topics.map((id) => { const b = by[id]; return b.n < 1 ? 1.5 : 1 + 2 * (1 - b.first / b.n); });
    const last = S.log.slice(-2).map((e) => e.topic);
    const repeat = S.topics.length > 1 && last.length === 2 && last[0] === last[1] ? last[0] : null;
    let total = 0;
    const w = weights.map((x, i) => { const v = S.topics[i] === repeat ? 0 : x; total += v; return v; });
    let r = Math.random() * total;
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return S.topics[i]; }
    return S.topics[0];
  }

  const KEYS = ['i', '/', '(', ')', '\u2212', '+', '\u221a', '\u00b2'];
  function buildKeypad() {
    const pad = $('keypad');
    pad.innerHTML = '';
    KEYS.forEach((k) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'key'; b.textContent = k;
      b.setAttribute('aria-label', 'Insert ' + k);
      b.onclick = () => {
        const el = $('answer');
        const s = el.selectionStart == null ? el.value.length : el.selectionStart;
        const e = el.selectionEnd == null ? el.value.length : el.selectionEnd;
        el.value = el.value.slice(0, s) + k + el.value.slice(e);
        el.focus(); el.setSelectionRange(s + k.length, s + k.length);
        touch();
      };
      pad.appendChild(b);
    });
  }
  buildKeypad();

  function setFeedback(kind, text) {
    const f = $('feedback');
    if (!kind) { f.hidden = true; f.textContent = ''; f.className = 'feedback'; return; }
    f.hidden = false; f.className = 'feedback ' + kind; f.textContent = text;
  }

  function newProblem() {
    const id = chooseTopic();
    const topic = topicById(id);
    const prob = topic.gen();
    S.cur = { topic: id, prob, attempts: 0, hint: false, solution: false, done: false, correct: false, seconds: 0 };
    $('problem-heading').textContent = 'Problem ' + (S.log.length + 1);
    $('topic-name').textContent = topic.name;
    $('topic-std').textContent = prob.std;
    $('prompt').textContent = prob.prompt;
    $('expr').innerHTML = prob.html; // built by engine.js from numbers only
    $('expr').setAttribute('aria-label', prob.display);
    $('answer').value = '';
    $('answer').placeholder = 'Type your answer, like 3 \u2212 2i';
    $('answer').disabled = false;
    $('check-btn').disabled = false;
    $('hint-btn').disabled = false;
    $('solution-btn').disabled = false;
    $('hint-box').hidden = true; $('solution-box').hidden = true;
    setFeedback(null);
    renderScore();
    renderProgress($('progress'));
    $('answer').focus();
  }

  function finalize(correct, skipped) {
    const c = S.cur;
    if (!c || c.done) return;
    c.done = true; c.correct = correct;
    S.log.push({
      topic: c.topic, std: c.prob.std, correct,
      firstTry: correct && c.attempts === 1,
      attempts: c.attempts, hint: c.hint, solution: c.solution, skipped: !!skipped,
      seconds: c.seconds, at: Date.now()
    });
    markDirty();
    renderScore();
    renderProgress($('progress'));
  }

  $('answer-form').onsubmit = (e) => {
    e.preventDefault();
    const c = S.cur;
    if (!c || c.done) return;
    const res = c.prob.check($('answer').value);
    if (res.status === 'invalid') { setFeedback('warn', res.msg); return; }
    c.attempts++;
    if (res.status === 'correct') {
      finalize(true);
      setFeedback('ok', '\u2713 Correct!' + (c.attempts === 1 ? ' First try.' : ''));
      $('answer').disabled = true; $('check-btn').disabled = true; $('hint-btn').disabled = true;
      $('next-btn').focus();
    } else if (res.status === 'partial') {
      setFeedback('partial', '\u2022 Almost. ' + res.msg);
    } else {
      setFeedback('bad', '\u2717 ' + res.msg);
    }
    markDirty();
  };

  $('hint-btn').onclick = () => {
    const c = S.cur; if (!c) return;
    c.hint = true;
    const h = $('hint-box');
    h.hidden = false; h.textContent = 'Hint: ' + c.prob.hint;
  };

  $('solution-btn').onclick = () => {
    const c = S.cur; if (!c) return;
    c.solution = true;
    const box = $('solution-box');
    box.hidden = false; box.innerHTML = '';
    const h = document.createElement('strong'); h.textContent = 'Worked solution';
    const ol = document.createElement('ol');
    c.prob.steps.forEach((s) => { const li = document.createElement('li'); li.textContent = s; ol.appendChild(li); });
    const fin = document.createElement('div'); fin.className = 'final'; fin.textContent = 'Answer: ' + c.prob.answerText;
    box.append(h, ol, fin);
    if (!c.done) {
      finalize(false);
      setFeedback('warn', 'Solution shown. This one counts as missed. Study the steps, then try the next problem.');
      $('answer').disabled = true; $('check-btn').disabled = true;
    }
    markDirty();
  };

  $('next-btn').onclick = () => {
    if (S.cur && !S.cur.done) finalize(false, true);
    newProblem();
  };

  function renderScore() {
    const n = S.log.length, first = S.log.filter((e) => e.firstTry).length;
    $('score').textContent = 'Score: ' + first + ' / ' + n;
  }

  function renderProgress(target, ids) {
    const by = stats();
    target.innerHTML = '';
    (ids || S.topics).forEach((id) => {
      const t = topicById(id), b = by[id];
      const row = document.createElement('div'); row.className = 'prow';
      const name = document.createElement('div'); name.className = 'name';
      const l = document.createElement('span'); l.textContent = t.name;
      const r = document.createElement('span');
      r.textContent = b.n ? b.first + ' of ' + b.n + ' (' + pct(b.first, b.n) + '%)' : 'Not started';
      name.append(l, r);
      const bar = document.createElement('div'); bar.className = 'bar';
      const fill = document.createElement('span');
      const p = pct(b.first, b.n);
      fill.style.width = (b.n ? Math.max(p, 3) : 0) + '%';
      if (b.n >= 2) fill.className = p >= 85 ? 'good' : p < 60 ? 'low' : '';
      bar.appendChild(fill);
      row.append(name, bar);
      target.appendChild(row);
    });
  }

  // ---------- results ----------
  $('finish-btn').onclick = () => {
    if (S.cur && !S.cur.done && S.cur.attempts > 0) finalize(false, true);
    S.status = 'finished';
    markDirty();
    const n = S.log.length, first = S.log.filter((e) => e.firstTry).length, ok = S.log.filter((e) => e.correct).length;
    $('results-name').textContent = S.name;
    const sum = $('results-summary');
    sum.innerHTML = '';
    [[n, 'Problems'], [pct(first, n) + '%', 'Correct on first try'], [pct(ok, n) + '%', 'Eventually correct'], [fmtTime(S.activeSeconds), 'Practice time']].forEach(([v, l]) => {
      const d = document.createElement('div'); d.className = 'stat';
      const a = document.createElement('div'); a.className = 'n'; a.textContent = v;
      const b = document.createElement('div'); b.className = 'l'; b.textContent = l;
      d.append(a, b); sum.appendChild(d);
    });
    renderProgress($('results-topics'), TOPICS.map((t) => t.id).filter((id) => S.log.some((e) => e.topic === id)));
    if (!S.log.length) $('results-topics').textContent = 'You have not finished any problems yet.';
    show('results');
  };
  $('keep-btn').onclick = () => { S.status = 'practicing'; markDirty(); show('practice'); newProblem(); };
  $('change-btn').onclick = () => { S.status = 'practicing'; markDirty(); show('start'); };
})();
