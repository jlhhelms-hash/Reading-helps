// Student app. After entering their details the student picks the name test or
// the sound test. Each shows letters one at a time and listens for the answer.
// A missed name gets a video, practice and a retry; a sound the app can't hear
// right is recorded on the webcam for the teacher, then the next letter comes.

import { ALPHABET, heardLetterName, heardLetterSound, shuffle } from './letters.js';
import { ACTIVITIES, speak } from './activities.js';
import { openCamera, recordClip, stopCamera, uploadClip } from './recorder.js';
import { isPlaying, musicWanted, setMusicWanted, startMusic, stopMusic } from './music.js';
import { chime, confetti, flyStar, letterColor, popTwinkle, renderStarChart } from './fun.js';

const LISTEN_MS = 5000; // longest the app listens on one try
const QUIET_MS = 700; // stop listening this long after the student stops talking
const RECORD_SECONDS = 5;
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const $ = (id) => document.getElementById(id);
// student is { first, last, grade, testDate }. stars is the student's star total;
// chart marks which letters' name and sound they have gotten right.
const state = {
  student: null, test: 'name', adultMode: !Recognition, practiced: [], passed: 0,
  stars: 0, chart: {}, starsToday: 0, newChart: [],
};

function show(screen) {
  document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== `screen-${screen}`; });
  // The colorful letters background is for the start and welcome screens; the
  // test screens stay calm so the letter stands out.
  const intro = screen === 'start' || screen === 'welcome';
  document.body.classList.toggle('letters-bg', intro);
  // Intro music plays only on the start and welcome screens.
  $('music-btn').hidden = !intro;
  if (!intro) stopMusic();
  showMusicButton();
}

function showMusicButton() {
  const on = isPlaying();
  $('music-btn').textContent = on ? '🎵' : '🔇';
  $('music-btn').setAttribute('aria-label', on ? 'Turn music off' : 'Turn music on');
  $('music-btn').classList.toggle('off', !on);
}

$('music-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  if (isPlaying()) {
    stopMusic();
    setMusicWanted(false);
  } else {
    startMusic();
    setMusicWanted(true);
  }
  showMusicButton();
});

// Browsers only allow sound after the first tap or key press, so the music
// starts then (unless it was turned off).
function startMusicOnFirstTouch() {
  const begin = (e) => {
    // A first tap on the music button is handled by the button itself.
    if (e.target.closest?.('#music-btn')) return;
    window.removeEventListener('pointerdown', begin, true);
    window.removeEventListener('keydown', begin, true);
    if (musicWanted() && !$('music-btn').hidden) {
      startMusic();
      showMusicButton();
    }
  };
  window.addEventListener('pointerdown', begin, true);
  window.addEventListener('keydown', begin, true);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function nextClick(button) {
  return new Promise((resolve) => button.addEventListener('click', resolve, { once: true }));
}

// Watches the microphone volume while listening. Speech recognition is made for
// words, so a short sound like /k/ often comes back as nothing; the volume tells
// us whether the student said something we couldn't read, or stayed quiet.
let meter = null;
async function startMeter() {
  try {
    if (!meter) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      meter = { ctx, analyser, data: new Float32Array(analyser.fftSize) };
    }
    await meter.ctx.resume();
    let loudMs = 0;
    const timer = setInterval(() => {
      meter.analyser.getFloatTimeDomainData(meter.data);
      let sum = 0;
      for (const v of meter.data) sum += v * v;
      if (Math.sqrt(sum / meter.data.length) > 0.03) loudMs += 20;
    }, 20);
    // Call the returned function to stop; it says whether a voice was heard.
    return () => {
      clearInterval(timer);
      return loudMs >= 80;
    };
  } catch {
    return () => false;
  }
}

// Listen until the student stops talking (or 5 seconds pass). Resolves with
// { heard, voice }: the recognizer's guesses (the whole thing first, then each
// piece's alternatives) and whether the microphone picked up a voice at all.
async function listen() {
  const stopMeter = await startMeter();
  try {
    const heard = await recognize();
    return { heard, voice: stopMeter() };
  } catch (err) {
    stopMeter();
    throw err;
  }
}

