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

test('studentId makes safe folder names', () => {
  assert.equal(studentId('Maya R.'), 'maya-r');
  assert.equal(studentId('../../etc'), 'etc');
});

test('serves the student app and teacher page', async () => {
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/teacher')).status, 200);
  assert.equal((await fetch(base + '/../server.js')).status, 404);
});

test('teacher data needs the PIN', async () => {
  assert.equal((await fetch(base + '/api/teacher/students')).status, 401);
  assert.equal((await post('/api/teacher/login', { pin: '0000' })).status, 401);
});

test('attempts and videos are saved per student and shown to the teacher', async () => {
  assert.equal((await post('/api/attempts', { student: 'Maya R.', letter: 'B', nameCorrect: true, soundCorrect: false, heard: 'bee dee' })).status, 201);
  assert.equal((await post('/api/attempts', { student: 'Maya R.', letter: 'S', nameCorrect: true, soundCorrect: true })).status, 201);
  assert.equal((await post('/api/attempts', { student: 'Maya R.', letter: 'bad' })).status, 400);

  const video = new Uint8Array([26, 69, 223, 163, 1, 2, 3, 4]);
  const up = await post('/api/recordings?student=Maya%20R.&letter=B', video, { 'Content-Type': 'video/webm' });
  assert.equal(up.status, 201);
  const { file } = await up.json();
  assert.match(file, /^B-\d+\.webm$/);
  const practiceUp = await post('/api/recordings?student=Maya%20R.&letter=B&kind=practice', video, { 'Content-Type': 'video/webm' });
  assert.match((await practiceUp.json()).file, /^B-practice-\d+\.webm$/);
  assert.equal((await post('/api/recordings?student=Maya&letter=B', video, { 'Content-Type': 'text/plain' })).status, 415);

  const login = await post('/api/teacher/login', { pin: '2468' });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const get = (url, opts = {}) => fetch(base + url, { ...opts, headers: { cookie, ...opts.headers } });

  const { students } = await (await get('/api/teacher/students')).json();
  assert.deepEqual(students.map((s) => [s.name, s.needsHelp, s.practiced, s.mastered, s.videoCount]), [['Maya R.', ['B'], [], ['S'], 2]]);

  await post('/api/attempts', { student: 'Maya R.', letter: 'B', retry: true, nameCorrect: true, soundCorrect: true });
  const after = (await (await get('/api/teacher/students')).json()).students[0];
  assert.deepEqual([after.needsHelp, after.practiced], [[], ['B']], 'B passed after practice');

  const detail = await (await get('/api/teacher/students/maya-r')).json();
  assert.deepEqual(detail.videos.map((v) => [v.letter, v.kind]).sort(), [['B', 'missed'], ['B', 'practice']]);
  assert.equal(detail.attempts[0].letter, 'B');
  assert.equal(detail.attempts[0].retry, true);
  assert.equal(detail.attempts.at(-1).heard, 'bee dee');

  const clip = await get(`/api/teacher/videos/maya-r/${file}`, { headers: { range: 'bytes=0-3' } });
  assert.equal(clip.status, 206);
  assert.deepEqual([...new Uint8Array(await clip.arrayBuffer())], [26, 69, 223, 163]);

  assert.equal((await get(`/api/teacher/videos/maya-r/${file}`, { method: 'DELETE' })).status, 200);
  assert.equal((await get('/api/teacher/videos/..%2F..%2Fserver.js/x')).status, 404);
});
