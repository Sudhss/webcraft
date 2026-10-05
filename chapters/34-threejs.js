/* Shared opening lines for the three playgrounds: a renderer with a capped
 * pixel ratio, a camera, and a resize handler. Each play adds its own scene. */
const SETUP = `import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15171c);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
function fit() {                        // 45 degrees tall, but never under 60 wide
  camera.aspect = innerWidth / innerHeight;
  const minFov = 2 * Math.atan(Math.tan(Math.PI / 6) / camera.aspect);
  camera.fov = Math.max(45, THREE.MathUtils.radToDeg(minFov));
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
fit();
addEventListener("resize", fit);
`;

const HUD_CSS = `#hud { position: fixed; left: 10px; top: 10px; padding: 6px 10px; border-radius: 6px;
  background: #000a; color: #eee; font: 12px/1.5 ui-monospace, monospace; white-space: pre; }`;

export default {
  id: "threejs",
  n: 34,
  part: "F",
  title: "Three.js",
  hook: "A scene graph, a camera and a loop. Learn what each render() really costs and 20,000 objects stay at 60 fps.",
  minutes: 100,
  levels: ["use", "understand", "rebuild"],
  sections: [
    {
      title: "A scene in 40 lines",
      beats: [
        { t: "say", x: "three.js is two things: a **tree of objects** you describe, and a **renderer** that walks that tree every frame and turns it into WebGL draw calls. Everything you tune later is about what that walk costs." },
        {
          t: "play",
          mode: "three",
          title: "hello.js",
          js: `import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); // cap: DPR 3 is 9x the pixels of DPR 1
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;      // the default since r152, written out
renderer.toneMapping = THREE.ACESFilmicToneMapping;    // squeeze bright light into 0..1
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15171c);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.2, 4);
camera.lookAt(0, 0, 0);

scene.add(new THREE.HemisphereLight(0xdde6ff, 0x30241a, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(3, 4, 2);
scene.add(sun);

const box = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0xe0893a, roughness: 0.4 })
);
scene.add(box);

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 20);   // a hidden tab returns minutes
  box.rotation.x += 0.4 * dt;
  box.rotation.y += 0.7 * dt;
  renderer.render(scene, camera);
});`,
          task: "Raise the sun to 8, then set `toneMapping` to `THREE.NoToneMapping` and watch the lit face clip to flat orange. Try `THREE.AgXToneMapping` too.",
        },
        {
          t: "steps",
          h: "What one renderer.render() does",
          items: [
            "Update `matrixWorld` for every object whose transform may have changed: a walk of the whole tree.",
            "Frustum-cull: test each object's bounding sphere against the camera's six planes.",
            "Sort opaque by renderOrder, then material (fewer switches), then front to back. Transparent goes back to front.",
            "Per visible object: pick or compile a shader program, upload changed uniforms, bind buffers.",
            "Issue one draw call per object, or one per material group. This loop is your CPU cost.",
          ],
        },
        {
          t: "predict",
          lang: "js",
          src: "// a phone with devicePixelRatio = 3\nrenderer.setPixelRatio(devicePixelRatio);\n// versus\nrenderer.setPixelRatio(Math.min(devicePixelRatio, 2));",
          q: "How much more fragment work does the uncapped version do?",
          options: ["1.5x", "2.25x", "3x", "None: the canvas is the same size in CSS pixels"],
          answer: 1,
          why: "Pixels scale with the square of the ratio: 3² / 2² = 2.25. On a small screen the difference at DPR 3 is barely visible, but the GPU shades every one of those pixels, every frame, with your battery.",
        },
        {
          t: "pitfall",
          h: "`clock.getElapsedTime()` eats your delta",
          x: "In three's `Clock`, `getElapsedTime()` calls `getDelta()` internally. Read elapsed time first and the `getDelta()` after it returns about 0, so everything driven by dt freezes. Call `getDelta()` once per frame and sum it yourself.",
        },
        {
          t: "quiz",
          q: "Why `renderer.setAnimationLoop(fn)` instead of your own `requestAnimationFrame` loop?",
          options: ["It is faster", "In WebXR the headset drives the frame loop, and only setAnimationLoop hands your callback to it", "requestAnimationFrame does not work with WebGL", "It skips frames when the GPU is busy"],
          answer: 1,
          why: "On a flat screen they behave the same. In a WebXR session `window.requestAnimationFrame` is the wrong clock; the session has its own. setAnimationLoop switches for you, so XR support costs one line later.",
        },
      ],
    },
    {
      title: "The scene graph",
      beats: [
        { t: "say", x: "Every `Object3D` has `position`, `quaternion` (`rotation` is an Euler view of it) and `scale`. Those make its local `matrix`. Its `matrixWorld` is `parent.matrixWorld × matrix`, all the way up to the scene." },
        {
          t: "play",
          mode: "three",
          title: "arm.js",
          js: SETUP + `camera.position.set(0, 1.4, 5);
camera.lookAt(0, 1, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.5));
scene.add(new THREE.GridHelper(6, 12, 0x555555, 0x333333));

const mat = new THREE.MeshStandardMaterial({ color: 0x8aa4c8, roughness: 0.5 });
const shoulder = new THREE.Group();              // a pivot: it turns, draws nothing
scene.add(shoulder);
const upper = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.3), mat);
upper.position.y = 0.6;                          // shift the box so the pivot is its end
shoulder.add(upper);

const elbow = new THREE.Group();
elbow.position.y = 1.2;                          // in shoulder space: top of the upper arm
shoulder.add(elbow);
const fore = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1, 0.25), mat);
fore.position.y = 0.5;
elbow.add(fore);
const hand = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 16),
  new THREE.MeshStandardMaterial({ color: 0xe0893a }));
hand.position.y = 1;                             // never changes: it rides on elbow
elbow.add(hand);

const world = new THREE.Vector3();
const fmt = (v) => v.toArray().map((n) => n.toFixed(2)).join(", ");
let lastLog = -1;
renderer.setAnimationLoop((ms) => {
  const t = ms / 1000;
  shoulder.rotation.z = Math.sin(t * 0.8) * 0.8;
  elbow.rotation.z = Math.sin(t * 1.3) * 1.2;
  renderer.render(scene, camera);
  if (t - lastLog > 1) {
    lastLog = t;
    console.log("hand local", fmt(hand.position), "  world", fmt(hand.getWorldPosition(world)));
  }
});`,
          task: "Add a third joint (a wrist Group at y = 1 inside elbow) and move the hand into it. Then put `shoulder.position.x = 1.5` and see only the world numbers change.",
        },
        {
          t: "predict",
          lang: "js",
          src: "const parent = new THREE.Group();\nparent.position.x = 2;\nparent.scale.setScalar(2);\nconst child = new THREE.Object3D();\nchild.position.x = 1;\nparent.add(child);\nconsole.log(child.getWorldPosition(new THREE.Vector3()).x);",
          q: "What prints?",
          options: ["1", "3", "4", "6"],
          answer: 2,
          why: "The child's local position goes through the parent's scale, then its translation: 2 + 2 × 1 = 4. Scale, then rotate, then translate, applied from the child outward through every ancestor.",
        },
        {
          t: "pitfall",
          h: "`add` keeps the local transform, `attach` the world one",
          x: "Pick up an object by moving it into a hand with `hand.add(cup)` and the cup jumps: its old position is now read in the hand's space. `hand.attach(cup)` recomputes the local transform so it stays exactly where it was on screen.",
        },
        {
          t: "pitfall",
          h: "Non-uniform scale on a parent shears its children",
          x: "Scale a parent to (2, 1, 1) and rotate a child 45° inside it: the child becomes a parallelogram, a shear no position, quaternion and scale can express. `attach` and decomposition break too. Keep non-uniform scale on leaf meshes only.",
        },
        {
          t: "quiz",
          q: "You set `parent.position.x = 5` and on the next line read `child.matrixWorld`. What do you get?",
          options: ["The new world matrix", "Last frame's world matrix: it updates in render() or when you ask", "An identity matrix", "An error"],
          answer: 1,
          why: "`matrixWorld` is a cache filled by `updateMatrixWorld`, which render() calls. `getWorldPosition` refreshes the ancestors first, so prefer it; raw `matrixWorld` reads mid-frame are a classic off-by-one-frame bug.",
        },
      ],
    },
    {
      title: "Cameras and the depth buffer",
      beats: [
        { t: "say", x: "`PerspectiveCamera(fov, aspect, near, far)`: fov is **vertical**, in degrees. `OrthographicCamera(left, right, top, bottom, near, far)` is a box in world units: no shrinking with distance, which is what maps, CAD and isometric games want." },
        {
          t: "predict",
          lang: "js",
          src: "// a 24-bit depth buffer, distant shapes flicker\nconst cam = new THREE.PerspectiveCamera(50, aspect, 0.01, 10000);\n// fix A: far 10000 -> 1000\n// fix B: near 0.01 -> 1",
          q: "Which fix does more for precision at distance 300?",
          options: ["A, by about 10x", "B, by about 100x", "Both about the same", "Neither: only a 32-bit buffer helps"],
          answer: 1,
          why: "Perspective depth is roughly `1 - near / z`, so the resolvable gap grows like z² / (near × 2^24). It scales with 1/near and barely depends on far. Raising near 100x buys about 100x; cutting far changes almost nothing.",
        },
        {
          t: "play",
          mode: "three",
          title: "zfight.js",
          js: `import * as THREE from "three";

const NEAR = 0.01;                                  // try 1
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15171c);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, NEAR, 3000);

// four red/blue pairs, 0.1 apart, at growing distances; each scaled to look the same size
const GAP = 0.1;
[[40, -1, 1], [120, 1, 1], [300, -1, -1], [700, 1, -1]].forEach(([z, sx, sy]) => {
  const pair = new THREE.Group();
  for (const [dz, color] of [[GAP, 0x3a7fd0], [0, 0xd0603a]]) {   // blue drawn first: a tie shows red
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3 * z, 0.3 * z),
      new THREE.MeshBasicMaterial({ color }));
    m.position.z = dz;                                // blue in front: should win everywhere
    pair.add(m);
  }
  pair.position.set(sx * 0.2 * z, sy * 0.2 * z, -z);
  pair.rotation.y = 0.6;
  scene.add(pair);
  const gap = (z * z) / (NEAR * 2 ** 24);
  console.log("z", z, " resolvable gap", gap.toFixed(4), gap > GAP ? " FIGHTS" : " ok");
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
renderer.setAnimationLoop((ms) => {
  camera.rotation.y = Math.sin(ms / 1500) * 0.01;     // a slow sway makes it shimmer
  renderer.render(scene, camera);
});`,
          task: "Match the console's predictions to the squares. Set NEAR to 1 and they all turn clean blue. Try 0.0001, then add `logarithmicDepthBuffer: true` to the renderer.",
        },
        {
          t: "code",
          lang: "js",
          src: "// smallest depth gap a 24-bit buffer can separate at distance z\nconst gap = (z, near) => (z * z) / (near * 2 ** 24);\n\ngap(300, 0.01);  // 0.54  : pairs 0.1 apart fight\ngap(300, 1);     // 0.005 : fine\ngap(5, 0.01);    // 0.00015: close things are always fine",
          note: "Push near out as far as the scene allows. `logarithmicDepthBuffer` fixes huge ranges but writes depth per fragment, which disables early depth rejection.",
        },
        {
          t: "pitfall",
          h: "Vertical fov crops your scene on phones",
          x: "fov fixes the vertical view, so a portrait screen keeps the height and loses the sides: your hero model is cut off on every phone. Fit the width instead: `fov = 2 * atan(tan(hfov / 2) / aspect)` in degrees, recomputed on resize.",
        },
        {
          t: "code",
          lang: "js",
          src: "// an orthographic camera that shows 10 world units vertically\nconst H = 10;\nconst cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);\nfunction fit() {\n  const a = innerWidth / innerHeight;\n  cam.left = -H * a / 2; cam.right = H * a / 2;\n  cam.top = H / 2;       cam.bottom = -H / 2;\n  cam.updateProjectionMatrix();\n}\nfit();\naddEventListener('resize', fit);",
          note: "An orthographic camera has no `aspect`: the resize code from the perspective camera silently does nothing, and the scene stretches.",
        },
        {
          t: "quiz",
          q: "You move an orthographic camera twice as close to the scene. What changes on screen?",
          options: ["Everything doubles in size", "Nothing, unless it crosses near or far", "Everything halves", "Perspective appears"],
          answer: 1,
          why: "Orthographic projection ignores distance. To zoom, set `camera.zoom = 2` and call `updateProjectionMatrix()`, or shrink the box. OrbitControls knows this and changes `zoom` for orthographic cameras.",
        },
      ],
    },
    {
      title: "Geometry, materials and light",
      beats: [
        { t: "say", x: "A `BufferGeometry` is a set of typed arrays named `position`, `normal`, `uv`, each with an itemSize, plus an optional `index` that lets triangles share vertices. That's all a mesh is to the GPU." },
        {
          t: "predict",
          lang: "js",
          src: "const g = new THREE.BoxGeometry(1, 1, 1);\nconsole.log(g.attributes.position.count);",
          q: "A cube has 8 corners. What prints?",
          options: ["8", "12", "24", "36"],
          answer: 2,
          why: "A vertex is a bundle: position plus normal plus uv. Each corner touches 3 faces with 3 different normals, so it is stored 3 times: 24. The index then lists 36 entries for 12 triangles. Hard edges always duplicate vertices.",
        },
        {
          t: "play",
          mode: "three",
          title: "attributes.js",
          js: SETUP + `camera.position.set(0, 6, 9);
camera.lookAt(0, 0, 0);

const N = 120;                                       // N x N points
const pos = new Float32Array(N * N * 3);
const col = new Float32Array(N * N * 3);
const c = new THREE.Color();
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
  const k = (i * N + j) * 3;
  pos[k] = (i / (N - 1) - 0.5) * 10;
  pos[k + 2] = (j / (N - 1) - 0.5) * 10;
  c.setHSL(0.55 + 0.25 * (i / N), 0.7, 0.55);       // sRGB in, linear stored
  col.set([c.r, c.g, c.b], k);
}
const geo = new THREE.BufferGeometry();
geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
const points = new THREE.Points(geo,
  new THREE.PointsMaterial({ size: 0.06, vertexColors: true }));
scene.add(points);

renderer.setAnimationLoop((ms) => {
  const t = ms / 1000;
  for (let i = 0; i < N * N; i++) {
    const x = pos[i * 3], z = pos[i * 3 + 2];
    pos[i * 3 + 1] = 0.6 * Math.sin(x * 0.8 + t) * Math.cos(z * 0.6 + t * 0.7);
  }
  geo.attributes.position.needsUpdate = true;        // re-upload the whole buffer
  points.rotation.y = t * 0.1;
  renderer.render(scene, camera);
});`,
          task: "Comment out the `needsUpdate` line: the CPU still computes, the GPU never hears. Then raise N to 400 and watch the frame rate: 160,000 sines a frame in JS.",
        },
        {
          t: "pitfall",
          h: "Moved vertices, stale bounding sphere",
          x: "Frustum culling uses `geometry.boundingSphere`, computed once. Displace vertices beyond the original bounds, on the CPU or in a shader, and the mesh blinks out near the screen edge. Call `computeBoundingSphere()` after big edits, or set a generous sphere yourself.",
        },
        {
          t: "table",
          head: ["Material", "Per pixel", "Use it for"],
          rows: [
            ["`MeshBasicMaterial`", "Colour times map. No lights at all", "UI, unlit art, debugging, baked lighting"],
            ["`MeshLambertMaterial`", "Diffuse only, cheap", "Lots of matte objects on weak GPUs"],
            ["`MeshStandardMaterial`", "PBR: roughness, metalness, env map", "The default for anything lit"],
            ["`MeshPhysicalMaterial`", "Standard plus clearcoat, transmission, sheen", "Car paint, glass, cloth. Costly, use sparingly"],
          ],
          caption: "Every light adds per-pixel work to every lit material it touches.",
        },
        {
          t: "play",
          mode: "three",
          title: "materials.js",
          js: SETUP + `import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

renderer.toneMapping = THREE.ACESFilmicToneMapping;
camera.position.set(0, 0, 9);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(2, 3, 4);
scene.add(sun);

const color = 0xc0503a;
const mats = [
  new THREE.MeshBasicMaterial({ color }),
  new THREE.MeshLambertMaterial({ color }),
  new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0 }),
  new THREE.MeshStandardMaterial({ color, roughness: 0.2, metalness: 1 }),
  new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, clearcoat: 1, clearcoatRoughness: 0.05 }),
];
const geo = new THREE.SphereGeometry(0.75, 64, 32);
mats.forEach((m, i) => {
  const s = new THREE.Mesh(geo, m);                   // one geometry, shared
  s.position.x = (i - 2) * 1.8;
  scene.add(s);
});

renderer.setAnimationLoop((ms) => {
  sun.position.set(Math.cos(ms / 2000) * 4, 3, 4);
  renderer.render(scene, camera);
});
renderer.render(scene, camera);
console.log("shader programs compiled:", renderer.info.programs.length);`,
          task: "Delete the `scene.environment` line: the metal sphere goes nearly black, since metal only reflects. Then add `flatShading: true` to the metal one: the two Standard spheres stop sharing a program.",
        },
        {
          t: "pitfall",
          h: "Toggling a light's visibility recompiles everything",
          x: "Light counts are baked into every lit shader. `light.visible = false`, adding a light, or flipping `castShadow` changes the count, and every material gets a new program on the next frame: a visible hitch. Keep the set fixed and fade with `intensity = 0`.",
        },
        {
          t: "code",
          lang: "js",
          src: "renderer.shadowMap.enabled = true;\nrenderer.shadowMap.type = THREE.PCFSoftShadowMap;\nsun.castShadow = true;\nsun.shadow.mapSize.set(2048, 2048);\n// the shadow camera is an ortho box: fit it to what casts, not the world\nObject.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 20 });\nsun.shadow.camera.updateProjectionMatrix();\nsun.shadow.normalBias = 0.02;   // stripes on lit surfaces (acne) go away\nplayer.castShadow = true;\nground.receiveShadow = true;",
          mark: [6],
          note: "Each shadow-casting light renders the casters again from its view; a point light does it 6 times. A box 10x too big spreads the same 2048 texels over 100x the area: blurry, blocky shadows.",
        },
        {
          t: "pitfall",
          h: "Transparent objects sort by centre, not by pixel",
          x: "three sorts transparent meshes back to front by object position, then draws each with depth writes on. Intersecting or nested transparent meshes pop and flicker as the camera moves. Set `depthWrite: false` on them, split big ones, or use alpha-tested cutouts.",
        },
      ],
    },
    {
      title: "Textures, colour and glTF",
      beats: [
        { t: "say", x: "A colour texture stores **sRGB-encoded** values: what an image editor saves. A normal, roughness or AO map stores **numbers**. Lighting maths needs linear values, so tag colour maps `colorSpace = THREE.SRGBColorSpace` and leave data maps alone." },
        {
          t: "play",
          mode: "three",
          title: "colorspace.js",
          css: `canvas.ref { position: fixed; left: 50%; bottom: 12px; transform: translateX(-50%);
  width: 256px; height: 32px; border: 1px solid #fff4; }
.lbl { position: fixed; top: 10px; left: 12px; right: 12px; color: #ccc; font: 13px system-ui; }`,
          js: SETUP + `camera.position.set(0, 0, 5);

// one gradient image, drawn by the browser (this canvas is also shown below as reference)
const img = document.createElement("canvas");
img.width = 256; img.height = 32;
img.className = "ref";
const g = img.getContext("2d");
const grad = g.createLinearGradient(0, 0, 256, 0);
grad.addColorStop(0, "#1a2a6c"); grad.addColorStop(0.5, "#b21f1f"); grad.addColorStop(1, "#fdbb2d");
g.fillStyle = grad; g.fillRect(0, 0, 256, 32);
document.body.appendChild(img);

const tagged = new THREE.CanvasTexture(img);
tagged.colorSpace = THREE.SRGBColorSpace;           // correct for a colour image
const untagged = new THREE.CanvasTexture(img);       // NoColorSpace: read as linear

const geo = new THREE.PlaneGeometry(4, 0.6);
const a = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tagged }));
const b = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: untagged }));
a.position.y = 0.6; b.position.y = -0.4;
scene.add(a, b);

const label = document.createElement("div");
label.className = "lbl";
label.textContent = "top: SRGBColorSpace / middle: untagged / bottom: the browser's own pixels";
document.body.appendChild(label);
renderer.setAnimationLoop(() => renderer.render(scene, camera));`,
          task: "Compare both strips with the browser-drawn reference at the bottom. The untagged one is washed out. Now tag it and see them match.",
        },
        {
          t: "quiz",
          q: "Someone tags a **normal map** as SRGBColorSpace. What happens?",
          options: ["Nothing, normals ignore colour space", "The vectors get bent by the sRGB decode curve, so lighting looks subtly wrong everywhere", "It fails to load", "Colours get more saturated"],
          answer: 1,
          why: "Decoding treats 0.5 (a flat normal) as about 0.21, so every normal tilts. It never errors; it just looks a bit off, which is the worst kind of bug. Data maps stay untagged.",
        },
        {
          t: "say",
          h: "File size is not GPU size",
          x: "A 4096x4096 PNG might be 3 MB on disk. On the GPU it is decoded to 4096 × 4096 × 4 bytes = 64 MB, plus a third more for mipmaps. KTX2 with Basis stays compressed in VRAM: often 4 to 8 times smaller there.",
        },
        {
          t: "code",
          lang: "js",
          src: "import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';\nimport { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';\nimport { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';\n\nconst draco = new DRACOLoader().setDecoderPath('/draco/');   // host the decoder files\nconst ktx2 = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer);\nconst loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2);\n\nconst gltf = await loader.loadAsync('/models/robot.glb');\nscene.add(gltf.scene);\nconst mixer = new THREE.AnimationMixer(gltf.scene);\ngltf.animations.forEach((clip) => mixer.clipAction(clip).play());",
          mark: [5, 6, 7],
          note: "Draco shrinks geometry, KTX2 shrinks textures. GLTFLoader already tags base colour and emissive maps as sRGB. The decoders are copied from `examples/jsm/libs/draco` and `libs/basis`.",
        },
        {
          t: "play",
          mode: "three",
          title: "gltf-roundtrip.js",
          js: SETUP + `import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

camera.position.set(0, 0.5, 6);
scene.add(new THREE.HemisphereLight(0xffffff, 0x332211, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(2, 3, 4);
scene.add(sun);

// build something, export it to a .glb in memory, then load it back
const original = new THREE.Group();
original.name = "Toy";
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.6, 0.2, 128, 16),
  new THREE.MeshStandardMaterial({ color: 0x4f8fd0, roughness: 0.3 }));
knot.name = "Knot";
original.add(knot);
scene.add(original);

const glb = await new GLTFExporter().parseAsync(original, { binary: true });
console.log("glb bytes:", glb.byteLength);
original.position.x = -1.6;                          // after export: transforms are exported too
const gltf = await new GLTFLoader().parseAsync(glb, "");
const copy = gltf.scene;
copy.position.x = 1.6;
scene.add(copy);
copy.traverse((o) => console.log(o.type, JSON.stringify(o.name)));

renderer.setAnimationLoop((ms) => {
  original.rotation.y = copy.rotation.y = ms / 1500;
  renderer.render(scene, camera);
});`,
          task: "Read the log: names survive, the root is a new Group, and your Group came back as a plain Object3D. Raise the knot to 512 x 64 segments and watch the byte count grow.",
        },
        {
          t: "pitfall",
          h: "`gltf.scene.clone()` breaks skinned characters",
          x: "A plain clone copies the meshes but the clones' skeletons still point at the original bones, so ten copies all pose like the first one, or not at all. Use `clone` from `three/addons/utils/SkeletonUtils.js`, which rebinds the bones.",
        },
      ],
    },
    {
      title: "Picking and motion",
      beats: [
        { t: "say", x: "A `Raycaster` turns a pointer into a ray from the camera and tests it against objects: bounding sphere first, then every triangle, **in JavaScript, on the CPU**. Results come back sorted by distance." },
        {
          t: "code",
          lang: "js",
          src: "const ray = new THREE.Raycaster();\nconst ndc = new THREE.Vector2();\nlet dirty = false;\ncanvas.addEventListener('pointermove', (e) => {\n  const r = canvas.getBoundingClientRect();        // not innerWidth: the canvas may not be full-screen\n  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1,\n         -((e.clientY - r.top) / r.height) * 2 + 1); // y flips: NDC is up\n  dirty = true;\n});\n// in the frame loop, at most once per frame:\nif (dirty) { ray.setFromCamera(ndc, camera); hits = ray.intersectObjects(pickables, false); dirty = false; }",
          mark: [6, 7, 11],
        },
        {
          t: "play",
          mode: "three",
          title: "hover.js",
          js: SETUP + `camera.position.set(0, 9, 9);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(3, 6, 2);
scene.add(sun);

const boxes = [];
const geo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) {
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x3d4f66 }));
  m.position.set(i - 5.5, 0, j - 5.5);
  boxes.push(m);
  scene.add(m);
}

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2(9, 9);                  // off-screen until the pointer moves
addEventListener("pointermove", (e) => {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
});

const clock = new THREE.Clock();
const hot = new THREE.Color(0xe0893a), cold = new THREE.Color(0x3d4f66);
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(boxes, false)[0]?.object;
  for (const b of boxes) {
    const target = b === hit ? 1.2 : 0;
    b.position.y = THREE.MathUtils.damp(b.position.y, target, 10, dt);
    b.material.color.lerpColors(cold, hot, b.position.y / 1.2);
  }
  renderer.render(scene, camera);
});`,
          task: "Make a click lock a box up. Then swap `damp(..., 10, dt)` for `lerp(..., 0.2)` and imagine it on a 144 Hz screen.",
        },
        {
          t: "pitfall",
          h: "Raycasting the render mesh on every pointermove",
          x: "Pointer events can fire faster than frames, and each raycast walks every triangle of a 500k-triangle model in JS. Raycast at most once per frame from the latest pointer, against an invisible low-poly proxy, or index the mesh with a BVH (three-mesh-bvh).",
        },
        { t: "say", x: "Imported animations arrive as `AnimationClip`s: keyframe tracks on named properties. An `AnimationMixer` per model turns clips into actions you play, fade and blend; `mixer.update(dt)` advances them all." },
        {
          t: "predict",
          lang: "js",
          src: "// turn to face a target: from 170° to -170°\nconst a = THREE.MathUtils.degToRad(170);\nconst b = THREE.MathUtils.degToRad(-170);\nobj.rotation.y = THREE.MathUtils.lerp(a, b, t);   // t: 0 -> 1",
          q: "How does it turn?",
          options: ["20° the short way", "340° the long way round", "It snaps at t = 0.5", "It does not move"],
          answer: 1,
          why: "Lerping angles lerps numbers: 170 down to -170 through 0. The two headings are 20° apart. `quaternion.slerp(target, t)` takes the shortest arc, and quaternions never hit gimbal lock.",
        },
        {
          t: "play",
          mode: "three",
          title: "mixer-and-damp.js",
          css: HUD_CSS,
          js: SETUP + `camera.position.set(0, 5.5, 6);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.4));
scene.add(new THREE.GridHelper(6, 6, 0x555555, 0x333333));
const SKIP = 1;   // render every Nth frame: 4 fakes a 15 fps phone

const leader = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7),
  new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
scene.add(leader);
const pos = new THREE.VectorKeyframeTrack(".position", [0, 1, 2, 3, 4],
  [-2, 0.3, -2,  2, 0.3, -2,  2, 0.3, 2,  -2, 0.3, 2,  -2, 0.3, -2]);
const q = (deg) => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, THREE.MathUtils.degToRad(deg), 0)).toArray();
const rot = new THREE.QuaternionKeyframeTrack(".quaternion", [0, 1, 2, 3, 4],
  [0, 90, 180, 270, 360].flatMap(q));              // a quarter turn per edge
const mixer = new THREE.AnimationMixer(leader);
mixer.clipAction(new THREE.AnimationClip("lap", 4, [pos, rot])).play();

const ball = (color) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 12),
    new THREE.MeshStandardMaterial({ color }));
  scene.add(m);
  return m;
};
const perFrame = ball(0xe0893a), perSecond = ball(0x4f8fd0);
const hud = document.createElement("div");
hud.id = "hud";
hud.textContent = "orange: lerp 0.05 per frame\\nblue:   damp, lambda 3 per second";
document.body.appendChild(hud);

const clock = new THREE.Clock();
let frame = 0;
renderer.setAnimationLoop(() => {
  if (++frame % SKIP) return;
  const dt = Math.min(clock.getDelta(), 1 / 10);
  mixer.update(dt);
  perFrame.position.lerp(leader.position, 0.05);
  const k = 1 - Math.exp(-3 * dt);
  perSecond.position.lerp(leader.position, k);
  renderer.render(scene, camera);
});`,
          task: "Set SKIP to 4. Blue keeps the same lag in seconds; orange falls far behind. Then make the leader's quaternion follow with `slerp` instead of a track.",
        },
        {
          t: "quiz",
          q: "Both followers look identical at 60 Hz. Why does only the blue one survive SKIP = 4?",
          options: ["The blue one uses a bigger factor", "Its factor `1 - exp(-λ dt)` grows with dt, so the gap closes at the same rate per second at any frame rate", "lerp is broken at low fps", "The mixer slows down"],
          answer: 1,
          why: "0.05 per frame is 5% per frame, whatever a frame lasts. The exponential form is exact for any step, which is what `MathUtils.damp` computes. Animation craft covers the derivation.",
        },
      ],
    },
    {
      title: "Performance: count the draw calls",
      beats: [
        { t: "say", x: "The first n to measure is **draw calls**: each costs CPU time in JS, three's bookkeeping and the driver, however small the mesh. Then pixels × shader cost. Triangles come a distant third." },
        {
          t: "play",
          mode: "three",
          title: "drawcalls.js",
          css: HUD_CSS,
          js: SETUP + `const MODE = "meshes";       // or "instanced"
const N = 2000;
camera.position.set(0, 0, 40);
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.5));
const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
const mat = new THREE.MeshStandardMaterial({ color: 0x6f9bd1 });
const root = new THREE.Group();
scene.add(root);

const dummy = new THREE.Object3D();
const place = (o, i) => {
  o.position.set(Math.sin(i * 1.7) * 14, Math.cos(i * 2.3) * 10, Math.sin(i * 0.37) * 12);
  o.rotation.set(i, i * 0.5, 0);
};
if (MODE === "meshes") {
  for (let i = 0; i < N; i++) { const m = new THREE.Mesh(geo, mat); place(m, i); root.add(m); }
} else {
  const inst = new THREE.InstancedMesh(geo, mat, N);
  for (let i = 0; i < N; i++) { place(dummy, i); dummy.updateMatrix(); inst.setMatrixAt(i, dummy.matrix); }
  root.add(inst);
}

const hud = document.createElement("div");
hud.id = "hud";
document.body.appendChild(hud);
let avg = 0, frames = 0;
renderer.setAnimationLoop((ms) => {
  root.rotation.y = ms / 4000;
  const t0 = performance.now();
  renderer.render(scene, camera);
  const took = performance.now() - t0;
  avg = frames++ < 3 ? took : avg * 0.95 + took * 0.05;   // frame 1 includes shader compile
  hud.textContent = MODE + "\\ndraw calls  " + renderer.info.render.calls +
    "\\ntriangles   " + renderer.info.render.triangles + "\\nrender() CPU " + avg.toFixed(2) + " ms";
});`,
          task: "Switch MODE to \"instanced\": same triangles, one call, a fraction of the CPU time. Then set N to 20000 in both modes and compare.",
        },
        {
          t: "predict",
          lang: "js",
          src: "// 4000 meshes, all sharing ONE material and ONE geometry\nfor (let i = 0; i < 4000; i++) scene.add(new THREE.Mesh(geo, mat));\nrenderer.render(scene, camera);\nconsole.log(renderer.info.render.calls);",
          q: "Roughly how many draw calls, with everything in view?",
          options: ["1: three batches shared materials", "4000", "2", "8000"],
          answer: 1,
          why: "Sharing saves shader switches and memory, not calls: each Mesh is still its own draw with its own matrix uniform. Only instancing, merging or BatchedMesh collapse them into fewer calls.",
        },
        {
          t: "table",
          head: ["Tool", "What it collapses", "Catch"],
          rows: [
            ["`InstancedMesh`", "N copies of one geometry and material into 1 call", "Per-instance data is only matrix and colour, unless you add attributes"],
            ["`mergeGeometries`", "Static meshes with one material into 1 geometry", "No more per-object culling, picking or moving"],
            ["`BatchedMesh`", "Different geometries, one material, 1 call", "New and still changing between releases; read your version's docs"],
            ["`LOD`", "Swaps in simpler meshes by camera distance", "Every level costs memory; pop-in without a fade"],
            ["Frustum culling", "Skips off-screen objects, on by default", "Useless for one merged or instanced blob spanning the screen"],
          ],
        },
        {
          t: "pitfall",
          h: "Instances vanish after you move them",
          x: "An `InstancedMesh` computes one bounding sphere around all instances the first time it is culled or raycast, then keeps it. Scatter instances further later and the whole mesh disappears at the screen edge, and picking misses. Call `computeBoundingSphere()` after moving them.",
        },
        {
          t: "code",
          lang: "js",
          src: "// removing from the scene frees nothing on the GPU\nfunction disposeDeep(root) {\n  root.traverse((o) => {\n    o.geometry?.dispose();\n    for (const m of [].concat(o.material ?? [])) {\n      for (const v of Object.values(m)) if (v?.isTexture) v.dispose();\n      m.dispose();\n    }\n  });\n  root.removeFromParent();\n}\n// also yours to free: render targets, PMREM textures, composer targets\nsetInterval(() => console.log(renderer.info.memory), 5000);",
          mark: [6],
          note: "`material.dispose()` does not free its textures: they may be shared, so three leaves them to you. Watch `renderer.info.memory` across route changes; it should come back down.",
        },
        {
          t: "quiz",
          q: "In an SPA, `renderer.info.memory.textures` climbs by 12 on every visit to the product page. What's wrong?",
          options: ["The browser cache", "Each visit loads a model and nothing disposes its textures when you leave", "Mipmaps are generated twice", "That's normal, the GC will collect them"],
          answer: 1,
          why: "GPU objects are not garbage-collected memory: the JS wrapper can die while the WebGL texture lives on. Dispose on unmount, or cache the loaded model and reuse it across visits.",
        },
        {
          t: "code",
          lang: "js",
          src: "const lod = new THREE.LOD();\nlod.addLevel(new THREE.Mesh(new THREE.IcosahedronGeometry(1, 8), mat), 0);   // 1620 triangles\nlod.addLevel(new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), mat), 15);  // 320\nlod.addLevel(new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), mat), 40);  // 20\nscene.add(lod);   // render() picks the level from camera distance each frame",
          note: "The distance is in world units from the camera. Pick thresholds where a level's triangles shrink below about a pixel each.",
        },
      ],
    },
    {
      title: "Postprocessing, R3F and what's next",
      beats: [
        { t: "say", x: "Postprocessing renders the scene into a texture, then runs full-screen passes over it: bloom, depth of field, colour grading. Each pass costs roughly one shaded pixel per screen pixel, so cost is passes × resolution." },
        {
          t: "play",
          mode: "three",
          title: "bloom.js",
          js: SETUP + `import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

renderer.toneMapping = THREE.ACESFilmicToneMapping;
scene.background = new THREE.Color(0x05060a);
camera.position.set(0, 0, 8);

const rings = new THREE.Group();
for (let i = 0; i < 7; i++) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(0.6 + i * 0.35, 0.03, 12, 128),
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.05 + i * 0.08, 1, 0.5).multiplyScalar(1.6) }));
  m.rotation.x = i * 0.4;
  rings.add(m);
}
scene.add(rings);

const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }); // keeps MSAA
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.2, 0.9));
composer.addPass(new OutputPass());                 // tone mapping + sRGB, last
composer.setPixelRatio(Math.min(devicePixelRatio, 2));
composer.setSize(innerWidth, innerHeight);
addEventListener("resize", () => composer.setSize(innerWidth, innerHeight));

renderer.setAnimationLoop((ms) => {
  rings.children.forEach((r, i) => { r.rotation.y = ms / (900 + i * 300); });
  composer.render();
});`,
          task: "Remove the OutputPass: everything goes dark and harsh. Then drop the `rt` argument and look at the ring edges: the jaggies are back.",
        },
        {
          t: "pitfall",
          h: "Adding a composer quietly removes your antialiasing",
          x: "`antialias: true` only applies to the canvas. The composer renders into its own targets, which have no MSAA unless you pass one with `samples: 4`. And without an `OutputPass` at the end, tone mapping and the sRGB encode never happen.",
        },
        { t: "say", h: "React Three Fiber", x: "R3F is a React renderer whose host elements are three objects: `<mesh>` is `new THREE.Mesh()`, `args` go to the constructor, props set properties. It removes boilerplate and disposes on unmount, but adds no new rendering power." },
        {
          t: "code",
          lang: "js",
          src: "import { Canvas, useFrame } from '@react-three/fiber';\nimport { useRef } from 'react';\n\nfunction Spinner() {\n  const ref = useRef();\n  // runs every frame, outside React: mutate, never setState here\n  useFrame((state, delta) => { ref.current.rotation.y += delta; });\n  return (\n    <mesh ref={ref}>\n      <boxGeometry args={[1, 1, 1]} />\n      <meshStandardMaterial color=\"orange\" />\n    </mesh>\n  );\n}\n\nexport default () => (\n  <Canvas dpr={[1, 2]} camera={{ position: [0, 1, 4] }}>\n    <ambientLight intensity={0.5} /><directionalLight position={[3, 4, 2]} />\n    <Spinner />\n  </Canvas>\n);",
          mark: [7],
        },
        {
          t: "pitfall",
          h: "setState in useFrame re-renders React 60 times a second",
          x: "It works in the demo and melts the tree in the real app: reconciling components every frame. Animate through refs in `useFrame`, keep React state for things that change on clicks, and use `frameloop=\"demand\"` for scenes that are mostly still.",
        },
        {
          t: "code",
          lang: "js",
          src: "// NOT available in r160, which the playgrounds run. Newer three ships\n// a WebGPU renderer (falling back to WebGL 2) and TSL, a node-based\n// shading language written in JS instead of GLSL strings.\nimport * as THREE from 'three/webgpu';\nimport { texture, uv } from 'three/tsl';\n\nconst renderer = new THREE.WebGPURenderer({ antialias: true });\nconst material = new THREE.MeshStandardNodeMaterial();\nmaterial.colorNode = texture(colorMap).mul(texture(detailMap, uv().mul(10)));\n\n// render() needs an initialised renderer: setAnimationLoop guarantees it,\n// a one-off render must `await renderer.init()` first\nrenderer.setAnimationLoop(() => renderer.render(scene, camera));",
          note: "Built-in materials, loaders and the scene graph carry over. GLSL `ShaderMaterial` and `onBeforeCompile` patches do not; those become node materials.",
        },
        {
          t: "rebuild",
          h: "20,000 instanced objects with picking",
          x: "One InstancedMesh, 20,000 instances in a galaxy, per-instance colour, hover highlight by `instanceId`, and a HUD with draw calls and pick time. Watch the pick cost: the ray tests every instance. Read how the highlight restores, then extend it.",
          mode: "three",
          css: HUD_CSS,
          js: SETUP + `const N = 20000;
camera.position.set(0, 14, 26);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.6));

const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.12, 0),
  new THREE.MeshStandardMaterial({ roughness: 0.6 }), N);
const d = new THREE.Object3D(), c = new THREE.Color(), base = [];
for (let i = 0; i < N; i++) {
  const r = 1.5 + 12 * Math.random() ** 1.5, a = r * 0.4 + (i % 3) * (Math.PI * 2 / 3);
  const j = () => (Math.random() - 0.5) * (0.4 + r * 0.12);   // scatter grows outward
  d.position.set(Math.cos(a) * r + j(), j() * 0.6, Math.sin(a) * r + j());
  d.updateMatrix();
  mesh.setMatrixAt(i, d.matrix);
  c.setHSL(0.08 + r * 0.04, 0.75, 0.6);               // yellow core, blue rim
  mesh.setColorAt(i, c);
  base.push(c.clone());
}
scene.add(mesh);

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), m4 = new THREE.Matrix4();
let moved = false;
addEventListener("pointermove", (e) => {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  moved = true;
});
let hot = -1, pickMs = 0;
function setHot(id) {
  if (id === hot) return;
  for (const [i, s] of [[hot, 1], [id, 4]]) {         // restore old, enlarge new
    if (i < 0) continue;
    mesh.getMatrixAt(i, m4);
    m4.decompose(d.position, d.quaternion, d.scale);
    d.scale.setScalar(s);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
    mesh.setColorAt(i, s > 1 ? c.set(0xffffff) : base[i]);
  }
  mesh.instanceMatrix.needsUpdate = mesh.instanceColor.needsUpdate = true;
  hot = id;
}

const hud = document.createElement("div");
hud.id = "hud";
document.body.appendChild(hud);
renderer.setAnimationLoop(() => {
  if (moved) {                                        // pick at most once a frame, only on change
    moved = false;
    const t0 = performance.now();
    ray.setFromCamera(ndc, camera);
    setHot(ray.intersectObject(mesh)[0]?.instanceId ?? -1);
    pickMs = performance.now() - t0;
  }
  renderer.render(scene, camera);
  hud.textContent = "instances  " + N + "\\ndraw calls " + renderer.info.render.calls +
    "\\npick       " + pickMs.toFixed(2) + " ms\\nhovered    " + (hot < 0 ? "-" : hot);
});`,
          task: "Make a click log the id and pin it white. Then cut the pick time: bucket instances into a coarse x/z grid and test only the cells under the ray.",
        },
        {
          t: "mission",
          h: "A solar system from nesting alone",
          x: "A sun, three planets on different orbits and speeds, a moon around one, and a ring that tilts with its planet. No sin or cos anywhere: every orbit is a Group rotating around its parent. Log the moon's world position every second.",
          hint: "For each orbit make a pivot Group at the parent's centre, rotate the pivot, and put the body at x = radius inside it. A moon's pivot is a child of the planet, not of the sun.",
          solution: {
            lang: "js",
            src: "const body = (r, color) => new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16),\n  new THREE.MeshStandardMaterial({ color }));\nconst orbit = (parent, radius, child) => {\n  const pivot = new THREE.Group();          // sits at the parent's centre\n  parent.add(pivot);\n  child.position.x = radius;\n  pivot.add(child);\n  return pivot;\n};\nconst sun = body(1.2, 0xffaa33);\nsun.material.emissive.set(0xffaa33);\nscene.add(sun, new THREE.PointLight(0xffffff, 60, 0, 1.5));\nconst earth = body(0.35, 0x3a7fd0), moon = body(0.1, 0xcccccc);\nconst saturn = body(0.5, 0xd8b56a);\nsaturn.rotation.z = 0.45;                   // tilt the planet: the ring, its child, follows\nconst ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.1, 64),\n  new THREE.MeshStandardMaterial({ color: 0xbfa77a, side: THREE.DoubleSide }));\nring.rotation.x = -Math.PI / 2;\nsaturn.add(ring);\nconst pivots = [\n  [orbit(sun, 4, earth), 0.5], [orbit(earth, 0.8, moon), 3],\n  [orbit(sun, 6.5, body(0.25, 0xd0603a)), 0.27], [orbit(sun, 10, saturn), 0.1],\n];\nconst w = new THREE.Vector3();\nlet last = 0;\nrenderer.setAnimationLoop((ms) => {\n  for (const [pivot, speed] of pivots) pivot.rotation.y = (ms / 1000) * speed;\n  renderer.render(scene, camera);\n  if (ms - last > 1000) { last = ms; console.log('moon', moon.getWorldPosition(w).toArray()); }\n});",
          },
        },
      ],
    },
  ],
  nobodyTells: [
    "Put `renderer.info.render.calls` in a corner of every 3D project from day one. Regressions show up as a jump in one number.",
    "Push the camera's near plane out as far as you dare. It fixes more depth flicker than any other setting.",
    "Never toggle lights or castShadow at runtime. Fade intensity instead: a light count change recompiles every lit material.",
    "Disposal is manual. Write one disposeDeep helper early and call it on every unmount, or the GPU leaks while JS looks clean.",
    "Rotate pivots, not maths. A Group at the hinge beats trigonometry every time, and survives the designer moving things.",
    "Colour maps are sRGB, data maps are linear. Half of all 'the lighting looks off' bugs are one wrong colorSpace.",
    "Raycast once per frame, never per pointer event, and against a cheap proxy when the visible mesh is heavy.",
    "Test on the weakest phone you support at its real DPR. Capping the pixel ratio at 2 is the cheapest big win there is.",
  ],
  glossary: [
    ["scene graph", "The tree of Object3Ds; each node's world transform is its parent's times its own."],
    ["matrixWorld", "An object's cached local-to-world matrix, refreshed by updateMatrixWorld during render()."],
    ["frustum culling", "Skipping objects whose bounding sphere lies outside the camera's view volume."],
    ["draw call", "One command to the GPU to draw a batch of triangles with one program and state."],
    ["BufferGeometry", "Typed-array vertex attributes (position, normal, uv...) plus an optional index."],
    ["PBR", "Physically based rendering: materials described by roughness and metalness, lit consistently."],
    ["tone mapping", "Compressing unbounded scene light into displayable 0..1 values, like ACES or AgX."],
    ["colorSpace", "Tells three whether texture or colour data is sRGB-encoded or linear."],
    ["glTF", "The standard 3D delivery format: meshes, materials, scene and animation; .glb is the binary form."],
    ["Draco", "A geometry compression scheme for glTF, decoded by a WASM decoder at load time."],
    ["KTX2", "A texture container whose Basis payload stays GPU-compressed in VRAM."],
    ["InstancedMesh", "One geometry and material drawn N times in one call with per-instance matrices."],
    ["AnimationMixer", "Plays, blends and advances animation clips for one object tree."],
    ["EffectComposer", "Chains full-screen postprocessing passes over a rendered scene."],
  ],
  explain: "Explain to a friend why 4000 tiny cubes can be slower than one mesh with a million triangles, and three ways to fix it.",
};
