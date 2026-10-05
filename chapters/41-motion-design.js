export default {
  id: "motion-design",
  n: 41,
  part: "G",
  title: "Motion and interaction design",
  hook: "Motion is information or it's noise. The timing limits, gestures and loading states that decide which.",
  minutes: 60,
  levels: ["use", "understand"],
  sections: [
    {
      title: "What motion is for",
      beats: [
        { t: "say", x: "Every animation costs the user time. It earns that time by doing one of four jobs: **orientation** (where am I), **continuity** (this is the same thing, moved), **feedback** (I heard you) or **attention** (look here). Motion doing none of them is noise." },
        {
          t: "table",
          head: ["Job", "Question it answers", "Example", "Without it"],
          rows: [
            ["Orientation", "Where did I go, how do I get back", "A pushed screen enters from the right; back sends it right again", "Every navigation is a teleport"],
            ["Continuity", "Is this the same object", "A thumbnail grows into the detail view", "The user re-finds the thing from scratch"],
            ["Feedback", "Did that register", "A button presses in on pointerdown", "Double clicks and double submits"],
            ["Attention", "What just changed", "A new row arrives with a brief tint", "The change happens in a corner, unseen"],
          ],
        },
        {
          t: "play",
          mode: "html",
          title: "continuity.html",
          html: `<div class="ui">
  <label><input type="radio" name="m" value="none"> instant</label>
  <label><input type="radio" name="m" value="fade"> fade</label>
  <label><input type="radio" name="m" value="grow" checked> grow from card</label>
  <label>open <input id="ms" type="range" min="100" max="1200" step="50" value="350"> <span id="msv"></span></label>
</div>
<div id="stage"><div id="grid"></div><div id="detail" hidden><h2></h2><p>Click to close.</p></div></div>`,
          css: `body { font: 14px system-ui; margin: 0; padding: 16px; }
.ui { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 12px; }
#stage { position: relative; max-width: 420px; }
#grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.card { height: 80px; border-radius: 10px; color: #fff; font-weight: 600; padding: 10px; cursor: pointer; }
#detail { position: absolute; inset: 0; border-radius: 10px; color: #fff; padding: 20px;
  transform-origin: 0 0; cursor: pointer; }
#detail h2 { margin: 0 0 8px; }`,
          js: `const stage = document.getElementById('stage'), grid = document.getElementById('grid');
const detail = document.getElementById('detail'), ms = document.getElementById('ms');
['Inbox', 'Drafts', 'Sent', 'Archive', 'Spam', 'Trash', 'Notes', 'Tasks', 'Files'].forEach((n, i) => {
  const c = document.createElement('div');
  c.className = 'card';
  c.textContent = n;
  c.style.background = \`hsl(\${i * 40} 50% 42%)\`;
  grid.append(c);
});
const mode = () => document.querySelector('input[name=m]:checked').value;
const label = () => (document.getElementById('msv').textContent = ms.value + ' ms');
ms.oninput = label; label();

// the transform that shrinks the full panel back onto a card
function onto(card) {
  const s = stage.getBoundingClientRect(), c = card.getBoundingClientRect();
  return \`translate(\${c.left - s.left}px, \${c.top - s.top}px) scale(\${c.width / s.width}, \${c.height / s.height})\`;
}

let from = null;
grid.onclick = (e) => {
  from = e.target.closest('.card');
  if (!from) return;
  detail.style.background = from.style.background;
  detail.querySelector('h2').textContent = from.textContent;
  detail.hidden = false;
  const d = +ms.value;
  if (mode() === 'fade') detail.animate([{ opacity: 0 }, { opacity: 1 }], { duration: d * 0.6 });
  if (mode() === 'grow') detail.animate([{ transform: onto(from) }, { transform: 'none' }],
    { duration: d, easing: 'cubic-bezier(.2, .8, .2, 1)' });
};

detail.onclick = async () => {
  const d = +ms.value * 0.8;
  let a;
  if (mode() === 'fade') a = detail.animate([{ opacity: 1 }, { opacity: 0 }], { duration: d * 0.6, fill: 'forwards' });
  if (mode() === 'grow') a = detail.animate([{ transform: 'none' }, { transform: onto(from) }],
    { duration: d, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });
  if (a) await a.finished;
  detail.hidden = true;
  a?.cancel();
};`,
          task: "Open and close a few cards in each mode. With instant, which card did you just leave? Then drag the slider to 1200 ms and feel orientation turn into waiting.",
        },
        { t: "say", h: "The instant test", x: "For each animation, ask: if this were instant, what would the user lose? If the honest answer is 'nothing, it would just look plainer', it's decoration. Decoration is allowed, but it pays rent on every single view." },
        {
          t: "quiz",
          q: "Which of these is noise?",
          options: ["A sheet sliding up from the edge it's attached to", "A deleted row collapsing so the rows below close the gap", "Every section of a docs page fading up as it scrolls into view", "A toggle knob sliding to its new side"],
          answer: 2,
          why: "The others carry information: where the sheet lives, where the row went, which state the switch is in. Fade-up-on-scroll says nothing and delays text the reader scrolled to read, on every section, every visit.",
        },
        {
          t: "pitfall",
          h: "Delightful once, a tax forever",
          x: "A 600 ms flourish on a dialog charms the first time and grates the 400th. Scale motion down with frequency: things used hundreds of times a day (menus, command palettes, tabs) want almost none. A once-a-month onboarding can afford a show.",
        },
        { t: "say", h: "Attention is the expensive job", x: "Peripheral vision is far better at catching motion than detail, so movement is the strongest attention signal a screen has. Spend it like one. If two things move at once, neither of them is the point." },
      ],
    },
    {
      title: "Fast enough: the response-time limits",
      beats: [
        { t: "say", h: "Three numbers from 1968", x: "Robert Miller's 1968 paper on response time, Card, Robertson and Mackinlay's 1991 work, and Jakob Nielsen's *Usability Engineering* (1993) give the limits every UI still runs on: about 0.1 s, 1 s and 10 s." },
        {
          t: "table",
          head: ["Limit", "What it means", "Design response"],
          rows: [
            ["~0.1 s", "Feels instantaneous: showing the result is feedback enough", "Just show the result. No spinner, nothing to cover"],
            ["~1 s", "Flow of thought survives, but the delay is noticed", "Prove you heard: pressed state, dimmed content, a quiet busy hint"],
            ["~10 s", "The limit for keeping attention on the task", "Percent-done progress, and an honest estimate"],
            ["> 10 s", "They will switch to something else", "Let them: run it in the background and notify when done"],
          ],
          caption: "The limits as Nielsen states them. Source chain: Miller 1968, Card et al. 1991, Nielsen 1993.",
        },
        {
          t: "predict",
          lang: "js",
          src: "button.onclick = async () => {\n  await save();              // ~600 ms\n  button.textContent = 'Saved';\n};",
          q: "The save takes 600 ms and the button shows nothing until it's done. What do users do?",
          options: ["Wait calmly: it's under the 1 s limit", "Click again, often submitting twice", "Nothing different from an instant save", "Reload the page"],
          answer: 1,
          why: "The 1 s limit keeps the train of thought only if people know the click landed. With nothing visible inside ~100 ms the click seems lost, so they repeat it. Acknowledge instantly; finish whenever.",
        },
        {
          t: "play",
          mode: "html",
          title: "latency.html",
          html: `<div class="ui">
  <label>added latency <input id="lag" type="range" min="0" max="300" step="5" value="0"></label>
  <b id="out">0 ms</b>
  <button id="btn">Click me</button>
</div>
<div id="pad"><div id="dot"></div><p>Drag anywhere in here</p></div>`,
          css: `body { font: 14px system-ui; margin: 0; padding: 16px; }
.ui { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
#btn { font: 600 14px system-ui; padding: 8px 14px; border-radius: 8px; border: 1px solid #8886;
  background: #fff; color: #111; }
#btn.on { background: #2563eb; color: #fff; }
#pad { position: relative; height: 260px; border-radius: 12px; background: #8881;
  touch-action: none; overflow: hidden; user-select: none; }
#pad p { position: absolute; left: 0; right: 0; bottom: 8px; text-align: center; color: #888; margin: 0; }
#dot { position: absolute; left: -22px; top: -22px; width: 44px; height: 44px; border-radius: 50%;
  background: #d49a3a; pointer-events: none; }`,
          js: `const pad = document.getElementById('pad'), dot = document.getElementById('dot');
const lag = document.getElementById('lag'), out = document.getElementById('out');
const btn = document.getElementById('btn');
let samples = [{ t: 0, x: 120, y: 120 }];
lag.oninput = () => (out.textContent = lag.value + ' ms');

function record(e) {
  const r = pad.getBoundingClientRect();
  samples.push({ t: performance.now(), x: e.clientX - r.left, y: e.clientY - r.top });
}
pad.onpointerdown = (e) => { pad.setPointerCapture(e.pointerId); record(e); };
pad.onpointermove = (e) => { if (pad.hasPointerCapture(e.pointerId)) record(e); };

function frame() {
  const known = performance.now() - +lag.value;   // what the screen is allowed to know
  while (samples.length > 1 && samples[1].t <= known) samples.shift();
  dot.style.transform = \`translate(\${samples[0].x}px, \${samples[0].y}px)\`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// the button answers after the same delay
btn.onpointerdown = () => setTimeout(() => btn.classList.toggle('on'), +lag.value);`,
          task: "Raise the latency until the button stops feeling instant. Then find where dragging stops feeling glued to you. Write both numbers down: they are not close.",
        },
        { t: "say", h: "Dragging runs on a stricter clock", x: "100 ms is the limit for a click to feel instant. For something under your finger it's far too slow. Microsoft Research touch studies (Ng et al. 2012, Jota et al. 2013) found dragging performance drops once latency passes about 25 ms." },
        {
          t: "pitfall",
          h: "Motion after a wait is more wait",
          x: "A 300 ms transition on a result that took 200 ms to fetch is a 500 ms response. Motion that covers a wait helps; motion that starts after it adds to it. When the destination is known, start moving on input, not on response.",
        },
        {
          t: "quiz",
          q: "A search box queries the server on each keystroke; answers take 300-800 ms. What keeps it feeling fast?",
          options: ["A full-screen spinner per keystroke", "Keep the old results visible, dimmed, until the new ones land", "Clear the list on each keystroke so it's obviously working", "Animate each new result list in over 400 ms"],
          answer: 1,
          why: "Stale-but-visible says 'working' without blanking the screen, and the user can still read. Clearing makes the page flash empty on every key, and spinners or long entrances add delay on top of a wait that's already near the 1 s limit.",
        },
      ],
    },
    {
      title: "Duration and easing by intent",
      beats: [
        { t: "say", x: "Animation craft covered what each curve communicates. The design question is which job the motion is doing. Material Design's original motion spec maps it cleanly: **decelerate** what enters, **accelerate** what leaves, **standard** for what moves on screen." },
        {
          t: "table",
          head: ["Intent", "Material curve", "Mobile duration", "Why"],
          rows: [
            ["Enter", "Deceleration `cubic-bezier(0, 0, .2, 1)`", "225 ms", "Arrives at speed, settles where the eye will land"],
            ["Exit", "Acceleration `cubic-bezier(.4, 0, 1, 1)`", "195 ms", "Gathers speed and goes; nobody needs to watch it leave"],
            ["Move on screen", "Standard `cubic-bezier(.4, 0, .2, 1)`", "~300 ms", "Starts and stops gently, like an object with mass"],
            ["Large, complex change", "Standard", "375 ms", "More area changing; past ~400 ms it starts to feel slow"],
          ],
          caption: "Material Design (2014). Desktop: 150-200 ms. Tablet about 30% longer than mobile, wearables about 30% shorter.",
        },
        { t: "viz", name: "easing", props: { curve: [0, 0, 0.2, 1] } },
        { t: "say", h: "Time grows slower than distance", x: "A body pushed with a constant force covers distance proportional to t², so time goes as √distance. Big moves get more time, but less time per pixel. That's why one duration can't serve a 20 px toggle and a 260 px panel." },
        {
          t: "play",
          mode: "html",
          title: "duration.html",
          html: `<div class="ui">
  <label>duration at 100 px <input id="base" type="range" min="80" max="600" step="10" value="250"></label>
  <label><input id="scale" type="checkbox"> scale with &radic;distance</label>
  <button id="go">Play</button>
</div>
<div class="row"><span>toggle, 20 px</span><div class="track" style="--d: 20px"><i></i></div></div>
<div class="row"><span>chip, 100 px</span><div class="track" style="--d: 100px"><i></i></div></div>
<div class="row"><span>panel, 260 px</span><div class="track" style="--d: 260px"><i></i></div></div>
<pre id="out"></pre>`,
          css: `body { font: 14px system-ui; padding: 16px; }
.ui { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; margin-bottom: 16px; }
.row { display: flex; align-items: center; gap: 12px; margin: 14px 0; }
.row span { width: 100px; flex: none; color: #777; }
.track { position: relative; width: calc(var(--d) + 28px); height: 28px; border-radius: 14px; background: #8882; }
.track i { position: absolute; left: 0; top: 0; width: 28px; height: 28px; border-radius: 14px;
  background: #d49a3a; transition-property: transform;
  transition-timing-function: cubic-bezier(.4, 0, .2, 1); }
.on .track i { transform: translateX(var(--d)); }`,
          js: `const base = document.getElementById('base'), scale = document.getElementById('scale');
const out = document.getElementById('out');
const knobs = [...document.querySelectorAll('.track i')];
const dist = [20, 100, 260];

function apply() {
  out.textContent = knobs.map((k, i) => {
    const ms = scale.checked ? Math.round(+base.value * Math.sqrt(dist[i] / 100)) : +base.value;
    k.style.transitionDuration = ms + 'ms';
    return \`\${String(dist[i]).padStart(3)} px  ->  \${ms} ms\`;
  }).join('\\n');
}
base.oninput = scale.onchange = apply;
apply();
document.getElementById('go').onclick = () => document.body.classList.toggle('on');`,
          task: "With scaling off, find one duration that suits all three. You can't. Turn scaling on and tune the base until the toggle feels crisp and the panel feels deliberate.",
        },
        {
          t: "quiz",
          q: "A toast slides in, waits, then dismisses itself. Which pairing fits?",
          options: ["Ease-in to enter, ease-out to exit", "Decelerate to enter; accelerate, and a little shorter, to exit", "Linear both ways", "One curve, played backwards to exit"],
          answer: 1,
          why: "Entering things should arrive fast and settle where the eye lands. Leaving things should get out of the way: accelerate and take less time. A reversed entrance makes the exit start slowly, exactly when nobody wants to watch it.",
        },
        {
          t: "pitfall",
          h: "Exits go somewhere",
          x: "A dismissed thing should leave toward where it lives: a sheet back down its edge, archived mail toward the Archive tab, a minimised window into its dock icon. Leaving in an arbitrary direction breaks the map the entrance built.",
        },
      ],
    },
    {
      title: "Choreography and stagger",
      beats: [
        { t: "say", x: "When several things move, the eye follows one. **Choreography** decides which: one leader carries the meaning (the card that becomes the page) and everything else follows a beat later, travelling less." },
        {
          t: "steps",
          h: "Rules that keep a scene readable",
          items: [
            "One leader per transition. It moves first and furthest.",
            "Everything shares one direction of travel. Two directions read as two events.",
            "Followers move less: fades and short offsets, not full journeys.",
            "Stagger in reading order, so the motion reads the way the content does.",
            "Keep the total short. The last item should land while the first is still fresh.",
            "Exits don't stagger. Everything leaves together, fast.",
          ],
        },
        {
          t: "play",
          mode: "html",
          title: "stagger.html",
          html: `<div class="ui">
  <label>step <input id="step" type="range" min="0" max="150" step="5" value="40"></label>
  <label>cap <input id="cap" type="range" min="0" max="1000" step="25" value="1000"></label>
  <button id="go">Show / hide</button>
  <span id="out"></span>
</div>
<ul id="list"></ul>`,
          css: `body { font: 14px system-ui; padding: 16px; }
.ui { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
ul { list-style: none; padding: 0; max-width: 360px; }
li { padding: 10px 12px; margin: 6px 0; border-radius: 8px; background: #8881; opacity: 0; }`,
          js: `const list = document.getElementById('list'), out = document.getElementById('out');
const step = document.getElementById('step'), cap = document.getElementById('cap');
for (let i = 1; i <= 14; i++) list.insertAdjacentHTML('beforeend', \`<li>Result \${i}</li>\`);
const items = [...list.children];
const DUR = 260;
let shown = false;

document.getElementById('go').onclick = () => {
  shown = !shown;
  items.forEach((li, i) => {
    li.getAnimations().forEach((a) => a.cancel());
    const delay = shown ? Math.min(i * +step.value, +cap.value) : 0;   // exits leave together
    li.animate(
      shown ? [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }]
            : [{ opacity: 1 }, { opacity: 0 }],
      { duration: shown ? DUR : 150, delay, easing: 'cubic-bezier(0, 0, .2, 1)', fill: 'both' }
    );
  });
  const last = Math.min((items.length - 1) * +step.value, +cap.value);
  out.textContent = shown ? \`last row starts at \${last} ms, done at \${last + DUR} ms\` : '';
};`,
          task: "Find the step where the list reads as a cascade, not a slow reveal. Now drop the cap until the tail arrives together. Which feels faster, even when the total is equal?",
        },
        {
          t: "quiz",
          q: "Search results re-render on each keystroke, each row staggering in by 50 ms. What's wrong?",
          options: ["Nothing, it's lively", "The step is too short", "Stagger means 'this is new'. Results that update while you read aren't new; replaying the entrance per key makes them unreadable", "Rows should stagger bottom-up"],
          answer: 2,
          why: "Entrance motion is for first arrival. Content that updates in place should change in place, maybe with a brief tint on what changed. Replaying an entrance per keystroke also adds the whole stagger to every response.",
        },
        {
          t: "pitfall",
          h: "Stagger the viewport, not the array",
          x: "Stagger by index and row 60 waits 2.4 s, offscreen, then fades in as the user scrolls to it, which looks broken. Stagger only what's in the first viewport; everything below simply exists. Loading the next page should never replay entrance motion.",
        },
      ],
    },
    {
      title: "Springs and direct manipulation",
      beats: [
        { t: "say", x: "Animation craft built springs; here's when design calls for one. A curve has a fixed duration, so it assumes nothing changes mid-flight. Anything the user can grab, throw or interrupt needs motion that starts from the current position *and velocity*." },
        {
          t: "table",
          head: ["", "Curve (tween)", "Spring"],
          rows: [
            ["Defined by", "Duration and easing", "Stiffness (or response) and damping"],
            ["Interrupted mid-flight", "Restarts from rest: a visible kink", "Keeps its velocity: bends smoothly"],
            ["Can start already moving", "No", "Yes: a flick's speed carries in"],
            ["Best for", "Fades, colour, one-shot transitions", "Drags, sheets, drawers, anything thrown"],
          ],
        },
        {
          t: "steps",
          h: "Anatomy of a good drag",
          items: [
            "Pointer down: capture the pointer and remember the grab offset. Nothing moves yet.",
            "Hysteresis: wait for some travel before deciding it's a drag, and on which axis. Apple puts this at about 10 points on iOS.",
            "Drag: follow 1:1. No easing, no smoothing, and no jump to centre under the finger.",
            "Past a boundary: resist with a rubber band instead of a hard stop.",
            "Release: estimate velocity from the last few dozen milliseconds of samples, not the last event.",
            "Project where that velocity would coast to, snap to the target nearest *that*, and spring there starting at the release velocity.",
          ],
        },
        {
          t: "code",
          lang: "js",
          src: "// UIScrollView-style deceleration: velocity is multiplied by `rate` every ms.\n// Sum that geometric series and you get how far a throw coasts.\nfunction project(vPxPerMs, rate = 0.998) {\n  return vPxPerMs * rate / (1 - rate);\n}\n// 0.998 is UIScrollView's normal rate, 0.99 its fast one.\nconst target = nearest(snapPoints, x + project(v));",
          mark: [4, 7],
          note: "From Apple's WWDC 2018 talk *Designing Fluid Interfaces*. Snap to where the throw would land, not where the finger let go.",
        },
        {
          t: "play",
          mode: "html",
          title: "fling.html",
          html: `<div class="ui">
  <label><input id="proj" type="checkbox" checked> snap to projected point</label>
  <label>deceleration <input id="rate" type="range" min="0.99" max="0.999" step="0.001" value="0.998"></label>
  <label>rubber c <input id="c" type="range" min="0.1" max="1" step="0.05" value="0.55"></label>
  <span id="out"></span>
</div>
<div id="track"><b></b><b></b><b></b><i id="ghost"></i><div id="card"></div></div>`,
          css: `body { font: 14px system-ui; padding: 16px; }
.ui { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 16px; }
#track { position: relative; height: 90px; max-width: 520px; border-radius: 12px; background: #8881;
  touch-action: none; user-select: none; }
#track b { position: absolute; top: 40px; width: 10px; height: 10px; margin-left: -5px;
  border-radius: 50%; background: #8886; }
#card { position: absolute; top: 15px; left: -30px; width: 60px; height: 60px; border-radius: 12px;
  background: #d49a3a; cursor: grab; }
#ghost { position: absolute; top: 4px; bottom: 4px; width: 2px; background: #2563eb; opacity: 0; }`,
          js: `const $ = (id) => document.getElementById(id);
const track = $('track'), card = $('card'), ghost = $('ghost');
let W, snaps, x = 30, v = 0, target = 30, dragging = false, grab = 0, samples = [];
function layout() {
  W = track.clientWidth;
  snaps = [30, W / 2, W - 30];
  track.querySelectorAll('b').forEach((b, i) => (b.style.left = snaps[i] + 'px'));
}
layout(); addEventListener('resize', layout);

// past an edge, each extra px of finger moves the card less and less
function rubber(raw) {
  const lo = snaps[0], hi = snaps[2], c = +$('c').value;
  const band = (o) => (1 - 1 / ((o * c) / W + 1)) * W;
  return raw < lo ? lo - band(lo - raw) : raw > hi ? hi + band(raw - hi) : raw;
}
const px = (e) => e.clientX - track.getBoundingClientRect().left;

card.onpointerdown = (e) => {
  card.setPointerCapture(e.pointerId);
  dragging = true; grab = px(e) - x; samples = [];
};
card.onpointermove = (e) => {
  if (!dragging) return;
  x = rubber(px(e) - grab);                                   // 1:1, keeping the grab offset
  samples.push({ t: e.timeStamp, x });
};
card.onpointerup = card.onpointercancel = (e) => {
  dragging = false;
  const recent = samples.filter((s) => e.timeStamp - s.t < 80);  // a pause means no throw
  const a = recent[0], b = recent[recent.length - 1];
  v = recent.length > 1 && b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0;   // px per ms
  const r = +$('rate').value, projected = x + v * r / (1 - r);
  const aim = $('proj').checked ? projected : x;
  target = snaps.reduce((p, s) => (Math.abs(s - aim) < Math.abs(p - aim) ? s : p));
  ghost.style.left = projected + 'px'; ghost.style.opacity = 1;
  $('out').textContent = \`release \${Math.round(v * 1000)} px/s, would coast to \${Math.round(projected)} px\`;
  v *= 1000;                                                    // px per s for the spring
};

let last = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 1 / 30); last = now;
  if (!dragging) {                                              // spring: k 300, zeta 0.8
    const k = 300, damp = 2 * 0.8 * Math.sqrt(k);
    v += (-k * (x - target) - damp * v) * dt;
    x += v * dt;
  }
  card.style.transform = \`translateX(\${x}px)\`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);`,
          task: "Flick the card gently, then hard. Untick projection and flick again: it ignores your throw. Then pull past an edge with c at 0.2 and at 1. The blue line is where the throw would coast.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// o: how far past the edge the finger is; d: the view's size\nconst band = (o, d, c = 0.55) => (1 - 1 / (o * c / d + 1)) * d;\n\nband(1000, 500);",
          q: "The finger is 1000 px past the edge of a 500 px view. How far past the edge is the content?",
          options: ["1000 px", "550 px", "About 262 px", "0 px"],
          answer: 2,
          why: "1000 × 0.55 / 500 = 1.1, and (1 - 1/2.1) × 500 ≈ 262. The band approaches d but never reaches it: more pull always moves it a bit more, never as much as the finger. The 0.55 is the widely copied reverse-engineered iOS value.",
        },
        {
          t: "pitfall",
          h: "Overshoot only when thrown",
          x: "Apple's advice in *Designing Fluid Interfaces*: start springs at full damping, no overshoot, and add bounce only when a gesture carried momentum into the motion. A tapped button that wobbles feels like a toy; a flung card that stops dead feels broken.",
        },
        {
          t: "pitfall",
          h: "Velocity from one event is noise",
          x: "Pointer events arrive at uneven intervals, and the last one before release often has a tiny dt. Divide by it and a gentle drop becomes a hard fling. Fit the last few dozen ms of samples, and treat a pause before release as zero velocity.",
        },
      ],
    },
    {
      title: "Feedback states",
      beats: [
        { t: "say", x: "A control has more states than most mockups draw: rest, hover, pressed, focused, disabled, loading, and their combinations. Each needs a visible answer, and each has its own timing." },
        {
          t: "table",
          head: ["State", "It says", "Get it right", "Common miss"],
          rows: [
            ["Hover", "You can act here", "A subtle tint, only under `(hover: hover)`", "Hover styles stuck on after a tap on touch screens"],
            ["Pressed", "I felt that", "On pointerdown; fast in, slower release", "Shown on click, which fires on release"],
            ["Focus", "The keyboard is here", "`:focus-visible` ring, shown at once, never faded in", "`outline: none` with nothing in its place"],
            ["Disabled", "Not now", "Visibly inert, with the reason next to it", "A grey button and no clue what's missing"],
            ["Loading", "Working on it", "Same size as at rest; label hidden, not swapped", "The button's width jumps and the row reflows"],
          ],
        },
        {
          t: "play",
          mode: "html",
          title: "press.html",
          html: `<div class="ui">
  <label>press scale <input id="s" type="range" min="0.85" max="1" step="0.01" value="0.97"></label>
  <label>release ms <input id="ms" type="range" min="0" max="400" step="10" value="150"></label>
  <label><input id="late" type="checkbox"> react on click, not on press</label>
</div>
<div class="row">
  <button class="b swap">Save</button>
  <button class="b keep"><span>Save</span></button>
  <span class="next">next to it</span>
</div>
<p class="hint">Left swaps its label while saving. Right keeps its width. Tab to see focus.</p>`,
          css: `:root { --s: .97; --ms: 150ms; }
body { font: 14px system-ui; padding: 16px; }
.ui { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; margin-bottom: 20px; }
.row { display: flex; gap: 12px; align-items: center; }
.b { position: relative; font: 600 15px system-ui; padding: 12px 20px; border: 0; border-radius: 10px;
  background: #111; color: #fff; transition: transform var(--ms) cubic-bezier(.2, .8, .2, 1); }
.b.pressed { transform: scale(var(--s)); transition-duration: 60ms; }
.b:focus-visible { outline: 2px solid #2563eb; outline-offset: 3px; }
.keep.busy span { visibility: hidden; }
.keep.busy::after { content: ''; position: absolute; inset: 0; margin: auto; width: 16px; height: 16px;
  border: 2px solid #fff6; border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(1turn); } }
.next, .hint { color: #777; }`,
          js: `const $ = (id) => document.getElementById(id);
const root = document.documentElement;
$('s').oninput = () => root.style.setProperty('--s', $('s').value);
$('ms').oninput = () => root.style.setProperty('--ms', $('ms').value + 'ms');

document.querySelectorAll('.b').forEach((b) => {
  const up = () => b.classList.remove('pressed');
  b.addEventListener('pointerdown', () => { if (!$('late').checked) b.classList.add('pressed'); });
  b.addEventListener('pointerup', up);
  b.addEventListener('pointerleave', up);
  b.addEventListener('click', () => {
    if ($('late').checked) { b.classList.add('pressed'); setTimeout(up, 60); }
    save(b);
  });
});

function save(b) {
  if (b.classList.contains('busy')) return;
  b.classList.add('busy');
  if (b.classList.contains('swap')) b.textContent = 'Saving...';
  setTimeout(() => {
    b.classList.remove('busy');
    if (b.classList.contains('swap')) b.textContent = 'Save';
  }, 1500);
}`,
          task: "Hold the mouse down on a button: tune scale and release until it feels physical, not rubbery. Tick 'react on click' and hold again. Watch the grey text when the left button saves.",
        },
        {
          t: "quiz",
          q: "Which event should drive the pressed look?",
          options: ["`click`", "`pointerdown`, with the action still committed on `click`", "`pointerup`", "`focus`"],
          answer: 1,
          why: "`click` fires on release, after the whole gesture; the user wanted proof the moment they pressed. Show pressed on pointerdown, act on click, and sliding off before release still cancels, as people expect.",
        },
        { t: "say", h: "Tooltips need intent", x: "A tooltip that opens the instant a cursor passes is a strobe. Good ones wait, then open instantly for neighbours once one is showing. Radix's Tooltip defaults: 700 ms to open, and a 300 ms window in which the next one skips the wait." },
        {
          t: "pitfall",
          h: "Disabled buttons don't explain themselves",
          x: "A greyed-out Submit gives no reason, drops out of the tab order so keyboard and screen reader users may never find it, and leaves people hunting for what they missed. Prefer an enabled button that, when pressed, points at the problem. If you must disable, say why next to it.",
        },
      ],
    },
    {
      title: "Waiting: loading states",
      beats: [
        { t: "say", x: "Loading UI is motion design for time you don't control. Nielsen Norman Group's rule of thumb for indicators: under 1 s, no looped animation, it only distracts; about 2 to 10 s, a spinner; 10 s and up, a percent-done bar." },
        {
          t: "table",
          head: ["Strategy", "Use it when", "The cost"],
          rows: [
            ["Nothing but the pressed state", "The answer usually lands within about a second", "None: pressed already says 'heard you'"],
            ["Spinner", "A few seconds, and the result's shape is unknown", "Says nothing about what's coming; flickers if fast"],
            ["Skeleton", "The layout of the result is known: feeds, cards, tables", "Must match the real layout, or it shifts on arrival"],
            ["Progress bar", "10 s or more, and the work is measurable", "Must be honest; a bar parked at 90% burns trust"],
            ["Optimistic", "The action almost always succeeds and can be undone", "Needs a visible, humane failure path"],
          ],
        },
        {
          t: "predict",
          lang: "js",
          src: "showSpinner();\nconst data = await load();   // usually ~120 ms\nhideSpinner();\nrender(data);",
          q: "On a good connection, what does the user see?",
          options: ["Content, smoothly", "A spinner flashing for a few frames, then content: it reads as a glitch", "Nothing until the data arrives", "A blank screen"],
          answer: 1,
          why: "A spinner that lives 120 ms is up for about seven frames at 60 Hz: too short to read, long enough to notice. Wait a beat before showing it, and once it's shown, keep it long enough to look intentional.",
        },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Clock", "Network", "Screen"],
            frames: [
              { cells: [["0 ms"], ["request sent"], ["button pressed"]], note: "Pressed state on pointerdown. No spinner yet: a fast request finishes before anyone would need one." },
              { cells: [["300 ms"], ["still waiting"], ["spinner appears"]], note: "The delay ran out with no answer. Now reassurance is worth showing." },
              { cells: [["420 ms"], ["response arrives"], ["spinner, kept"]], note: "Data is here, but the spinner has only been up 120 ms. Swapping now would be a flicker." },
              { cells: [["800 ms"], ["done"], ["content"]], note: "The minimum display time has passed. One clean change instead of two blinks." },
              { cells: [["fast case"], ["response at 150 ms"], ["content at 150 ms"]], note: "Beat the delay and the spinner never exists. The 300 and 500 are taste; the shape is the rule." },
            ],
          },
        },
        {
          t: "play",
          mode: "html",
          title: "loading.html",
          html: `<div class="ui">
  <label>server <input id="lat" type="range" min="50" max="3000" step="50" value="250"> <span id="latv"></span></label>
  <select id="how">
    <option value="now">spinner at once</option>
    <option value="smart" selected>spinner after a delay, kept a minimum</option>
    <option value="skel">skeleton</option>
  </select>
  <label>delay <input id="delay" type="number" value="300" step="50"></label>
  <label>min <input id="min" type="number" value="500" step="50"></label>
  <button id="go">Load</button>
</div>
<div id="box"></div>
<p id="log"></p>`,
          css: `body { font: 14px system-ui; padding: 16px; }
.ui { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
input[type=number] { width: 64px; }
#box { position: relative; max-width: 360px; min-height: 132px; margin-top: 16px; }
.row { height: 36px; margin-bottom: 8px; border-radius: 8px; background: #8881;
  display: flex; align-items: center; padding: 0 12px; }
.skel { background: linear-gradient(90deg, #8881 30%, #8883 50%, #8881 70%);
  background-size: 300% 100%; animation: sh 1.2s linear infinite; }
@keyframes sh { from { background-position: 100% 0; } to { background-position: 0 0; } }
.spin { position: absolute; inset: 0; margin: auto; width: 24px; height: 24px; border-radius: 50%;
  border: 3px solid #8884; border-top-color: #2563eb; animation: r .7s linear infinite; }
@keyframes r { to { transform: rotate(1turn); } }
#log { color: #777; }`,
          js: `const $ = (id) => document.getElementById(id);
const box = $('box'), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = (cls, text) => [1, 2, 3].map((i) => \`<div class="row \${cls}">\${text ? text + ' #' + i : ''}</div>\`).join('');
const spinner = '<div class="spin"></div>';
const showLat = () => ($('latv').textContent = $('lat').value + ' ms');
$('lat').oninput = showLat; showLat();

$('go').onclick = async () => {
  const t0 = performance.now(), how = $('how').value;
  const request = sleep(+$('lat').value);
  box.innerHTML = '';
  if (how === 'now') box.innerHTML = spinner;
  if (how === 'skel') box.innerHTML = rows('skel');
  if (how === 'smart') {
    let shownAt = 0;
    const timer = setTimeout(() => { box.innerHTML = spinner; shownAt = performance.now(); }, +$('delay').value);
    await request;
    clearTimeout(timer);
    if (shownAt) await sleep(Math.max(0, +$('min').value - (performance.now() - shownAt)));
  }
  await request;
  box.innerHTML = rows('', 'Order');
  $('log').textContent = \`server took \${$('lat').value} ms, content after \${Math.round(performance.now() - t0)} ms\`;
};`,
          task: "Set the server to 150, 350 and 2000 ms and press Load in each mode. Which mode never flickers? Then tune delay and min until the 350 ms case feels calm.",
        },
        {
          t: "play",
          mode: "html",
          title: "optimistic.html",
          html: `<div class="ui">
  <label><input id="opt" type="checkbox" checked> optimistic</label>
  <label>failure rate <input id="fail" type="range" min="0" max="1" step="0.1" value="0.3"></label>
  <label>latency <input id="lat" type="range" min="100" max="2000" step="100" value="800"></label>
</div>
<div class="f"><input id="text" placeholder="New task" autocomplete="off"><button id="add">Add</button></div>
<p id="msg"></p>
<ul id="list"></ul>`,
          css: `body { font: 14px system-ui; padding: 16px; }
.ui { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 12px; }
.f { display: flex; gap: 8px; max-width: 360px; }
#text { flex: 1; padding: 8px; font: inherit; }
#msg { color: #b91c1c; min-height: 1.2em; margin: 8px 0 0; }
ul { list-style: none; padding: 0; max-width: 360px; }
li { padding: 8px 12px; margin: 6px 0; border-radius: 8px; background: #8881;
  display: flex; justify-content: space-between; transition: opacity .2s; }
li.pending { opacity: .55; }
li.failed { background: #dc262622; color: #b91c1c; }
li button { font: inherit; border: 0; background: none; color: inherit; text-decoration: underline; cursor: pointer; }`,
          js: `const $ = (id) => document.getElementById(id);
// a fake server: answers after the latency, fails at the chosen rate
const server = () => new Promise((ok, no) =>
  setTimeout(() => (Math.random() < +$('fail').value ? no() : ok()), +$('lat').value));

function addRow(text) {
  const li = document.createElement('li');
  li.append(document.createElement('span'));
  li.firstChild.textContent = text;
  $('list').prepend(li);
  return li;
}

async function send(li, text) {
  li.className = 'pending';
  li.querySelector('button')?.remove();
  try {
    await server();
    li.className = '';
  } catch {
    li.className = 'failed';
    li.firstChild.textContent = text + ' (not saved)';
    const retry = document.createElement('button');
    retry.textContent = 'Retry';
    retry.onclick = () => { li.firstChild.textContent = text; send(li, text); };
    li.append(retry);
  }
}

$('text').onkeydown = (e) => { if (e.key === 'Enter') $('add').click(); };
$('add').onclick = async () => {
  const text = $('text').value.trim() || 'Untitled';
  $('text').value = '';
  $('msg').textContent = '';
  if ($('opt').checked) return send(addRow(text), text);
  $('add').disabled = true; $('add').textContent = 'Adding...';
  try { await server(); addRow(text); }
  catch { $('msg').textContent = 'Could not add "' + text + '". Try again.'; }
  $('add').disabled = false; $('add').textContent = 'Add';
};`,
          task: "Add five tasks quickly in each mode. Optimistic lets you keep typing; pessimistic blocks you. Then set failure to 1 and judge whether each failure is still humane.",
        },
        {
          t: "pitfall",
          h: "Optimistic needs a real failure path",
          x: "Optimistic UI is a promise you might break. Mark pending items subtly, keep the user's input when it fails, and offer retry in place. A row that silently vanishes two seconds later is worse than any spinner. Never go optimistic on payments or anything irreversible.",
        },
        {
          t: "pitfall",
          h: "Skeletons that don't match the content",
          x: "Three generic grey bars, replaced by a two-line card with an image, shift everything on arrival: you've swapped a spinner for layout shift. Build skeletons from the real component with placeholder data, so the heights match to the pixel.",
        },
      ],
    },
    {
      title: "Details that feel expensive",
      beats: [
        { t: "say", x: "Expensive-feeling UI is rarely one big animation. It's dozens of small ones that agree with each other: things grow out of what spawned them, nothing inflates from zero, and every interruption is handled." },
        {
          t: "play",
          mode: "html",
          title: "popover.html",
          html: `<div class="ui">
  <label>start scale <input id="s" type="range" min="0" max="1" step="0.01" value="0"> <span id="sv"></span></label>
  <label><input id="origin" type="checkbox"> grow from the trigger</label>
  <label>open ms <input id="ms" type="range" min="50" max="600" step="10" value="400"> <span id="msv"></span></label>
</div>
<div class="wrap">
  <button id="t">Options</button>
  <div id="menu" hidden><a>Rename</a><a>Duplicate</a><a>Move to...</a><a>Delete</a></div>
</div>`,
          css: `body { font: 14px system-ui; padding: 16px; min-height: 260px; }
.ui { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; margin-bottom: 20px; }
.wrap { position: relative; display: inline-block; }
#t { font: 600 14px system-ui; padding: 8px 14px; border-radius: 8px; border: 1px solid #8886;
  background: #fff; color: #111; }
#menu { position: absolute; top: calc(100% + 6px); left: 0; width: 180px; padding: 6px;
  background: #fff; border-radius: 10px; box-shadow: 0 8px 30px #0003, 0 0 0 1px #0001; }
#menu a { display: block; padding: 8px 10px; border-radius: 6px; color: #111; cursor: default; }
#menu a:hover { background: #0000000d; }`,
          js: `const $ = (id) => document.getElementById(id);
const menu = $('menu');
const labels = () => { $('sv').textContent = $('s').value; $('msv').textContent = $('ms').value + ' ms'; };
$('s').oninput = $('ms').oninput = labels; labels();

let isOpen = false, anim;
$('t').onclick = () => {
  isOpen = !isOpen;
  menu.hidden = false;
  menu.style.transformOrigin = $('origin').checked ? 'top left' : 'center';
  const closed = { opacity: 0, transform: \`scale(\${$('s').value})\` };
  const open = { opacity: 1, transform: 'none' };
  anim?.cancel();
  anim = menu.animate(isOpen ? [closed, open] : [open, closed], {
    duration: isOpen ? +$('ms').value : +$('ms').value * 0.6,
    easing: isOpen ? 'cubic-bezier(0, 0, .2, 1)' : 'cubic-bezier(.4, 0, 1, 1)',
    fill: 'forwards',
  });
  if (!isOpen) anim.finished.then(() => { menu.hidden = true; }).catch(() => {});
};`,
          task: "The default is the cheap version. Tune start scale, origin and duration until the menu feels like part of the button. Try 0.95, the trigger corner, and well under 300 ms.",
        },
        {
          t: "table",
          head: ["Feels cheap", "Feels expensive"],
          rows: [
            ["A menu inflates from `scale(0)` at its own centre", "Starts near 0.95 at the trigger's corner, with a fade"],
            ["Same duration in and out", "Out quicker than in"],
            ["Interrupted animation restarts from the beginning", "Reverses from wherever it is now"],
            ["A count jumps from 99 to 100 and the row reflows", "Digits roll, set in tabular figures so nothing shifts"],
            ["An icon swaps instantly between states", "It crossfades with a slight scale, or morphs"],
            ["Every element on the page has its own easing", "Three or four motion tokens, used everywhere"],
          ],
        },
        {
          t: "quiz",
          q: "A dropdown opens from `scale(0)`. Why does it feel cheap even at a good speed?",
          options: ["It's too slow", "Real things don't inflate from a point: the first frames are unreadable specks, and the link to the button is lost", "It should rotate in", "Scale isn't GPU-accelerated"],
          answer: 1,
          why: "Starting near full size with a fade reads as the menu already existing and arriving. Putting the origin at the trigger ties it to what you clicked. Scale from zero is a cartoon, and the first third of it is spent showing nothing usable.",
        },
        {
          t: "pitfall",
          h: "Transitions that fire on first paint",
          x: "Give a component a transition, render it with defaults, then apply saved state or the theme after hydration, and it animates on load: drawers slide shut, colours fade in. Only transition on user-caused changes, or switch transitions on after the first frame.",
        },
      ],
    },
    {
      title: "Reduced motion and restraint",
      beats: [
        { t: "say", x: "Animation craft showed the code for `prefers-reduced-motion`. The design job is a decision per animation: what does this motion mean, and how do I keep that meaning without the movement? Replace, don't just remove." },
        {
          t: "table",
          head: ["Motion", "Under reduced motion", "Why"],
          rows: [
            ["Views slide between each other", "A short crossfade", "Keeps 'something changed' without travel"],
            ["A thumbnail zooms into the detail view", "Crossfade in place", "Large scaling is a common vestibular trigger"],
            ["Parallax and scroll-linked movement", "Static", "Pure movement, no information"],
            ["`scroll-behavior: smooth` on jump links", "`auto`: jump instantly", "A long programmatic scroll is large-scale motion"],
            ["An auto-advancing carousel", "Paused, with manual controls", "It moves without being asked"],
            ["Spinners, progress bars", "Keep them", "They are information, not decoration"],
            ["Press, hover and focus states", "Keep: colour, opacity, outline", "Feedback with no travel at all"],
          ],
        },
        { t: "say", h: "What the standards say", x: "WCAG 2.2.2 (level A): content that moves on its own for over 5 seconds, alongside other content, needs a way to pause it. WCAG 2.3.3 (level AAA): motion triggered by interaction can be turned off unless it's essential." },
        {
          t: "quiz",
          q: "With reduced motion on, an 'added to cart' confirmation used to fly a thumbnail into the cart icon. Best replacement?",
          options: ["Remove it", "Keep the flight, just faster", "Fade the badge count to its new number and briefly tint the cart icon", "Show an alert dialog"],
          answer: 2,
          why: "The flight meant 'it went into the cart'. A badge that updates with a fade and a colour pulse keeps that meaning with zero travel. Removing it loses the feedback; a faster flight is still a flight.",
        },
        {
          t: "pitfall",
          h: "Video, GIFs and Lottie ignore your CSS",
          x: "An autoplaying hero video, a GIF or a Lottie file keeps moving whatever your media queries say. Check the query in JS before calling play, and for GIFs use `<picture>` with a `<source media=\"(prefers-reduced-motion: reduce)\">` pointing at a still frame.",
        },
        { t: "say", h: "A motion budget", x: "Give each screen one thing that's allowed to be noticed: the transition that carries the meaning. Everything else should be short, quiet and boring. Restraint is what makes the one big moment land." },
        {
          t: "mission",
          h: "A motion pass on delete",
          x: "Build a list where deleting a row presses on pointerdown, removes the row at once, slides the rows below up to close the gap, and shows an Undo toast that enters decelerating and leaves accelerating. Under reduced motion, every movement becomes a fade and nothing is lost.",
          hint: "Close the gap with FLIP on the remaining rows, not by animating height. Send the delete to the server only when Undo expires, so Undo is just re-inserting a node.",
          solution: {
            lang: "js",
            src: `const reduce = matchMedia('(prefers-reduced-motion: reduce)');

function remove(row) {
  const rest = [...list.children].filter((r) => r !== row);
  const before = new Map(rest.map((r) => [r, r.getBoundingClientRect().top]));
  const next = row.nextElementSibling;
  row.remove();                                         // optimistic: gone now
  for (const r of rest) {                               // FLIP the survivors up
    const dy = before.get(r) - r.getBoundingClientRect().top;
    if (dy) r.animate(reduce.matches
      ? [{ opacity: 0.4 }, { opacity: 1 }]
      : [{ transform: \`translateY(\${dy}px)\` }, { transform: 'none' }],
      { duration: 220, easing: 'cubic-bezier(.4, 0, .2, 1)' });
  }
  const restore = () => list.insertBefore(row, next?.isConnected ? next : null);
  let undone = false;
  toast('Deleted', () => { undone = true; restore(); });
  setTimeout(() => undone || api.delete(row.dataset.id)
    .catch(() => { restore(); toast('Could not delete. Restored.'); }), 5000);
}

function toast(text, onUndo) {
  const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: text });
  const move = reduce.matches ? 'none' : 'translateY(16px)';
  const hide = () => t.animate([{ opacity: 1 }, { opacity: 0, transform: move }],
    { duration: 195, easing: 'cubic-bezier(.4, 0, 1, 1)' }).finished.then(() => t.remove());
  if (onUndo) t.append(Object.assign(document.createElement('button'),
    { textContent: 'Undo', onclick: () => { onUndo(); hide(); } }));
  document.body.append(t);
  t.animate([{ opacity: 0, transform: move }, { opacity: 1, transform: 'none' }],
    { duration: 225, easing: 'cubic-bezier(0, 0, .2, 1)' });
  setTimeout(hide, 5000);
}`,
          },
        },
      ],
    },
  ],
  nobodyTells: [
    "Click open, close, open as fast as you can before shipping any animation. Someone will, and the interrupted case is where cheap motion shows.",
    "The best spinner is the one you never show: start the request on pointerdown or hover instead of on click.",
    "Keep old content on screen, dimmed, while new data loads. Stale but visible beats a blank flash.",
    "Exits don't need choreography. Nobody watches things leave; get them out of the way.",
    "Keep velocity in px/ms from pointer events and convert once at the spring. A missing factor of 1000 is the classic fling bug.",
    "Name motion tokens by intent (`--ease-enter`, `--dur-small`), not by curve. Design systems and tokens covers the plumbing.",
    "If two things animate at once, decide which one the eye should follow, then make the other quieter or later.",
    "Turn reduced motion on in your OS for a whole day. You'll find every animation you forgot, in apps and in your own.",
  ],
  glossary: [
    ["response-time limits", "~0.1 s feels instant, ~1 s keeps flow, ~10 s keeps attention (Miller 1968, Nielsen 1993)."],
    ["choreography", "Ordering several motions so one leads and the rest follow, giving the eye a single path."],
    ["stagger", "Starting a group's animations at small offsets, in reading order, so they read as a sequence."],
    ["direct manipulation", "The object tracks the finger or pointer 1:1, with no easing and no visible lag."],
    ["hysteresis", "Travel required before a touch counts as a drag; about 10 points on iOS."],
    ["rubber-banding", "Resistance past a boundary: the content moves less than the finger, and springs back on release."],
    ["projection", "Where a released throw would coast to under deceleration; snap targets are chosen from it."],
    ["release velocity", "Speed of the pointer at let-go, estimated from recent samples, handed to the spring."],
    ["skeleton screen", "A placeholder with the final layout's shape, shown while content loads."],
    ["optimistic UI", "Showing an action's result before the server confirms it, with rollback on failure."],
    ["hover intent", "A short delay before hover UI opens, so a passing cursor doesn't trigger it."],
    ["motion budget", "The rule that each screen gets one noticeable motion; the rest stays quiet."],
  ],
  explain: "Explain to a friend why a spinner can make a fast app feel slower, and what you'd show at 100 ms, 1 s and 10 s instead.",
};
