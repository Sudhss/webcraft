const HEAD = `precision highp float;
uniform vec2 uRes;
uniform float uTime;
`;

export default {
  id: "shaders",
  n: 31,
  part: "F",
  title: "Shaders",
  hook: "One tiny function, run two million times a frame. Learn to think in it and the GPU becomes a paintbrush.",
  minutes: 90,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "Thinking per pixel",
      beats: [
        { t: "say", x: "A fragment shader is a pure function from **pixel position to colour**. The GPU calls it for every pixel, every frame, all at once. No loop over pixels, no neighbours, no memory of last frame." },
        {
          t: "play",
          mode: "glsl",
          title: "first.frag",
          glsl: `precision highp float;
uniform vec2 uRes;
uniform float uTime;

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;   // 0..1, origin bottom-left
  float blue = 0.5 + 0.5 * sin(uTime);
  gl_FragColor = vec4(uv.x, uv.y, blue, 1.0);
}`,
          task: "Make the top-left corner white. Then make the whole thing pulse twice as fast.",
        },
        { t: "say", x: "Do the CP maths. 1920x1080 is 2.07M pixels; at 60 fps that is **124M calls a second**. Every line in `main` is multiplied by n. A shader is a hot loop where you never see the loop." },
        {
          t: "predict",
          lang: "glsl",
          src: "void main() {\n  float x = gl_FragCoord.x / uRes.x;\n  gl_FragColor = vec4(vec3(step(0.5, x)), 1.0);\n}",
          q: "What does this draw?",
          options: ["Left half white, right half black", "Left half black, right half white", "A smooth black-to-white gradient", "A thin white line at the centre"],
          answer: 1,
          why: "`step(edge, x)` is `x < edge ? 0.0 : 1.0`. Left of centre x < 0.5 gives black; right gives white. Hard edge, no gradient: that would be `vec3(x)`.",
        },
        {
          t: "quiz",
          q: "You want each pixel to blur with its neighbours. Why can't one pass just read them?",
          options: ["GLSL has no arrays", "All pixels run in parallel and outputs only exist after the pass ends", "Reading memory is forbidden in shaders", "It works, it's just slow"],
          answer: 1,
          why: "There is no 'neighbour's result' yet: everyone computes at once. Render the first pass into a texture, then a second pass samples that texture at offsets. Every blur, bloom and simulation is built from such passes.",
        },
        { t: "say", h: "Colour is your printf", x: "There is no `console.log` on the GPU. To debug a value, paint it: `gl_FragColor = vec4(vec3(d), 1.0)`. Negative shows black, above 1 clips to white. Use `fract(d * 10.0)` to see bands in large values." },
      ],
    },
    {
      title: "Types, swizzles, coordinates",
      beats: [
        {
          t: "table",
          head: ["Type", "What", "Gotcha"],
          rows: [
            ["`float`", "32-bit on desktop, maybe 16-bit on phones (mediump)", "`1` is an int, `1.0` is a float"],
            ["`vec2/3/4`", "Float vectors; ops work per component", "`v * 2.0` fine, `v * 2` is an error"],
            ["`mat2/3/4`", "Column-major matrices; `m * v` transforms", "`mat2(a,b,c,d)` fills column by column"],
            ["`sampler2D`", "A handle to a texture; read with `texture2D`", "Only a uniform, never computed"],
            ["`int`, `bool`", "Loop counters and flags", "No implicit conversion to float, ever"],
          ],
        },
        {
          t: "predict",
          lang: "glsl",
          src: "vec4 c = vec4(1.0, 0.5, 0.0, 1.0);  // orange\ngl_FragColor = c.bgra;",
          q: "What colour appears?",
          options: ["Orange", "Azure blue (0, 0.5, 1)", "Black", "Compile error: bgra is not a swizzle"],
          answer: 1,
          why: "Swizzles read components in any order: `.bgra` is `(c.b, c.g, c.r, c.a)` = `(0, 0.5, 1, 1)`. You can mix names within a set (`xyzw`, `rgba`, `stpq`) but never across sets: `c.xg` is an error.",
        },
        {
          t: "pitfall",
          h: "`${1}` in a shader string prints 1, not 1.0",
          x: "Build GLSL from JS with `` `r * ${k}` `` and k = 1, and you get `r * 1`: float times int, compile error, black screen. GLSL ES 1.00 has no implicit conversions. Format every interpolated number so it always has a decimal point.",
        },
        {
          t: "code",
          lang: "js",
          src: "// always emit a GLSL float literal\nconst glf = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));\n\nconst k = 1;\nconst bad = `float r = d * ${k};`;       // \"float r = d * 1;\"   error\nconst good = `float r = d * ${glf(k)};`; // \"float r = d * 1.0;\" ok\n// better still: make k a uniform, and tweaking it never recompiles",
          note: "`String(1e-7)` gives `1e-7`, which GLSL accepts. `toFixed(1)` on every number would round 0.05 to `0.1`, so only use it for integers.",
        },
        { t: "say", h: "Normalise once, the same way", x: "`vec2 p = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;` puts the origin at the centre, y in -1..1 and x scaled by aspect. Divide by one axis, never by both, or circles become ellipses." },
        {
          t: "predict",
          lang: "glsl",
          src: "// canvas is 1600 x 800\nvec2 uv = gl_FragCoord.xy / uRes;\nfloat inside = step(length(uv - 0.5), 0.3);\ngl_FragColor = vec4(vec3(inside), 1.0);",
          q: "What shape appears?",
          options: ["A circle", "An ellipse twice as wide as it is tall", "An ellipse twice as tall as it is wide", "A square"],
          answer: 1,
          why: "Dividing by `uRes` squeezes both axes to 0..1, so one unit of x is 1600 px and one unit of y is 800 px. A circle in uv space is stretched 2:1 on screen. Divide by `uRes.y` only.",
        },
        {
          t: "play",
          mode: "glsl",
          title: "circle.frag",
          glsl: HEAD + `
void main() {
  vec2 p = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;
  float r = 0.5 + 0.05 * sin(uTime * 2.0);
  float d = length(p) - r;               // signed distance to the circle
  float px = 2.0 / uRes.y;               // one pixel, in p units
  float fill = 1.0 - smoothstep(-px, px, d);
  vec3 col = mix(vec3(0.08), vec3(1.0, 0.62, 0.25), fill);
  gl_FragColor = vec4(col, 1.0);
}`,
          task: "Replace `px` with 0.0 and see the jaggies. Then draw only a 3-pixel ring using `abs(d)`.",
        },
      ],
    },
    {
      title: "Shaping functions",
      beats: [
        {
          t: "table",
          head: ["Function", "Does", "Used for"],
          rows: [
            ["`step(e, x)`", "0 below e, 1 at or above", "Hard masks, thresholds"],
            ["`smoothstep(a, b, x)`", "Hermite 0 to 1 between a and b", "Soft edges, anti-aliasing, fades"],
            ["`mix(a, b, t)`", "`a*(1-t) + b*t`", "Blending colours, masks into colours"],
            ["`fract(x)`", "`x - floor(x)`: sawtooth 0..1", "Repetition, tiling, stripes"],
            ["`clamp(x, a, b)`", "Keep inside a..b", "Guarding pow, sqrt, colour"],
            ["`mod(x, y)`", "`x - y*floor(x/y)`, always non-negative for y > 0", "Periodic things, unlike C's %"],
          ],
        },
        {
          t: "play",
          mode: "glsl",
          title: "plotter.frag",
          glsl: HEAD + `
float plot(vec2 uv, float y) {
  float px = 2.0 / uRes.y;
  return 1.0 - smoothstep(0.0, px, abs(uv.y - y));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float x = uv.x;
  float y = smoothstep(0.2, 0.8, x);
  // try: step(0.5, x)   fract(x * 4.0)   0.5 + 0.5 * sin(x * 20.0 - uTime)
  //      pow(x, 3.0)    abs(fract(x * 3.0) - 0.5) * 2.0
  vec3 col = vec3(y) * 0.3;
  col = mix(col, vec3(1.0, 0.6, 0.2), plot(uv, y));
  gl_FragColor = vec4(col, 1.0);
}`,
          task: "Build a triangle wave, then a pulse that is 1 only between x = 0.4 and 0.6, using two steps.",
        },
        {
          t: "predict",
          lang: "glsl",
          src: "vec2 uv = gl_FragCoord.xy / uRes;\nfloat c = step(0.5, fract(uv.x * 4.0));\ngl_FragColor = vec4(vec3(c), 1.0);",
          q: "What does it draw?",
          options: ["4 vertical bands", "8 vertical bands, alternating, starting black on the left", "8 bands starting white", "4 horizontal bands"],
          answer: 1,
          why: "`uv.x * 4.0` runs 0..4, `fract` makes 4 sawtooth cycles, and `step(0.5, ...)` splits each cycle into a black then a white half: 8 bands, black first.",
        },
        {
          t: "quiz",
          q: "`vec2 q = fract(p * 5.0) - 0.5;` then drawing a circle at `q` gives...",
          options: ["One circle, 5x bigger", "A 5x5 grid of circles, each cell with its own centred origin", "One circle, 5x smaller", "Noise"],
          answer: 1,
          why: "This is **domain repetition**: every cell maps to the same -0.5..0.5 space, so one shape evaluation draws infinite copies for free. `floor(p * 5.0)` gives the cell id if each copy should differ.",
        },
        {
          t: "pitfall",
          h: "`smoothstep(b, a, x)` with a < b is undefined",
          x: "The spec says results are undefined if edge0 >= edge1. `smoothstep(px, -px, d)` is everywhere in tutorials and works on most GPUs because they use the plain formula, but it is not guaranteed. Write `1.0 - smoothstep(-px, px, d)`.",
        },
      ],
    },
    {
      title: "Shapes as distances",
      beats: [
        { t: "say", x: "A **signed distance function** returns how far a point is from a shape's edge: negative inside, 0 on the edge, positive outside. One number gives you fill, outline, glow, AA and shadows." },
        {
          t: "code",
          lang: "glsl",
          src: "float sdCircle(vec2 p, float r) { return length(p) - r; }\n\nfloat sdBox(vec2 p, vec2 b) {       // b = half size\n  vec2 d = abs(p) - b;\n  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);\n}\n\n// polynomial smooth min: blends two shapes over width k\nfloat smin(float a, float b, float k) {\n  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);\n  return mix(b, a, h) - k * h * (1.0 - h);\n}",
          note: "`abs(p)` folds the plane into one quadrant, so the box only has to handle a corner. Symmetry is the main SDF trick.",
        },
        {
          t: "table",
          head: ["Want", "Write"],
          rows: [
            ["Union", "`min(a, b)`"],
            ["Intersection", "`max(a, b)`"],
            ["Subtract b from a", "`max(a, -b)`"],
            ["Blobby union", "`smin(a, b, k)`"],
            ["Outline of width w", "`abs(d) - w`"],
            ["Rounded corners r", "`d - r`"],
            ["Move / rotate", "Transform `p` before calling: `sd(p - c)`, `sd(rot * p)`"],
          ],
        },
        {
          t: "play",
          mode: "glsl",
          title: "sdf-lab.frag",
          glsl: `precision highp float;
uniform vec2 uRes;
uniform vec2 uMouse;

float sdCircle(vec2 p, float r) { return length(p) - r; }
float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

void main() {
  vec2 p = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;
  vec2 m = (2.0 * uMouse * uRes - uRes) / uRes.y;
  float d = smin(sdBox(p, vec2(0.4, 0.25)), sdCircle(p - m, 0.3), 0.2);

  vec3 col = d > 0.0 ? vec3(0.9, 0.6, 0.3) : vec3(0.3, 0.6, 0.9);
  col *= 1.0 - exp(-6.0 * abs(d));        // darker near the edge
  col *= 0.8 + 0.2 * cos(120.0 * d);       // isolines: the field itself
  float px = 2.0 / uRes.y;
  col = mix(col, vec3(1.0), 1.0 - smoothstep(0.0, px, abs(d)));
  gl_FragColor = vec4(col, 1.0);
}`,
          task: "Move the mouse to merge the shapes. Swap smin for min, then max, then max(box, -circle). Watch how the isolines bend.",
        },
        {
          t: "predict",
          lang: "glsl",
          src: "float a = sdCircle(p, 0.5);\nfloat b = sdCircle(p - vec2(0.25, 0.0), 0.4);\nfloat d = max(a, -b);\n// draw d < 0.0 as white",
          q: "What shape is white?",
          options: ["Two overlapping circles", "A crescent moon opening to the right", "A small circle", "A lens where they overlap"],
          answer: 1,
          why: "`max(a, -b)` keeps points inside a and outside b: the big circle with a bite taken from its right side, a crescent. The overlap alone (the lens) would be `max(a, b)`.",
        },
        {
          t: "pitfall",
          h: "After smin or scaling, it's a bound, not a distance",
          x: "`smin` and non-uniform transforms make the field under- or over-estimate the true distance. For 2D fills nobody notices; a raymarcher will overshoot and punch holes. Scale uniformly as `sd(p / s) * s`, and never forget the `* s`.",
        },
      ],
    },
    {
      title: "Noise, warping and palettes",
      beats: [
        { t: "say", x: "A **hash** turns a coordinate into a random-looking number. Hash the grid corners, interpolate between them smoothly, and you get **value noise**: organic randomness with no memory and no textures." },
        {
          t: "code",
          lang: "glsl",
          src: "// sin-free hash (Dave Hoskins): stable across GPUs and precisions\nfloat hash(vec2 p) {\n  vec3 p3 = fract(vec3(p.xyx) * 0.1031);\n  p3 += dot(p3, p3.yzx + 33.33);\n  return fract((p3.x + p3.y) * p3.z);\n}\n\nfloat valueNoise(vec2 p) {\n  vec2 i = floor(p), f = fract(p);\n  vec2 u = f * f * (3.0 - 2.0 * f);          // smooth fade curve\n  return mix(mix(hash(i),                  hash(i + vec2(1.0, 0.0)), u.x),\n             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);\n}",
          mark: [9, 10],
          note: "Without the fade curve `u`, you interpolate linearly and the grid shows as creases.",
        },
        {
          t: "pitfall",
          h: "`fract(sin(x) * 43758.5)` is not a hash on every GPU",
          x: "The classic one-liner relies on `sin` of big arguments keeping many digits. On mediump phones, and some drivers with low-precision `sin`, it turns into stripes or blocks. It looks fine on your laptop and broken on your user's phone. Use a sin-free hash.",
        },
        { t: "say", x: "**Gradient noise** hashes a direction at each corner and dots it with the offset. No blocky look. **fbm** adds octaves: double the frequency, halve the amplitude, 4 to 6 times. That's clouds, terrain, marble." },
        {
          t: "play",
          mode: "glsl",
          title: "noise.frag",
          glsl: HEAD + `#define GRADIENT 1
#define OCTAVES 5

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float corner(vec2 i, vec2 f, vec2 o) {
#if GRADIENT
  float a = 6.2831853 * hash(i + o);
  return dot(vec2(cos(a), sin(a)), f - o) + 0.5;   // gradient
#else
  return hash(i + o);                              // value
#endif
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(corner(i, f, vec2(0.0, 0.0)), corner(i, f, vec2(1.0, 0.0)), u.x),
             mix(corner(i, f, vec2(0.0, 1.0)), corner(i, f, vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);   // rotate each octave: hides the grid
  for (int i = 0; i < OCTAVES; i++) {
    s += a * noise(p);
    p = r * p * 2.0;
    a *= 0.5;
  }
  return s;
}
void main() {
  vec2 p = gl_FragCoord.xy / uRes.y * 4.0 + vec2(uTime * 0.2, 0.0);
  gl_FragColor = vec4(vec3(fbm(p)), 1.0);
}`,
          task: "Set GRADIENT to 0 and spot the grid. Set OCTAVES to 1, then 8. Where does adding octaves stop being visible?",
        },
        { t: "say", h: "Domain warping", x: "Feed noise into the coordinates of more noise: `fbm(p + 4.0 * vec2(fbm(p), fbm(p + 5.2)))`. Straight lines become smoke and marble. It costs 3 fbm calls, so budget it." },
        {
          t: "code",
          lang: "glsl",
          src: "// cosine palette (Inigo Quilez): 12 numbers give a whole gradient\nvec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {\n  return a + b * cos(6.2831853 * (c * t + d));\n}\n// rainbow: a = b = vec3(0.5), c = vec3(1.0), d = vec3(0.0, 0.33, 0.67)\n// warm:    d = vec3(0.0, 0.1, 0.2)   duotone: c = vec3(0.5)",
          note: "a is the mean colour, b the contrast, c how many cycles over 0..1, d the phase per channel. Animate d for free colour motion.",
        },
        {
          t: "play",
          mode: "glsl",
          title: "warp.frag",
          glsl: HEAD + `
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) { s += a * noise(p); p = r * p * 2.0; a *= 0.5; }
  return s;
}
vec3 palette(float t) {
  return 0.5 + 0.5 * cos(6.2831853 * (t + vec3(0.0, 0.33, 0.67)));
}
void main() {
  vec2 p = gl_FragCoord.xy / uRes.y * 3.0;
  vec2 q = vec2(fbm(p + 0.05 * uTime), fbm(p + vec2(5.2, 1.3)));
  float f = fbm(p + 4.0 * q);
  vec3 col = palette(f * 1.4 + 0.05 * uTime);
  col *= 0.4 + 0.8 * f;                   // darken the valleys
  gl_FragColor = vec4(col, 1.0);
}`,
          task: "Change the warp strength 4.0 to 1.0, then 10.0. Swap the palette phase for warm tones. Warp q again with a second fbm.",
        },
        {
          t: "quiz",
          q: "Your warped fbm runs at 20 fps on a mid-range phone. Biggest single win?",
          options: ["Swap the hash back to sin", "Render it at half resolution and upscale: 4x fewer pixels", "Wrap the fbm in `if (uv.x > 0.0)`", "Use `int` instead of `float`"],
          answer: 1,
          why: "Cost is pixels x work per pixel. Smooth effects look identical at half resolution, and it cuts n by 4. Next wins: fewer octaves, or bake noise into a texture and sample it.",
        },
      ],
    },
    {
      title: "Polar coordinates and time",
      beats: [
        { t: "say", x: "`length(p)` and `atan(p.y, p.x)` turn the plane into rings and angles. Anything periodic in the angle becomes radial symmetry: flowers, gears, sunbursts, loading spinners." },
        {
          t: "predict",
          lang: "glsl",
          src: "vec2 p = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;\nfloat a = atan(p.y, p.x);                  // -PI..PI\nfloat c = step(0.5, fract(a / 6.2831853 * 6.0));\ngl_FragColor = vec4(vec3(c), 1.0);",
          q: "What does it draw?",
          options: ["6 concentric rings", "12 alternating wedges: 6 white, 6 black", "6 white wedges and a seam", "A spiral"],
          answer: 1,
          why: "The angle covers one full turn, times 6 gives 6 cycles, and each cycle splits into black then white: 12 wedges. Rings would need `length(p)` instead of the angle.",
        },
        {
          t: "play",
          mode: "glsl",
          title: "polar.frag",
          glsl: HEAD + `
void main() {
  vec2 p = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;
  float r = length(p);
  float a = atan(p.y, p.x);
  float petals = 5.0;
  float edge = 0.5 + 0.2 * cos(petals * a + uTime);
  float px = 2.0 / uRes.y;
  float fill = 1.0 - smoothstep(edge - px, edge + px, r);
  float rays = step(0.5, fract(a / 6.2831853 * 24.0 - uTime * 0.1));
  vec3 col = vec3(0.06) + 0.06 * rays;
  col = mix(col, vec3(0.95, 0.55, 0.25) * (0.6 + 0.4 * r / edge), fill);
  gl_FragColor = vec4(col, 1.0);
}`,
          task: "Make the petals spin the other way. Set petals to 5.5 and find the seam. Turn the rays into a spiral by adding r to the angle.",
        },
        {
          t: "pitfall",
          h: "The atan seam",
          x: "`atan(y, x)` jumps from PI to -PI along the negative x axis. Any function of the angle that isn't periodic with a whole number of cycles per turn shows a hard line there. Keep counts integral, or build the effect from `p` directly.",
        },
        {
          t: "quiz",
          q: "Which makes a stripe pattern move to the right as `uTime` grows?",
          options: ["`sin(10.0 * x + uTime)`", "`sin(10.0 * x - uTime)`", "`sin(10.0 * x) + uTime`", "`sin(10.0 * x * uTime)`"],
          answer: 1,
          why: "A crest sits where the phase is constant: `10x - t = c` gives `x = (c + t) / 10`, which grows with t. `+ uTime` moves left, and multiplying by time makes the stripes get denser forever.",
        },
      ],
    },
    {
      title: "Raymarching a sphere",
      beats: [
        { t: "say", x: "In 3D, the scene's SDF tells you how far a ray can travel **without hitting anything**. Step exactly that far, ask again, repeat. That's **sphere tracing**, and it draws 3D with no triangles at all." },
        {
          t: "steps",
          h: "Per pixel",
          items: [
            "Build a ray: origin at the camera, direction through this pixel.",
            "Loop: `d = map(ro + rd * t)`, then `t += d`.",
            "If `d` is tiny you hit a surface. If `t` is huge you hit sky.",
            "Normal = gradient of the SDF at the hit point, by finite differences.",
            "Light it: `max(dot(n, L), 0.0)` plus some ambient. Gamma-correct the output.",
          ],
        },
        {
          t: "play",
          mode: "glsl",
          title: "raymarch.frag",
          glsl: HEAD + `
float map(vec3 p) {
  float sphere = length(p) - 1.0;
  float ground = p.y + 1.0;
  return min(sphere, ground);
}
vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.001, 0.0);
  return normalize(vec3(map(p + e.xyy) - map(p - e.xyy),
                        map(p + e.yxy) - map(p - e.yxy),
                        map(p + e.yyx) - map(p - e.yyx)));
}
void main() {
  vec2 p = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;
  vec3 ro = vec3(0.0, 0.0, 3.5);
  vec3 rd = normalize(vec3(p, -1.8));
  float t = 0.0;
  bool hit = false;
  for (int i = 0; i < 96; i++) {
    float d = map(ro + rd * t);
    if (d < 0.001) { hit = true; break; }
    t += d;
    if (t > 20.0) break;
  }
  vec3 col = vec3(0.6, 0.75, 0.9) - 0.3 * p.y;
  if (hit) {
    vec3 pos = ro + rd * t;
    vec3 n = normalAt(pos);
    vec3 L = normalize(vec3(cos(uTime), 1.0, sin(uTime)));
    float diff = max(dot(n, L), 0.0);
    float amb = 0.5 + 0.5 * n.y;
    vec3 albedo = pos.y < -0.99 ? vec3(0.45) : vec3(0.9, 0.5, 0.3);
    col = albedo * (0.2 * amb + 0.8 * diff);
  }
  gl_FragColor = vec4(pow(col, vec3(0.4545)), 1.0);
}`,
          task: "Drop the loop count to 8 and watch the silhouette and horizon. Then add a second sphere with smin and see them melt together.",
        },
        {
          t: "quiz",
          q: "Why is the gradient of the SDF the surface normal?",
          options: ["By definition of normalize", "Distance grows fastest straight away from the surface, and the gradient points in the direction of fastest growth", "Because the sphere is round", "It's an approximation that only works for spheres"],
          answer: 1,
          why: "An exact SDF has gradient length 1 pointing directly away from the nearest surface point. Central differences cost 6 `map` calls; the tetrahedron trick gets it in 4, which matters when `map` is expensive.",
        },
        {
          t: "predict",
          lang: "glsl",
          src: "// same raymarcher, but:\nfor (int i = 0; i < 8; i++) {\n  float d = map(ro + rd * t);\n  if (d < 0.001) { hit = true; break; }\n  t += d;\n}",
          q: "With only 8 steps, what goes wrong?",
          options: ["Nothing, spheres converge in 1 step", "The centre of the sphere turns to sky", "Edges of the sphere and the far floor turn to sky; the centre is fine", "The whole image goes black"],
          answer: 2,
          why: "A ray aimed at the centre lands in one step because the distance is exact. Grazing rays near silhouettes and the horizon crawl in tiny steps and run out. Step count is paid at the edges, not the middle.",
        },
        {
          t: "pitfall",
          h: "Fixed epsilon gives acne far away",
          x: "`d < 0.001` is too strict at distance 50, where one pixel spans far more than 0.001, so far rays burn every iteration. Scale it: `d < 0.0005 * t`. If your SDF is only a bound, also step `t += d * 0.8` to stop overshooting.",
        },
        {
          t: "rebuild",
          h: "A tiny raymarcher with shadows",
          x: "The starter marches one sphere. Add a ground plane, a second shape merged with smin, and a hard shadow: from the hit point, march toward the light; if you hit anything before reaching it, darken.",
          mode: "glsl",
          glsl: HEAD + `
float map(vec3 p) {
  return length(p - vec3(0.0, 0.2 * sin(uTime), 0.0)) - 1.0;
  // TODO: min with a ground plane at y = -1, smin with a box or second sphere
}
float march(vec3 ro, vec3 rd) {
  float t = 0.0;
  for (int i = 0; i < 100; i++) {
    float d = map(ro + rd * t);
    if (d < 0.0005 * t + 0.0005) return t;
    t += d;
    if (t > 30.0) break;
  }
  return -1.0;
}
void main() {
  vec2 p = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;
  vec3 ro = vec3(0.0, 0.5, 4.0);
  vec3 rd = normalize(vec3(p, -1.8));
  float t = march(ro, rd);
  vec3 col = vec3(0.1);
  if (t > 0.0) {
    vec3 pos = ro + rd * t;
    col = vec3(0.5 + 0.5 * pos.y);   // TODO: normal, diffuse, then shadow ray
  }
  gl_FragColor = vec4(col, 1.0);
}`,
          task: "Shadow ray: start at `pos + n * 0.01` (or you hit yourself), march toward L, and multiply diffuse by 0.2 if it returns a hit.",
        },
      ],
    },
    {
      title: "How the GPU really runs it",
      beats: [
        { t: "say", x: "Pixels run in groups of 32 or 64 lanes in **lockstep**, and the rasteriser shades 2x2 **quads** so it can compare neighbours for derivatives. Both facts explain most shader performance surprises." },
        {
          t: "quiz",
          q: "Which `if` is cheap?",
          options: ["`if (noise(p) > 0.5) { heavyA(); } else { heavyB(); }`", "`if (uMode > 0.5) { heavyA(); } else { heavyB(); }`", "Both cost the same", "Neither: GPUs can't branch"],
          answer: 1,
          why: "A uniform is the same for every lane, so each group takes one side. A branch on noise splits lanes inside a group, and the group runs **both** sides with lanes masked off. Divergence, not the `if`, is the cost.",
        },
        {
          t: "pitfall",
          h: "mediump time stutters after a few minutes",
          x: "mediump can be real fp16 on phones: about 3 significant digits. At `uTime` = 600 s the gap between representable values is 0.5 s, so animation jumps in steps. Wrap time on the CPU (`t % 600`, or a period your loop repeats on) and use highp where you can.",
        },
        {
          t: "code",
          lang: "glsl",
          src: "#ifdef GL_FRAGMENT_PRECISION_HIGH\n  precision highp float;\n#else\n  precision mediump float;\n#endif\n\n// or per variable, where it matters:\nuniform highp float uTime;",
          note: "WebGL1 fragment shaders may lack highp, and a shader that demands it fails to compile there. The ifdef picks the best available.",
        },
        { t: "say", x: "`texture2D(tex, uv)` is not a memory read. The texture unit picks a **mip level** from how fast `uv` changes across the 2x2 quad, then blends 4 or 8 texels. Filtering is free; confusing it is not." },
        {
          t: "pitfall",
          h: "`texture2D(tex, fract(uv))` draws seam lines",
          x: "At each tile boundary `fract` jumps from 1 to 0, the quad sees a huge derivative, and the GPU picks the tiniest mip: a 1-pixel line of wrong colour. Use REPEAT wrapping instead of fract, or pass the unwrapped derivatives with `textureGrad` in WebGL2.",
        },
        {
          t: "pitfall",
          h: "WebGL1 non-power-of-two textures sample black",
          x: "In WebGL1, a 1000x600 texture with mipmaps or REPEAT wrap is incomplete and reads as black, with at most a console warning. Use CLAMP_TO_EDGE and LINEAR or NEAREST without mips, or resize to 1024x512. WebGL2 lifts the rule.",
        },
      ],
    },
    {
      title: "Shaders in three.js",
      beats: [
        { t: "say", x: "`ShaderMaterial` is your GLSL with three's plumbing prepended: `projectionMatrix`, `modelViewMatrix`, `position`, `normal`, `uv`, precision. `RawShaderMaterial` prepends nothing, so you declare it all yourself." },
        {
          t: "play",
          mode: "three",
          title: "displace.js",
          js: `import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 2.2, 3.2);
camera.lookAt(0, 0, 0);

const uniforms = { uTime: { value: 0 }, uAmp: { value: 0.25 } };
const material = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: \`
    uniform float uTime;
    uniform float uAmp;
    varying float vH;
    void main() {
      vec3 p = position;
      float h = uAmp * sin(p.x * 4.0 + uTime) * cos(p.y * 3.0 + uTime * 0.7);
      p.z += h;                 // plane is in XY, so z is "up" before rotation
      vH = h / uAmp;            // -1..1, interpolated for the fragment shader
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }\`,
  fragmentShader: \`
    varying float vH;
    void main() {
      vec3 col = mix(vec3(0.1, 0.2, 0.5), vec3(1.0, 0.7, 0.3), vH * 0.5 + 0.5);
      gl_FragColor = vec4(col, 1.0);
    }\`,
});

const plane = new THREE.Mesh(new THREE.PlaneGeometry(3, 3, 200, 200), material);
plane.rotation.x = -Math.PI / 2;
scene.add(plane);

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop((ms) => {
  uniforms.uTime.value = ms / 1000;
  renderer.render(scene, camera);
});`,
          task: "Drop the segments from 200 to 8 and see why displacement needs vertices. Add `wireframe: true` to the material.",
        },
        {
          t: "pitfall",
          h: "Displaced vertices, undisplaced normals",
          x: "Move vertices in the shader and the lighting still uses the original normals, so a wavy surface shades like a flat one. Recompute: evaluate the height at p + dx and p + dz, cross the two tangents. Or derive it analytically from your formula.",
        },
        { t: "say", x: "To keep three's lighting, shadows and PBR, don't rewrite the material. Patch it: `onBeforeCompile` hands you the shader source before compile, and you string-replace its `#include` chunks." },
        {
          t: "play",
          mode: "three",
          title: "patch.js",
          js: `import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101418);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 5);
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1));
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(2, 3, 4);
scene.add(sun);

const uTime = { value: 0 };
const mat = new THREE.MeshStandardMaterial({ color: 0x88aaff, roughness: 0.35, metalness: 0.1 });
mat.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = uTime;        // share the object, update .value later
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", \`#include <common>
      uniform float uTime;
      mat2 twist(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }\`)
    .replace("#include <beginnormal_vertex>", \`#include <beginnormal_vertex>
      objectNormal.xz = twist(position.y * sin(uTime)) * objectNormal.xz;\`)
    .replace("#include <begin_vertex>", \`#include <begin_vertex>
      transformed.xz = twist(position.y * sin(uTime)) * transformed.xz;\`);
};

const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.9, 0.3, 256, 32), mat);
scene.add(knot);

renderer.setAnimationLoop((ms) => {
  uTime.value = ms / 1000;
  knot.rotation.y = ms / 4000;
  renderer.render(scene, camera);
});`,
          task: "Delete the beginnormal_vertex patch and compare the shading. The shape still twists; the light doesn't follow.",
        },
        {
          t: "pitfall",
          h: "Same onBeforeCompile text, same program",
          x: "three caches programs by a key that includes `onBeforeCompile.toString()`. Two materials whose callbacks share source text but bake in different closure values get one program, and one silently shows the other's shader. Override `customProgramCacheKey`, or use uniforms.",
        },
        {
          t: "compare",
          a: { label: "Two definitions, they drift", lang: "js", src: "// shader\nconst vs = `h = 0.25 * sin(p.x * 4.0 + t)`;\n// CPU, for picking and physics (someone edits one)\nconst h = (x, t) => 0.25 * Math.sin(x * 4.5 + t);" },
          b: { label: "One definition, both generated", lang: "js", src: "const K = { amp: 0.25, freq: 4 };\nconst glf = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));\nexport const heightJS = (x, t) => K.amp * Math.sin(x * K.freq + t);\nexport const heightGLSL =\n  `float height(float x, float t) {\n     return ${glf(K.amp)} * sin(x * ${glf(K.freq)} + t);\n   }`;" },
          x: "When a function runs on both CPU and GPU, generate both from one source. Otherwise the ball floats above the wave and nobody knows why for a week.",
        },
        {
          t: "mission",
          h: "Ship a shader background",
          x: "Build a full-screen hero background: domain-warped fbm with a cosine palette, reacting to the mouse. It must hold 60 fps on a phone: render at half resolution, cap DPR, wrap time, and pause when the tab is hidden.",
          hint: "A plain WebGL quad or a three `PlaneGeometry(2, 2)` with a `RawShaderMaterial` that writes `gl_Position = vec4(position.xy, 0.0, 1.0)` covers the screen with no camera maths.",
        },
      ],
    },
  ],
  nobodyTells: [
    "Paint the value you're debugging. `fract(x * 10.0)` bands reveal gradients and discontinuities that a flat grey hides.",
    "Test every shader on a real phone early. mediump, weak sin, and missing highp only show up there.",
    "Half resolution is the best optimisation in shader land. Smooth effects look the same and cost a quarter.",
    "Keep a snippets file of SDFs, hashes, noise and palettes. Nobody writes sdBox from memory twice.",
    "A black screen is usually a compile error. Log `gl.getShaderInfoLog` every time, even in production builds.",
    "Wrap time on the CPU to a loop period. Float precision runs out long before users close the tab.",
    "Put tweakable numbers in uniforms, not string templates. Changing a uniform is free; changing source recompiles.",
  ],
  glossary: [
    ["fragment shader", "Program run per pixel (fragment) that outputs its colour."],
    ["vertex shader", "Program run per vertex that outputs its clip-space position and varyings."],
    ["uniform", "A value that is the same for every vertex or pixel in one draw call."],
    ["varying", "A value written per vertex and interpolated across the triangle for the fragment shader."],
    ["swizzle", "Reading vector components in any order: `v.zyx`, `c.rrr`."],
    ["SDF", "Signed distance function: distance to a shape's edge, negative inside."],
    ["fbm", "Fractal Brownian motion: several octaves of noise summed at rising frequency and falling amplitude."],
    ["domain warping", "Offsetting the input coordinates of noise by more noise."],
    ["raymarching", "Stepping along a ray by the scene SDF's distance until it hits a surface."],
    ["divergence", "Lanes in one GPU group taking different branches, so the group runs both."],
    ["mipmap", "Pre-shrunk copies of a texture the sampler picks from to avoid shimmer."],
    ["onBeforeCompile", "three.js hook to edit a built-in material's shader source before it compiles."],
  ],
  explain: "Explain to a friend how a raymarcher draws a lit sphere with no triangles, from the ray to the colour.",
};