function recognize() {
  return new Promise((resolve, reject) => {
    const rec = new Recognition();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    let pieces = [];
    let quiet;
    const hardStop = setTimeout(() => rec.stop(), LISTEN_MS);
    rec.onresult = (e) => {
      pieces = [...e.results].map((result) => [...result].map((alt) => alt.transcript.trim()).filter(Boolean));
      // Stop once the student has been quiet for a moment.
      clearTimeout(quiet);
      quiet = setTimeout(() => rec.stop(), QUIET_MS);
    };
    rec.onerror = (e) => {
      clearTimeout(hardStop);
      clearTimeout(quiet);
      if (e.error === 'no-speech' || e.error === 'aborted') resolve([]);
      else reject(e.error);
    };
    rec.onend = () => {
      clearTimeout(hardStop);
      clearTimeout(quiet);
      const whole = pieces.map((alts) => alts[0]).filter(Boolean).join(' ');
      resolve(whole ? [whole, ...pieces.flat()] : []);
    };
    rec.start();
  });
}

function setFeedback(text, kind = '') {
  const f = $('feedback');
  f.textContent = text;
  f.className = `feedback ${kind}`;
}

// The two tests. Students do the name test first, then the sound test.
const TESTS = {
  name: {
    title: 'Name test',
    pill: '🔤 Letter name',
    tries: 3, // the first try plus up to 2 retries
    question: 'What is the name of this letter?',
    hint: 'Tap “Say it”, then say the letter’s name.',
    check: heardLetterName,
    teacher: (letter) => `did they say the letter name "${letter}" correctly?`,
    wrong: (letter) => `This letter is ${letter}.`,
    done: (n, total) => `You knew ${n} of ${total} letter names`,
  },
  sound: {
    title: 'Sound test',
    pill: '🔊 Letter sound',
    tries: 2, // then the webcam records the sound for the teacher
    question: 'What is the sound of this letter?',
    hint: 'Tap “Say it”, then make the sound nice and loud.',
    check: heardLetterSound,
    teacher: (letter) => `did they say the ${letter} sound correctly?`,
    done: (n, total) => `You knew ${n} of ${total} letter sounds`,
  },
};

// When the app can't hear an answer, the teacher can mark it right or wrong now,
// or the student continues and it is flagged "Teacher listening required".
// Resolves with 'correct', 'wrong' or 'later'.
async function teacherCheck(letter, test, reason) {
  $('say-btn').hidden = true;
  $('teacher-check').hidden = false;
  $('teacher-reason').textContent = reason;
  $('teacher-question').textContent = `Teacher: ${TESTS[test].teacher(letter)}`;
  const decision = await Promise.race([
    nextClick($('teacher-yes')).then(() => 'correct'),
    nextClick($('teacher-no')).then(() => 'wrong'),
    nextClick($('teacher-later')).then(() => 'later'),
  ]);
  $('teacher-check').hidden = true;
  $('say-btn').hidden = false;
  return decision;
}

