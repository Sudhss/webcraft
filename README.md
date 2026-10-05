# Webcraft

Web development taught from the inside out: how browsers, servers and GPUs
really behave, how to build on them, and how to make the result look
designed. It's written for people who already think in `n` and cost per
frame, and it runs one short beat at a time instead of as walls of text.

52 chapters in nine parts: how the web works, HTML/CSS/JS, tools, frameworks,
backend, motion and 3D, design, case studies and reference. Every chapter goes
up to three levels deep: **use** it, **understand** what runs underneath, and
**rebuild** a small version in the page.

## Run it

It's a static site with no build step and no dependencies.

```bash
npm run serve        # python -m http.server 5900
```

Then open http://localhost:5900. Any static file server works. The page loads
its chapters as ES modules, so it has to be served over HTTP; opening
`index.html` from disk won't work.

## What's in the page

- **The reader.** Press Space (or Continue) for the next beat. Beat types
  include predict-the-output questions, quizzes, live playgrounds (HTML, JS,
  React, three.js, GLSL) and interactive visuals. There are 13 visuals, among
  them an event-loop stepper, a flexbox lab, a git graph and a page-load
  waterfall.
- **Review.** Questions you get wrong come back after 1, 3, 7 and 21 days.
- **Search** (`/`) and a **glossary** of every term the course defines.
- Progress, answers and playground edits are kept in `localStorage`. There's
  no account and no server.

## Layout

```
index.html          shell
css/site.css        all styles, light and dark
js/main.js          router, home, chapter reader, review, glossary, search
js/beats.js         one renderer per beat type
js/playground.js    sandboxed live editors
js/viz/             the interactive visuals, loaded on demand
js/store.js         progress in localStorage
chapters/index.js   the course map
chapters/NN-*.js    one module per chapter
CONTENT.md          how a chapter is written
tests/validate.mjs  checks every chapter against CONTENT.md
```

## Writing a chapter

Read [CONTENT.md](CONTENT.md): it covers the reader, the voice, every beat
type and its limits. Add the chapter to `chapters/index.js`, then run:

```bash
npm test             # node tests/validate.mjs
```

A chapter ships only when it passes with no warnings.
