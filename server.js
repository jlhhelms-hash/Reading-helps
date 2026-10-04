// Letter Sounds server. Serves the student app and the teacher page, and keeps
// each student's results and videos in data/students/<student-id>/.
// Run with: node server.js   (no packages to install)

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildXlsx } from './xlsx.js';
import { ALPHABET } from './public/letters.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const STUDENTS_DIR = path.join(DATA_DIR, 'students');
const PORT = Number(process.env.PORT) || 3000;
const TEACHER_PIN = process.env.TEACHER_PIN || '1234';
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const sessions = new Set();

// Video files are named <letter>-<time>.webm for a missed letter and
// <letter>-practice-<time>.webm for the practice "Say it" step.
const VIDEO_FILE = /^([A-Z])-(practice-)?(\d+)\.(webm|mp4)$/;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
};

// "Maya R." -> "maya-r". Used as the folder name for a student.
export function studentId(name) {
  return String(name).toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
}

function cleanName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

// Reads first/last name from a request. Older data used one "student" field.
function studentFromInput(input) {
  let first = cleanName(input.first);
  let last = cleanName(input.last);
  if (!first && input.student) [first, last] = splitName(input.student);
  if (!first) throw Object.assign(new Error('Student first name is required'), { status: 400 });
  return { first, last, name: last ? `${first} ${last}` : first };
}

function splitName(full) {
  const words = cleanName(full).split(' ');
  return words.length > 1 ? [words.slice(0, -1).join(' '), words.at(-1)] : [words[0] || '', ''];
}

