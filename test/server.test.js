import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'letter-sounds-'));
process.env.DATA_DIR = dataDir;
process.env.TEACHER_PIN = '2468';
const { createServer, studentId } = await import('../server.js');

let server;
let base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const post = (url, body, headers = { 'Content-Type': 'application/json' }) =>
  fetch(base + url, { method: 'POST', headers, body: typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body) });

const maya = { first: 'Maya', last: 'Rodriguez', grade: 'K', testDate: '2026-10-01' };
const video = new Uint8Array([26, 69, 223, 163, 1, 2, 3, 4]);

async function teacherGet() {
  const login = await post('/api/teacher/login', { pin: '2468' });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  return (url, opts = {}) => fetch(base + url, { ...opts, headers: { cookie, ...opts.headers } });
}

test('studentId makes safe folder names', () => {
  assert.equal(studentId('Maya R.'), 'maya-r');
  assert.equal(studentId('../../etc'), 'etc');
});

test('serves the student app and teacher page', async () => {
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/teacher')).status, 200);
});

test('teacher data and exports need the PIN', async () => {
  assert.equal((await fetch(base + '/api/teacher/students')).status, 401);
  assert.equal((await fetch(base + '/api/teacher/export.xlsx')).status, 401);
  assert.equal((await post('/api/teacher/login', { pin: '0000' })).status, 401);
});

test('a first name is required', async () => {
  assert.equal((await post('/api/attempts', { letter: 'B', nameCorrect: true })).status, 400);
});

test('every right answer earns a star: one for the name, one for the sound', async () => {
  const stars = async () => (await (await fetch(`${base}/api/stars?first=Leo&last=Tran`)).json());
  assert.deepEqual(await stars(), { stars: 0, chart: {}, returning: false });

  const attempt = async (letter, name, sound) => (await post('/api/attempts', {
    first: 'Leo', last: 'Tran', grade: '1', testDate: '2026-10-02', letter, nameCorrect: name, soundCorrect: sound,
  })).json();
  assert.deepEqual(await attempt('B', false, false), { ok: true, stars: 0, chart: { B: { name: false, sound: false } } });
  assert.deepEqual(await attempt('B', true, false), { ok: true, stars: 1, chart: { B: { name: true, sound: false } } });
  assert.deepEqual((await attempt('A', true, true)).stars, 3);
  const last = await attempt('B', false, true);
  assert.equal(last.stars, 4);
  assert.deepEqual(last.chart.B, { name: true, sound: true }, 'chart keeps stars from earlier tries');
  assert.deepEqual(await stars(), { stars: 4, chart: last.chart, returning: true });
});

test('attempts and videos are saved per student and shown to the teacher', async () => {
  assert.equal((await post('/api/attempts', { ...maya, letter: 'B', nameCorrect: true, soundCorrect: false, heard: 'bee dee' })).status, 201);
  assert.equal((await post('/api/attempts', { ...maya, letter: 'S', nameCorrect: true, soundCorrect: true })).status, 201);
  assert.equal((await post('/api/attempts', { ...maya, letter: 'bad' })).status, 400);

  const up = await post('/api/recordings?first=Maya&last=Rodriguez&letter=B', video, { 'Content-Type': 'video/webm' });
  assert.equal(up.status, 201);
  const { file } = await up.json();
  assert.match(file, /^B-\d+\.webm$/);
  const practiceUp = await post('/api/recordings?first=Maya&last=Rodriguez&letter=B&kind=practice', video, { 'Content-Type': 'video/webm' });
  assert.match((await practiceUp.json()).file, /^B-practice-\d+\.webm$/);
  assert.equal((await post('/api/recordings?first=Maya&letter=B', video, { 'Content-Type': 'text/plain' })).status, 415);

  const get = await teacherGet();
  const maya1 = (await (await get('/api/teacher/students')).json()).students.find((s) => s.first === 'Maya');
  assert.deepEqual([maya1.last, maya1.grade, maya1.lastTestDate, maya1.needsHelp, maya1.practiced, maya1.mastered, maya1.stars, maya1.videoCount],
    ['Rodriguez', 'K', '2026-10-01', ['B'], [], ['S'], 3, 2]);

  await post('/api/attempts', { ...maya, letter: 'B', retry: true, nameCorrect: true, soundCorrect: true });
  const after = (await (await get('/api/teacher/students')).json()).students.find((s) => s.first === 'Maya');
  assert.deepEqual([after.needsHelp, after.practiced, after.stars], [[], ['B'], 5], 'B passed after practice');

  const detail = await (await get('/api/teacher/students/maya-rodriguez')).json();
  assert.deepEqual(detail.videos.map((v) => [v.letter, v.kind]).sort(), [['B', 'missed'], ['B', 'practice']]);
  assert.equal(detail.attempts[0].retry, true);
  assert.equal(detail.attempts.at(-1).heard, 'bee dee');
  assert.deepEqual([detail.attempts.at(-1).grade, detail.attempts.at(-1).testDate], ['K', '2026-10-01']);

  const clip = await get(`/api/teacher/videos/maya-rodriguez/${file}`, { headers: { range: 'bytes=0-3' } });
  assert.equal(clip.status, 206);
  assert.deepEqual([...new Uint8Array(await clip.arrayBuffer())], [26, 69, 223, 163]);

  assert.equal((await get(`/api/teacher/videos/maya-rodriguez/${file}`, { method: 'DELETE' })).status, 200);
  assert.equal((await get('/api/teacher/videos/..%2F..%2Fserver.js/x')).status, 404);
});

