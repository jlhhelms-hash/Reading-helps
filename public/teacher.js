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
    el('strong', {}, s.name),
    el('span', { class: 'meta' }, `🎥 ${s.videoCount}`),
    el('span', {}, s.needsHelp.length ? `Needs help: ${s.needsHelp.join(' ')}` : 'No letters need help'),
    el('span', { class: 'meta' }, `${s.mastered.length + s.practiced.length} passed · ${when(s.lastActive)}`))));
}

async function loadStudent(id) {
  const s = await api(`students/${encodeURIComponent(id)}`);
  show('student');
  $('student-name').textContent = s.name;

  $('letter-grid').replaceChildren(...ALPHABET.map((letter) => {
    const stats = s.letters[letter];
    const cls = !stats ? '' : !stats.lastPassed ? 'help' : stats.everMissed ? 'practiced' : 'good';
    const title = stats
      ? `${letter}: ${stats.tries} tries, name missed ${stats.nameMissed}, sound missed ${stats.soundMissed}`
      : `${letter}: not tried yet`;
    return el('div', { class: `letter-cell ${cls}`, title }, letter);
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

  const mark = (ok) => el('span', { class: ok ? 'yes' : 'no-text' }, ok ? '✓' : '✗');
  $('attempts').replaceChildren(...s.attempts.map((a) => el('tr', {},
    el('td', {}, when(a.at)),
    el('td', {}, a.letter + (a.retry ? ' (after practice)' : '')),
    el('td', {}, mark(a.nameCorrect)),
    el('td', {}, mark(a.soundCorrect)),
    el('td', {}, a.checkedBy === 'adult' ? 'checked by an adult' : (a.heard ?? [a.heardName, a.heardSound].filter(Boolean).join(' / ')) || '(nothing)'))));
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
