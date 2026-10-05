// A short, bouncy intro tune played on the start and welcome screens.
// It is made with the Web Audio API (no music file), loops, and fades out
// before the letter test so it doesn't get in the way of the microphone.

const TEMPO = 132; // beats per minute
const BEAT = 60 / TEMPO;
const NOTE = { B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5,
  G2: 98, A2: 110, C3: 130.81, D3: 146.83, F2: 87.31, E3: 164.81 };

// [note, beats]; null is a rest. Four bars of 4 beats.
const MELODY = [
  ['E5', 0.5], ['G5', 0.5], ['A5', 0.5], ['G5', 0.5], ['E5', 0.5], ['C5', 0.5], ['D5', 1],
  ['E5', 0.5], ['G5', 0.5], ['A5', 0.5], ['C6', 0.5], ['B5', 0.5], ['A5', 0.5], ['G5', 1],
  ['A5', 0.5], ['G5', 0.5], ['F5', 0.5], ['E5', 0.5], ['D5', 0.5], ['E5', 0.5], ['F5', 0.5], ['A5', 0.5],
  ['G5', 0.5], ['E5', 0.5], ['D5', 0.5], ['B4', 0.5], ['C5', 1.5], [null, 0.5],
];
const BASS = ['C3', 'G2', 'C3', 'G2', 'F2', 'C3', 'F2', 'C3', 'D3', 'A2', 'F2', 'A2', 'G2', 'D3', 'C3', 'C3'];
const LOOP_BEATS = 16;

const STORAGE_KEY = 'letterSoundsMusic';

let ctx = null;
let master = null;
let timer = null;
let loopStart = 0;
let nextLoop = 0;

export function musicWanted() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setMusicWanted(on) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Not saved; that's fine.
  }
}

export function isPlaying() {
  return Boolean(timer);
}

function tone(type, freq, at, length, volume, filterHz) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  let out = osc.connect(gain);
  if (filterHz) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterHz;
    out = out.connect(filter);
  }
  out.connect(master);
  osc.start(at);
  osc.stop(at + length + 0.05);
}

function kick(at) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(150, at);
  osc.frequency.exponentialRampToValueAtTime(45, at + 0.12);
  gain.gain.setValueAtTime(0.5, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
  osc.connect(gain).connect(master);
  osc.start(at);
  osc.stop(at + 0.2);
}

let noise = null;
function hat(at, volume) {
  if (!noise) {
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 7000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
  src.connect(filter).connect(gain).connect(master);
  src.start(at);
}

function scheduleLoop(start) {
  let t = start;
  for (const [note, beats] of MELODY) {
    if (note) tone('square', NOTE[note], t, beats * BEAT * 0.9, 0.12, 2600);
    t += beats * BEAT;
  }
  BASS.forEach((note, i) => tone('triangle', NOTE[note], start + i * BEAT, BEAT * 0.8, 0.3));
  for (let i = 0; i < LOOP_BEATS; i++) {
    const at = start + i * BEAT;
    if (i % 2 === 0) kick(at);
    hat(at, 0.06);
    hat(at + BEAT / 2, 0.03);
  }
}

export function startMusic() {
  if (timer) return;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();
    master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.4);
    master.connect(ctx.destination);
    loopStart = ctx.currentTime + 0.1;
    nextLoop = loopStart;
    // Schedule each loop a little before it is due.
    const tick = () => {
      while (nextLoop < ctx.currentTime + 0.5) {
        scheduleLoop(nextLoop);
        nextLoop += LOOP_BEATS * BEAT;
      }
    };
    tick();
    timer = setInterval(tick, 200);
  } catch {
    timer = null;
  }
}

export function stopMusic(fadeSeconds = 0.6) {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  const old = master;
  try {
    old.gain.cancelScheduledValues(ctx.currentTime);
    old.gain.setValueAtTime(old.gain.value || 0.5, ctx.currentTime);
    old.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + fadeSeconds);
    setTimeout(() => old.disconnect(), fadeSeconds * 1000 + 100);
  } catch {
    // Already gone.
  }
}
