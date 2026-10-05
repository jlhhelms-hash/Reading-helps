// Teacher page: log in with the PIN, see each student's letters and videos.

import { ALPHABET } from './letters.js';

const $ = (id) => document.getElementById(id);

function show(screen) {
  document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== `screen-${screen}`; });
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

const gradeLabel = (g) => (!g ? '' : g === 'K' ? 'Kindergarten' : g === 'Pre-K' ? 'Pre-K' : `Grade ${g}`);

const when = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');

async function api(path, options) {
  const res = await fetch(`api/teacher/${path}`, options);
  if (res.status === 401) {
    show('login');
    throw new Error('login');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function loadList() {
  const { students } = await api('students');
  show('list');
  const list = $('student-list');
  if (!students.length) {
    list.replaceChildren(el('p', { class: 'small' }, 'No students yet. Results show up here after a student plays.'));
    return;
  }
  list.replaceChildren(...students.map((s) => el('button', { class: 'student-row', type: 'button', onclick: () => loadStudent(s.id) },
    el('strong', {}, s.last ? `${s.last}, ${s.first}` : s.first),
    el('span', { class: 'meta' }, [s.toReview && `🎧 ${s.toReview} to listen`, `⭐ ${s.stars}`, `🎥 ${s.videoCount}`].filter(Boolean).join(' · ')),
    el('span', {}, s.needsHelp.length ? `Needs help: ${s.needsHelp.join(' ')}` : 'No letters need help'),
    el('span', { class: 'meta' }, [gradeLabel(s.grade), s.lastTestDate && `tested ${s.lastTestDate}`].filter(Boolean).join(' · ')))));
}

async function loadStudent(id) {
  const s = await api(`students/${encodeURIComponent(id)}`);
  show('student');
  $('student-name').textContent = [`${s.first} ${s.last}`, gradeLabel(s.grade), `⭐ ${s.stars}`].filter(Boolean).join(' · ');
  $('student-export').href = `api/teacher/students/${encodeURIComponent(id)}/export.xlsx`;

  $('letter-grid').replaceChildren(...ALPHABET.map((letter) => {
    const stats = s.letters[letter];
    const cls = !stats ? '' : stats.listen ? 'listen' : !stats.lastPassed ? 'help' : stats.everMissed ? 'practiced' : 'good';
    const title = stats
      ? `${letter}: ${stats.tries} tries, name missed ${stats.nameMissed}, sound missed ${stats.soundMissed}`
      : `${letter}: not tried yet`;
    return el('div', { class: `letter-cell ${cls}`, title }, letter);
  }));

  // Answers the app couldn't hear: the teacher watches the video, then marks them.
  $('review-section').hidden = !s.toReview.length;
  $('review-list').replaceChildren(...s.toReview.map((r) => {
    const clip = s.videos.find((v) => v.letter === r.letter && v.recorded >= r.at) || s.videos.find((v) => v.letter === r.letter);
    const decide = async (correct) => {
      await api(`students/${encodeURIComponent(id)}/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: r.index, step: r.step, correct }),
      });
      loadStudent(id);
    };
    return el('div', { class: 'review-card' },
      el('div', {}, el('strong', {}, `Letter ${r.letter} · ${r.step}`), ` · ${r.testDate || when(r.at)}`),
      clip
        ? el('video', { src: `api/teacher/videos/${encodeURIComponent(id)}/${clip.file}`, controls: '', preload: 'metadata', playsinline: '' })
        : el('p', { class: 'small' }, 'No video for this letter.'),
      el('div', { class: 'row' },
        el('button', { class: 'plain-btn ok-btn', type: 'button', onclick: () => decide(true) }, `✓ ${r.step === 'name' ? 'Name' : 'Sound'} was correct`),
        el('button', { class: 'plain-btn no-btn', type: 'button', onclick: () => decide(false) }, '✗ Not correct')));
  }));

  $('videos').replaceChildren(...(s.videos.length ? s.videos.map((v) => {
    const src = `api/teacher/videos/${encodeURIComponent(id)}/${v.file}`;
    const card = el('div', { class: 'video-card' },
      el('video', { src, controls: '', preload: 'metadata', playsinline: '' }),
      el('div', { class: 'row' },
        el('span', {}, el('strong', {}, `Letter ${v.letter}`), ` · ${v.kind === 'practice' ? 'practice' : 'missed'} · ${when(v.recorded)}`),
        el('span', { class: 'row' },
          el('a', { href: src, download: `${s.name} - ${v.letter} - ${v.file}` }, 'Download'),
          el('button', {
            class: 'plain-btn', type: 'button', onclick: async () => {
              if (!confirm(`Delete this video of letter ${v.letter}?`)) return;
              await api(`videos/${encodeURIComponent(id)}/${v.file}`, { method: 'DELETE' });
              card.remove();
            },
          }, 'Delete'))));
    return card;
  }) : [el('p', { class: 'small' }, 'No videos yet.')]));

  const by = (a, step) => a[`${step}By`] || (a.checkedBy === 'adult' ? 'teacher' : 'app');
  const mark = (a, step) => {
    if (by(a, step) === 'review') return el('span', { class: 'listen-text' }, '🎧 Listen');
    const ok = a[`${step}Correct`];
    return el('span', { class: ok ? 'yes' : 'no-text' }, (ok ? '✓' : '✗') + (by(a, step) === 'teacher' ? ' (teacher)' : ''));
  };
  $('attempts').replaceChildren(...s.attempts.map((a) => el('tr', {},
    el('td', {}, a.testDate || ''),
    el('td', {}, when(a.at)),
    el('td', {}, a.letter + (a.retry ? ' (after practice)' : '')),
    el('td', {}, mark(a, 'name')),
    el('td', {}, mark(a, 'sound')),
    el('td', {}, (a.heard ?? [a.heardName, a.heardSound].filter(Boolean).join(' / ')) || '(nothing)'))));
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('login-error').textContent = '';
  const res = await fetch('api/teacher/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: $('pin').value }),
  });
  if (!res.ok) {
    $('login-error').textContent = 'That PIN is not right.';
    return;
  }
  $('pin').value = '';
  loadList();
});

$('refresh').addEventListener('click', () => loadList());
$('back').addEventListener('click', () => loadList());
$('logout').addEventListener('click', async () => {
  await fetch('api/teacher/logout', { method: 'POST' });
  show('login');
});

loadList().catch(() => show('login'));
