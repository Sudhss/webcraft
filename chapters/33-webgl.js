const CANVAS = `<canvas id="c"></canvas>`;
const CSS = `html, body { margin: 0; height: 100%; background: #111; }
canvas { display: block; width: 100%; height: 100%; }`;
const SETUP = `const canvas = document.getElementById('c'), gl = canvas.getContext('webgl2');
canvas.width = Math.round(canvas.clientWidth * devicePixelRatio);
canvas.height = Math.round(canvas.clientHeight * devicePixelRatio);
gl.viewport(0, 0, canvas.width, canvas.height);
`;
const PROGRAM = `function program(vs, fs) {               // compile, link, throw the log on failure
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}
`;
const MAT = `const mul = (a, b) => { const o = new Float32Array(16);    // column-major: (row r, col c) at [c * 4 + r]
  for (let i = 0; i < 16; i++) for (let k = 0; k < 4; k++) o[i] += a[k * 4 + i % 4] * b[(i >> 2) * 4 + k];
  return o; };
const perspective = (fovy, aspect, near, far) => { const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect,0,0,0, 0,f,0,0, 0,0,(far + near) * nf,-1, 0,0,2 * far * near * nf,0]); };
const rotY = (t) => new Float32Array([Math.cos(t),0,-Math.sin(t),0, 0,1,0,0, Math.sin(t),0,Math.cos(t),0, 0,0,0,1]);
const rotX = (t) => new Float32Array([1,0,0,0, 0,Math.cos(t),Math.sin(t),0, 0,-Math.sin(t),Math.cos(t),0, 0,0,0,1]);
const translate = (x, y, z) => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]);
`;