test('teacher list is sorted by last name', async () => {
  await post('/api/attempts', { first: 'Zoe', last: 'Adams', letter: 'C', nameCorrect: true, soundCorrect: true });
  await post('/api/attempts', { student: 'Ava Brown', letter: 'C', nameCorrect: true, soundCorrect: true });
  const get = await teacherGet();
  const { students } = await (await get('/api/teacher/students')).json();
  assert.deepEqual(students.map((s) => s.last), ['Adams', 'Brown', 'Rodriguez', 'Tran']);
});

test('bad grade or date values are not stored', async () => {
  await post('/api/attempts', { first: 'Odd', last: 'Input', grade: '<b>9</b>', testDate: 'yesterday', letter: 'A', nameCorrect: true, soundCorrect: true });
  const get = await teacherGet();
  const odd = await (await get('/api/teacher/students/odd-input')).json();
  assert.deepEqual([odd.grade, odd.attempts[0].grade, odd.attempts[0].testDate], ['', '', '']);
});

test('teacher listening required: flagged, then marked by the teacher', async () => {
  const kim = { first: 'Kim', last: 'Lee', grade: 'K', testDate: '2026-10-05' };
  // The app couldn't hear the K sound and nobody marked it, so it is flagged and earns no star yet.
  const saved = await (await post('/api/attempts', {
    ...kim, letter: 'K', nameCorrect: true, soundCorrect: true, nameBy: 'app', soundBy: 'review',
  })).json();
  assert.equal(saved.stars, 1, 'a flagged answer never counts as correct by itself');

  const get = await teacherGet();
  const row = (await (await get('/api/teacher/students')).json()).students.find((s) => s.first === 'Kim');
  assert.equal(row.toReview, 1);
  const before = await (await get('/api/teacher/students/kim-lee')).json();
  assert.deepEqual(before.toReview.map((r) => [r.letter, r.step, r.index]), [['K', 'sound', 0]]);
  assert.equal(before.letters.K.listen, true);

  const mark = (body) => get('/api/teacher/students/kim-lee/review', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await mark({ index: 5, step: 'sound', correct: true })).status, 400);
  assert.equal((await mark({ index: 0, step: 'sound', correct: true })).status, 200);

  const after = await (await get('/api/teacher/students/kim-lee')).json();
  assert.equal(after.toReview.length, 0);
  assert.equal(after.stars, 2, 'the star is added once the teacher marks it correct');
  assert.deepEqual([after.attempts[0].soundBy, after.attempts[0].soundCorrect], ['teacher', true]);
});

test('excel exports for the class and for one student', async () => {
  const get = await teacherGet();
  const cls = await get('/api/teacher/export.xlsx');
  assert.equal(cls.status, 200);
  assert.equal(cls.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.match(cls.headers.get('content-disposition'), /class results/);
  const bytes = Buffer.from(await cls.arrayBuffer());
  assert.equal(bytes.subarray(0, 2).toString(), 'PK');
  if (process.env.SAVE_XLSX) fs.writeFileSync(process.env.SAVE_XLSX, bytes);

  const one = await get('/api/teacher/students/maya-rodriguez/export.xlsx');
  assert.equal(one.status, 200);
  assert.match(decodeURIComponent(one.headers.get('content-disposition')), /Rodriguez, Maya - Letter Sounds\.xlsx/);
  assert.equal((await get('/api/teacher/students/nobody/export.xlsx')).status, 404);
});
