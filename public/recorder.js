// Camera recording shared by the "missed letter" video and the practice "Say it" step.

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function openCamera() {
  return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
}

export function stopCamera(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

function pickMimeType() {
  const options = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return options.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
}

// Counts down 3-2-1, records for `seconds`, and resolves with the video Blob.
// `onTick` gets the text to show ("3", "🔴 Say it now! 4", "").
export async function recordClip(stream, seconds, onTick) {
  for (const n of [3, 2, 1]) {
    onTick(String(n));
    await wait(800);
  }
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => { recorder.onstop = r; });
  recorder.start();
  for (let s = seconds; s > 0; s--) {
    onTick(`🔴 Say it now! ${s}`);
    await wait(1000);
  }
  recorder.stop();
  await stopped;
  onTick('');
  const type = (recorder.mimeType || mimeType || 'video/webm').split(';')[0];
  return new Blob(chunks, { type });
}

// `student` is { first, last }. `kind` is "missed" (after a wrong answer) or "practice" (from the Say it step).
export async function uploadClip(student, letter, kind, blob) {
  const params = new URLSearchParams({ ...student, letter, kind });
  const res = await fetch(`api/recordings?${params}`, {
    method: 'POST', headers: { 'Content-Type': blob.type }, body: blob,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
