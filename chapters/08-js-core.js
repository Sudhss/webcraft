const raw = String.raw;

export default {
  id: "js-core",
  n: 8,
  part: "B",
  title: "JavaScript I: the real parts",
  hook: "Where JavaScript quietly differs from C++: references, coercion, doubles, UTF-16, `this`, prototypes and modules.",
  minutes: 75,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "Values, references and const",
      beats: [
        { t: "say", x: "Arguments are passed by value, and an object's value is a reference: a pointer with no arithmetic. A function can mutate what you pass it but can never repoint your variable. There is no `T&`, and no struct that copies on assignment." },
        {
          t: "predict",
          lang: "js",
          src: `const grid = Array(3).fill(Array(3).fill(0));
grid[0][0] = 1;
console.log(grid.map((r) => r.join("")).join(" "));`,
          q: "What prints?",
          options: ["100 000 000", "100 100 100", "000 000 000", "it throws"],
          answer: 1,
          why: "`fill` evaluates its argument once and puts the same reference in every slot: three rows, one array. `Array.from({ length: 3 }, () => Array(3).fill(0))` calls the factory once per row.",
        },
        { t: "say", x: "`const` is `T* const`, not `const T*`: it pins the binding and leaves the object fully mutable. `Object.freeze` is the other one: it pins the object's own properties, one level deep." },
        {
          t: "predict",
          lang: "js",
          src: `"use strict";
const cfg = Object.freeze({ retries: 3, hosts: ["a"] });
cfg.hosts.push("b");
try { cfg.retries = 5; } catch (e) { console.log(e.name); }
console.log(cfg.retries, cfg.hosts.length);`,
          q: "What prints?",
          options: ["TypeError, then 3 2", "5 2", "3 1", "TypeError, then 3 1"],
          answer: 0,
          why: "`freeze` is shallow: `hosts` is a separate array nobody froze. Writing a frozen property throws in strict code (modules and classes are always strict) and is silently dropped in sloppy scripts, which is worse.",
        },
        { t: "say", h: "Primitives borrow methods", x: "`\"abc\".length` works because reading a property of a primitive wraps it in a throwaway `String` object whose prototype has the methods. The wrapper dies at once, so a property written to a primitive is lost, or a TypeError in strict code." },
        {
          t: "pitfall",
          h: "Spread copies one level",
          x: "`const next = { ...state }; next.user.name = 'x'` also renames the user in `state`: both point at one `user`. Undo history now holds the edit, and memoised children compare `prev.user === next.user`, see no change and skip rendering. Copy every level you touch.",
        },
      ],
    },
    {
      title: "Coercion that bites",
      beats: [
        {
          t: "predict",
          lang: "js",
          src: `console.log([0] == false, "" == 0, null == 0, null == undefined, NaN == NaN);`,
          q: "What prints?",
          options: ["true true false true false", "false true false true false", "true true true true false", "false false false true true"],
          answer: 0,
          why: "`false` becomes 0 first; `[0]` becomes `\"0\"`, then 0. `\"\"` is 0. `null` loosely equals only `null` and `undefined`, never 0. NaN equals nothing, itself included.",
        },
        {
          t: "steps",
          h: "The whole `==` algorithm",
          items: [
            "Same type: exactly `===`.",
            "`null` and `undefined` equal each other and nothing else.",
            "Number vs string: the string goes through `Number()`. BigInt vs string: the string is parsed as a BigInt.",
            "A boolean on either side becomes 0 or 1, then start over. So `\"1\" == true`, while `\"true\" == true` is false.",
            "Object vs primitive: the object goes through ToPrimitive (`Symbol.toPrimitive`, else `valueOf`, then `toString`), then start over.",
            "BigInt vs Number compares the mathematical values. Anything else is false.",
            "The one `==` worth writing is `x == null`: true for exactly `null` and `undefined`.",
          ],
        },
        {
          t: "predict",
          lang: "js",
          src: `const qty = "3";          // from an <input>
console.log(qty + 1, qty - 1, [1, 2] + [3], {} + []);`,
          q: "What prints?",
          options: ["31 2 1,23 [object Object]", "4 2 [1,2,3] [object Object]", "31 2 1,2,3 0", "4 2 1,23 0"],
          answer: 0,
          why: "`+` turns both sides into primitives and concatenates if either is a string. Every other arithmetic operator forces numbers. Arrays become strings through `join`, so `[1, 2] + [3]` is `\"1,2\" + \"3\"`.",
        },
        {
          t: "predict",
          lang: "js",
          src: `console.log([10, 9, 1, 100].sort());`,
          q: "What prints?",
          options: ["[1, 9, 10, 100]", "[1, 10, 100, 9]", "[100, 10, 9, 1]", "[10, 9, 1, 100]"],
          answer: 1,
          why: "With no comparator, `sort` stringifies every element and compares UTF-16 code units, even for numbers, so `\"100\" < \"9\"`. Pass `(a, b) => a - b`. For human text use `Intl.Collator`: code-unit order puts `\"Z\"` before `\"a\"`.",
        },
        {
          t: "pitfall",
          h: "A boolean is not a comparator",
          x: "`xs.sort((a, b) => a > b)` returns 1 or 0, never negative, so the comparator is inconsistent and the result is implementation-defined. V8 leaves `[3, 1, 2]` unchanged. Engines that happen to sort it are why it survives in old code. Return `a - b`.",
        },
        {
          t: "predict",
          lang: "js",
          src: `console.log(Number(""), Number(" 42 "), Number("12px"), parseInt("12px"), parseInt(0.0000005));`,
          q: "What prints?",
          options: ["0 42 NaN 12 5", "NaN 42 NaN 12 0", "NaN NaN NaN 12 0", "0 42 12 12 5"],
          answer: 0,
          why: "`Number` trims whitespace, maps empty to 0 and rejects any junk. `parseInt` reads a prefix and stops at the first bad character. `parseInt(0.0000005)` stringifies first, to `\"5e-7\"`, and the prefix is 5.",
        },
        {
          t: "pitfall",
          h: "An empty field is zero",
          x: "`Number(input.value)` on a cleared field is 0, and 0 passes every `isNaN` check. Emptied quantities get saved as 0 and blank prices as free. Test `value.trim() === \"\"` first, or read `input.valueAsNumber`, which is NaN when the field is empty.",
        },
      ],
    },
    {
      title: "Every number is a double",
      beats: [
        {
          t: "predict",
          lang: "js",
          src: `console.log(0.1 + 0.2 === 0.3);
console.log(2 ** 53 + 1 === 2 ** 53);
console.log(9007199254740993);`,
          q: "What prints?",
          options: ["false, true, 9007199254740992", "false, false, 9007199254740993", "true, true, 9007199254740993", "false, true, 9007199254740993"],
          answer: 0,
          why: "0.1 and 0.2 are rounded to the nearest doubles when parsed, and their sum rounds to the double just above 0.3. With a 53-bit significand, neighbours past 2^53 are 2 apart, so odd integers don't exist and that literal is rounded.",
        },
        {
          t: "pitfall",
          h: "64-bit ids die in JSON.parse",
          x: "A `BIGINT` key like `1234567890123456789` survives SQL and the wire, then `JSON.parse` turns it into `1234567890123456800`: a different row, and no error. Serialise 64-bit ids as strings. `Number.isSafeInteger` tells you when you've crossed 2^53 - 1.",
        },
        {
          t: "predict",
          lang: "js",
          src: `const MOD = 1_000_000_007;
const a = 999_999_999, b = 999_999_999;
console.log((a * b) % MOD);
console.log(Number((BigInt(a) * BigInt(b)) % BigInt(MOD)));`,
          q: "The second line prints 64. The first?",
          options: ["64, same as BigInt", "63", "a negative number", "it throws"],
          answer: 1,
          why: "`a * b` is near 1e18, far past 2^53, so it's rounded to a multiple of 128 before `%` sees it. Off by one, no error. Where C++ has `long long`, use BigInt, or split `b` into 16-bit halves so no partial product passes 2^53.",
        },
        {
          t: "code",
          lang: "js",
          src: `(2 ** 31) | 0            // -2147483648: ToInt32 wraps mod 2^32
-7.9 | 0                 // -7: truncates toward zero, like (int)
(2 ** 32 + 5) | 0        // 5
-1 >>> 0                 // 4294967295: same bits, read as uint32
Date.now() | 0           // garbage: timestamps are past 2^31

// 32-bit multiply: the double product loses the low bits
(0x7fffffff * 0x7fffffff) | 0       // 0, wrong
Math.imul(0x7fffffff, 0x7fffffff)   // 1, exact

10n ** 20n               // 100000000000000000000n, exact
-7n / 2n                 // -3n: truncates, like C++
BigInt.asUintN(64, -1n)  // 18446744073709551615n: u64 wraparound
1n + 1                   // TypeError: no implicit mixing
JSON.stringify(1n)       // TypeError: send it as a string`,
          mark: [1, 7, 8],
          note: "Bitwise operators convert to int32 and back, so `x | 0` is a C cast plus wraparound: fine for hashes, a bug on anything that can pass 2^31. `Math.imul` is the built-in exact 32-bit multiply.",
        },
        {
          t: "predict",
          lang: "js",
          src: `const x = Math.round(-0.4);
console.log(x === 0, Object.is(x, -0), 1 / x, JSON.stringify(x));`,
          q: "What prints?",
          options: ["true true -Infinity 0", "true false Infinity 0", "false true -Infinity -0", "true false NaN 0"],
          answer: 0,
          why: "`Math.round(-0.4)` is -0. `===` treats the zeros as equal, `Object.is` doesn't, division exposes the sign and JSON erases it. `assert.deepStrictEqual(-0, 0)` fails, which is usually how you find out.",
        },
        {
          t: "pitfall",
          h: "Formatting lies at the edges",
          x: "`(1.005).toFixed(2)` is `\"1.00\"`: the double is 1.00499999999999989. `(-0.04).toFixed(1)` is `\"-0.0\"`, the thermometer bug. Do money in integer cents, and format with `Intl.NumberFormat` and `signDisplay: \"negative\"`, which drops the sign of a rounded zero.",
        },
      ],
    },
    {
      title: "Strings are UTF-16",
      beats: [
        {
          t: "predict",
          lang: "js",
          src: raw`const s = "\u{1D11E}";   // the G clef: one character on screen
console.log(s.length, [...s].length);
console.log(s.charCodeAt(0).toString(16), s.codePointAt(0).toString(16));`,
          q: "What prints?",
          options: ["2 1, then d834 1d11e", "1 1, then 1d11e 1d11e", "2 2, then d834 dd1e", "4 1, then f0 1d11e"],
          answer: 0,
          why: "A string is a sequence of 16-bit code units. U+1D11E is above U+FFFF, so it takes a **surrogate pair**, D834 DD1E. `length`, indexing and `charCodeAt` count units; spread and `for...of` walk code points.",
        },
        {
          t: "predict",
          lang: "js",
          src: raw`const name = "Zoe\u0308";   // e + combining diaeresis: renders as one letter
const seg = new Intl.Segmenter("en", { granularity: "grapheme" });
console.log(name.length, [...name].length, [...seg.segment(name)].length);`,
          q: "Code points aren't characters either. What prints?",
          options: ["4 4 3", "3 3 3", "4 3 3", "4 4 4"],
          answer: 0,
          why: "Four code units, four code points, three **graphemes**. Combining accents, Hangul built from jamo, emoji with skin tones or joiners: only `Intl.Segmenter` counts what a human sees. Use it for character limits and cursor movement.",
        },
        {
          t: "pitfall",
          h: "slice() can cut a character in half",
          x: "`text.slice(0, 280)` can split a surrogate pair. The orphan renders as a replacement box, and `encodeURIComponent` throws `URIError: URI malformed` on it, so the share button crashes on one post in a thousand. Truncate by graphemes; `str.isWellFormed()` detects orphans.",
        },
        {
          t: "play",
          mode: "js",
          title: "code units, code points, graphemes",
          js: raw`const composed = "caf\u00e9";      // e-acute as one code point
const decomposed = "cafe\u0301";   // e + combining acute accent
console.log(composed, decomposed, composed === decomposed);
console.log(composed === decomposed.normalize("NFC"));

const clef = "\u{1D11E}";
const text = "music " + clef + clef;
console.log(text.length, [...text].length);
const cut = text.slice(0, 7);
console.log(cut.isWellFormed());
try { encodeURIComponent(cut); } catch (e) { console.log(e.name, e.message); }

const seg = new Intl.Segmenter("en", { granularity: "grapheme" });
const graphemes = (s) => Array.from(seg.segment(s), (x) => x.segment);
console.log(graphemes(decomposed).length);

function truncate(s, n) {
  // TODO: at most n graphemes, never split one
  return s.slice(0, n);
}
console.log(truncate(decomposed, 4), truncate(text, 7).isWellFormed());`,
          task: "Fix `truncate` with `graphemes` until the last line prints `café true`. Then sort `['b', 'a', 'B', 'é']` with `sort()` and with `new Intl.Collator('en').compare`.",
        },
      ],
    },
    {
      title: "Scope, closures and this",
      beats: [
        {
          t: "predict",
          lang: "js",
          src: `let x = "outer";
{
  console.log(x);
  let x = "inner";
}`,
          q: "What happens?",
          options: ["logs outer", "logs inner", "logs undefined", "ReferenceError"],
          answer: 3,
          why: "The inner `x` exists from the top of its block and shadows the outer one, but stays uninitialised until its line runs: the **temporal dead zone**. With `var` you'd get `undefined`. `let`, `const` and `class` throw, even under `typeof`.",
        },
        {
          t: "predict",
          lang: "js",
          src: `const fns = [];
for (var i = 0; i < 3; i++) fns.push(() => i);
for (let j = 0; j < 3; j++) fns.push(() => j);
console.log(fns.map((f) => f()).join(" "));`,
          q: "What prints?",
          options: ["0 1 2 0 1 2", "3 3 3 0 1 2", "3 3 3 3 3 3", "2 2 2 0 1 2"],
          answer: 1,
          why: "Closures capture **variables**, not values. `var i` is one variable for the whole function, read after the loop ended. `for (let ...)` makes a fresh binding per iteration and copies the value into it, so each closure has its own.",
        },
        { t: "say", h: "A closure is [&] that can't dangle", x: "A JS closure is a C++ lambda capturing by reference, except nothing dangles: a variable any inner function uses lives in a heap-allocated scope object that stays alive as long as some closure still points at it." },
        {
          t: "pitfall",
          h: "Sibling closures share one scope",
          x: "In V8, every closure created in a scope points at one shared context holding every variable any of them uses. A tiny event handler can keep a 50 MB buffer alive because a sibling callback used it. Null out big locals once you're done with them.",
        },
        { t: "say", x: "`this` is the one binding that isn't lexical. It's a hidden argument set by the **call site**: `obj.f()` passes `obj`, a plain `f()` passes `undefined` in strict code, `new` passes a fresh object. Arrow functions have no `this`; they read the enclosing one." },
        {
          t: "predict",
          lang: "js",
          src: `// in an ES module: strict, and top-level this is undefined
const user = {
  name: "ada",
  hi() { return this?.name; },
  arrow: () => this?.name,
  later() { return [0].map(() => this.name)[0]; },
};
const { hi } = user;
console.log(user.hi(), hi(), user.arrow(), user.later());`,
          q: "What prints?",
          options: ["ada undefined undefined ada", "ada ada ada ada", "ada undefined ada ada", "ada ada undefined undefined"],
          answer: 0,
          why: "Destructuring copies the function out, so `hi()` is a plain call: `this` is undefined. The object-literal arrow reads the module's `this`; an object literal is not a scope. The arrow inside `later` reads `later`'s `this`: `user`.",
        },
        {
          t: "table",
          caption: "Checked top to bottom: the first rule that matches decides.",
          head: ["Call", "`this` is"],
          rows: [
            ["`new F()`", "the new object, even if `F` came from `bind`"],
            ["`f.call(x)`, `f.apply(x)`, `f.bind(x)()`", "`x`; binding again later changes nothing"],
            ["`obj.f()`, `obj[k]()`", "`obj`"],
            ["`f()`", "`undefined` in strict code, `globalThis` in sloppy scripts"],
            ["`arr.map(obj.f)`, `setTimeout(obj.f)`", "not `obj`: the callee decides (`undefined` for `map`, `window` for timers)"],
            ["arrow function", "the enclosing `this`; `call` and `bind` can't change it"],
          ],
        },
        {
          t: "pitfall",
          h: "Arrow class fields live on the instance",
          x: "`onClick = () => {...}` is a field: a new function per instance, not a prototype method. `jest.spyOn(Widget.prototype, 'onClick')` finds nothing, a subclass can't call `super.onClick()`, and 10,000 rows mean 10,000 functions. That's the price of the auto-bound `this`.",
        },
      ],
    },
    {
      title: "Prototypes, and what class means",
      beats: [
        { t: "say", x: "Every object has one hidden link, `[[Prototype]]`. A read that misses walks the chain until it finds the key or hits `null`. A write never walks: it creates an own property on the receiver, unless the chain has a setter or a read-only property of that name." },
        {
          t: "predict",
          lang: "js",
          src: `function Dog(name) { this.name = name; }
Dog.prototype.tricks = [];
Dog.prototype.learn = function (t) { this.tricks.push(t); };

const a = new Dog("rex"), b = new Dog("fido");
a.learn("sit");
b.tricks = ["roll"];
console.log(a.tricks, b.tricks, new Dog("max").tricks);`,
          q: "What prints?",
          options: ["[sit] [roll] []", "[sit] [roll] [sit]", "[sit, roll] [sit, roll] [sit, roll]", "[sit] [sit, roll] [sit]"],
          answer: 1,
          why: "`this.tricks.push` reads through the chain and mutates the one shared array. `b.tricks = ...` is a write, so it makes an own property on `b` that shadows it. Class fields exist to put state on each instance.",
        },
        {
          t: "compare",
          a: {
            label: "what you write",
            lang: "js",
            src: `class Animal {
  static count = 0;
  legs = 4;
  constructor(name) {
    this.name = name;
    Animal.count++;
  }
  speak() { return this.name + " makes a sound"; }
}

class Dog extends Animal {
  speak() { return super.speak() + ": woof"; }
}`,
          },
          b: {
            label: "roughly what it means",
            lang: "js",
            src: `function Animal(name) {
  this.legs = 4;                 // fields run first
  this.name = name;
  Animal.count++;
}
Animal.count = 0;
Animal.prototype.speak = function () {
  return this.name + " makes a sound";
};

function Dog(...args) {          // the base allocates
  return Reflect.construct(Animal, args, new.target);
}
Object.setPrototypeOf(Dog.prototype, Animal.prototype); // instances
Object.setPrototypeOf(Dog, Animal);                     // statics
Dog.prototype.speak = function () {
  return Animal.prototype.speak.call(this) + ": woof";
};`,
          },
          x: "Not exact: class methods are non-enumerable, class bodies are strict, calling a class without `new` throws, and `super` is fixed to the method's home object instead of being looked up through `this`.",
        },
        {
          t: "predict",
          lang: "js",
          src: `class Base {
  constructor() { this.kind = "base"; }
}
class Child extends Base {
  constructor() {
    this.tag = "child";
    super();
  }
}
new Child();`,
          q: "What happens?",
          options: ["an object with `tag` and `kind`", "an object with only `kind`", "ReferenceError", "TypeError"],
          answer: 2,
          why: "A derived constructor never allocates: `this` is unbound until `super()` returns the object the base made. That's how `extends Array` or `extends HTMLElement` gets a real exotic object, and why the desugaring needs `Reflect.construct`.",
        },
        { t: "say", h: "Private fields are not properties", x: "`#n` lives in a hidden slot stamped on the object by the class that declares it. No `Object.keys`, `JSON.stringify`, `Proxy` trap or `structuredClone` sees it. `obj.#n` on an object without the slot throws; `#n in obj` checks safely." },
        {
          t: "pitfall",
          h: "Proxies and #private don't mix",
          x: "Wrap an instance in a `Proxy`, as Vue's `reactive` and other proxy-based stores do, and every method touching `this.#n` throws `Cannot read private member`: `this` is now the proxy, which has no slot. Keep such classes out of reactive stores, or mark them raw.",
        },
        {
          t: "rebuild",
          h: "new, instanceof and bind by hand",
          x: "Three builtins, a few lines each. `myNew` works; `myInstanceof` and the `new` path of `myBind` don't yet. Run it, read the FAILs, fix them. The primitive test exists to catch the obvious solution.",
          mode: "js",
          js: `// new F(...args), by hand
function myNew(F, ...args) {
  const obj = Object.create(F.prototype);
  const out = F.apply(obj, args);
  const isObj = out !== null && (typeof out === "object" || typeof out === "function");
  return isObj ? out : obj; // a constructor may return its own object
}

// a instanceof F: is F.prototype anywhere on a's chain?
function myInstanceof(a, F) {
  // TODO
  return false;
}

// f.bind(thisArg, ...pre)
function myBind(f, thisArg, ...pre) {
  return function bound(...rest) {
    // TODO: under \`new\`, ignore thisArg and construct f instead
    return f.apply(thisArg, [...pre, ...rest]);
  };
}

function Point(x, y) { this.x = x; this.y = y; }
Point.prototype.len = function () { return Math.hypot(this.x, this.y); };
const check = (name, got, want) => console.log(Object.is(got, want) ? "pass" : "FAIL", name, "->", got);

const p = myNew(Point, 3, 4);
check("myNew", p.len(), 5);
check("myNew, returned object wins", myNew(function () { return { a: 1 }; }).a, 1);
check("instanceof", myInstanceof(p, Point), true);
check("instanceof, other chain", myInstanceof({}, Point), false);
check("instanceof, null prototype", myInstanceof(Object.create(null), Object), false);
check("instanceof, primitive", myInstanceof(5, Number), false);
check("bind", myBind(function () { return this.n; }, { n: 7 })(), 7);
const P2 = myBind(Point, null, 1);
const q = new P2(2);
check("bind under new", q instanceof Point && q.y === 2, true);`,
          task: "Walk `Object.getPrototypeOf` in `myInstanceof`, rejecting primitives first. In `myBind`, check `new.target` and construct `f` instead. Bonus: make `q instanceof P2` true.",
        },
      ],
    },
    {
      title: "Modules: live bindings and order",
      beats: [
        { t: "say", x: "An ES module runs once, in strict mode, in its own scope. Its imports aren't copies: each is a **live, read-only view** of a variable in the exporting module." },
        {
          t: "predict",
          lang: "js",
          src: `// counter.js
export let count = 0;
export function inc() { count++; }

// main.js
import { count, inc } from "./counter.js";
inc(); inc();
console.log(count);
count = 10;`,
          q: "What happens in main.js?",
          options: ["logs 0, then count is 10", "logs 2, then TypeError", "logs 2, then count is 10", "logs 0, then TypeError"],
          answer: 1,
          why: "`count` is a binding to counter.js's variable, so it reads 2. From outside it's read-only: assigning throws `TypeError: Assignment to constant variable`. CommonJS `const { count } = require(...)` would have copied the 0.",
        },
        {
          t: "predict",
          lang: "js",
          src: `// state.js
let mode = "light";
export default mode;
export { mode };
export function toggle() { mode = "dark"; }

// main.js
import m, { mode, toggle } from "./state.js";
toggle();
console.log(m, mode);`,
          q: "What prints?",
          options: ["dark dark", "light dark", "light light", "SyntaxError: duplicate export"],
          answer: 1,
          why: "`export default mode` exports the **value** of an expression, evaluated once, into a hidden binding. `export { mode }` exports the variable itself. For a live default, write `export { mode as default }`.",
        },
        {
          t: "code",
          lang: "js",
          src: `// main.js
import "./a.js";

// a.js
import { b } from "./b.js";
export const a = "A";
console.log("a sees", b);

// b.js
import { a } from "./a.js";
export const b = "B";
console.log("b sees", a);`,
          note: "A two-module cycle, the shape a barrel file creates without anyone noticing. Step through it below.",
        },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Evaluation stack", "a.js bindings", "b.js bindings", "Console"],
            frames: [
              { cells: [[], ["a: uninitialised"], ["b: uninitialised"], []], note: "Before any code runs, the whole graph is fetched, parsed and linked. Every export binding exists, uninitialised, and imports point at them." },
              { cells: [["main.js", "a.js"], ["a: uninitialised"], ["b: uninitialised"], []], note: "Evaluation is depth-first, dependencies first. main.js waits for a.js, and a.js waits for b.js." },
              { cells: [["main.js", "a.js", "b.js"], ["a: uninitialised"], ["b: uninitialised"], []], note: "b.js imports a.js, which is already on the stack: a cycle. Nothing waits. b.js runs now, before a.js has run a single line." },
              { cells: [["main.js", "a.js", "b.js"], ["a: uninitialised"], ["b: \"B\""], []], note: "`export const b = \"B\"` initialises b.js's binding." },
              { cells: [["main.js", "a.js", "b.js"], ["a: uninitialised"], ["b: \"B\""], ["ReferenceError: Cannot access 'a' before initialization"]], note: "b.js reads `a`, still in its TDZ, and the graph fails. An exported function declaration would have worked: those are initialised at link time." },
              { cells: [["main.js"], ["a: \"A\""], ["b: \"B\""], ["a sees B", "b sees A"]], note: "The fix: b.js reads `a` inside an exported function that main.js calls after both modules ran. The live binding then sees \"A\"." },
            ],
          },
        },
        {
          t: "pitfall",
          h: "Barrel files manufacture cycles",
          x: "An `index.js` re-exporting every component lets any file import any other through it, and the graph fills with cycles. The day a `class X extends Base` runs before Base's module, the app dies with `Cannot access 'Base' before initialization`. Inside a package, import from the file.",
        },
        {
          t: "predict",
          lang: "js",
          src: `// main.js
console.log("main body");
import "./slow.js";
import "./fast.js";

// slow.js
console.log("slow start");
await new Promise((r) => setTimeout(r, 100));
console.log("slow end");

// fast.js
console.log("fast");`,
          q: "Output order?",
          options: ["main body, slow start, slow end, fast", "slow start, slow end, fast, main body", "slow start, fast, slow end, main body", "slow start, fast, main body, slow end"],
          answer: 2,
          why: "Imports are hoisted: dependencies run before the importer's body, whatever the line order. Top-level `await` pauses slow.js and everything that imports it; fast.js doesn't depend on it, so it runs meanwhile.",
        },
      ],
    },
    {
      title: "Iterators and generators",
      beats: [
        { t: "say", x: "`for...of`, spread, destructuring, `Array.from`, `new Map(x)`, `Promise.all` and `yield*` all speak one protocol: call `x[Symbol.iterator]()` to get an iterator, then call `next()` until `done` is true. Implement it once and all of them work." },
        {
          t: "play",
          mode: "js",
          title: "the protocol, by hand",
          js: `const range = (lo, hi) => ({
  [Symbol.iterator]() {
    let i = lo;
    return {
      next() {
        console.log("  next()");
        return i < hi ? { value: i++, done: false } : { value: undefined, done: true };
      },
      return() {
        console.log("  return(): the consumer stopped early");
        return { done: true };
      },
    };
  },
});

console.log("spread:", [...range(0, 3)]);
const [a, b] = range(0, 100);
console.log("destructured", a, b);
for (const x of range(0, 100)) {
  if (x === 1) break;
}
console.log("done");`,
          task: "Rewrite `range` as a generator with a `try/finally` that logs: the `finally` runs on `break` too. Then drop `hi` so it never ends, and take 3 with `.take(3).toArray()`.",
        },
        {
          t: "predict",
          lang: "js",
          src: `function* evens() { yield 0; yield 2; yield 4; }
const xs = evens();
const total = [...xs].reduce((a, b) => a + b, 0);
console.log(total, [...xs].length, Math.max(...xs));`,
          q: "What prints?",
          options: ["6 3 4", "6 0 -Infinity", "6 0 undefined", "6 3 -Infinity"],
          answer: 1,
          why: "A generator object is an iterator, and iterators are one-shot: the first spread drained it. Arrays, Sets and Maps are iterables that hand out a fresh iterator each time; `map.values()` is one-shot too. Pass the generator function, or spread once.",
        },
        {
          t: "predict",
          lang: "js",
          src: `function* g() {
  const a = yield 1;
  const b = yield a * 10;
  return a + b;
}
const it = g();
console.log(it.next("x").value, it.next(2).value, it.next(3));`,
          q: "What prints?",
          options: ["1 20 { value: 5, done: true }", "1 NaN { value: NaN, done: true }", "x 20 { value: 5, done: false }", "1 20 { value: undefined, done: true }"],
          answer: 0,
          why: "`next(v)` resumes the paused `yield` and makes it evaluate to `v`. The first `next` has no paused `yield` to receive \"x\", so it's dropped. A coroutine driven from outside: transpilers built async/await on exactly this.",
        },
        {
          t: "code",
          lang: "js",
          src: `function* naturals() {
  for (let n = 1; ; n++) yield n;
}

naturals()
  .map((n) => n * n)
  .filter((n) => n % 3 === 1)
  .take(5)
  .toArray();                                   // [1, 4, 16, 25, 49]

Iterator.from(new Set([3, 1, 2])).drop(1).toArray();  // [1, 2]`,
          note: "Iterator helpers (ES2025, in every current engine) are lazy: one element flows through the whole chain at a time, so infinite sources and early exits are free. Array methods build an array per step.",
        },
        {
          t: "mission",
          h: "Lazy zip, chunk and sliding",
          x: "Write generators `zip(...iterables)`, `chunk(iterable, n)` and `sliding(iterable, k)`. All must work on infinite inputs. When `zip` stops at its shortest input it must close the others, so their `finally` blocks run.",
          hint: "Get the iterators with `[Symbol.iterator]()` and call `next()` on each yourself. Put `for (const it of its) it.return?.()` in a `finally`. `sliding` keeps a buffer of k and yields a copy.",
          solution: {
            lang: "js",
            src: `function* zip(...iterables) {
  const its = iterables.map((x) => x[Symbol.iterator]());
  try {
    for (;;) {
      const rs = its.map((it) => it.next());
      if (rs.some((r) => r.done)) return;
      yield rs.map((r) => r.value);
    }
  } finally {
    for (const it of its) it.return?.();
  }
}

function* chunk(iterable, n) {
  let buf = [];
  for (const x of iterable) {
    buf.push(x);
    if (buf.length === n) { yield buf; buf = []; }
  }
  if (buf.length) yield buf;
}

function* sliding(iterable, k) {
  const buf = [];
  for (const x of iterable) {
    buf.push(x);
    if (buf.length > k) buf.shift();
    if (buf.length === k) yield [...buf];
  }
}`,
          },
        },
      ],
    },
    {
      title: "Collections, copies and equality",
      beats: [
        {
          t: "predict",
          lang: "js",
          src: `const scores = { carol: 3, 10: "x", bob: 2, 2: "y", alice: 1 };
console.log(Object.keys(scores).join(" "));`,
          q: "What prints?",
          options: ["carol 10 bob 2 alice", "2 10 carol bob alice", "10 2 carol bob alice", "alice bob carol 10 2"],
          answer: 1,
          why: "Own keys come out integer-like first, ascending, then strings in insertion order, then symbols. `JSON.parse` follows the same rule, so a server's ranked `{ [userId]: score }` arrives sorted by id. `Map` keeps insertion order for every key.",
        },
        {
          t: "predict",
          lang: "js",
          src: `const dist = new Map();
dist.set([0, 0], 0);
dist.set(NaN, "nan");
console.log(dist.get([0, 0]), dist.get(NaN), dist.size);`,
          q: "What prints?",
          options: ["0 nan 2", "undefined nan 2", "undefined undefined 2", "0 undefined 1"],
          answer: 1,
          why: "Map compares object keys by identity, so a new `[0, 0]` is a different key: there's no `std::pair` hashing. Encode cells as `x * W + y` or `x + \",\" + y`. NaN works as a key, and -0 is stored as 0.",
        },
        {
          t: "pitfall",
          h: "A plain object is a bad dictionary",
          x: "Count words into `{}` and the word \"constructor\" yields `\"function Object() { [native code] }1\"`, because `counts.constructor` is inherited. `\"__proto__\"` is worse: the write is swallowed. Keys that come from users go in a `Map` or an `Object.create(null)`.",
        },
        {
          t: "code",
          lang: "js",
          src: `const meta = new WeakMap();   // node -> data; the entry dies with the node
function track(node) {
  if (!meta.has(node)) meta.set(node, { clicks: 0 });
  meta.get(node).clicks++;
}

// A WeakRef doesn't keep its target alive; deref() is undefined once collected
const cache = new Map();      // key -> WeakRef
const gone = new FinalizationRegistry((key) => {
  if (!cache.get(key)?.deref()) cache.delete(key);   // late, or never
});
function load(key, make) {
  const hit = cache.get(key)?.deref();
  if (hit) return hit;
  const value = make(key);
  cache.set(key, new WeakRef(value));
  gone.register(value, key);
  return value;
}`,
          mark: [1, 13],
          note: "WeakMap attaches data to objects you don't own without leaking them. It can't be iterated or sized: that would reveal when GC ran. Finalizers may never run, so no cleanup that matters goes in one.",
        },
        {
          t: "table",
          head: ["", "`{ ...x }`", "`JSON` round trip", "`structuredClone`"],
          rows: [
            ["depth", "one level", "deep", "deep"],
            ["`Date`", "shared", "becomes a string", "a `Date`"],
            ["`Map`, `Set`", "shared", "become `{}`", "copied"],
            ["`undefined`, `NaN`", "kept", "key dropped, `NaN` becomes `null`", "kept"],
            ["functions", "shared", "dropped", "throws `DataCloneError`"],
            ["cycles", "shared", "throws `TypeError`", "preserved"],
            ["`BigInt`", "kept", "throws `TypeError`", "kept"],
            ["class instance", "plain object, own fields", "plain object", "plain object: methods and `#private` gone"],
          ],
        },
        {
          t: "predict",
          lang: "js",
          src: `const xs = [NaN, -0];
console.log(xs.indexOf(NaN), xs.includes(NaN), xs.includes(0));
console.log(Object.is(xs[1], 0), new Set(xs).has(0));`,
          q: "What prints?",
          options: ["-1 true true, then false true", "0 true false, then false false", "-1 false true, then true true", "0 true true, then false true"],
          answer: 0,
          why: "`indexOf` uses `===`, where NaN matches nothing. `includes`, Map and Set use SameValueZero: NaN matches NaN and -0 matches 0. `Object.is` matches NaN but splits the zeros.",
        },
        {
          t: "table",
          head: ["Algorithm", "`NaN`, `NaN`", "`0`, `-0`", "Used by"],
          rows: [
            ["`==`", "false", "true", "`x == null`, and nothing else you should write"],
            ["`===`", "false", "true", "`indexOf`, `switch`"],
            ["SameValueZero", "true", "true", "`includes`, Map and Set keys"],
            ["`Object.is` (SameValue)", "true", "false", "React state and hook deps"],
          ],
        },
      ],
    },
  ],
  nobodyTells: [
    "`new Array(n).map(f)` returns n holes: `map`, `forEach` and `filter` skip holes. `Array.from({ length: n }, f)` is the one-liner that works.",
    "`Math.max(...arr)` throws RangeError past about 10^5 elements in V8, since spread arguments go on the stack, and returns -Infinity for an empty array. Loop instead.",
    "V8's default stack fits roughly 10^4 frames of a simple recursive function. A DFS down a 10^5-node path graph needs an explicit stack.",
    "`sort` has been stable since ES2019: sort by the secondary key, then by the primary, and ties keep the secondary order.",
    "`(0, obj.fn)()` in compiled code isn't noise: it calls `fn` with `this` undefined, the way the plain `fn()` in your source did.",
    "Modules are cached by resolved URL. `./store.js?v=2`, or a second copy in node_modules, is a second module with its own singleton state.",
    "Sets have `union`, `intersection`, `difference` and `isSubsetOf` (ES2025). The argument can be any set-like with `size`, `has` and `keys`, a Map included.",
    "Normalise text to NFC where it enters: `é` can arrive as one code point or two, and `===`, Map keys and search treat those as different strings.",
  ],
  glossary: [
    ["call by sharing", "Passing a reference by value: the callee can mutate the object but can't rebind the caller's variable."],
    ["ToPrimitive", "The coercion step that turns an object into a primitive via `Symbol.toPrimitive`, `valueOf` or `toString`."],
    ["safe integer", "An integer within ±(2^53 - 1), where every integer is exactly representable as a double."],
    ["BigInt", "The arbitrary-precision integer primitive, written `123n`. Never mixes implicitly with Number."],
    ["code unit", "One 16-bit element of a JS string. `length`, indexing and `slice` count these."],
    ["surrogate pair", "Two code units that together encode one code point above U+FFFF."],
    ["grapheme cluster", "What a reader sees as one character; may span several code points. Count it with `Intl.Segmenter`."],
    ["temporal dead zone", "From the start of a scope to a `let`, `const` or `class` line: reading the name there throws."],
    ["closure", "A function plus the variables it captured, by reference, from its enclosing scopes."],
    ["prototype chain", "The linked list of `[[Prototype]]` objects a missed property read walks, ending at `null`."],
    ["live binding", "An import that reads the exporter's variable itself, so it sees every later change."],
    ["iterator protocol", "`[Symbol.iterator]()` returns an object whose `next()` returns `{ value, done }`."],
    ["SameValueZero", "The equality behind `includes`, Map and Set: `===`, except NaN equals NaN."],
  ],
  explain: "Explain to a friend what happens, step by step, when you run `new Dog('rex')` for a class that extends `Animal`: who allocates the object, where its prototype comes from, and why touching `this` before `super()` throws.",
};
