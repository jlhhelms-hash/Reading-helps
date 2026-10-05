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
    el('span', {}, [
      `Names: ${s.names.needsHelp.length ? `help with ${s.names.needsHelp.join(' ')}` : `${s.names.known.length + s.names.practiced.length} known`}`,
      `Sounds: ${s.sounds.needsHelp.length ? `help with ${s.sounds.needsHelp.join(' ')}` : `${s.sounds.known.length + s.sounds.practiced.length} known`}`,
    ].join(' · ')),
    el('span', { class: 'meta' }, [gradeLabel(s.grade), s.lastTestDate && `tested ${s.lastTestDate}`].filter(Boolean).join(' · ')))));
}

async function loadStudent(id) {
  const s = await api(`students/${encodeURIComponent(id)}`);
  show('student');
  $('student-name').textContent = [`${s.first} ${s.last}`, gradeLabel(s.grade), `⭐ ${s.stars}`].filter(Boolean).join(' · ');
  $('student-export').href = `api/teacher/students/${encodeURIComponent(id)}/export.xlsx`;

  for (const test of ['name', 'sound']) {
    $(`${test}-grid`).replaceChildren(...ALPHABET.map((letter) => {
      const stats = s.letters[letter]?.[test];
      const cls = !stats ? '' : stats.listen ? 'listen' : !stats.lastCorrect ? 'help' : stats.everMissed ? 'practiced' : 'good';
      const title = stats ? `${letter} ${test}: ${stats.tries} tries, missed ${stats.missed}` : `${letter} ${test}: not tried yet`;
      return el('div', { class: `letter-cell ${cls}`, title }, letter);
    }));
  }

  // Answers the app couldn't hear: the teacher watches the video, then marks them.
  $('review-section').hidden = !s.toReview.length;
  $('review-list').replaceChildren(...s.toReview.map((r) => {
    const forLetter = s.videos.filter((v) => v.letter === r.letter);
    // Videos are newest first, so this finds the sound video made just before this answer was saved.
    const clip = (r.step === 'sound' && forLetter.find((v) => v.kind === 'sound' && v.recorded <= r.at))
      || forLetter.find((v) => v.recorded >= r.at) || forLetter[0];
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
        el('span', {}, el('strong', {}, `Letter ${v.letter}`), ` · ${{ practice: 'practice', sound: 'sound check', missed: 'missed' }[v.kind] || v.kind} · ${when(v.recorded)}`),
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

  const mark = (a) => {
    if (a.by === 'review') return el('span', { class: 'listen-text' }, '🎧 Listen');
    return el('span', { class: a.correct ? 'yes' : 'no-text' }, (a.correct ? '✓' : '✗') + (a.by === 'teacher' ? ' (teacher)' : ''));
  };
  $('attempts').replaceChildren(...s.answers.map((a) => el('tr', {},
    el('td', {}, a.testDate || ''),
    el('td', {}, when(a.at)),
    el('td', {}, a.test === 'name' ? 'Name' : 'Sound'),
    el('td', {}, a.letter + (a.retry ? ' (after practice)' : '')),
    el('td', {}, mark(a)),
    el('td', {}, a.heard || '(nothing)'))));
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