function isLetter(value) {
  return typeof value === 'string' && /^[A-Z]$/.test(value);
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

function sendXlsx(res, filename, buffer) {
  res.writeHead(200, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${filename.replace(/[^\w ,.-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Content-Length': buffer.length,
  });
  res.end(buffer);
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  try {
    return JSON.parse((await readBody(req, 100_000)).toString('utf8') || '{}');
  } catch (err) {
    if (err.status) throw err;
    throw Object.assign(new Error('Bad JSON'), { status: 400 });
  }
}

async function ensureStudent(student) {
  const id = studentId(student.name);
  if (!id) throw Object.assign(new Error('Student name is required'), { status: 400 });
  const dir = path.join(STUDENTS_DIR, id);
  await fsp.mkdir(path.join(dir, 'videos'), { recursive: true });
  const profile = path.join(dir, 'profile.json');
  if (!fs.existsSync(profile)) {
    await fsp.writeFile(profile, JSON.stringify({ ...student, created: new Date().toISOString() }, null, 2));
  }
  return { id, dir };
}

async function readAttempts(dir) {
  try {
    const text = await fsp.readFile(path.join(dir, 'attempts.jsonl'), 'utf8');
    return text.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

async function listVideos(dir) {
  try {
    const files = await fsp.readdir(path.join(dir, 'videos'));
    return files.map((file) => VIDEO_FILE.exec(file)).filter(Boolean).map(([file, letter, practice, stamp]) => ({
      file, letter, kind: practice ? 'practice' : 'missed', recorded: new Date(Number(stamp)).toISOString(),
    })).sort((a, b) => b.recorded.localeCompare(a.recorded));
  } catch {
    return [];
  }
}

// Per-letter totals for the teacher: how often each letter was tried and missed.
// A star is earned the first time a letter is passed, and is never taken away.
function summarize(attempts) {
  const letters = {};
  for (const a of attempts) {
    const s = (letters[a.letter] ||= { tries: 0, nameMissed: 0, soundMissed: 0, lastPassed: false, everMissed: false, everPassed: false });
    s.tries++;
    if (!a.nameCorrect) s.nameMissed++;
    if (!a.soundCorrect) s.soundMissed++;
    s.lastPassed = Boolean(a.nameCorrect && a.soundCorrect);
    if (s.lastPassed) s.everPassed = true;
    else s.everMissed = true;
  }
  const all = Object.keys(letters).sort();
  const needsHelp = all.filter((l) => !letters[l].lastPassed);
  const practiced = all.filter((l) => letters[l].lastPassed && letters[l].everMissed);
  const mastered = all.filter((l) => letters[l].lastPassed && !letters[l].everMissed);
  const stars = all.filter((l) => letters[l].everPassed);
  return { letters, needsHelp, practiced, mastered, stars };
}

async function loadStudent(id) {
  const dir = studentDirFromParam(id);
  if (!dir) return null;
  const profile = JSON.parse(await fsp.readFile(path.join(dir, 'profile.json'), 'utf8').catch(() => '{}'));
  const [first, last] = profile.first ? [profile.first, profile.last || ''] : splitName(profile.name || id);
  const attempts = await readAttempts(dir);
  return {
    id, first, last, name: profile.name || id, created: profile.created,
    attempts, videos: await listVideos(dir), ...summarize(attempts),
  };
}

const byLastName = (a, b) =>
  a.last.localeCompare(b.last, undefined, { sensitivity: 'base' }) ||
  a.first.localeCompare(b.first, undefined, { sensitivity: 'base' });

async function loadAllStudents() {
  await fsp.mkdir(STUDENTS_DIR, { recursive: true });
  const students = [];
  for (const id of await fsp.readdir(STUDENTS_DIR)) {
    const student = await loadStudent(id);
    if (student) students.push(student);
  }
  return students.sort(byLastName);
}

function localTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Excel workbook of results, sorted by last name: a summary, an A-Z grid, and every try.
function resultsWorkbook(students) {
  const yesNo = (ok) => ({ v: ok ? 'Yes' : 'No', style: ok ? 'good' : 'help' });
  const summary = [
    ['Last name', 'First name', 'Stars', 'Passed first time', 'Passed after practice', 'Needs help', 'Letters tried', 'Videos', 'Last active'],
    ...students.map((s) => [
      s.last, s.first, s.stars.length, s.mastered.join(' '), s.practiced.join(' '), s.needsHelp.join(' '),
      Object.keys(s.letters).length, s.videos.length, localTime(s.attempts.at(-1)?.at),
    ]),
  ];
  const grid = [
    ['Last name', 'First name', ...ALPHABET],
    ...students.map((s) => [s.last, s.first, ...ALPHABET.map((l) => {
      const stats = s.letters[l];
      if (!stats) return '';
      if (!stats.lastPassed) return { v: 'Help', style: 'help' };
      return stats.everMissed ? { v: 'Practiced', style: 'practiced' } : { v: 'Passed', style: 'good' };
    })]),
  ];
  const tries = [
    ['Last name', 'First name', 'When', 'Letter', 'Name right', 'Sound right', 'After practice', 'Checked by', 'App heard'],
    ...students.flatMap((s) => s.attempts.map((a) => [
      s.last, s.first, localTime(a.at), a.letter, yesNo(a.nameCorrect), yesNo(a.soundCorrect),
      a.retry ? 'Yes' : '', a.checkedBy === 'adult' ? 'Adult' : 'App',
      a.heard ?? [a.heardName, a.heardSound].filter(Boolean).join(' / '),
    ])),
  ];
  return buildXlsx([
    { name: 'Summary', rows: summary, widths: [16, 14, 7, 28, 22, 22, 13, 8, 17] },
    { name: 'Letters A-Z', rows: grid, widths: [16, 14, ...ALPHABET.map(() => 9)] },
    { name: 'All tries', rows: tries, widths: [16, 14, 17, 7, 11, 11, 13, 11, 30] },
  ]);
}

function isTeacher(req) {
  const match = /(?:^|;\s*)teacher=([a-f0-9]+)/.exec(req.headers.cookie || '');
  return Boolean(match && sessions.has(match[1]));
}

function studentDirFromParam(id) {
  if (!/^[a-z0-9-]{1,90}$/.test(id)) return null;
  const dir = path.join(STUDENTS_DIR, id);
  return fs.existsSync(dir) ? dir : null;
}

async function serveFile(req, res, file, type) {
  const stat = await fsp.stat(file);
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  // Safari needs byte ranges to play video.
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
    res.writeHead(206, {
      'Content-Type': type, 'Accept-Ranges': 'bytes',
      'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1,
    });
    fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' });
  fs.createReadStream(file).pipe(res);
}

async function handleApi(req, res, url) {
  const { pathname } = url;
  const query = Object.fromEntries(url.searchParams);

  // Student: the stars they have earned so far.
  if (req.method === 'GET' && pathname === '/api/stars') {
    const student = studentFromInput(query);
    const found = await loadStudent(studentId(student.name));
    return sendJson(res, 200, { stars: found ? found.stars : [], returning: Boolean(found) });
  }

  // Student: save one letter result. Replies with their stars and whether this one is new.
  if (req.method === 'POST' && pathname === '/api/attempts') {
    const body = await readJson(req);
    if (!isLetter(body.letter)) return sendJson(res, 400, { error: 'Bad letter' });
    const { id, dir } = await ensureStudent(studentFromInput(body));
    const before = (await loadStudent(id)).stars;
    const record = {
      letter: body.letter,
      nameCorrect: Boolean(body.nameCorrect),
      soundCorrect: Boolean(body.soundCorrect),
      heard: String(body.heard || '').slice(0, 300),
      retry: Boolean(body.retry),
      checkedBy: body.checkedBy === 'adult' ? 'adult' : 'app',
      at: new Date().toISOString(),
    };
    await fsp.appendFile(path.join(dir, 'attempts.jsonl'), JSON.stringify(record) + '\n');
    const passed = record.nameCorrect && record.soundCorrect;
    const newStar = passed && !before.includes(record.letter);
    const stars = newStar ? [...before, record.letter].sort() : before;
    return sendJson(res, 201, { ok: true, stars, newStar });
  }

  // Student: save a video. The body is the raw video file.
  if (req.method === 'POST' && pathname === '/api/recordings') {
    const student = studentFromInput(query);
    const letter = query.letter;
    if (!isLetter(letter)) return sendJson(res, 400, { error: 'Bad letter' });
    const practice = query.kind === 'practice';
    const type = req.headers['content-type'] || '';
    const ext = type.startsWith('video/mp4') ? 'mp4' : type.startsWith('video/webm') ? 'webm' : null;
    if (!ext) return sendJson(res, 415, { error: 'Video must be webm or mp4' });
    const video = await readBody(req, MAX_VIDEO_BYTES);
    if (!video.length) return sendJson(res, 400, { error: 'Empty video' });
    const { dir } = await ensureStudent(student);
    const file = `${letter}-${practice ? 'practice-' : ''}${Date.now()}.${ext}`;
    await fsp.writeFile(path.join(dir, 'videos', file), video);
    return sendJson(res, 201, { ok: true, file });
  }

  if (req.method === 'POST' && pathname === '/api/teacher/login') {
    const { pin } = await readJson(req);
    const ok = typeof pin === 'string' && pin.length === TEACHER_PIN.length &&
      crypto.timingSafeEqual(Buffer.from(pin), Buffer.from(TEACHER_PIN));
    if (!ok) return sendJson(res, 401, { error: 'Wrong PIN' });
    const token = crypto.randomBytes(24).toString('hex');
    sessions.add(token);
    return sendJson(res, 200, { ok: true }, {
      'Set-Cookie': `teacher=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`,
    });
  }

  if (!pathname.startsWith('/api/teacher/')) return sendJson(res, 404, { error: 'Not found' });
  if (!isTeacher(req)) return sendJson(res, 401, { error: 'Teacher login required' });

  if (req.method === 'POST' && pathname === '/api/teacher/logout') {
    const match = /(?:^|;\s*)teacher=([a-f0-9]+)/.exec(req.headers.cookie || '');
    if (match) sessions.delete(match[1]);
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': 'teacher=; Path=/; Max-Age=0' });
  }

  if (req.method === 'GET' && pathname === '/api/teacher/students') {
    const students = (await loadAllStudents()).map((s) => ({
      id: s.id, name: s.name, first: s.first, last: s.last,
      needsHelp: s.needsHelp, practiced: s.practiced, mastered: s.mastered, stars: s.stars.length,
      videoCount: s.videos.length, lastActive: s.attempts.at(-1)?.at || s.created || null,
    }));
    return sendJson(res, 200, { students });
  }

  if (req.method === 'GET' && pathname === '/api/teacher/export.xlsx') {
    const date = localTime(new Date().toISOString()).slice(0, 10);
    return sendXlsx(res, `Letter Sounds - class results ${date}.xlsx`, resultsWorkbook(await loadAllStudents()));
  }

  const exportMatch = /^\/api\/teacher\/students\/([^/]+)\/export\.xlsx$/.exec(pathname);
  if (req.method === 'GET' && exportMatch) {
    const student = await loadStudent(exportMatch[1]);
    if (!student) return sendJson(res, 404, { error: 'No such student' });
    const label = student.last ? `${student.last}, ${student.first}` : student.first;
    return sendXlsx(res, `${label} - Letter Sounds.xlsx`, resultsWorkbook([student]));
  }

  const studentMatch = /^\/api\/teacher\/students\/([^/]+)$/.exec(pathname);
  if (req.method === 'GET' && studentMatch) {
    const s = await loadStudent(studentMatch[1]);
    if (!s) return sendJson(res, 404, { error: 'No such student' });
    return sendJson(res, 200, { ...s, attempts: s.attempts.slice(-200).reverse() });
  }

  const videoMatch = /^\/api\/teacher\/videos\/([^/]+)\/([^/]+)$/.exec(pathname);
  if (videoMatch && VIDEO_FILE.test(videoMatch[2])) {
    const dir = studentDirFromParam(videoMatch[1]);
    const file = dir && path.join(dir, 'videos', videoMatch[2]);
    if (!file || !fs.existsSync(file)) return sendJson(res, 404, { error: 'No such video' });
    if (req.method === 'GET') return serveFile(req, res, file, TYPES[path.extname(file)]);
    if (req.method === 'DELETE') {
      await fsp.unlink(file);
      return sendJson(res, 200, { ok: true });
    }
  }

  return sendJson(res, 404, { error: 'Not found' });
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);

    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    if (rel === '/teacher') rel = '/teacher.html';
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    return await serveFile(req, res, file, TYPES[path.extname(file)] || 'application/octet-stream');
  } catch (err) {
    if (!err.status) console.error(err);
    if (!res.headersSent) sendJson(res, err.status || 500, { error: err.status ? err.message : 'Server error' });
  }
}

export function createServer() {
  return http.createServer(handle);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, () => {
    console.log(`Letter Sounds is running.`);
    console.log(`  Students: http://localhost:${PORT}/`);
    console.log(`  Teacher:  http://localhost:${PORT}/teacher`);
    if (!process.env.TEACHER_PIN) {
      console.log(`  Teacher PIN is the default "1234". Set TEACHER_PIN to change it.`);
    }
  });
}
