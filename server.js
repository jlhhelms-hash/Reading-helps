// Letter Sounds server. Serves the student app and the teacher page, and keeps
// each student's results and videos in data/students/<student-id>/.
// Run with: node server.js   (no packages to install)

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

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
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function cleanName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

function isLetter(value) {
  return typeof value === 'string' && /^[A-Z]$/.test(value);
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
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

async function ensureStudent(name) {
  const id = studentId(name);
  if (!id) throw Object.assign(new Error('Student name is required'), { status: 400 });
  const dir = path.join(STUDENTS_DIR, id);
  await fsp.mkdir(path.join(dir, 'videos'), { recursive: true });
  const profile = path.join(dir, 'profile.json');
  if (!fs.existsSync(profile)) {
    await fsp.writeFile(profile, JSON.stringify({ name, created: new Date().toISOString() }, null, 2));
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
function summarize(attempts) {
  const letters = {};
  for (const a of attempts) {
    const s = (letters[a.letter] ||= { tries: 0, nameMissed: 0, soundMissed: 0, lastPassed: false, everMissed: false });
    s.tries++;
    if (!a.nameCorrect) s.nameMissed++;
    if (!a.soundCorrect) s.soundMissed++;
    s.lastPassed = Boolean(a.nameCorrect && a.soundCorrect);
    if (!s.lastPassed) s.everMissed = true;
  }
  const all = Object.keys(letters).sort();
  const needsHelp = all.filter((l) => !letters[l].lastPassed);
  const practiced = all.filter((l) => letters[l].lastPassed && letters[l].everMissed);
  const mastered = all.filter((l) => letters[l].lastPassed && !letters[l].everMissed);
  return { letters, needsHelp, practiced, mastered };
}

function isTeacher(req) {
  const match = /(?:^|;\s*)teacher=([a-f0-9]+)/.exec(req.headers.cookie || '');
  return Boolean(match && sessions.has(match[1]));
}

function studentDirFromParam(id) {
  if (!/^[a-z0-9-]{1,60}$/.test(id)) return null;
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

  // Student: save one letter result.
  if (req.method === 'POST' && pathname === '/api/attempts') {
    const body = await readJson(req);
    const name = cleanName(body.student);
    if (!isLetter(body.letter)) return sendJson(res, 400, { error: 'Bad letter' });
    const { dir } = await ensureStudent(name);
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
    return sendJson(res, 201, { ok: true });
  }

  // Student: save a practice video. The body is the raw video file.
  if (req.method === 'POST' && pathname === '/api/recordings') {
    const name = cleanName(url.searchParams.get('student'));
    const letter = url.searchParams.get('letter');
    if (!isLetter(letter)) return sendJson(res, 400, { error: 'Bad letter' });
    const practice = url.searchParams.get('kind') === 'practice';
    const type = req.headers['content-type'] || '';
    const ext = type.startsWith('video/mp4') ? 'mp4' : type.startsWith('video/webm') ? 'webm' : null;
    if (!ext) return sendJson(res, 415, { error: 'Video must be webm or mp4' });
    const video = await readBody(req, MAX_VIDEO_BYTES);
    if (!video.length) return sendJson(res, 400, { error: 'Empty video' });
    const { dir } = await ensureStudent(name);
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
    await fsp.mkdir(STUDENTS_DIR, { recursive: true });
    const ids = await fsp.readdir(STUDENTS_DIR);
    const students = [];
    for (const id of ids) {
      const dir = studentDirFromParam(id);
      if (!dir) continue;
      const profile = JSON.parse(await fsp.readFile(path.join(dir, 'profile.json'), 'utf8').catch(() => '{}'));
      const attempts = await readAttempts(dir);
      const { needsHelp, practiced, mastered } = summarize(attempts);
      const videos = await listVideos(dir);
      students.push({
        id, name: profile.name || id, needsHelp, practiced, mastered, videoCount: videos.length,
        lastActive: attempts.at(-1)?.at || profile.created || null,
      });
    }
    students.sort((a, b) => a.name.localeCompare(b.name));
    return sendJson(res, 200, { students });
  }

  const studentMatch = /^\/api\/teacher\/students\/([^/]+)$/.exec(pathname);
  if (req.method === 'GET' && studentMatch) {
    const dir = studentDirFromParam(studentMatch[1]);
    if (!dir) return sendJson(res, 404, { error: 'No such student' });
    const profile = JSON.parse(await fsp.readFile(path.join(dir, 'profile.json'), 'utf8').catch(() => '{}'));
    const attempts = await readAttempts(dir);
    return sendJson(res, 200, {
      id: studentMatch[1], name: profile.name, ...summarize(attempts),
      attempts: attempts.slice(-200).reverse(), videos: await listVideos(dir),
    });
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
