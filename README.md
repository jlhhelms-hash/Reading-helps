# Letter Sounds

A web app that checks whether elementary students know each letter's **name** and **sound**.

1. The app shows a letter (big and small, like **Bb**).
2. The student taps the microphone and says the letter's name, then taps again and says its sound.
3. If both are right, the student moves on to the next random letter.
4. If either is wrong, the app records a short video (5 seconds) of the student saying the letter and its sound. The video is saved under the student's name for the teacher.
5. The student then does four practice activities for that letter:
   - **Listen and say it:** hear the letter and its sound, with pictures.
   - **Find the letter:** tap every big and small copy of the letter among look-alike letters.
   - **Pick the picture:** choose the picture that starts with the letter's sound.
   - **Trace it:** trace the big and small letter with a finger or mouse.
6. After practice, the student tries the letter one more time, then moves on.

The **teacher page** (`/teacher`, protected by a PIN) shows each student's letters in color (passed, passed after practice, needs help, not tried yet), their videos, and what the app heard on each try.

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
- **Speech recognition in Chrome needs the internet.** Chrome sends the audio to Google to turn it into words.
- **Camera and microphone only work on `localhost` or an `https://` address.** Running on one classroom computer works as-is. Letting student devices across the school network connect needs HTTPS hosting.
- **Student videos are private data.** They are saved only on the computer running the app, in `data/students/<name>/videos/`. That folder is never uploaded to GitHub (see `.gitignore`). Check your school or district's rules for recording students before you use this with a class.
- Students are kept apart by name, so two students named "Sam" share a folder. Use a last initial, like "Sam P."

## For developers

```bash
npm test        # letter-matching and server tests
```

| File | What it does |
| --- | --- |
| `server.js` | Small web server with no packages to install: saves results and videos, runs the teacher login |
| `public/letters.js` | Letter data and the name/sound matching rules |
| `public/app.js` | Student flow: test, record, practice, retry |
| `public/activities.js` | The four practice activities |
| `public/teacher.html`, `public/teacher.js` | Teacher page |
| `data/` | Student results and videos (created when the app runs, not saved to GitHub) |