// Ask the question for one letter. The student taps "Say it" and answers, with
// TESTS[test].tries tries. Returns { correct, heard, by } where `by` is 'app',
// 'teacher', 'review' (teacher listening required), or 'video' (the sound wasn't
// heard right: record it on the webcam for the teacher).
async function askLetter(letter, test) {
  const { question, hint, check, tries: TRIES } = TESTS[test];
  $('test-pill').className = 'step active';
  $('prompt').textContent = question;
  setFeedback(hint);
  await speak(question);

  const heardLog = [];
  let heardWords = false;
  for (let tries = 0; tries < TRIES && !state.adultMode; tries++) {
    await nextClick($('say-btn'));
    window.speechSynthesis?.cancel();
    popTwinkle();
    $('say-btn').classList.add('listening');
    $('say-btn').textContent = '👂 Listening…';
    // Let the pop finish so the microphone doesn't hear it.
    await wait(250);
    let heard;
    let voice;
    try {
      ({ heard, voice } = await listen());
    } catch (err) {
      // No microphone permission or no speech service: the teacher checks instead.
      console.warn('Speech recognition error:', err);
      state.adultMode = true;
      break;
    } finally {
      $('say-btn').classList.remove('listening');
      $('say-btn').textContent = '🎤 Say it';
    }
    if (heard.length) {
      heardWords = true;
      heardLog.push(heard[0]);
      if (check(letter, heard)) return { correct: true, heard: heardLog.join(' / '), by: 'app' };
    } else {
      heardLog.push(voice ? '(voice heard, no words)' : '(nothing heard)');
    }
    if (tries < TRIES - 1) {
      setFeedback(heard.length ? `I heard "${heard[0]}". Try again!`
        : voice ? "I heard you, but I couldn't tell what you said. Try again, nice and loud!"
          : "I didn't hear you. Try again, nice and loud!", 'oops');
    }
  }
  const heard = heardLog.join(' / ');

  // The sound wasn't heard right after both tries: the webcam records it for the teacher.
  if (test === 'sound' && !state.adultMode) return { correct: false, heard, by: 'video' };

  // The app heard words, but they were wrong: that's the app's answer.
  if (heardWords && !state.adultMode) return { correct: false, heard, by: 'app' };

  // The app never heard an answer it could read.
  setFeedback('');
  const reason = state.adultMode ? "The app can't listen on this computer." : `The app couldn't hear the ${test} clearly.`;
  const decision = await teacherCheck(letter, test, reason);
  return { correct: decision === 'correct', heard, by: decision === 'later' ? 'review' : 'teacher' };
}

// Saves the result. Resolves with { stars, chart } from the server, or null if saving failed.
async function saveAttempt(record) {
  try {
    const res = await fetch('api/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...state.student, ...record }),
    });
    return res.ok ? await res.json() : null;
  } catch (err) {
    console.warn('Could not save result', err);
    return null;
  }
}

function showStarCount() {
  $('star-count').textContent = `⭐ ${state.stars}`;
}

function cheerOwl() {
  const owl = $('owl');
  owl.classList.remove('cheer');
  void owl.offsetWidth;
  owl.classList.add('cheer');
}

// A right answer: the star pops out of the letter and flies to the counter.
// No spoken praise, so the next letter comes quickly.
async function earnStar(letter, test) {
  state.stars++;
  state.starsToday++;
  (state.chart[letter] ||= { name: false, sound: false })[test] = true;
  if (!state.newChart.includes(letter)) state.newChart.push(letter);
  $('test-pill').className = 'step done';
  $('letter-card').classList.add('pass');
  setFeedback('⭐ You earned a star! ⭐', 'yay');
  cheerOwl();
  confetti(80);
  chime();
  await flyStar($('letter-card'), $('star-count'));
  showStarCount();
  await wait(300);
}

// Test one letter. Returns 'passed', 'video' (the sound went to the teacher on
// video), 'review' (teacher will listen later) or 'missed' (needs practice).
async function testLetter(letter, test, retry) {
  show('letter');
  $('letter-upper').textContent = letter;
  $('letter-lower').textContent = letter.toLowerCase();
  const card = $('letter-card');
  card.classList.remove('pass');
  card.style.setProperty('--letter-color', letterColor(letter));
  // Restart the pop-in animation for each new letter.
  card.style.animation = 'none';
  void card.offsetWidth;
  card.style.animation = '';

  const answer = await askLetter(letter, test);
  let outcome;
  if (answer.correct) {
    await earnStar(letter, test);
    outcome = 'passed';
  } else if (answer.by === 'video' || (test === 'sound' && answer.by === 'teacher')) {
    // The student says the sound on camera for the teacher, then goes on.
    // ('teacher' here means a teacher already marked it wrong, so no review is needed.)
    $('test-pill').className = 'step missed';
    await recordVideo(letter, 'sound');
    if (answer.by === 'video') answer.by = 'review';
    outcome = 'video';
  } else if (answer.by === 'review') {
    // It may have been right, so don't teach as if it was wrong.
    $('test-pill').className = 'step missed';
    setFeedback('Your teacher will listen to this one later.', 'oops');
    await wait(900);
    outcome = 'review';
  } else {
    $('test-pill').className = 'step missed';
    $('prompt').textContent = TESTS.name.wrong(letter);
    setFeedback("That's OK! We'll practice it.", 'oops');
    await speak(`${TESTS.name.wrong(letter)} Let's practice it together!`);
    outcome = 'missed';
  }

  const saved = await saveAttempt({ letter, test, retry, correct: answer.correct, by: answer.by, heard: answer.heard });
  if (saved) {
    // The server's count is the real one (it includes other sessions).
    state.stars = saved.stars;
    state.chart = saved.chart;
    showStarCount();
  }
  return outcome;
}

