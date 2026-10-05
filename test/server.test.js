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

// Saves one answer (a letter's name or its sound).
const answer = (who, letter, test, correct, extra = {}) =>
  post('/api/attempts', { ...who, letter, test, correct, ...extra });

test('a first name and a test are required', async () => {
  assert.equal((await post('/api/attempts', { letter: 'B', test: 'name', correct: true })).status, 400);
  assert.equal((await post('/api/attempts', { first: 'X', letter: 'B', correct: true })).status, 400);
});

test('every right answer earns a star: names and sounds count separately', async () => {
  const leo = { first: 'Leo', last: 'Tran', grade: '1', testDate: '2026-10-02' };
  const stars = async () => (await (await fetch(`${base}/api/stars?first=Leo&last=Tran`)).json());
  assert.deepEqual(await stars(), { stars: 0, chart: {}, returning: false });

  assert.deepEqual(await (await answer(leo, 'B', 'name', false)).json(), { ok: true, stars: 0, chart: {} });
  assert.deepEqual(await (await answer(leo, 'B', 'name', true)).json(), { ok: true, stars: 1, chart: { B: { name: true, sound: false } } });
  assert.equal((await (await answer(leo, 'A', 'name', true)).json()).stars, 2);
  const last = await (await answer(leo, 'B', 'sound', true)).json();
  assert.equal(last.stars, 3);
  assert.deepEqual(last.chart.B, { name: true, sound: true });
  await answer(leo, 'B', 'name', false);
  assert.deepEqual(await stars(), { stars: 3, chart: last.chart, returning: true }, 'stars are never taken away');
});

test('answers and videos are saved per student and shown to the teacher', async () => {
  assert.equal((await answer(maya, 'B', 'name', true)).status, 201);
  assert.equal((await answer(maya, 'B', 'sound', false, { heard: 'dee' })).status, 201);
  assert.equal((await answer(maya, 'S', 'name', true)).status, 201);
  assert.equal((await answer(maya, 'S', 'sound', true)).status, 201);
  assert.equal((await answer(maya, 'bad', 'name', true)).status, 400);

  const up = await post('/api/recordings?first=Maya&last=Rodriguez&letter=B', video, { 'Content-Type': 'video/webm' });
  assert.equal(up.status, 201);
  const { file } = await up.json();
  assert.match(file, /^B-\d+\.webm$/);
  const practiceUp = await post('/api/recordings?first=Maya&last=Rodriguez&letter=B&kind=practice', video, { 'Content-Type': 'video/webm' });
  assert.match((await practiceUp.json()).file, /^B-practice-\d+\.webm$/);
  const soundUp = await post('/api/recordings?first=Maya&last=Rodriguez&letter=B&kind=sound', video, { 'Content-Type': 'video/webm' });
  assert.match((await soundUp.json()).file, /^B-sound-\d+\.webm$/);
  assert.equal((await post('/api/recordings?first=Maya&letter=B', video, { 'Content-Type': 'text/plain' })).status, 415);

  const get = await teacherGet();
  const row = (await (await get('/api/teacher/students')).json()).students.find((s) => s.first === 'Maya');
  assert.deepEqual([row.last, row.grade, row.lastTestDate, row.stars, row.videoCount], ['Rodriguez', 'K', '2026-10-01', 3, 3]);
  assert.deepEqual(row.names, { known: ['B', 'S'], practiced: [], needsHelp: [], listen: [] });
  assert.deepEqual(row.sounds, { known: ['S'], practiced: [], needsHelp: ['B'], listen: [] });

  await answer(maya, 'B', 'sound', true, { retry: true });
  const after = (await (await get('/api/teacher/students')).json()).students.find((s) => s.first === 'Maya');
  assert.deepEqual([after.sounds.needsHelp, after.sounds.practiced, after.stars], [[], ['B'], 4], 'B sound known after practice');

  const detail = await (await get('/api/teacher/students/maya-rodriguez')).json();
  assert.deepEqual(detail.videos.map((v) => [v.letter, v.kind]).sort(), [['B', 'missed'], ['B', 'practice'], ['B', 'sound']]);
  assert.deepEqual([detail.answers[0].test, detail.answers[0].retry], ['sound', true]);
  const first = detail.answers.at(-1);
  assert.deepEqual([first.letter, first.test, first.grade, first.testDate], ['B', 'name', 'K', '2026-10-01']);
  assert.equal(detail.answers.at(-2).heard, 'dee');

  const clip = await get(`/api/teacher/videos/maya-rodriguez/${file}`, { headers: { range: 'bytes=0-3' } });
  assert.equal(clip.status, 206);
  assert.deepEqual([...new Uint8Array(await clip.arrayBuffer())], [26, 69, 223, 163]);

  assert.equal((await get(`/api/teacher/videos/maya-rodriguez/${file}`, { method: 'DELETE' })).status, 200);
  assert.equal((await get('/api/teacher/videos/..%2F..%2Fserver.js/x')).status, 404);
});

