export default {
  id: "typescript",
  n: 11,
  part: "B",
  title: "TypeScript for real",
  hook: "A type system that is erased before your code runs, and still catches most of your bugs. Here is how far to trust it.",
  minutes: 80,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "Types that vanish",
      beats: [
        { t: "say", x: "TypeScript is JavaScript plus a type layer that a checker reads and the build deletes. What runs is your JS minus the annotations: no runtime checks, no reflection, no overloading on types. If the checker is wrong about a value, nothing notices." },
        {
          t: "predict",
          lang: "ts",
          src: `function add(a: number, b: number) { return a + b; }
console.log(add("2" as any, 3));

const x: number = JSON.parse('"7"');
console.log(x + 1);`,
          q: "This compiles cleanly. What does it print when run?",
          options: ["5, then 8", "23, then 71", "a TypeError on the first call", "5, then 71"],
          answer: 1,
          why: "Annotations are deleted, so `add` is plain JS doing string concatenation. `JSON.parse` returns `any`, and `any` assigns to `number` without complaint. `x` holds the string \"7\" while the checker swears it's a number.",
        },
        {
          t: "table",
          caption: "Only tsc and the editor check types, and only tsc can fail a build.",
          head: ["Tool", "What it does with types", "Reads tsconfig"],
          rows: [
            ["`tsc`", "checks the whole program, then emits JS (or nothing, with `--noEmit`)", "yes"],
            ["esbuild, swc, Vite, Bun", "strips them file by file, no checking at all", "a few emit options"],
            ["Node 22.18+, 23.6+", "strips them by default (`node app.ts`), no checking; stable since 24.12 and 25.2", "no"],
            ["your editor", "the same checker as `tsc`, live, but only reports files you have open", "yes"],
          ],
        },
        {
          t: "pitfall",
          h: "A green build can carry red types",
          x: "Vite, esbuild and Node only strip. A type error compiles, bundles, deploys and crashes in production, and nothing in the build log says so. Put `tsc --noEmit` in CI as its own step, next to lint and tests. The editor's red squiggle is not a gate.",
        },
        {
          t: "code",
          lang: "ts",
          src: `// tsconfig: "erasableSyntaxOnly": true flags everything below

enum Color { Red }                        // emits an object
class P { constructor(public x: number) {} }  // emits this.x = x
namespace N { export const y = 1; }       // emits an IIFE

// Erasable: delete the types and valid JS remains
type Point = { x: number; y: number };
const p = { x: 1, y: 2 } satisfies Point;
import type { User } from "./user.ts";`,
          mark: [3, 4, 5],
          note: "A stripper swaps types for whitespace, so it can't generate code. Enums, parameter properties and value namespaces need it. Node refuses them; `erasableSyntaxOnly` makes tsc refuse them too.",
        },
        {
          t: "predict",
          lang: "ts",
          src: `// user.ts
export interface User { name: string }
export const mk = (n: string): User => ({ name: n });

// main.ts, run with: node main.ts
import { User, mk } from "./user.ts";
const u: User = mk("ada");
console.log(u);`,
          q: "What happens?",
          options: ["logs { name: 'ada' }", "SyntaxError: user.ts does not provide an export named 'User'", "a type error, printed before running", "logs undefined"],
          answer: 1,
          why: "The stripper sees one file at a time and can't know `User` is only a type, so the import survives and fails to link. Write `import { type User, mk }`. `verbatimModuleSyntax` makes tsc flag it as TS1484 before Node does.",
        },
        { t: "say", h: "TypeScript 7 is a Go binary", x: "TypeScript 7.0 (July 2026) is a native port of the compiler, still `npm i -D typescript` and still `tsc`, with 8 to 12x faster full builds. `strict` is now the default. It ships without a programmatic API; tools that need one use `@typescript/typescript6`." },
      ],
    },
    {
      title: "Shapes, not names",
      beats: [
        { t: "say", x: "In C++ a type is a name: two structs with identical fields don't convert. In TypeScript a type is a **set of values**, and A is assignable to B when every A-shaped value fits B. The name is a label for your benefit only." },
        {
          t: "predict",
          lang: "ts",
          src: `class Meters { constructor(public value: number) {} }
class Seconds { constructor(public value: number) {} }

const d: Meters = new Seconds(3);`,
          q: "Does this compile?",
          options: ["yes", "no: Seconds is not assignable to Meters", "only with `as Meters`", "no: classes are nominal"],
          answer: 0,
          why: "**Structural typing**: Seconds has every member Meters requires, so it fits. Classes are checked by shape too, unless they have `private` or `#private` members, which only instances of that exact class carry.",
        },
        {
          t: "code",
          lang: "ts",
          src: `type UserId = string & { readonly __brand: "UserId" };
type OrderId = string & { readonly __brand: "OrderId" };

const asUserId = (s: string) => s as UserId;   // the one sanctioned door
declare function getUser(id: UserId): void;
declare const orderId: OrderId;

getUser(asUserId("u1"));   // ok
getUser("u1");             // error: string is not UserId
getUser(orderId);          // error: '"OrderId"' is not '"UserId"'`,
          note: "A **brand** fakes nominal typing: a phantom property no real value has. At runtime it's a plain string, so it costs nothing. Use it for ids, units and sanitized HTML.",
        },
        {
          t: "predict",
          lang: "ts",
          src: `interface Opts { retries: number; timeout?: number }

const o1: Opts = { retries: 3, timout: 100 };

const tmp = { retries: 3, timout: 100 };
const o2: Opts = tmp;`,
          q: "Which assignments error?",
          options: ["both", "only o1", "only o2", "neither: extra properties are fine structurally"],
          answer: 1,
          why: "Extra properties are structurally fine, so o2 passes. A **fresh object literal** gets an extra check, the excess property check, because a typo there is almost always a bug. Once the literal sits in a variable, the check is gone.",
        },
        {
          t: "pitfall",
          h: "Excess property checks only see fresh literals",
          x: "`createServer({ ...defaults, timout: 5 })` gets checked, but `const opts = { timout: 5 }; createServer(opts)` doesn't, and the typo silently does nothing. Write config objects inline at the call, or `satisfies Opts` where they're declared, so the check runs on the literal.",
        },
        {
          t: "quiz",
          q: "Under `strict`, which line fails to compile?",
          options: ["`let a: {} = 0;`", "`let b: {} = \"s\";`", "`let c: object = 0;`", "`let d: unknown = null;`"],
          answer: 2,
          why: "`{}` means any non-nullish value, primitives included, since 0 has every property `{}` asks for (none). `object` means non-primitive. `unknown` takes everything. To say \"some object\", write `object` or `Record<string, unknown>`.",
        },
      ],
    },
    {
      title: "Inference, literals and satisfies",
      beats: [
        {
          t: "predict",
          lang: "ts",
          src: `let a = "x";
const b = "x";
const arr = [1, "a"];
const o = { k: "x" };`,
          q: "Inferred types of a, b, arr and o?",
          options: ["string, \"x\", (string | number)[], { k: string }", "\"x\", \"x\", [number, string], { k: \"x\" }", "string, string, any[], { k: string }", "string, \"x\", [1, \"a\"], { readonly k: \"x\" }"],
          answer: 0,
          why: "**Widening**: a `const` primitive can never change, so it keeps its literal type. Anything that can be reassigned or mutated (a `let`, array elements, object properties) widens to the general type. Arrays infer as arrays, not tuples.",
        },
        {
          t: "code",
          lang: "ts",
          src: `const ROLES = ["admin", "editor", "viewer"] as const;
// readonly ["admin", "editor", "viewer"]

type Role = (typeof ROLES)[number];
// "admin" | "editor" | "viewer"

const isRole = (s: string): s is Role => (ROLES as readonly string[]).includes(s);

const LIMITS = { admin: 100, editor: 20, viewer: 5 } satisfies Record<Role, number>;
// add a role to ROLES and this line errors until you add its limit`,
          mark: [1, 4],
          note: "`as const` turns widening off all the way down and adds `readonly`. Derive the type from the value: one source of truth, and the array is there at runtime for validation and dropdowns.",
        },
        { t: "say", h: "Annotate the edges, infer the middle", x: "Annotate parameters, exported return types and empty containers. Let locals infer. A return annotation makes the error land inside the function that's wrong instead of at thirty call sites, and stops an accidental `string | undefined` leaking out." },
        {
          t: "predict",
          lang: "ts",
          src: `const cfg1: Record<string, string | number> = { port: 8080, host: "x" };
cfg1.port;   // type?
cfg1.typo;   // compiles?

const cfg2 = { port: 8080, host: "x" } satisfies Record<string, string | number>;
cfg2.port;   // type?
cfg2.typo;   // compiles?`,
          q: "Which is right?",
          options: ["cfg1.port: number, cfg1.typo errors; cfg2 the same", "cfg1.port: string | number, cfg1.typo compiles; cfg2.port: number, cfg2.typo errors", "both are string | number and both typos compile", "cfg1.port: string | number, cfg1.typo errors; cfg2.typo compiles"],
          answer: 1,
          why: "An annotation replaces the inferred type with the declared one, keys and all; a string index signature accepts any key. `satisfies` checks the value against the type but keeps the precise inferred type, so you get both the check and the detail.",
        },
        {
          t: "pitfall",
          h: "`as const` arrays don't fit `string[]` parameters",
          x: "Pass `ROLES` to `function f(xs: string[])` and it fails: a readonly array can't go where a mutable one is expected, since `f` could push. Declare parameters you don't mutate as `readonly string[]`. It also documents that `f` won't touch the caller's array.",
        },
      ],
    },
    {
      title: "Unions and narrowing",
      beats: [
        { t: "say", x: "**Narrowing** is flow analysis. The checker tracks, at each point, which members of a union a variable can still be, refined by `typeof`, `===`, truthiness, `in`, `instanceof` and checks on a shared tag field." },
        {
          t: "predict",
          lang: "ts",
          src: `function size(x: string | string[] | null) {
  if (typeof x === "object") {
    return x.length;
  }
  return x.length;
}`,
          q: "Does it compile?",
          options: ["yes", "no: line 3, 'x' is possibly 'null'", "no: line 5, 'x' is possibly 'null'", "no: `length` isn't on string | string[]"],
          answer: 1,
          why: "`typeof null` is \"object\", and the checker models that exactly: inside the `if`, x is `string[] | null`. Outside it's `string`. Check `x === null` first, or use `Array.isArray(x)`.",
        },
        {
          t: "code",
          lang: "ts",
          src: `type Shape =
  | { kind: "circle"; r: number }
  | { kind: "rect"; w: number; h: number }
  | { kind: "tri"; b: number; h: number };     // just added

function area(s: Shape): number {
  switch (s.kind) {
    case "circle": return Math.PI * s.r ** 2;   // s is the circle
    case "rect": return s.w * s.h;              // s is the rect
    default: {
      const unreachable: never = s;
      // error: '{ kind: "tri"; ... }' is not assignable to 'never'
      throw new Error("unhandled " + JSON.stringify(unreachable));
    }
  }
}`,
          mark: [11],
          note: "A **discriminated union**: one literal-typed tag on every member. Assigning to `never` turns \"I forgot a case\" into a compile error at every switch, the day someone adds a member.",
        },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Point in area()", "What s can be"],
            frames: [
              { cells: [["entry"], ["circle", "rect", "tri"]], note: "The parameter starts as the declared union: all three members." },
              { cells: [["case \"circle\""], ["circle"]], note: "`s.kind === \"circle\"` keeps only members whose tag can be \"circle\". Inside, `s.r` is legal." },
              { cells: [["case \"rect\""], ["rect"]], note: "Each case narrows by its own tag compare: here, only rect." },
              { cells: [["default"], ["tri"]], note: "`default` gets the members no case label matched. Here that's tri, the one nobody handled." },
              { cells: [["const unreachable: never = s"], ["tri: error"]], note: "Only the empty union fits `never`. Add a `case \"tri\"` and the set here becomes empty, and the line compiles." },
            ],
          },
        },
        {
          t: "predict",
          lang: "ts",
          src: `type User = { name?: string };

function greet(u: User, names: string[]) {
  if (u.name) {
    names.forEach(() => u.name.toUpperCase());   // A
    const n = u.name;
    names.forEach(() => n.toUpperCase());        // B
  }
}`,
          q: "Which lines error?",
          options: ["neither", "A only", "B only", "both"],
          answer: 1,
          why: "A callback may run later, after someone sets `u.name = undefined`, so narrowings of properties reset inside it. A `const` can't change, so its narrowing survives. A `let` keeps its narrowing too if it's never assigned after the closure is created.",
        },
        {
          t: "pitfall",
          h: "A type predicate is an unchecked promise",
          x: "`function isUser(x: unknown): x is User { return typeof x === \"object\"; }` compiles, and every caller now trusts a lie. The body of a guard is never checked against its claim. Keep guards tiny, test them, or let a validator write them. Since 5.5, `filter(x => x !== null)` infers its own guard.",
        },
        {
          t: "play",
          mode: "js",
          title: "never is compile-time only",
          js: `// What area() compiles to, fed data from an older or newer server
function area(s) {
  switch (s.kind) {
    case "circle": return Math.PI * s.r ** 2;
    case "rect": return s.w * s.h;
    default: {
      const unreachable = s;
      throw new Error("unhandled " + JSON.stringify(unreachable));
    }
  }
}

const fromServer = JSON.parse('[{"kind":"rect","w":2,"h":3},{"kind":"hexagon","side":1},{"kind":"circle","radius":1}]');
for (const s of fromServer) {
  try { console.log(s.kind, area(s)); }
  catch (e) { console.log("threw:", e.message); }
}`,
          task: "The hexagon throws, but the circle quietly returns NaN: `radius` vs `r`. Types promised neither. Make `area` return `null` for unknown kinds and reject a non-number `r` or `w`.",
        },
      ],
    },
    {
      title: "Generics and type-level programming",
      beats: [
        {
          t: "code",
          lang: "ts",
          src: `function pluck<T, K extends keyof T>(xs: T[], k: K): T[K][] {
  return xs.map((x) => x[k]);
}

const users = [{ name: "ada", age: 36, admin: true }];
pluck(users, "name");    // string[]
pluck(users, "age");     // number[]
pluck(users, "email");   // error: not "name" | "age" | "admin"

const conf = { port: 8080, host: "x" };
type Conf = typeof conf;         // { port: number; host: string }
type Key = keyof typeof conf;    // "port" | "host"
type Port = Conf["port"];        // number`,
          mark: [1],
          note: "`keyof T` is the union of T's keys, `T[K]` is an **indexed access**, and `typeof` lifts a value into the type world. `K extends keyof T` is a constraint, like a C++20 concept but checked on shape.",
        },
        {
          t: "code",
          lang: "ts",
          src: `type MyPartial<T> = { [K in keyof T]?: T[K] };
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

type Getters<T> = {
  [K in keyof T as \`get\${Capitalize<string & K>}\`]: () => T[K];
};
type G = Getters<{ name: string; age: number }>;
// { getName: () => string; getAge: () => number }`,
          note: "A **mapped type** is a loop over keys. `?` and `readonly` can be added or removed with `+`/`-`, and `as` renames each key, here with a template literal type.",
        },
        {
          t: "predict",
          lang: "ts",
          src: `type ToArr<T> = T extends unknown ? T[] : never;
type A = ToArr<string | number>;

type ToArr2<T> = [T] extends [unknown] ? T[] : never;
type B = ToArr2<string | number>;`,
          q: "What are A and B?",
          options: ["both (string | number)[]", "A: string[] | number[], B: (string | number)[]", "A: (string | number)[], B: string[] | number[]", "both string[] | number[]"],
          answer: 1,
          why: "A conditional type on a bare type parameter is **distributive**: it maps over each union member and unions the results. Wrapping both sides in a one-element tuple turns distribution off.",
        },
        {
          t: "code",
          lang: "ts",
          src: `type Params<S extends string> =
  S extends \`\${string}:\${infer P}/\${infer Rest}\` ? P | Params<Rest>
  : S extends \`\${string}:\${infer P}\` ? P
  : never;

type R = Params<"/users/:id/posts/:postId">;   // "id" | "postId"

function route<S extends string>(path: S, h: (p: Record<Params<S>, string>) => void) {}
route("/users/:id", (p) => p.id);     // ok
route("/users/:id", (p) => p.uid);    // error: no 'uid'

type Unwrap<T> = T extends Promise<infer V> ? Unwrap<V> : T;
type N = Unwrap<Promise<Promise<number>>>;    // number`,
          mark: [2],
          note: "`infer` binds a type variable during matching, like a pattern in a functional language. Template literal types pattern-match strings. This is how typed routers get `req.params.id` right.",
        },
        {
          t: "quiz",
          q: "`type IsNever<T> = T extends never ? true : false`. What is `IsNever<never>`?",
          options: ["true", "false", "never", "boolean"],
          answer: 2,
          why: "`never` is the empty union, and a distributive conditional maps over zero members, giving the empty union back. Write `[T] extends [never] ? true : false` to ask the question about T as a whole.",
        },
        {
          t: "table",
          caption: "The built-ins worth knowing by heart. All are a few lines of mapped or conditional types.",
          head: ["Type", "Gives"],
          rows: [
            ["`Partial<T>`, `Required<T>`, `Readonly<T>`", "every property optional, required, readonly (one level)"],
            ["`Pick<T, K>`, `Omit<T, K>`", "keep or drop keys; `Omit` doesn't check that K exists"],
            ["`Record<K, V>`", "an object with keys K and values V"],
            ["`Exclude<U, X>`, `Extract<U, X>`", "drop or keep union members assignable to X"],
            ["`NonNullable<T>`", "T without `null` and `undefined`"],
            ["`ReturnType<F>`, `Parameters<F>`", "a function type's return type, or its parameters as a tuple"],
            ["`Awaited<T>`", "what `await` gives: unwraps nested promises"],
          ],
        },
        {
          t: "pitfall",
          h: "`Omit` flattens discriminated unions",
          x: "`Omit<Click | Key, \"x\">` is `{ type: \"click\" | \"key\" }`: keyof a union is only the shared keys, so the members merge and narrowing stops working. Distribute it yourself: `type DOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never`.",
        },
        { t: "say", h: "Types cost compile time", x: "Type-level code is a pure functional language: no loops, only recursion. Tail-recursive conditional types stop at 1000 levels with TS2589, \"excessively deep\". `tsc --extendedDiagnostics` prints instantiation counts and check time." },
      ],
    },
    {
      title: "Escape hatches and traps",
      beats: [
        {
          t: "compare",
          a: {
            label: "any: opts out",
            lang: "ts",
            src: `const w: any = JSON.parse(body);
w.user.name.toUpperCase();   // compiles
const n: number = w;         // compiles
// any spreads into everything it touches`,
          },
          b: {
            label: "unknown: must prove it",
            lang: "ts",
            src: `const v: unknown = JSON.parse(body);
v.user;                      // error: 'v' is of type 'unknown'
if (typeof v === "object" && v !== null && "user" in v) {
  v.user;                    // ok, and still unknown
}`,
          },
          x: "`any` turns the checker off for that value and everything derived from it. `unknown` accepts any value but lets you do nothing until you narrow it. Type every untrusted input as `unknown`.",
        },
        {
          t: "predict",
          lang: "ts",
          src: `type User = { name: string };

const u = JSON.parse('{"nam":"x"}') as User;   // line 3
u.name.toUpperCase();                           // line 4

const s = 5 as string;                          // line 6`,
          q: "What happens?",
          options: ["line 3 errors: the JSON has no `name`", "compiles; then a runtime TypeError at line 4", "line 6 errors at compile time; lines 3-4 compile and line 4 throws when run", "everything compiles and runs"],
          answer: 2,
          why: "`as` is an assertion, not a conversion: nothing is checked or changed at runtime. It's refused only when the types don't overlap at all, as with 5 and string, and `5 as unknown as string` gets past even that.",
        },
        {
          t: "pitfall",
          h: "Every `as` is a place types can lie",
          x: "`as User`, `as unknown as T` and the non-null `!` all mean \"trust me\", and the code around them inherits the lie. In review, treat each one as a claim needing a reason. Most `as` on parsed data should be a validator call; most `!` should be a narrowing check.",
        },
        {
          t: "predict",
          lang: "ts",
          src: `enum Dir { Up, Down }

console.log(Object.keys(Dir));

const n: number = 42;
let d: Dir = n;`,
          q: "What happens?",
          options: ["logs ['Up', 'Down']; line 6 errors", "logs ['0', '1', 'Up', 'Down']; line 6 compiles", "logs ['0', '1']; line 6 compiles", "logs ['0', '1', 'Up', 'Down']; line 6 errors"],
          answer: 1,
          why: "A numeric enum compiles to an object with a reverse mapping: `Dir[Dir[\"Up\"] = 0] = \"Up\"`. A literal 7 is rejected, but any `number` variable is accepted. String enums have no reverse map, and refuse even the matching string literal.",
        },
        {
          t: "compare",
          a: {
            label: "enum",
            lang: "ts",
            src: `enum Level { Low = "low", High = "high" }

setLevel(Level.Low);
setLevel("low");     // error, though it's the same string`,
          },
          b: {
            label: "const object plus union",
            lang: "ts",
            src: `const Level = { Low: "low", High: "high" } as const;
type Level = (typeof Level)[keyof typeof Level];

setLevel(Level.Low);
setLevel("low");     // ok`,
          },
          x: "The right side is erasable, so it runs under Node's type stripping. It accepts strings straight from JSON or a URL, and it reads the same at call sites.",
        },
        {
          t: "predict",
          lang: "ts",
          src: `class Animal { name = "" }
class Dog extends Animal { bark() {} }
class Cat extends Animal { meow() {} }

const animals: Animal[] = [] as Dog[];
animals.push(new Cat());                      // line 6

interface H1 { handle(a: Animal): void }      // method syntax
interface H2 { handle: (a: Animal) => void }  // property syntax
const onlyDogs = (d: Dog) => d.bark();
const h1: H1 = { handle: onlyDogs };          // line 11
const h2: H2 = { handle: onlyDogs };          // line 12`,
          q: "Which lines error under `strict`?",
          options: ["6, 11 and 12", "11 and 12", "only 12", "none"],
          answer: 2,
          why: "Arrays are covariant, which is unsound: a Cat now sits in a Dog[]. `strictFunctionTypes` checks parameters contravariantly, but only for property-syntax function types. Method syntax stays **bivariant**, so h1 accepts a handler that crashes on a Cat.",
        },
        {
          t: "pitfall",
          h: "Method syntax switches off parameter checking",
          x: "Callbacks declared as `onEvent(e: BaseEvent): void` in an interface accept handlers that need a narrower event, and crash later. Declare callback members as properties, `onEvent: (e: BaseEvent) => void`. typescript-eslint's `method-signature-style` rule enforces it.",
        },
        {
          t: "code",
          lang: "ts",
          src: `function parse(x: string): number;
function parse(x: number): string;
function parse(x: string | number) {      // implementation: invisible to callers
  return typeof x === "string" ? Number(x) : String(x);
}

parse("1");                                // number
parse(Math.random() ? "1" : 1);            // error: no overload matches`,
          note: "Overloads are tried top to bottom, and a union argument matches none of them. The implementation signature is invisible to callers. If the return type doesn't vary, use one signature with a union.",
        },
      ],
    },
    {
      title: "The tsconfig that matters",
      beats: [
        {
          t: "code",
          lang: "json",
          file: "tsconfig.json",
          src: `{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "noEmit": true,
    "skipLibCheck": true
  }
}`,
          mark: [3, 4, 5],
          note: "`strict` bundles `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes` and more, and is the default in TS 7; say it anyway for 6.x tooling. The next two are off by default.",
        },
        {
          t: "predict",
          lang: "ts",
          src: `// "noUncheckedIndexedAccess": true
declare const xs: number[];
declare const m: Record<string, { n: number }>;

const a = xs[0];
const b = m["k"];
for (const y of xs) {}
for (let i = 0; i < xs.length; i++) { const c = xs[i]; }
if (xs.length > 0) { const d = xs[0]; }`,
          q: "Which of a, b, y, c, d include `undefined`?",
          options: ["a and b only", "a, b, c and d; not y", "all five", "none: the flag only affects tuples"],
          answer: 1,
          why: "Every index read gets `| undefined`, because the checker doesn't track lengths or bounds: not even inside a `length` check or a classic `for` loop. `for...of` yields elements, so y is a plain `number`. Tuples with known positions stay exact.",
        },
        {
          t: "pitfall",
          h: "Without the flag, every index read is a guess",
          x: "With it off, `rows[0].id` and `byId[key].name` type-check, and crash on the empty result set or the missing key. The flag is noisy in index-heavy code: prefer `for...of`, destructuring and `Map.get` (already `| undefined`), and use `!` where you can prove the bound.",
        },
        {
          t: "predict",
          lang: "ts",
          src: `// "exactOptionalPropertyTypes": true
interface P { nick?: string }

const p: P = { nick: undefined };
const q: P = {};`,
          q: "Which compile?",
          options: ["both", "only q", "only p", "neither"],
          answer: 1,
          why: "With the flag, `nick?: string` means \"absent, or a string\", not \"or undefined\". Those differ at runtime: `\"nick\" in p`, `Object.keys`, and spreads. If explicit undefined is allowed, write `nick?: string | undefined`.",
        },
        {
          t: "quiz",
          q: "`const opts = { ...defaults, ...overrides }`, and a form sends `overrides = { timeout: undefined }`. Which flag rejects that at the type level?",
          options: ["`noUncheckedIndexedAccess`", "`exactOptionalPropertyTypes`", "`strictNullChecks`", "none can: spreads aren't checked"],
          answer: 1,
          why: "A spread copies own properties, undefined values included, so the default timeout is replaced by undefined. With `exactOptionalPropertyTypes`, `{ timeout: undefined }` isn't a valid `Partial<Opts>`, so the override object can't be built that way.",
        },
      ],
    },
    {
      title: "Boundaries: zod, d.ts, React, Node",
      beats: [
        { t: "say", x: "A type is a claim about data. Inside your code the checker keeps it honest. At the edges (fetch, `JSON.parse`, env vars, `localStorage`, form data, queue messages) nothing does. Parse once at the edge into a typed value, then trust the types inside." },
        {
          t: "code",
          lang: "ts",
          src: `import { z } from "zod";

const User = z.object({
  id: z.string(),
  email: z.email(),
  age: z.number().int().min(0).optional(),
  role: z.enum(["admin", "viewer"]),
});
type User = z.infer<typeof User>;
// { id: string; email: string; role: "admin" | "viewer"; age?: number | undefined }

const r = User.safeParse(await res.json());
if (!r.success) throw new Error(r.error.issues.map((i) => i.path + ": " + i.message).join("; "));
r.data;   // User, and now actually true`,
          note: "Zod 4. The schema is a runtime value; `z.infer` reads the type from it, so the two can't drift. `z.object` strips unknown keys by default.",
        },
        {
          t: "rebuild",
          h: "A runtime validator shaped like a type",
          x: "A validator is a function that returns its input or throws with a path. Compose small ones and the code mirrors the type it guards. `str`, `num`, `oneOf` and `optional` work. `arr` and `obj` don't yet. Run it, read the FAILs, fix them.",
          mode: "js",
          js: `class ValidationError extends Error {}
const fail = (path, msg) => { throw new ValidationError((path.join(".") || "(root)") + ": " + msg); };

const str = () => (v, path = []) => typeof v === "string" ? v : fail(path, "expected string");
const num = () => (v, path = []) => Number.isFinite(v) ? v : fail(path, "expected number");
const oneOf = (...xs) => (v, path = []) => xs.includes(v) ? v : fail(path, "expected one of " + xs.join(", "));
const optional = (inner) => (v, path = []) => v === undefined ? v : inner(v, path);

const arr = (item) => (v, path = []) => {
  // TODO: reject non-arrays; validate each element with path [...path, i]
  return v;
};
const obj = (shape) => (v, path = []) => {
  // TODO: reject null, arrays and non-objects; validate each key in shape
  // with path [...path, key]; build a new object so unknown keys are dropped
  return v;
};

// type User = { id: string; role: "admin" | "viewer"; age?: number; tags: string[] }
const User = obj({ id: str(), role: oneOf("admin", "viewer"), age: optional(num()), tags: arr(str()) });

const run = (v) => { try { return JSON.stringify(User(v)); } catch (e) { if (e instanceof ValidationError) return e.message; throw e; } };
const check = (name, got, want) => console.log(got === want ? "pass" : "FAIL", name, "->", got);
check("valid, extra key dropped", run({ id: "1", role: "admin", tags: [], x: 1 }), '{"id":"1","role":"admin","tags":[]}');
check("wrong type", run({ id: 1, role: "admin", tags: [] }), "id: expected string");
check("missing key", run({ id: "1", tags: [] }), "role: expected one of admin, viewer");
check("bad element", run({ id: "1", role: "viewer", tags: ["a", 2] }), "tags.1: expected string");
check("not an array", run({ id: "1", role: "viewer", tags: "a" }), "tags: expected array");
check("null", run(null), "(root): expected object");
check("array is not an object", run([]), "(root): expected object");`,
          task: "Finish `arr` and `obj`. Then write `nullable(inner)` and `union(...validators)`, which returns the first success or reports the last error.",
        },
        {
          t: "code",
          lang: "ts",
          src: `// types/legacy-charts.d.ts: no imports or exports, so it's ambient
declare module "legacy-charts" {
  export function draw(el: HTMLElement, data: number[]): void;
}

// types/globals.d.ts: declare global needs a module, hence export {}
declare global {
  interface Window { __APP_VERSION__: string }
}
export {};`,
          note: "Keep them apart: an `export` in the first file would turn `declare module` into an augmentation, and the import would fail with TS2307. A hand-written declaration is an unchecked claim, like `as`.",
        },
        {
          t: "pitfall",
          h: "@types versions drift from the runtime",
          x: "`@types/node` 24 on a Node 22 server types APIs that don't exist there, and the crash comes at runtime. `@types/react` a major ahead of `react` does the same. Pin @types majors to what you deploy, and bump them in the same commit as the runtime.",
        },
        {
          t: "code",
          lang: "ts",
          src: `import { useState, type ComponentProps, type ReactNode } from "react";

type ButtonProps = ComponentProps<"button"> & { variant?: "primary" | "ghost" };
function Button({ variant = "primary", ...rest }: ButtonProps) {
  return <button data-variant={variant} {...rest} />;
}

type User = { name: string };
function Card({ title, children }: { title: string; children?: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);   // say the union up front
  return <Button onClick={(e) => e.currentTarget.blur()}>{title}{children}</Button>;
}`,
          note: "`ComponentProps<\"button\">` gives every native attribute, so wrappers stay drop-in. Inline handlers infer their event type: `e` is `MouseEvent<HTMLButtonElement>` with no annotation.",
        },
        {
          t: "predict",
          lang: "ts",
          src: `type Item = { id: string; label: string };

function List() {
  const [items, setItems] = useState([]);
  setItems([{ id: "1", label: "a" }]);
  // ...
}`,
          q: "Does line 5 compile?",
          options: ["yes: items becomes Item[]", "yes: items is any[]", "no: the object isn't assignable to `never`", "no: Item isn't referenced"],
          answer: 2,
          why: "`useState([])` infers its state from the initial value, an empty array literal with nothing to go on: `never[]`. Write `useState<Item[]>([])`. Same for `null`: `useState(null)` can only ever hold null.",
        },
        { t: "say", h: "Node runs .ts files now", x: "`node app.ts` works on 22.18+ and 23.6+, erasable syntax only, no tsconfig. Import with real `.ts` extensions: tsc allows that with `allowImportingTsExtensions` under `noEmit`, or `rewriteRelativeImportExtensions` turns them into `.js` when tsc emits." },
      ],
    },
    {
      title: "Rebuild: utility types by hand",
      beats: [
        {
          t: "code",
          lang: "ts",
          src: `type DeepReadonly<T> =
  T extends (...args: any[]) => unknown ? T            // leave functions alone
  : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;                                                  // primitives as is

type State = { user: { name: string; tags: string[] }; onChange: () => void };
declare const s: DeepReadonly<State>;

s.user.name = "x";      // error: read-only property
s.user.tags.push("x");  // error: no 'push' on readonly string[]
s.onChange();           // ok`,
          mark: [2],
          note: "A mapped type over an array gives a readonly array, so arrays come for free. It's types only: `Object.freeze` is still the runtime half.",
        },
        {
          t: "quiz",
          q: "Drop the function line: `type Naive<T> = { readonly [K in keyof T]: Naive<T[K]> }`. What does `s2.onChange()` do?",
          options: ["compiles, same as before", "error: `onChange` is read-only", "error: this expression is not callable", "compiles, but `onChange` returns `never`"],
          answer: 2,
          why: "A mapped type over a function type maps its properties, of which there are none, and drops the call signature. `onChange` becomes `{}`. Recursive utility types need explicit cases for functions, and often for `Date` and `Map`.",
        },
        {
          t: "code",
          lang: "ts",
          src: `class Emitter<E extends Record<string, unknown[]>> {
  private handlers: { [K in keyof E]?: Array<(...args: E[K]) => void> } = {};

  on<K extends keyof E>(type: K, fn: (...args: E[K]) => void): () => void {
    (this.handlers[type] ??= []).push(fn);
    return () => { this.handlers[type] = this.handlers[type]?.filter((h) => h !== fn); };
  }

  emit<K extends keyof E>(type: K, ...args: E[K]): void {
    for (const fn of this.handlers[type] ?? []) fn(...args);
  }
}

type AppEvents = { login: [user: string, at: number]; logout: [] };
const bus = new Emitter<AppEvents>();
bus.on("login", (user, at) => {});   // user: string, at: number
bus.emit("logout");`,
          mark: [9],
          note: "Event payloads as labelled tuples, spread into rest parameters: the name picks the signature. The runtime is ten lines of plain JS.",
        },
        {
          t: "predict",
          lang: "ts",
          src: `bus.emit("login", 42);`,
          q: "What does tsc say?",
          options: ["nothing: 42 is unknown[]-compatible", "Argument of type 'number' is not assignable to parameter of type 'string'", "Expected 3 arguments, but got 2", "'login' is not assignable to keyof AppEvents"],
          answer: 2,
          why: "`...args: E[K]` with K = \"login\" is the tuple `[user: string, at: number]`, so `emit` takes exactly three arguments, and the arity check fires first. Tuple rest parameters give real fixed-arity signatures.",
        },
        {
          t: "pitfall",
          h: "Interfaces don't fit Record<string, ...>",
          x: "`new Emitter<AppEvents>()` works when AppEvents is a `type`. Declare it as an `interface` and it fails: \"Index signature for type 'string' is missing\". Interfaces can be augmented later, so they never get an implicit index signature. Use a `type` for maps like this.",
        },
        {
          t: "mission",
          h: "A typed get(obj, \"a.b.c\")",
          x: "Write `Paths<T>`, the union of every dotted path into a nested object (`\"db\" | \"db.port\" | ...`), and `Get<T, P>`, the type at that path. Then type `get(obj, path)` so a typo is a compile error and the result is exact.",
          hint: "Paths: a mapped type sending each key K to K or a template literal of K, a dot and Paths<T[K]>, indexed by its own keys to get the union. Get: split P on the first dot with `infer`.",
          solution: {
            lang: "ts",
            src: `type Paths<T> = T extends object
  ? { [K in keyof T & string]: K | \`\${K}.\${Paths<T[K]>}\` }[keyof T & string]
  : never;

type Get<T, P extends string> =
  P extends \`\${infer H}.\${infer R}\`
    ? H extends keyof T ? Get<T[H], R> : never
    : P extends keyof T ? T[P] : never;

function get<T, P extends Paths<T>>(obj: T, path: P): Get<T, P> {
  return path.split(".").reduce<any>((o, k) => o?.[k], obj);
}

const cfg = { db: { host: "h", port: 5432 }, debug: true };
get(cfg, "db.port");   // number
get(cfg, "db");        // { host: string; port: number }
get(cfg, "db.prot");   // error: not "db" | "debug" | "db.host" | "db.port"
// Arrays would add "length", "0" and every method: stop recursing on them`,
          },
        },
      ],
    },
  ],
  nobodyTells: [
    "Run `tsc --noEmit` in CI as its own step. Vite, esbuild and Node strip types without checking, so nothing else in the pipeline ever fails on a type error.",
    "`JSON.parse`, `res.json()` and `any` from untyped libraries are where most type lies enter. Type them `unknown` and parse them.",
    "Since 5.5, `xs.filter((x) => x !== null)` infers a type predicate. Delete the hand-written `isNotNull` guards you copied from old answers.",
    "Write `import type` for type-only imports. Node's stripper and per-file transpilers can't tell a type from a value across files.",
    "The `interface` vs `type` difference that bites: interfaces merge across declarations and never get an implicit index signature.",
    "When a type is too clever to read in a hover, it's too clever. A few explicit overloads beat a 40-line conditional type nobody can debug.",
    "A `.d.ts` you write by hand is an unchecked claim. Prefer the library's own types, then `@types`, then a minimal declaration of only what you call.",
    "Slow checks usually come from a handful of huge unions or deep recursive types. `--extendedDiagnostics` shows instantiation counts; bisect from there.",
  ],
  glossary: [
    ["type erasure", "Types are removed before the code runs; nothing in the emitted JS knows about them."],
    ["type stripping", "Removing type syntax per file with no checking, as Node, esbuild and swc do."],
    ["structural typing", "Assignability decided by shape: a value fits a type if it has the required members."],
    ["brand", "A phantom property intersected into a type to make otherwise identical types incompatible."],
    ["excess property check", "Extra check on fresh object literals that rejects properties the target type doesn't declare."],
    ["widening", "Inferring `string` instead of `\"x\"` for values that can change; `as const` turns it off."],
    ["narrowing", "Flow analysis refining a union to fewer members after a check like `typeof` or a tag compare."],
    ["discriminated union", "A union whose members share a literal-typed tag field, so one check picks the member."],
    ["mapped type", "`{ [K in keyof T]: ... }`: builds an object type by looping over keys."],
    ["conditional type", "`A extends B ? X : Y` at the type level; distributes over a union in a bare type parameter."],
    ["infer", "Binds a type variable inside a conditional type's pattern, like a capture group."],
    ["satisfies", "Checks a value against a type while keeping the value's more precise inferred type."],
    ["bivariance", "Accepting a parameter type that is wider or narrower; unsound, kept for method syntax."],
    ["declaration file", "A `.d.ts` holding only types for code written elsewhere, often a JS package."],
  ],
  explain: "Explain to a friend why `const u = (await res.json()) as User` compiles, how it can still crash, and what you'd write instead so the type you rely on matches the data you actually received.",
};