const VIDEO_TEXT = {
  // After a missed letter name: record the name, then practice.
  missed: {
    prompt: (l) => `Press the button, then say the letter name "${l}".`,
    say: (l) => `Let's record you saying the letter ${l} for your teacher.`,
    button: '🔴 Start recording',
    saved: 'Saved for your teacher! ⭐',
    failed: "That didn't save, but that's OK. Let's practice!",
    noCamera: "The camera isn't working, so let's go practice!",
  },
  // After the sound wasn't heard right twice: record the sound, then the next letter.
  sound: {
    prompt: (l) => `Press the button, then say the sound ${l} makes, nice and loud!`,
    say: (l) => `Let's record you saying the ${l} sound for your teacher.`,
    button: '🔴 Record my sound',
    saved: 'Sent to your teacher! ⭐ On to the next letter!',
    failed: "That didn't save, but that's OK. On to the next letter!",
    noCamera: "The camera isn't working. On to the next letter!",
  },
};

// Record the student on the webcam and save it for the teacher.
// `kind` is 'missed' or 'sound' (see VIDEO_TEXT).
async function recordVideo(letter, kind = 'missed') {
  const text = VIDEO_TEXT[kind];
  show('record');
  $('record-prompt').textContent = text.prompt(letter);
  $('record-status').textContent = '';
  $('countdown').textContent = '';
  const button = $('record-btn');
  button.textContent = text.button;
  button.hidden = false;
  // Enabled once the camera is on.
  button.disabled = true;

  let stream;
  try {
    stream = await openCamera();
  } catch (err) {
    console.warn('Camera unavailable', err);
    $('record-status').textContent = text.noCamera;
    button.hidden = true;
    await wait(2500);
    return;
  }
  $('camera').srcObject = stream;
  button.disabled = false;
  speak(text.say(letter));
  await nextClick(button);
  button.disabled = true;

  const clip = await recordClip(stream, RECORD_SECONDS, (tick) => { $('countdown').textContent = tick; });
  stopCamera(stream);
  $('camera').srcObject = null;

  $('record-status').textContent = 'Saving…';
  try {
    await uploadClip(state.student, letter, kind, clip);
    $('record-status').textContent = text.saved;
    confetti(30);
  } catch (err) {
    console.warn('Upload failed', err);
    $('record-status').textContent = text.failed;
  }
  button.hidden = true;
  await wait(2000);
}

async function practice(letter) {
  show('practice');
  $('practice-letter').textContent = letter + letter.toLowerCase();
  for (const [i, activity] of ACTIVITIES.entries()) {
    $('practice-step').textContent = `${i + 1} of ${ACTIVITIES.length}`;
    await activity($('activity'), letter, { student: state.student });
  }
}