export default {
  id: "webgl",
  n: 33,
  part: "F",
  title: "WebGL from zero",
  hook: "No library. A triangle in 50 lines, every call taken apart, then a spinning cube and 10,000 quads in one draw.",
  minutes: 100,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "The pipeline",
      beats: [
        { t: "say", x: "The GPU draws triangles, and almost nothing else. Maps, games, Figma's canvas: all of it is vertices in, triangles assembled, pixels found, pixels coloured. WebGL is the API that feeds that machine." },
        {
          t: "steps",
          h: "One draw call, start to finish",
          items: [
            "**Vertex shader** runs once per vertex: reads its attributes, writes `gl_Position` in clip space plus any outputs.",
            "**Primitive assembly** groups vertices into triangles, lines or points and clips them against the view volume.",
            "**Perspective divide and viewport**: x, y, z are divided by w, then mapped from -1..1 to pixels. Back faces are culled here if you asked.",
            "**Rasterisation** finds every pixel centre the triangle covers and interpolates the vertex outputs to it.",
            "**Fragment shader** runs once per covered pixel and outputs a colour, or discards.",
            "**Per-fragment ops**: scissor, stencil and depth tests, then blending with the colour already there.",
            "The result lands in the **framebuffer**: the canvas's drawing buffer, or a texture you attached.",
          ],
        },
        {
          t: "viz",
          name: "frames",
          props: {
            cols: ["Your JS", "Vertex shader", "Raster", "Fragment shader", "Framebuffer"],
            frames: [
              { cells: [["`drawArrays(TRIANGLES, 0, 3)`"], [], [], [], ["cleared to dark grey"]], note: "One call queues work. The GPU now runs the whole pipeline on 3 vertices." },
              { cells: [[], ["v0 -> (0, 0.7)", "v1 -> (-0.7, -0.6)", "v2 -> (0.7, -0.6)"], [], [], ["cleared to dark grey"]], note: "Three vertex shader runs, in parallel. Each writes `gl_Position` and a `vColor`." },
              { cells: [[], [], ["assemble 1 triangle", "clip to -w..w", "divide by w", "map to pixels"], [], ["cleared to dark grey"]], note: "Three vertices become one triangle, clipped and placed in pixel coordinates." },
              { cells: [[], [], ["every covered pixel centre", "`vColor` interpolated per pixel"], [], ["cleared to dark grey"]], note: "The rasteriser blends the three `vColor`s by each pixel's barycentric weights." },
              { cells: [[], [], [], ["one run per covered pixel", "`outColor = vec4(vColor, 1)`"], ["cleared to dark grey"]], note: "Tens of thousands of fragment runs for three vertex runs. This is where the cost is." },
              { cells: [[], [], [], [], ["depth test: off", "blend: off", "triangle written"]], note: "Fixed-function switches decide how the colour is written. Both off: it simply replaces what was there." },
            ],
          },
        },
        {
          t: "quiz",
          q: "A full-screen quad on a 1920x1080 canvas, drawn as two triangles with `drawArrays`. Roughly how many shader runs?",
          options: ["6 vertex, 6 fragment", "6 vertex, about 2.07M fragment", "2.07M of each", "4 vertex, 4 fragment"],
          answer: 1,
          why: "Vertex work scales with vertices, fragment work with covered pixels. Six vertices against two million pixels is why full-screen effects are fragment-bound and why resolution is the first knob.",
        },
        { t: "say", h: "Two programmable stages, many switches", x: "Only the vertex and fragment stages run your code. Everything else is fixed hardware you configure: `gl.enable(gl.DEPTH_TEST)`, `gl.blendFunc(...)`, `gl.viewport(...)`. Learning WebGL is learning which switch lives where." },
        {
          t: "predict",
          lang: "glsl",
          src: "// three vertices, drawn with drawArrays(TRIANGLES, 0, 3)\n// gl_Position for each:\nvec4(-0.5, -0.5, 0.0, 1.0)\nvec4( 0.5, -0.5, 0.0, 1.0)\nvec4( 3.0,  2.0, 0.0, 1.0)   // far outside -1..1",
          q: "What appears?",
          options: ["Nothing: one vertex is invalid", "The whole triangle, squashed to fit", "The part of the triangle inside the canvas, cut cleanly at the edge", "An error from drawArrays"],
          answer: 2,
          why: "Clipping cuts triangles against the view volume, producing new vertices on the boundary. Out-of-range coordinates are normal: every 3D scene has triangles half off-screen.",
        },
      ],
    },
    {
      title: "A global state machine",
      beats: [
        { t: "say", x: "WebGL has almost no methods on objects. You **bind** an object to a slot, then call functions that act on whatever sits in that slot. `bufferData` takes no buffer: it writes into the one bound to `ARRAY_BUFFER`." },
        {
          t: "code",
          lang: "js",
          src: "const buf = gl.createBuffer();          // just a handle, no memory yet\ngl.bindBuffer(gl.ARRAY_BUFFER, buf);    // put it in the ARRAY_BUFFER slot\ngl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); // acts on the slot\n\nconst tex = gl.createTexture();\ngl.activeTexture(gl.TEXTURE3);          // choose texture unit 3\ngl.bindTexture(gl.TEXTURE_2D, tex);     // unit 3's TEXTURE_2D slot\ngl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); // acts on tex",
          note: "Every edit is two steps: bind, then operate. Forget the bind and you silently edit whatever was bound last.",
        },
        {
          t: "table",
          head: ["State", "Lives on", "Includes"],
          rows: [
            ["Context", "the `gl` object", "current program, viewport, clear colour, enables, blend and depth funcs, bound framebuffer"],
            ["Vertex array (VAO)", "the bound VAO", "attribute enables, pointers (with their buffer), divisors, the ELEMENT_ARRAY_BUFFER"],
            ["Program", "each program", "uniform values, which survive until you set them again"],
            ["Texture", "each texture", "image data, filter and wrap parameters"],
            ["Not in a VAO", "the context", "the ARRAY_BUFFER binding itself"],
          ],
        },
        {
          t: "predict",
          lang: "js",
          src: "gl.bindVertexArray(vao);\ngl.bindBuffer(gl.ARRAY_BUFFER, posBuf);\ngl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);\ngl.bindVertexArray(null);\n\ngl.bindBuffer(gl.ARRAY_BUFFER, otherBuf);\ngl.bindVertexArray(vao);\ngl.drawArrays(gl.TRIANGLES, 0, 3);",
          q: "Which buffer feeds attribute 0 in the draw?",
          options: ["`otherBuf`: it's bound last", "`posBuf`", "Neither: the draw fails", "Whichever was created first"],
          answer: 1,
          why: "`vertexAttribPointer` captures the buffer bound **at that moment** into the VAO. The ARRAY_BUFFER binding is context state and plays no part in the draw. That's why rebinding it later changes nothing.",
        },
        {
          t: "pitfall",
          h: "Index buffers are VAO state",
          x: "Binding ELEMENT_ARRAY_BUFFER writes into the **currently bound VAO**. Create mesh B's index buffer while mesh A's VAO is still bound and you've just replaced A's indices. A draws garbage, far from the code that broke it. Bind `null` after every setup.",
        },
        {
          t: "quiz",
          q: "Why does every engine wrap calls in `if (current !== prog) gl.useProgram(prog)`?",
          options: ["Calling it twice throws", "Each call is validated and serialised into a command buffer; redundant calls still cost CPU", "useProgram recompiles the shader", "The GPU resets uniforms on every useProgram"],
          answer: 1,
          why: "In Chrome your calls are checked, encoded and shipped to the GPU process. A redundant bind does nothing on the GPU but still costs that CPU path. With thousands of draws a frame, state caching is a real win.",
        },
      ],
    },
    {
      title: "A triangle from zero",
      beats: [
        { t: "say", x: "Here is every line, no helper, no library. Run it first, then we take it apart call by call." },
        {
          t: "play",
          mode: "html",
          title: "triangle.html",
          html: CANVAS,
          css: CSS,
          js: SETUP + `
const vsSrc = \`#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec3 aColor;
out vec3 vColor;
void main() {
  vColor = aColor;
  gl_Position = vec4(aPos, 0.0, 1.0);
}\`;
const fsSrc = \`#version 300 es
precision highp float;
in vec3 vColor;
out vec4 outColor;
void main() { outColor = vec4(vColor, 1.0); }\`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
const prog = gl.createProgram();
gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSrc));
gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc));
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));

// x, y, r, g, b per vertex, interleaved
const data = new Float32Array([
   0.0,  0.7,   1.0, 0.4, 0.2,
  -0.7, -0.6,   0.2, 0.8, 0.4,
   0.7, -0.6,   0.2, 0.4, 1.0,
]);
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);                                  // start recording
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);    // copy to GPU memory
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);    // 5 floats = 20-byte stride
gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 20, 8);    // colour starts after x, y
gl.bindVertexArray(null);                                 // stop recording

gl.clearColor(0.07, 0.07, 0.08, 1);
gl.clear(gl.COLOR_BUFFER_BIT);
gl.useProgram(prog);
gl.bindVertexArray(vao);
gl.drawArrays(gl.TRIANGLES, 0, 3);`,
          task: "Make the top vertex white. Then change TRIANGLES to LINE_LOOP, then POINTS (add `gl_PointSize = 10.0;` to the vertex shader).",
        },
        {
          t: "steps",
          h: "What each call did",
          items: [
            "`getContext('webgl2')`: a context plus a drawing buffer the size of `canvas.width` x `canvas.height`. Returns null if WebGL2 isn't available.",
            "`createShader`, `shaderSource`, `compileShader`: GLSL text compiled by the driver. Failures are silent until you ask for `COMPILE_STATUS`.",
            "`createProgram`, `attachShader`, `linkProgram`: joins the two stages, matching vertex `out`s to fragment `in`s by name and type.",
            "`createVertexArray`, `bindVertexArray`: from here on, attribute setup is recorded into this VAO.",
            "`bufferData`: copies bytes into GPU memory. `STATIC_DRAW` is a hint: written once, drawn many times.",
            "`vertexAttribPointer(loc, size, type, normalized, stride, offset)`: how attribute `loc` reads that buffer. Stride and offset are in **bytes**.",
            "`useProgram`, `bindVertexArray`, `drawArrays(mode, first, count)`: pick the program and inputs, then run `count` vertices.",
          ],
        },
        {
          t: "predict",
          lang: "js",
          src: "// same interleaved data: x, y, r, g, b per vertex\ngl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);  // stride 0",
          q: "What appears?",
          options: ["The same triangle: stride 0 means auto", "A different, wrong-shaped triangle, and no error", "Nothing, and an INVALID_VALUE error", "Only the colours change"],
          answer: 1,
          why: "Stride 0 means \"tightly packed\": 2 floats per vertex. Vertex 1 now reads floats 2-3 (`1.0, 0.4`), a colour, as a position. The GPU happily draws whatever the bytes say.",
        },
        {
          t: "predict",
          lang: "glsl",
          src: "#version 300 es\n// precision highp float;   <- deleted\nin vec3 vColor;\nout vec4 outColor;\nvoid main() { outColor = vec4(vColor, 1.0); }",
          q: "This is the fragment shader. What happens?",
          options: ["Works, defaults to mediump", "Compile error: fragment shaders have no default float precision", "Works but colours are banded", "The triangle is drawn black"],
          answer: 1,
          why: "In GLSL ES 3.00 the vertex stage defaults float to highp, but the fragment stage has **no** default. The info log says so; your page just shows nothing unless you read it.",
        },
        {
          t: "pitfall",
          h: "`#version 300 es` must come first",
          x: "Open the template literal with a newline so the GLSL lines up nicely, and it fails to compile: `#version directive must occur on the first line`. Leading spaces pass; a leading newline doesn't. Put `#version` right after the backtick.",
        },
        {
          t: "quiz",
          q: "You rename `vColor` to `vCol` in the fragment shader only. When does it fail?",
          options: ["At compile of the fragment shader", "At link: each shader compiles alone, but the fragment input has no matching vertex output", "At draw time with INVALID_OPERATION", "Never: unmatched inputs read zero"],
          answer: 1,
          why: "Compilation sees one stage at a time, so both pass. Linking matches `out` to `in` by name, and a used input with no source fails `LINK_STATUS`. Always check both statuses and print both logs.",
        },
      ],
    },
    {
      title: "Attributes, uniforms, varyings, clip space",
      beats: [
        {
          t: "table",
          head: ["Kind", "Changes per", "Set from JS with", "GLSL ES 3.00"],
          rows: [
            ["Attribute", "vertex (or instance)", "a buffer + `vertexAttribPointer`", "`in` in the vertex shader"],
            ["Uniform", "draw call", "`gl.uniform*` after `useProgram`", "`uniform`, either stage"],
            ["Varying", "pixel, interpolated", "never: the vertex shader writes it", "`out` in vertex, `in` in fragment"],
            ["Texture", "lookup", "`texImage2D` + a texture unit", "`uniform sampler2D`, read with `texture()`"],
          ],
        },
        {
          t: "play",
          mode: "html",
          title: "uniforms.html",
          html: CANVAS,
          css: CSS,
          js: SETUP + PROGRAM + `
const prog = program(\`#version 300 es
layout(location = 0) in vec2 aPos;
uniform float uTime;
uniform float uAspect;                  // width / height
out vec2 vUv;
void main() {
  float c = cos(uTime), s = sin(uTime);
  vec2 p = mat2(c, s, -s, c) * aPos;    // rotate
  vUv = aPos + 0.5;                     // -0.5..0.5 to 0..1, interpolated
  gl_Position = vec4(p.x / uAspect, p.y, 0.0, 1.0);
}\`, \`#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
void main() { outColor = vec4(vUv, 0.8, 1.0); }\`);

const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5,-0.5, 0.5,-0.5, 0.5,0.5, -0.5,0.5]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());   // recorded in the VAO
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2,  0, 2, 3]), gl.STATIC_DRAW);
gl.bindVertexArray(null);

const uTime = gl.getUniformLocation(prog, 'uTime');
const uAspect = gl.getUniformLocation(prog, 'uAspect');

function frame(ms) {
  gl.clearColor(0.07, 0.07, 0.08, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(prog);                  // uniforms go to the current program
  gl.uniform1f(uTime, ms / 1000);
  gl.uniform1f(uAspect, canvas.width / canvas.height);
  gl.bindVertexArray(vao);
  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);`,
          task: "Set uAspect to 1.0 and watch the square stretch. Then make a house: one more vertex at (0, 0.9), three more indices, and a draw count of 9.",
        },
        { t: "say", h: "Clip space, NDC, pixels", x: "`gl_Position` is a vec4 in **clip space**. The GPU clips to -w..w, divides x, y, z by w to get **NDC** in -1..1, then `gl.viewport` maps NDC to pixels with y pointing **up** and the origin bottom-left." },
        {
          t: "predict",
          lang: "glsl",
          src: "// canvas and viewport: 400 x 400\ngl_Position = vec4(0.5, 0.5, 0.0, 2.0);",
          q: "Where does this vertex land, in pixels from the bottom-left?",
          options: ["(300, 300)", "(250, 250)", "(100, 100)", "Off-screen: w must be 1"],
          answer: 1,
          why: "Divide by w first: NDC (0.25, 0.25). Then (0.25 + 1) / 2 x 400 = 250. A w other than 1 is exactly how perspective works: big w, point pulled toward the centre.",
        },
        {
          t: "predict",
          lang: "html",
          src: "<canvas style=\"width: 100vw; height: 100vh\"></canvas>\n<script>\n  const gl = document.querySelector('canvas').getContext('webgl2');\n  // ...draw the triangle, no width/height set anywhere\n</script>",
          q: "What does the triangle look like on a 1600x900 window?",
          options: ["Sharp and correct", "Blurry and stretched: drawn at 300x150, scaled up by CSS", "Clipped to the top-left 300x150", "Nothing: the canvas has no size"],
          answer: 1,
          why: "CSS sizes the element; the `width` and `height` attributes size the **drawing buffer**, default 300x150. The browser stretches that small image to fill the box, aspect and all.",
        },
        {
          t: "pitfall",
          h: "Resizing the canvas doesn't resize the viewport",
          x: "The viewport is set to the canvas size when the context is created, and never again. Grow the canvas from 300x150 to 600x300 later and you draw into the bottom-left quarter. On resize: set `canvas.width/height` to CSS size x DPR, then call `gl.viewport`.",
        },
        {
          t: "quiz",
          q: "You comment out the line that uses `uniform float uScale;` while debugging. `gl.uniform1f(uScaleLoc, 2.0)` now...",
          options: ["Throws: unknown uniform", "Does nothing, silently: the compiler removed the uniform, so its location is `null`", "Logs INVALID_OPERATION", "Still sets it, for when you uncomment"],
          answer: 1,
          why: "Unused uniforms and attributes are optimised out. `getUniformLocation` returns `null`, and every `uniform*` call on null is a legal no-op. Re-fetch locations after changing a shader, and expect null.",
        },
        {
          t: "code",
          lang: "js",
          src: "// cube: 8 corners, but each face wants its own colour/normal\n// without indices: 6 faces x 2 triangles x 3 = 36 vertices\n// with indices:    6 faces x 4 corners  = 24 vertices + 36 indices\nconst indices = new Uint16Array([0, 1, 2,  0, 2, 3 /* , ...per face */]);\ngl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);\n// offset (last arg) is in BYTES: 6 indices in = 12 for Uint16\n// more than 65535 vertices: Uint32Array + gl.UNSIGNED_INT (core in WebGL2)",
          note: "Indices let the GPU reuse a shared vertex's shader result instead of running it again. On meshes, that's most vertices.",
        },
      ],
    },
    {
      title: "Textures",
      beats: [
        { t: "say", x: "A texture is an image in GPU memory plus rules for reading it: how to filter when it's magnified or shrunk, and what to do past the edges. You upload once, then `texture(sampler, uv)` in a shader." },
        {
          t: "play",
          mode: "html",
          title: "texture.html",
          html: CANVAS,
          css: CSS,
          js: SETUP + PROGRAM + `
// the image: a 32x32 2D canvas with an F, so orientation is obvious
const img = document.createElement('canvas');
img.width = img.height = 32;
const g = img.getContext('2d');
g.fillStyle = '#e8a33d'; g.fillRect(0, 0, 32, 32);
g.fillStyle = '#1b1b1f'; g.fillRect(0, 0, 16, 16); g.fillRect(16, 16, 16, 16);
g.fillStyle = '#fff'; g.font = 'bold 14px sans-serif'; g.fillText('F', 3, 13);
const tex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, tex);
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);      // images are stored top row first
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
gl.generateMipmap(gl.TEXTURE_2D);                  // min filter defaults to a mipmap mode
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);   // try LINEAR
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);         // try CLAMP_TO_EDGE

// no buffers at all: one triangle that covers the screen, from gl_VertexID
const prog = program(\`#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}\`, \`#version 300 es
precision highp float;
uniform sampler2D uTex;                 // samplers default to unit 0
uniform float uZoom, uAspect;
in vec2 vUv;
out vec4 outColor;
void main() { outColor = texture(uTex, (vUv - 0.5) * vec2(uAspect, 1.0) * uZoom + 0.5); }\`);
const uZoom = gl.getUniformLocation(prog, 'uZoom');
const uAspect = gl.getUniformLocation(prog, 'uAspect');

function frame(ms) {
  gl.useProgram(prog);
  gl.uniform1f(uZoom, 1.2 + 20 * (0.5 - 0.5 * Math.cos(ms / 3000)));
  gl.uniform1f(uAspect, canvas.width / canvas.height);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);`,
          task: "Delete the generateMipmap line: what happens, and why? Restore it, then set MIN_FILTER to NEAREST and watch the zoomed-out tiles shimmer. Turn flipY off.",
        },
        {
          t: "predict",
          lang: "js",
          src: "const tex = gl.createTexture();\ngl.bindTexture(gl.TEXTURE_2D, tex);\ngl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0,\n              gl.RGBA, gl.UNSIGNED_BYTE, pixels);\n// no texParameteri, no generateMipmap\n// ...draw a quad that samples tex",
          q: "Why is the quad black?",
          options: ["It isn't: it shows the image", "The default min filter needs mipmaps; with only level 0 the texture is incomplete and samples as (0, 0, 0, 1)", "`pixels` must be a Float32Array", "Texture unit 0 is reserved"],
          answer: 1,
          why: "TEXTURE_MIN_FILTER defaults to NEAREST_MIPMAP_LINEAR. With no mip chain the texture is incomplete, and WebGL defines that as opaque black. Set MIN_FILTER to LINEAR, or call generateMipmap.",
        },
        {
          t: "table",
          head: ["Parameter", "Default", "What to know"],
          rows: [
            ["`TEXTURE_MIN_FILTER`", "`NEAREST_MIPMAP_LINEAR`", "Needs mips. `LINEAR_MIPMAP_LINEAR` is trilinear, the smooth choice"],
            ["`TEXTURE_MAG_FILTER`", "`LINEAR`", "`NEAREST` for pixel art and data textures"],
            ["`TEXTURE_WRAP_S/T`", "`REPEAT`", "`CLAMP_TO_EDGE` for anything that isn't meant to tile"],
            ["`UNPACK_FLIP_Y_WEBGL`", "`false`", "Applies at upload. Flip, or flip v in the shader, never both"],
            ["`UNPACK_PREMULTIPLY_ALPHA_WEBGL`", "`false`", "Applies at upload. Turn on for images you blend with alpha"],
            ["`UNPACK_ALIGNMENT`", "`4`", "Rows padded to 4 bytes. Set 1 for tightly packed RGB or LUMINANCE data"],
          ],
        },
        {
          t: "quiz",
          q: "A brick texture on a floor shimmers and crawls in the distance. Mipmaps fix it because...",
          options: ["They make the texture higher resolution", "Far away, one pixel covers many texels; a single sample picks one at random-ish, and mips pre-average them", "They disable filtering", "They move the work to the CPU"],
          answer: 1,
          why: "Without mips, a minified texture is undersampled: each pixel grabs one texel out of dozens, and which one changes as the camera moves. Mips cost one third more memory and fix it.",
        },
        {
          t: "pitfall",
          h: "RGB data with odd widths comes out sheared",
          x: "UNPACK_ALIGNMENT defaults to 4, so GL expects every row padded to a multiple of 4 bytes. A 3-pixel-wide RGB row is 9 bytes: each row starts 3 bytes late, the image leans diagonally, or the upload fails for being short. `gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)`.",
        },
        {
          t: "pitfall",
          h: "Dark halos around transparent sprites",
          x: "With straight alpha, LINEAR filtering blends an edge texel with its transparent neighbour, whose RGB is often black. You get a dark fringe on every sprite. Upload with UNPACK_PREMULTIPLY_ALPHA_WEBGL and blend with `blendFunc(ONE, ONE_MINUS_SRC_ALPHA)`.",
        },
      ],
    },
    {
      title: "Matrices, perspective and depth",
      beats: [
        { t: "say", x: "Three matrices move a vertex: **model** (object to world), **view** (world to camera), **projection** (camera to clip). `gl_Position = uProj * uView * uModel * vec4(aPos, 1.0)`. Read it right to left." },
        {
          t: "code",
          lang: "js",
          src: "// column-major: the 4 columns are stored one after another\nconst m = new Float32Array([\n  1, 0, 0, 0,   // column 0\n  0, 1, 0, 0,   // column 1\n  0, 0, 1, 0,   // column 2\n  tx, ty, tz, 1 // column 3: translation lives at [12], [13], [14]\n]);\ngl.uniformMatrix4fv(uModelLoc, false, m);  // false: don't transpose",
          mark: [6],
          note: "Written as source, a column-major array looks transposed. Element (row r, column c) is at index `c * 4 + r`.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// written by hand, row by row, as in a textbook\nconst m = new Float32Array([\n  1, 0, 0, tx,\n  0, 1, 0, ty,\n  0, 0, 1, tz,\n  0, 0, 0, 1,\n]);\ngl.uniformMatrix4fv(loc, false, m);",
          q: "With tx = 2, what happens to the mesh?",
          options: ["It moves 2 units right", "It warps strangely or vanishes: the translation landed in the bottom row and now feeds w", "Nothing: GL detects the layout", "INVALID_VALUE"],
          answer: 1,
          why: "Uploaded as columns, those numbers become the bottom row, so w = 2x + 1 instead of 1. The divide by w then warps everything like a broken perspective. Transposed matrices look like this, never like an error.",
        },
        { t: "say", h: "Perspective is the divide", x: "A projection matrix copies -z (distance in front of the camera) into w. The GPU then divides x and y by w, so things twice as far are drawn half the size. That one division is all perspective is." },
        {
          t: "play",
          mode: "html",
          title: "depth.html",
          html: CANVAS,
          css: CSS,
          js: SETUP + PROGRAM + MAT + `
const prog = program(\`#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aColor;
uniform mat4 uMvp;
out vec3 vColor;
void main() { vColor = aColor; gl_Position = uMvp * vec4(aPos, 1.0); }\`, \`#version 300 es
precision highp float;
in vec3 vColor; out vec4 outColor;
void main() { outColor = vec4(vColor, 1.0); }\`);
const quad = (a, b, c, d, col) => [a, b, c, a, c, d].flatMap((p) => [...p, ...col]);
const data = new Float32Array([   // two quads that cut through each other
  ...quad([-1,-1,0], [1,-1,0], [1,1,0], [-1,1,0], [0.95, 0.6, 0.25]),   // z = 0 plane
  ...quad([0,-1,-1], [0,-1,1], [0,1,1], [0,1,-1], [0.3, 0.55, 0.95]),   // x = 0 plane
]);
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
gl.enable(gl.DEPTH_TEST);              // the canvas has a depth buffer; the test is off by default
gl.clearColor(0.07, 0.07, 0.08, 1);
gl.useProgram(prog);                   // one program, one VAO: bind once, the state stays
const uMvp = gl.getUniformLocation(prog, 'uMvp');

function frame(ms) {
  const proj = perspective(Math.PI / 3, canvas.width / canvas.height, 0.1, 100);
  const model = mul(rotY(ms / 1400), rotX(0.4));
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.uniformMatrix4fv(uMvp, false, mul(proj, mul(translate(0, 0, -4), model)));
  gl.drawArrays(gl.TRIANGLES, 0, 12);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);`,
          task: "Comment out `enable(DEPTH_TEST)`: the quad drawn second always wins. Then give the blue quad corners at ±0.6 in the z = 0 plane, the orange one's plane, and watch them fight.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// a floor at y = 0, and a decal quad at y = 0 on top of it\n// both drawn with depth test on, gl.LESS\ndrawFloor();\ndrawDecal();",
          q: "What does the decal look like as the camera moves?",
          options: ["Perfectly on top: drawn last", "Hidden: equal depth fails LESS", "Flickering stripes of floor and decal: z-fighting", "Blended 50/50"],
          answer: 2,
          why: "Two triangles at the same depth get interpolated depths that differ by rounding, pixel by pixel. Some pass LESS, some fail, and the pattern changes every frame. Use `polygonOffset` on the decal, or lift it slightly.",
        },
        {
          t: "pitfall",
          h: "Z-fighting is a near-plane problem",
          x: "Depth after the divide is hyperbolic: most of the precision crowds in front of the near plane. At distance 100, near 0.1 with far 100000 is about 100x more precise than near 0.001 with far 1000. Push near out as far as the scene allows; pulling far in barely helps.",
        },
      ],
    },
    {
      title: "Blending and instancing",
      beats: [
        { t: "say", x: "Blending combines the fragment's colour with the one already in the framebuffer. `blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)` means `src * a + dst * (1 - a)`. It depends on what's already there, so **draw order matters**." },
        {
          t: "quiz",
          q: "A scene with opaque walls and glass panes. What order works?",
          options: ["Any order, depth test sorts it out", "Opaque first with depth writes on; then glass back to front with `depthMask(false)`", "Glass first, then opaque", "Glass front to back with depth writes on"],
          answer: 1,
          why: "Depth hides glass behind walls, so opaque goes first. Glass must blend over what's behind it, so far to near. Writing depth from glass would make nearer glass block farther glass drawn after it.",
        },
        {
          t: "compare",
          a: { label: "straight alpha", lang: "js", src: "// texture RGB not multiplied by alpha\ngl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);\n// filtering mixes in the RGB of\n// transparent texels: dark fringes" },
          b: { label: "premultiplied", lang: "js", src: "gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);\n// shader outputs vec4(rgb * a, a)\ngl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);\n// filters correctly, and matches the canvas" },
          x: "The page composites your canvas as premultiplied by default. Output premultiplied colour, or create the context with `{ alpha: false }` if it's opaque anyway.",
        },
        { t: "say", h: "Instancing", x: "10,000 quads as 10,000 `drawArrays` calls is CPU-bound: each call pays the validation path. One `drawArraysInstanced` draws the same 6 vertices 10,000 times, reading **per-instance attributes** for position and colour." },
        {
          t: "play",
          mode: "html",
          title: "instances.html",
          html: CANVAS,
          css: CSS,
          js: SETUP + PROGRAM + `
const N = 10000;
const prog = program(\`#version 300 es
layout(location = 0) in vec2 aCorner;     // per vertex
layout(location = 1) in vec3 aInst;       // per instance: x, y, phase
uniform float uTime, uAspect;
out vec3 vColor;
void main() {
  float a = aInst.z + uTime;
  vec2 c = aInst.xy + 0.05 * vec2(cos(a), sin(a * 1.3));
  vColor = 0.5 + 0.5 * cos(aInst.z + vec3(0.0, 2.1, 4.2));
  gl_Position = vec4(c + aCorner * vec2(0.008 / uAspect, 0.008), 0.0, 1.0);
}\`, \`#version 300 es
precision highp float;
in vec3 vColor; out vec4 outColor;
void main() { outColor = vec4(vColor * 0.5, 1.0); }\`);
const inst = new Float32Array(N * 3);
for (let i = 0; i < N; i++) inst.set([Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 6.28], i * 3);

const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, 1,1, -1,-1, 1,1, -1,1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, inst, gl.STATIC_DRAW);
gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
gl.vertexAttribDivisor(1, 1);              // advance once per instance, not per vertex

gl.enable(gl.BLEND);
gl.blendFunc(gl.ONE, gl.ONE);              // additive: order doesn't matter
gl.clearColor(0.03, 0.03, 0.04, 1);
gl.useProgram(prog);
const uTime = gl.getUniformLocation(prog, 'uTime');
const uAspect = gl.getUniformLocation(prog, 'uAspect');

function frame(ms) {
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.uniform1f(uTime, ms / 1000);
  gl.uniform1f(uAspect, canvas.width / canvas.height);
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, N);   // one call, N quads
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);`,
          task: "Raise N to 100000, then 1000000: where does it stop being smooth? Then try `blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)` with an output alpha of 0.3.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// same setup, but this line is deleted:\n// gl.vertexAttribDivisor(1, 1);\ngl.drawArraysInstanced(gl.TRIANGLES, 0, 6, N);",
          q: "What appears?",
          options: ["The same 10,000 quads", "One misshapen polygon, drawn 10,000 times on top of itself", "Nothing: instancing needs at least one divisor", "10,000 quads at the origin"],
          answer: 1,
          why: "Divisor 0 means per vertex: vertex k of every instance reads `inst[k]`, so the 6 corners take offsets from 6 different instances. Every instance is identical, stacked. Additive blending makes it bright.",
        },
        {
          t: "pitfall",
          h: "Sorting by centre fails for big transparent meshes",
          x: "Back-to-front sorting works per object, by its centre. Two long intersecting transparent panels have no correct order: each is partly in front of the other. Split them, use additive blending, which is order-free, or cut out with alpha-to-coverage.",
        },
      ],
    },
    {
      title: "Framebuffers, errors and context loss",
      beats: [
        { t: "say", x: "A **framebuffer** redirects drawing from the canvas into a texture you own. Draw a scene into it, then sample it in a second pass: that's post-processing, shadow maps, picking and every blur." },
        {
          t: "play",
          mode: "html",
          title: "render-to-texture.html",
          html: CANVAS,
          css: CSS,
          js: SETUP + PROGRAM + `
const SIZE = 48;                                 // tiny on purpose: watch the pixels
const tex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, tex);
gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, SIZE, SIZE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
const fbo = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
console.log(gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE ? 'fbo complete' : 'fbo incomplete');
const scene = program(\`#version 300 es
uniform float uT;
const vec2 P[3] = vec2[3](vec2(0.0, 0.8), vec2(-0.7, -0.5), vec2(0.7, -0.5));
out vec2 vP;
void main() {
  vP = P[gl_VertexID]; float c = cos(uT), s = sin(uT);
  gl_Position = vec4(mat2(c, s, -s, c) * vP, 0.0, 1.0);
}\`, \`#version 300 es
precision highp float; in vec2 vP; out vec4 o;
void main() { o = vec4(0.5 + 0.5 * vP, 0.9, 1.0); }\`);
const post = program(\`#version 300 es
out vec2 vUv;
void main() {                            // one screen-covering triangle, no buffer
  vUv = vec2(gl_VertexID == 1 ? 2.0 : 0.0, gl_VertexID == 2 ? 2.0 : 0.0);
  gl_Position = vec4(vUv * 2.0 - 1.0, 0.0, 1.0);
}\`, \`#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uTex;
void main() { o = texture(uTex, vUv * 3.0) * (0.6 + 0.4 * vUv.y); }\`);
const uT = gl.getUniformLocation(scene, 'uT');
gl.clearColor(0.1, 0.1, 0.12, 1);

function frame(ms) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, SIZE, SIZE);   // pass 1: into tex
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(scene); gl.uniform1f(uT, ms / 1000);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); // pass 2
  gl.useProgram(post);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);`,
          task: "Raise SIZE to 512. Then delete the second `gl.viewport` call and predict what you'll see before running it.",
        },
        {
          t: "predict",
          lang: "js",
          src: "gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);\ngl.viewport(0, 0, 256, 256);\ndrawScene();\ngl.bindFramebuffer(gl.FRAMEBUFFER, null);\n// forgot: gl.viewport(0, 0, canvas.width, canvas.height)\ndrawPostQuad();",
          q: "On a 1200x800 canvas, what appears?",
          options: ["The full-screen post effect", "The post pass squeezed into a 256x256 square at the bottom-left", "Nothing", "INVALID_FRAMEBUFFER_OPERATION"],
          answer: 1,
          why: "The viewport is context state, not framebuffer state. Binding `null` doesn't restore it. Every bind of a framebuffer should be followed by a viewport for that target.",
        },
        {
          t: "pitfall",
          h: "Reading the texture you're drawing into",
          x: "Sample a texture that's also attached to the bound framebuffer and the draw fails with INVALID_OPERATION: a feedback loop. Blur and simulation passes need two textures, ping-ponged: read A write B, then swap.",
        },
        {
          t: "code",
          lang: "js",
          src: "function compile(type, src) {\n  const s = gl.createShader(type);\n  gl.shaderSource(s, src);\n  gl.compileShader(s);\n  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {\n    const log = gl.getShaderInfoLog(s);       // \"ERROR: 0:7: 'vColr' : undeclared identifier\"\n    const numbered = src.split('\\n').map((l, i) => `${i + 1}: ${l}`).join('\\n');\n    throw new Error(`${log}\\n${numbered}`);   // 0:7 means line 7\n  }\n  return s;\n}\n\n// dev only: errors are sticky flags, read and cleared one at a time\nlet e; while ((e = gl.getError()) !== gl.NO_ERROR) console.warn('GL error', e);",
          mark: [6, 7, 14],
          note: "A shader log without the numbered source sends you counting lines in a template literal. Print both.",
        },
        {
          t: "pitfall",
          h: "getError in the render loop stalls the GPU",
          x: "`getError`, `getShaderParameter`, `getProgramParameter` and `readPixels` make your JS wait for the GPU process to answer: a synchronous round trip that drains the queue. Use them in dev builds, and in production check compile and link status once, after all programs are linked.",
        },
        {
          t: "code",
          lang: "js",
          src: "canvas.addEventListener('webglcontextlost', (e) => {\n  e.preventDefault();          // without this, it is never restored\n  cancelAnimationFrame(raf);\n});\ncanvas.addEventListener('webglcontextrestored', () => {\n  initGL();                    // every buffer, texture, program: gone. Recreate.\n  raf = requestAnimationFrame(frame);\n});\n\n// test it on purpose\nconst ext = gl.getExtension('WEBGL_lose_context');\next.loseContext();\nsetTimeout(() => ext.restoreContext(), 1000);",
          mark: [2, 6],
          note: "Contexts are lost on driver resets, GPU switches on laptops, and when a page opens too many contexts. All old handles are dead after a restore.",
        },
        {
          t: "pitfall",
          h: "Keep the data that built your GPU objects",
          x: "If your loader uploaded a mesh and threw the arrays away, a context loss means a blank canvas until reload. Structure setup as one `initGL()` that can rebuild everything from CPU-side data or re-fetch it, and test it with WEBGL_lose_context.",
        },
        {
          t: "table",
          head: ["You write by hand", "three.js does it as"],
          rows: [
            ["compile, link, check logs, cache programs", "a program cache keyed by material and lights"],
            ["VAOs and buffers per mesh", "`BufferGeometry` attributes, uploaded on first render"],
            ["model, view, projection maths", "`Object3D.matrixWorld`, `camera.projectionMatrix`"],
            ["uniform uploads, skipped if unchanged", "per-material uniforms plus a state cache"],
            ["opaque first, transparent back to front", "render lists sorted every frame"],
            ["texture params, flipY, mips, premultiply", "`Texture` properties: `flipY` defaults to true"],
            ["context loss", "handles the lost and restored events and reinitialises its GL state"],
          ],
        },
      ],
    },
    {
      title: "Rebuild: triangle to spinning cube",
      beats: [
        { t: "say", x: "You now have every piece: buffers, a VAO, an index buffer, a matrix uniform, depth. The starter is a triangle already wired to an MVP matrix. Turn it into a solid cube with one colour per face." },
        {
          t: "rebuild",
          h: "A spinning cube, no library",
          x: "The triangle spins through `uMvp`. Replace its data with 24 vertices (4 per face, each with the face's colour) and 36 indices, draw with drawElements, and turn on depth testing and back-face culling.",
          mode: "html",
          html: CANVAS,
          css: CSS,
          js: SETUP + PROGRAM + MAT + `
const prog = program(\`#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aColor;
uniform mat4 uMvp;
out vec3 vColor;
void main() { vColor = aColor; gl_Position = uMvp * vec4(aPos, 1.0); }\`, \`#version 300 es
precision highp float;
in vec3 vColor; out vec4 outColor;
void main() { outColor = vec4(vColor, 1.0); }\`);
// TODO: 24 vertices, x y z r g b: 4 corners per face, one colour per face
const data = new Float32Array([
   0, 1, 0,   1.0, 0.4, 0.2,
  -1,-1, 0,   0.2, 0.8, 0.4,
   1,-1, 0,   0.2, 0.4, 1.0,
]);
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
// TODO: an index buffer, bound while the VAO is: 2 CCW triangles per face
// TODO: gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
gl.clearColor(0.07, 0.07, 0.08, 1);
gl.useProgram(prog);
const uMvp = gl.getUniformLocation(prog, 'uMvp');

function frame(ms) {
  const proj = perspective(Math.PI / 3, canvas.width / canvas.height, 0.1, 100);
  gl.uniformMatrix4fv(uMvp, false, mul(proj, mul(translate(0, 0, -5), mul(rotY(ms / 1000), rotX(ms / 1700)))));
  gl.clear(gl.COLOR_BUFFER_BIT);         // TODO: | gl.DEPTH_BUFFER_BIT
  gl.drawArrays(gl.TRIANGLES, 0, 3);     // TODO: drawElements(TRIANGLES, 36, UNSIGNED_SHORT, 0)
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);`,
          task: "Build one face first and check it. If a face vanishes with CULL_FACE on, its winding is clockwise: swap two indices.",
        },
        {
          t: "mission",
          h: "10,000 instanced cubes",
          x: "Combine the cube and the instancing demo: 10,000 cubes in one `drawElementsInstanced` call, each with its own position and spin speed as instance attributes, depth tested. Then make it survive `WEBGL_lose_context`.",
          hint: "Spin in the vertex shader: build a rotation from `aInst.w * uTime` and apply it before adding the offset. Only the projection-view matrix stays a uniform.",
          solution: {
            lang: "glsl",
            src: "#version 300 es\nlayout(location = 0) in vec3 aPos;\nlayout(location = 1) in vec3 aColor;\nlayout(location = 2) in vec4 aInst;   // xyz offset, w spin speed; divisor 1\nuniform mat4 uViewProj;\nuniform float uTime;\nout vec3 vColor;\nvoid main() {\n  float a = aInst.w * uTime, c = cos(a), s = sin(a);\n  vec3 p = aPos * 0.1;\n  p.xz = mat2(c, s, -s, c) * p.xz;    // spin around y\n  vColor = aColor;\n  gl_Position = uViewProj * vec4(p + aInst.xyz, 1.0);\n}\n// JS: gl.drawElementsInstanced(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, 10000);",
          },
        },
      ],
    },
  ],
  nobodyTells: [
    "Print shader logs together with line-numbered source. The line in `ERROR: 0:7` counts from the first line of the string, `#version` included.",
    "Bind `null` to the VAO after setting one up. Half of all 'mesh draws garbage' bugs are an index buffer bound into the wrong VAO.",
    "A blank canvas is usually a compile error, a null uniform location or a viewport mismatch. Check them in that order.",
    "In WebGL2 primitive restart is always on: index 65535 in a Uint16 buffer ends the strip instead of drawing vertex 65535.",
    "`toDataURL` on a WebGL canvas outside the frame that drew it returns blank unless the context has `preserveDrawingBuffer: true`.",
    "Spector.js captures one frame and lists every GL call with its state. It's the debugger WebGL doesn't ship with.",
    "Treat context loss as a feature to test, not an edge case. Laptops switching GPUs trigger it in the wild.",
  ],
  glossary: [
    ["clip space", "The vec4 a vertex shader writes to `gl_Position`, before the divide by w."],
    ["NDC", "Normalised device coordinates: clip space divided by w, -1..1 on each axis."],
    ["viewport", "The mapping from NDC to framebuffer pixels, set by `gl.viewport`. Context state."],
    ["attribute", "A per-vertex (or per-instance) shader input read from a buffer."],
    ["uniform", "A shader input that is constant for one draw call; stored per program."],
    ["varying", "A vertex shader output interpolated across the triangle into the fragment shader."],
    ["VAO", "Vertex array object: records attribute pointers, enables, divisors and the index buffer."],
    ["index buffer", "An ELEMENT_ARRAY_BUFFER of vertex indices so shared vertices are stored and shaded once."],
    ["mipmap", "A chain of half-size copies of a texture, sampled when it's minified to stop shimmer."],
    ["perspective divide", "Dividing clip x, y, z by w, which makes far things smaller."],
    ["z-fighting", "Flicker where two surfaces' depths are too close for the depth buffer to separate."],
    ["premultiplied alpha", "RGB already multiplied by alpha; filters and blends correctly with `ONE, ONE_MINUS_SRC_ALPHA`."],
    ["instancing", "Drawing one mesh many times in a single call, with per-instance attributes via a divisor."],
    ["framebuffer", "A render target. `null` is the canvas; your own attaches textures or renderbuffers."],
    ["context loss", "The browser revoking the GPU context; every WebGL object must be recreated."],
  ],
  explain: "Explain to a friend everything that happens between `gl.drawArrays(gl.TRIANGLES, 0, 3)` and a coloured triangle on screen.",
};
