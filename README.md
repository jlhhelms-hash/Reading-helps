# Letter Sounds

A web app that checks whether elementary students know each letter's **name** and **sound**.

1. The first screen asks for the student's **first name, last name, grade and date of test** (the date starts as today). Ollie the Owl then welcomes them and shows their **star chart**. A bouncy intro tune plays on these screens. It starts at the first tap, because browsers don't allow sound before that. The 🎵 button turns it off (the app remembers), and it fades out when a test begins.
2. The student picks a test: **🔤 Name test** or **🔊 Sound test**. Ollie suggests doing the Name test first, and when it ends the main button is **Next: Sound test**.
3. Each test shows random letters one at a time (5, 10 or all 26), each big and small (like **Bb**) in its own bright color. The student taps **🎤 Say it** (it pops and twinkles) and answers. The app listens for up to 5 seconds. A right answer sends a ⭐ flying to their star count, and the next letter comes right away.

**Name test** ("What is the name of this letter?")
- A first try plus up to 2 retries.
- If the app can't make out any words, the teacher sees **✓ Correct**, **✗ Not correct**, or **Continue (teacher will listen later)**. "Later" marks the answer **Teacher listening required**.
- A wrong name: the app shows the right name, records a short video of the student saying the letter name, runs five practice activities, then gives one more try:
  - **Listen and say it:** hear the letter and its sound, with pictures.
  - **Say it!:** film yourself saying the letter and its sound, hear it played back, and save it for the teacher.
  - **Find the letter:** tap every big and small copy among look-alike letters.
  - **Pick the picture:** choose the picture that starts with the letter's sound.
  - **Trace it:** trace the big and small letter.

**Sound test** ("What is the sound of this letter?")
- Two tries.
- If the sound still isn't heard or isn't right, the **webcam opens**. The student taps **🔴 Record my sound** and says the sound (a 3-2-1 countdown, then 5 seconds of recording). The video goes to the teacher and the student goes **straight to the next letter**. That sound is marked **Teacher listening required** until the teacher watches the video and marks it.

At the end of each test, students see how many letters they knew and how many stars they earned.

**Stars:** every right answer earns a star, so the total keeps growing. The star chart shows two stars for each letter: the first for its name and the second for its sound. A letter's stars stay on the chart once earned.

The **teacher page** (`/teacher`, protected by a PIN) lists students by last name. Each student's page shows:
- their grade, last test date and star total
- two A–Z grids, **Letter names** and **Letter sounds**, colored by result: known first time, known after practice, needs help, teacher listening required, or not tried yet
- their videos, each marked **missed**, **sound check** or **practice**
- every answer, with what the app heard

**Teacher listening required:** answers the app couldn't hear show up in a 🎧 list on the student's page, next to the video for that letter. Watch it, then click **✓ Correct** or **✗ Not correct**. The star is added when you mark it correct. Until then, the answer shows as **Listen** in Excel and in the **Teacher listening required** column.

**Excel export:** On the teacher page, **⬇ Export class to Excel** downloads one workbook for the whole class, sorted by last name. Each student's page has its own **⬇ Export to Excel** button, which downloads a file named like `Rodriguez, Maya - Letter Sounds.xlsx`. Each workbook has four sheets:

- **Summary:** last name, first name, grade, last test date, stars, names known, names needing help, sounds known, sounds needing help, teacher listening required, videos.
- **Names A-Z** and **Sounds A-Z:** one row per student (with grade), with each letter marked Known (green), Practiced (yellow), Help (red) or Listen (blue).
- **All answers:** every answer, with grade, test date, time, test (Name or Sound), letter, whether it was right, who checked it (App, Teacher, or Teacher listening required), and what the app heard.

## Run it on your computer

You need [Node.js](https://nodejs.org) version 20 or newer. There's nothing else to install.

```bash
node server.js
```

Then open:

- Students: http://localhost:3000
- Teacher: http://localhost:3000/teacher (the PIN is `1234` unless you change it)

To pick your own PIN:

```bash
TEACHER_PIN=8642 node server.js
```

Use **Chrome**, **Edge** or **Safari**. The first time, the browser asks to use the microphone and camera. Click **Allow**.

## Good to know

- **Speech checking is a helper, not a judge.** Browsers turn speech into words, so a bare sound like "/b/" can come out as "buh," "bah" or "but." The app accepts the usual spellings for each sound (see `public/letters.js`). The teacher page shows what it heard so you can spot letters it gets wrong. In browsers without speech recognition (such as Firefox), or if the microphone is blocked, a grown-up gets **✓ Yes / ✗ Not yet** buttons instead.
- **Short sounds are the hardest.** A sound like /k/ often comes back from the browser as no words at all. The app watches the microphone volume, so if it heard a voice but no words it tells the student "I heard you, but I couldn't tell what you said" and counts the try. After the last try, the teacher can mark it, or it is flagged for the teacher to listen to later.
- **The teacher buttons are on the student's screen,** so a student working alone could tap ✓ Correct. Anything they tap shows as "(teacher)" on the teacher page.
- **The app's voice** is the most natural, child-like voice the computer has, with a raised pitch. In **Microsoft Edge on Windows**, it uses "Ana," a real child's voice, so Edge sounds the most kid-like.
- **Speech recognition in Chrome needs the internet.** Chrome sends the audio to Google to turn it into words.
- **Camera and microphone only work on `localhost` or an `https://` address.** Running on one classroom computer works as-is. Letting student devices across the school network connect needs HTTPS hosting.
- **Student videos are private data.** They are saved only on the computer running the app, in `data/students/<name>/videos/` (missed-name clips are named like `B-<time>.webm`, sound-test clips like `B-sound-<time>.webm`, practice clips like `B-practice-<time>.webm`). That folder is never uploaded to GitHub (see `.gitignore`). Check your school or district's rules for recording students before you use this with a class.
- Students are kept apart by first and last name, so they need to type their name the same way each time to keep their stars.

## For developers

```bash
npm test        # letter-matching and server tests
```

| File | What it does |
| --- | --- |
| `server.js` | Small web server with no packages to install: saves results and videos, runs the teacher login |
| `public/letters.js` | Letter data and the name/sound matching rules |
| `public/app.js` | Student flow: pick the name or sound test, listen, stars, videos, practice |
| `public/activities.js` | The five practice activities |
| `public/recorder.js` | Camera recording and video upload |
| `public/music.js` | The intro tune, made with the Web Audio API (no music file) |
| `public/fun.js` | Letter colors, confetti, the star chime, flying stars and the star chart |
| `xlsx.js` | Small Excel file writer used by the teacher export |
| `public/teacher.html`, `public/teacher.js` | Teacher page |
| `data/` | Student results and videos (created when the app runs, not saved to GitHub) |