test('results saved before the name and sound tests were split still load', async () => {
  const dir = path.join(dataDir, 'students', 'old-timer');
  fs.mkdirSync(path.join(dir, 'videos'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify({ first: 'Old', last: 'Timer', name: 'Old Timer' }));
  fs.writeFileSync(path.join(dir, 'attempts.jsonl'), [
    { letter: 'M', nameCorrect: true, soundCorrect: false, heard: 'em', at: '2026-10-01T10:00:00Z' },
    { letter: 'K', nameCorrect: true, soundCorrect: false, nameBy: 'app', soundBy: 'review', at: '2026-10-01T10:01:00Z' },
  ].map((r) => JSON.stringify(r)).join('\n') + '\n');
  const get = await teacherGet();
  const old = await (await get('/api/teacher/students/old-timer')).json();
  assert.equal(old.stars, 2);
  assert.deepEqual([old.names.known, old.sounds.needsHelp, old.sounds.listen], [['K', 'M'], ['M'], ['K']]);
  assert.deepEqual(old.toReview.map((r) => [r.letter, r.step, r.index]), [['K', 'sound', 1]]);
  const mark = await get('/api/teacher/students/old-timer/review', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index: 1, step: 'sound', correct: true }),
  });
  assert.equal(mark.status, 200);
  assert.equal((await (await get('/api/teacher/students/old-timer')).json()).stars, 3);
});

test('teacher list is sorted by last name', async () => {
  await answer({ first: 'Zoe', last: 'Adams' }, 'C', 'name', true);
  await answer({ student: 'Ava Brown' }, 'C', 'name', true);
  const get = await teacherGet();
  const { students } = await (await get('/api/teacher/students')).json();
  assert.deepEqual(students.map((s) => s.last), ['Adams', 'Brown', 'Rodriguez', 'Timer', 'Tran']);
});

test('bad grade or date values are not stored', async () => {
  await answer({ first: 'Odd', last: 'Input', grade: '<b>9</b>', testDate: 'yesterday' }, 'A', 'name', true);
  const get = await teacherGet();
  const odd = await (await get('/api/teacher/students/odd-input')).json();
  assert.deepEqual([odd.grade, odd.answers[0].grade, odd.answers[0].testDate], ['', '', '']);
});

test('teacher listening required: flagged, then marked by the teacher', async () => {
  const kim = { first: 'Kim', last: 'Lee', grade: 'K', testDate: '2026-10-05' };
  await answer(kim, 'K', 'name', true);
  // The app couldn't hear the K sound, so it was recorded and is waiting for the teacher.
  const saved = await (await answer(kim, 'K', 'sound', true, { by: 'review' })).json();
  assert.equal(saved.stars, 1, 'a flagged answer never counts as right by itself');

  const get = await teacherGet();
  const row = (await (await get('/api/teacher/students')).json()).students.find((s) => s.first === 'Kim');
  assert.equal(row.toReview, 1);
  const before = await (await get('/api/teacher/students/kim-lee')).json();
  assert.deepEqual(before.toReview.map((r) => [r.letter, r.step, r.index]), [['K', 'sound', 1]]);
  assert.equal(before.letters.K.sound.listen, true);
  assert.deepEqual(before.sounds.listen, ['K']);

  const mark = (body) => get('/api/teacher/students/kim-lee/review', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await mark({ index: 5, step: 'sound', correct: true })).status, 400);
  assert.equal((await mark({ index: 1, step: 'name', correct: true })).status, 400, 'step must match the answer');
  assert.equal((await mark({ index: 1, step: 'sound', correct: true })).status, 200);

  const after = await (await get('/api/teacher/students/kim-lee')).json();
  assert.equal(after.toReview.length, 0);
  assert.equal(after.stars, 2, 'the star is added once the teacher marks it correct');
  assert.deepEqual([after.answers[0].by, after.answers[0].correct], ['teacher', true]);
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
