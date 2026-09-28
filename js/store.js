/* Progress lives in this browser: beats revealed, answers, missions done,
 * explanations written, playground drafts, and a spaced-review queue for
 * questions you got wrong (back after 1, 3, 7 and 21 days). */

const KEY = "fsg:v1";
const DAY = 86400000;
const GAPS = [1, 3, 7, 21];

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}
let db = load();
db.chapters ||= {};
db.review ||= {};
db.explain ||= {};
db.drafts ||= {};
db.last ||= null;

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* private mode or full: progress is just not kept */
  }
}

export const store = {
  chapter(id) {
    return (db.chapters[id] ||= { revealed: 1, answers: {}, missions: {}, done: false, all: false });
  },
  update(id, fn) {
    fn(this.chapter(id));
    db.last = id;
    save();
  },
  get last() {
    return db.last;
  },
  answer(id, key, picked, correct, item) {
    this.update(id, (c) => (c.answers[key] = picked));
    const r = db.review[key];
    if (!correct) db.review[key] = { chapter: id, item, stage: 0, due: Date.now() + GAPS[0] * DAY };
    else if (r) {
      r.stage += 1;
      if (r.stage >= GAPS.length) delete db.review[key];
      else r.due = Date.now() + GAPS[r.stage] * DAY;
    }
    save();
  },
  reviewAnswer(key, correct) {
    const r = db.review[key];
    if (!r) return;
    if (correct) {
      r.stage += 1;
      if (r.stage >= GAPS.length) delete db.review[key];
      else r.due = Date.now() + GAPS[r.stage] * DAY;
    } else {
      r.stage = 0;
      r.due = Date.now() + GAPS[0] * DAY;
    }
    save();
  },
  due() {
    const now = Date.now();
    return Object.entries(db.review)
      .filter(([, r]) => r.due <= now)
      .map(([key, r]) => ({ key, ...r }));
  },
  queued() {
    return Object.keys(db.review).length;
  },
  explain(id, text) {
    if (text === undefined) return db.explain[id] || "";
    db.explain[id] = text;
    save();
  },
  draft(key, files) {
    if (files === undefined) return db.drafts[key];
    if (files === null) delete db.drafts[key];
    else db.drafts[key] = files;
    save();
  },
};