// Run the name test or the sound test over a random set of letters.
async function run(test) {
  const count = Number($('letter-count').value);
  state.test = test;
  state.practiced = [];
  state.passed = 0;
  state.starsToday = 0;
  state.newChart = [];
  const letters = shuffle(ALPHABET).slice(0, count);
  $('who').textContent = `👋 ${state.student.first}`;
  $('test-pill').textContent = TESTS[test].pill;
  showStarCount();
  for (const [i, letter] of letters.entries()) {
    $('progress-fill').style.width = `${(i / letters.length) * 100}%`;
    const outcome = await testLetter(letter, test, false);
    if (outcome === 'passed') state.passed++;
    // A missed letter name gets a video, practice, and one more try.
    if (outcome !== 'missed') continue;
    state.practiced.push(letter);
    await recordVideo(letter, 'missed');
    await practice(letter);
    if ((await testLetter(letter, test, true)) === 'passed') state.passed++;
  }
  $('progress-fill').style.width = '100%';
  showDone(letters.length);
}

function showDone(total) {
  show('done');
  const { first } = state.student;
  const n = state.starsToday;
  $('done-title').textContent = `🎉 ${TESTS[state.test].title} done!`;
  $('done-summary').textContent = `${TESTS[state.test].done(state.passed, total)}, ${first}!`;
  $('done-stars').textContent = n
    ? `You earned ${n} ${n === 1 ? 'star' : 'stars'} today! You have ${state.stars} stars in all.`
    : `You have ${state.stars} stars. Let's practice and earn more!`;
  // After the name test, the sound test is next.
  const next = state.test === 'name' ? 'sound' : 'name';
  $('next-test-btn').textContent = state.test === 'name' ? 'Next: Sound test ▶' : 'Name test 🔤';
  $('next-test-btn').dataset.test = next;
  $('again-btn').textContent = `${TESTS[state.test].title} again ↻`;
  renderStarChart($('done-chart'), state.chart, state.newChart);
  confetti(n ? 120 : 60);
  if (n) chime();
  speak(n ? `Great job, ${first}! You earned ${n} ${n === 1 ? 'star' : 'stars'}!` : `Great job, ${first}!`);
}

async function showWelcome() {
  const { first } = state.student;
  let returning = false;
  try {
    const params = new URLSearchParams(state.student);
    const res = await fetch(`api/stars?${params}`);
    ({ stars: state.stars, chart: state.chart, returning } = await res.json());
  } catch {
    state.stars = 0;
    state.chart = {};
  }
  show('welcome');
  $('welcome-hello').textContent = returning ? `Welcome back, ${first}!` : `Hi, ${first}! Nice to meet you!`;
  $('welcome-stars').textContent = state.stars
    ? `You have ${state.stars} ${state.stars === 1 ? 'star' : 'stars'}. Pick a test to earn more!`
    : 'Start with the Name test, then do the Sound test!';
  renderStarChart($('welcome-chart'), state.chart);
  speak(returning ? `Welcome back, ${first}! Pick a test.` : `Hi, ${first}! Start with the name test.`);
}

// "Letter Sounds" title with each letter in a different crayon color.
$('title').replaceChildren(...[...'Letter Sounds'].map((ch, i) => {
  const span = document.createElement('span');
  if (ch === ' ') span.className = 'space';
  else {
    span.textContent = ch;
    span.style.color = `var(--c${i % 6})`;
    span.style.animationDelay = `${i * 0.08}s`;
  }
  span.setAttribute('aria-hidden', 'true');
  return span;
}));

const tidy = (value) => value.replace(/\s+/g, ' ').trim();

$('start-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const first = tidy($('first-name').value);
  const last = tidy($('last-name').value);
  const grade = $('grade').value;
  const testDate = $('test-date').value;
  if (!first || !last || !grade || !testDate) return;
  state.student = { first, last, grade, testDate };
  showWelcome();
});

$('name-test-btn').addEventListener('click', () => run('name'));
$('sound-test-btn').addEventListener('click', () => run('sound'));
$('next-test-btn').addEventListener('click', (e) => run(e.currentTarget.dataset.test));
$('again-btn').addEventListener('click', () => run(state.test));

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
$('test-date').value = today();

$('switch-btn').addEventListener('click', () => {
  $('first-name').value = '';
  $('last-name').value = '';
  $('grade').value = '';
  state.student = null;
  show('start');
  if (musicWanted()) {
    startMusic();
    showMusicButton();
  }
});

show('start');
startMusicOnFirstTouch();
