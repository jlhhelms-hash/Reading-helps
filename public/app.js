// Student app: show a letter, listen for its name and sound, and when the
// student misses, record a short video for the teacher and run practice.

import { ALPHABET, LETTERS, heardLetterName, heardLetterSound, shuffle } from './letters.js';
import { ACTIVITIES, speak } from './activities.js';
import { openCamera, recordClip, stopCamera, uploadClip } from './recorder.js';
import { isPlaying, musicWanted, setMusicWanted, startMusic, stopMusic } from './music.js';
import { chime, confetti, flyStar, letterColor, popTwinkle, renderStarChart } from './fun.js';

const TRIES = 3; // the first try plus up to 2 retries
const LISTEN_MS = 5000; // longest the app listens on one try
const QUIET_MS = 700; // stop listening this long after the student stops talking
const RECORD_SECONDS = 5;
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const $ = (id) => document.getElementById(id);
// student is { first, last, grade, testDate }. stars is the student's star total;
// chart marks which letters' name and sound they have gotten right.
const state = {
  student: null, adultMode: !Recognition, practiced: [], passed: 0,
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

const STEPS = {
  name: {
    question: 'What is the name of this letter?',
    check: heardLetterName,
    teacher: (letter) => `did they say the letter name "${letter}" correctly?`,
    wrong: (letter) => `This letter is ${letter}.`,
  },
  sound: {
    question: 'What is the sound of this letter?',
    check: heardLetterSound,
    teacher: (letter) => `did they say the ${letter} sound correctly?`,
    wrong: (letter) => {
      const [word] = LETTERS[letter].words[0];
      return LETTERS[letter].soundAtEnd ? `${letter} makes the sound at the end of ${word}.` : `${letter} makes the sound at the start of ${word}.`;
    },
  },
};

// When the app can't hear an answer, the teacher can mark it right or wrong now,
// or the student continues and it is flagged "Teacher listening required".
// Resolves with 'correct', 'wrong' or 'later'.
async function teacherCheck(letter, step, reason) {
  $('say-btn').hidden = true;
  $('teacher-check').hidden = false;
  $('teacher-reason').textContent = reason;
  $('teacher-question').textContent = `Teacher: ${STEPS[step].teacher(letter)}`;
  const decision = await Promise.race([
    nextClick($('teacher-yes')).then(() => 'correct'),
    nextClick($('teacher-no')).then(() => 'wrong'),
    nextClick($('teacher-later')).then(() => 'later'),
  ]);
  $('teacher-check').hidden = true;
  $('say-btn').hidden = false;
  return decision;
}

// One question: the letter's name, or its sound. The student taps "Say it" and
// answers: a first try plus up to 2 retries. If the app never hears an answer it
// can read, the teacher decides. Returns { correct, heard, by } where `by` is
// 'app', 'teacher', or 'review' (teacher listening required).
async function askStep(letter, step) {
  const { question, check } = STEPS[step];
  $(`step-${step}`).classList.add('active');
  $('prompt').textContent = question;
  setFeedback(step === 'sound' ? 'Tap “Say it”, then make the sound nice and loud.' : 'Tap “Say it”, then answer.');
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

  // The app heard words, but they were wrong: that's the app's answer.
  if (heardWords && !state.adultMode) return { correct: false, heard: heardLog.join(' / '), by: 'app' };

  // The app never heard an answer it could read.
  setFeedback('');
  const reason = state.adultMode ? "The app can't listen on this computer." : `The app couldn't hear the ${step} clearly.`;
  const decision = await teacherCheck(letter, step, reason);
  return {
    correct: decision === 'correct',
    heard: heardLog.join(' / '),
    by: decision === 'later' ? 'review' : 'teacher',
  };
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
// No spoken praise, so the next question comes quickly.
async function earnStar(letter, step) {
  state.stars++;
  state.starsToday++;
  (state.chart[letter] ||= { name: false, sound: false })[step] = true;
  if (!state.newChart.includes(letter)) state.newChart.push(letter);
  $(`step-${step}`).className = 'step done';
  setFeedback('⭐ You earned a star! ⭐', 'yay');
  cheerOwl();
  confetti(step === 'sound' ? 100 : 60);
  chime();
  await flyStar($('letter-card'), $('star-count'));
  showStarCount();
}

async function missStep(letter, step, by) {
  $(`step-${step}`).className = 'step missed';
  if (by === 'review') {
    // It may have been right, so don't teach as if it was wrong.
    setFeedback('Your teacher will listen to this one later.', 'oops');
    await wait(900);
    return;
  }
  $('prompt').textContent = STEPS[step].wrong(letter);
  setFeedback("That's OK! We'll practice it.", 'oops');
  await speak(STEPS[step].wrong(letter));
}

// Test one letter: first its name, then its sound, with a star for each right answer.
// Returns true when both were right.
async function testLetter(letter, retry) {
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
  ['name', 'sound'].forEach((s) => { $(`step-${s}`).className = 'step'; });

  const name = await askStep(letter, 'name');
  if (name.correct) await earnStar(letter, 'name');
  else await missStep(letter, 'name', name.by);

  const sound = await askStep(letter, 'sound');
  if (sound.correct) await earnStar(letter, 'sound');
  else await missStep(letter, 'sound', sound.by);

  const saved = await saveAttempt({
    letter, retry, nameCorrect: name.correct, soundCorrect: sound.correct,
    nameBy: name.by, soundBy: sound.by,
    heard: [name.heard && `name: ${name.heard}`, sound.heard && `sound: ${sound.heard}`].filter(Boolean).join(' · '),
  });
  if (saved) {
    // The server's count is the real one (it includes other sessions).
    state.stars = saved.stars;
    state.chart = saved.chart;
    showStarCount();
  }

  const passed = name.correct && sound.correct;
  if (passed) {
    card.classList.add('pass');
    await wait(500);
  } else {
    $('prompt').textContent = `Let's practice ${letter} together!`;
    setFeedback('');
    await speak(`Let's practice ${letter} together!`);
  }
  return passed;
}

// Record the student saying the letter and sound, and save it for the teacher.
async function recordVideo(letter) {
  show('record');
  $('record-prompt').textContent = `Press the button, then say "${letter}" and the sound ${letter} makes.`;
  $('record-status').textContent = '';
  $('countdown').textContent = '';
  const button = $('record-btn');
  button.hidden = false;
  button.disabled = false;

  let stream;
  try {
    stream = await openCamera();
  } catch (err) {
    console.warn('Camera unavailable', err);
    $('record-status').textContent = "The camera isn't working, so let's go practice!";
    button.hidden = true;
    await wait(2500);
    return;
  }
  $('camera').srcObject = stream;
  speak(`Let's record you saying ${letter} and its sound for your teacher.`);
  await nextClick(button);
  button.disabled = true;

  const clip = await recordClip(stream, RECORD_SECONDS, (text) => { $('countdown').textContent = text; });
  stopCamera(stream);
  $('camera').srcObject = null;

  $('record-status').textContent = 'Saving…';
  try {
    await uploadClip(state.student, letter, 'missed', clip);
    $('record-status').textContent = 'Saved for your teacher! ⭐';
  } catch (err) {
    console.warn('Upload failed', err);
    $('record-status').textContent = "That didn't save, but that's OK. Let's practice!";
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

async function run(count) {
  state.practiced = [];
  state.passed = 0;
  state.starsToday = 0;
  state.newChart = [];
  const letters = shuffle(ALPHABET).slice(0, count);
  $('who').textContent = `👋 ${state.student.first}`;
  showStarCount();
  for (const [i, letter] of letters.entries()) {
    $('progress-fill').style.width = `${(i / letters.length) * 100}%`;
    if (await testLetter(letter, false)) {
      state.passed++;
      continue;
    }
    state.practiced.push(letter);
    await recordVideo(letter);
    await practice(letter);
    // One more try after practice, then move on either way.
    if (await testLetter(letter, true)) state.passed++;
  }
  $('progress-fill').style.width = '100%';
  showDone(letters.length);
}

function showDone(total) {
  show('done');
  const { first } = state.student;
  const n = state.starsToday;
  $('done-summary').textContent = `You knew ${state.passed} of ${total} letters, ${first}!`;
  $('done-stars').textContent = n
    ? `You earned ${n} ${n === 1 ? 'star' : 'stars'} today! You have ${state.stars} stars in all.`
    : `You have ${state.stars} stars. Let's practice and earn more!`;
  renderStarChart($('done-chart'), state.chart, state.newChart);
  confetti(n ? 120 : 60);
  if (n) chime();
  speak(n ? `Great job, ${first}! You earned ${n} ${n === 1 ? 'star' : 'stars'} today!` : `Great job, ${first}!`);
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
    ? `You have ${state.stars} ${state.stars === 1 ? 'star' : 'stars'}. Let's earn more!`
    : 'Say the name and the sound of each letter to earn stars!';
  renderStarChart($('welcome-chart'), state.chart);
  speak(returning ? `Welcome back, ${first}!` : `Hi, ${first}! Let's earn some stars!`);
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

$('begin-btn').addEventListener('click', () => run(Number($('letter-count').value)));
$('again-btn').addEventListener('click', () => run(Number($('letter-count').value)));
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
$('test-date').value = today();

$('switch-btn').addEventListener('click', () => {
  if (musicWanted()) startMusic();
  $('first-name').value = '';
  $('last-name').value = '';
  $('grade').value = '';
  state.student = null;
  show('start');
showMusicButton();
startMusicOnFirstTouch();
});

show('start');
showMusicButton();
startMusicOnFirstTouch();
