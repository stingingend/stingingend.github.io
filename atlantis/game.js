// Atlantis: a relaxed first-person dive through a sunken marble city.
// Plain three.js, no build step. Models live in ./models, ground textures in ./textures.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const $ = (id) => document.getElementById(id);
const canvas = $("view");
const cover = $("cover");
const goButton = $("go");
const bar = $("bar").firstElementChild;
const touchDevice = matchMedia("(hover: none) and (pointer: coarse)").matches;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const SURFACE = 62; // height of the water surface above the plaza
const WORLD_RADIUS = 172; // how far the player can swim from the centre
const WATER = new THREE.Color(0x0e5a7c);
const shared = { uTime: { value: 0 } };

/* ---------------------------------------------------------------- *
 * Small helpers
 * ---------------------------------------------------------------- */
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise2(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi);
  const b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1);
  const d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/* ---------------------------------------------------------------- *
 * The lie of the land. The city follows Plato's plan: a central
 * island and two rings of land, with sunken channels between them.
 * ---------------------------------------------------------------- */
const PLAZA_TOP = 1;
const ISLAND = 14;
const RING_1 = [24, 30];
const RING_2 = [42, 50];
const CAUSEWAY_HALF = 4;
const CAUSEWAY_END = 54;

function seabed(x, z) {
  const r = Math.hypot(x, z);
  const wild = smooth(55, 85, r);
  let h = (noise2(x * 0.03, z * 0.03) - 0.5) * 5 * wild + (noise2(x * 0.11, z * 0.11) - 0.5) * (0.5 + wild);
  // channels between the rings
  h -= 2.4 * (smooth(ISLAND - 1, ISLAND + 2, r) - smooth(RING_1[0] - 2, RING_1[0] + 1, r));
  h -= 2.4 * (smooth(RING_1[1] - 1, RING_1[1] + 2, r) - smooth(RING_2[0] - 2, RING_2[0] + 1, r));
  // the basin wall that keeps the player in
  const rim = smooth(118, 195, r);
  h += Math.pow(rim, 1.4) * 62 + (noise2(x * 0.02 + 9, z * 0.02) - 0.5) * 16 * smooth(100, 150, r);
  return h;
}
// Height the player (and props) rest on, including the marble built on top.
function groundAt(x, z) {
  const r = Math.hypot(x, z);
  const onMarble =
    r <= ISLAND ||
    (r >= RING_1[0] && r <= RING_1[1]) ||
    (r >= RING_2[0] && r <= RING_2[1]) ||
    (r <= CAUSEWAY_END && (Math.abs(x) <= CAUSEWAY_HALF || Math.abs(z) <= CAUSEWAY_HALF));
  return onMarble ? PLAZA_TOP : seabed(x, z);
}

/* ---------------------------------------------------------------- *
 * Renderer, camera, light
 * ---------------------------------------------------------------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, touchDevice ? 1.25 : 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = WATER;
scene.fog = new THREE.FogExp2(WATER, 0.014);

const camera = new THREE.PerspectiveCamera(70, 1, 0.15, 700);
camera.rotation.order = "YXZ";

scene.add(new THREE.HemisphereLight(0xa9e4ff, 0x0b3a52, 1.5));
const sun = new THREE.DirectionalLight(0xdff6ff, 2.1);
sun.position.set(-0.35, 1, 0.25);
scene.add(sun);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

/* ---------------------------------------------------------------- *
 * Underwater materials: every lit surface gets a moving web of
 * light, and plants sway. Done by patching the standard shader.
 * ---------------------------------------------------------------- */
const CAUSTIC_GLSL = `
float caustic(vec2 uv) {
  vec2 p = mod(uv * 6.2831853, 6.2831853) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float t = uTime * 0.45 + 23.0;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - 3.5 / float(n + 1));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / 0.005), p.y / (cos(i.y + tt) / 0.005)));
  }
  c = 1.17 - pow(c / 4.0, 1.4);
  return pow(abs(c), 8.0);
}`;

function underwater(material, { sway = 0, light = 1 } = {}) {
  if (material.userData.underwater) return material;
  material.userData.underwater = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    const swayCode = sway
      ? `{
          #ifdef USE_INSTANCING
            mat4 placed = modelMatrix * instanceMatrix;
          #else
            mat4 placed = modelMatrix;
          #endif
          vec3 anchor = placed[3].xyz;
          float bend = position.y * ${sway.toFixed(3)};
          transformed.x += sin(uTime * 0.9 + anchor.x * 0.7 + position.y * 0.8) * bend;
          transformed.z += cos(uTime * 0.7 + anchor.z * 0.7 + position.y * 0.6) * bend * 0.7;
        }`
      : "";
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;\nuniform float uTime;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${swayCode}`)
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        #ifdef USE_INSTANCING
          vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vWPos;\nuniform float uTime;\n${CAUSTIC_GLSL}`)
      .replace(
        "#include <opaque_fragment>",
        `{
          vec3 worldNormal = inverseTransformDirection(normal, viewMatrix);
          float facing = clamp(worldNormal.y * 0.7 + 0.45, 0.0, 1.0);
          float web = caustic(vWPos.xz * 0.07 + vec2(vWPos.y * 0.02));
          outgoingLight += diffuseColor.rgb * vec3(0.55, 0.85, 1.0) * web * facing * ${(0.9 * light).toFixed(2)};
        }
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => `underwater-${sway}-${light}`;
  return material;
}

/* ---------------------------------------------------------------- *
 * Loading
 * ---------------------------------------------------------------- */
const MODEL_NAMES = [
  "round_tholos", "greek_temple", "temple_platform", "ionic_colonnade", "doric_column", "broken_column",
  "fallen_column", "archway", "wall_doorway", "pediment", "staircase", "colossal_sea_god", "standing_woman",
  "bearded_bust", "amphora", "bronze_brazier", "fountain_basin", "wave_altar", "rock_a", "rock_b", "rock_c",
  "branching_coral", "fan_coral", "kelp", "sea_grass", "small_fish", "sea_turtle",
];
const SWAY = { kelp: 0.05, sea_grass: 0.16, fan_coral: 0.012, branching_coral: 0.006 };

const manager = new THREE.LoadingManager();
manager.onProgress = (_, done, total) => (bar.style.width = `${Math.round((done / total) * 100)}%`);
const gltfLoader = new GLTFLoader(manager);
const textureLoader = new THREE.TextureLoader(manager);
const models = {};

function loadTexture(name, repeat, colour) {
  const texture = textureLoader.load(`textures/${name}.webp`);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 4;
  if (colour) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

async function loadModels() {
  await Promise.all(
    MODEL_NAMES.map(async (name) => {
      const gltf = await gltfLoader.loadAsync(`models/${name}.glb`);
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((node) => {
        if (!node.isMesh) return;
        for (const material of [].concat(node.material)) underwater(material, { sway: SWAY[name] || 0 });
      });
      models[name] = gltf;
    }),
  );
}

/* ---------------------------------------------------------------- *
 * Placing things. Everything static is instanced: one draw call per
 * material per model, however many copies there are.
 * ---------------------------------------------------------------- */
const placements = {}; // model name -> list of matrices
const rand = seeded(20261111);
const tmp = new THREE.Object3D();

// y = null rests the piece on whatever is under it.
function put(name, x, z, { y = null, turn = 0, scale = 1, tilt = 0, lift = 0 } = {}) {
  tmp.position.set(x, (y ?? groundAt(x, z)) + lift, z);
  tmp.rotation.set(tilt, turn, 0, "YXZ");
  if (typeof scale === "number") tmp.scale.setScalar(scale);
  else tmp.scale.set(...scale);
  tmp.updateMatrix();
  (placements[name] ||= []).push(tmp.matrix.clone());
}

function buildInstances() {
  const matrix = new THREE.Matrix4();
  for (const name in placements) {
    const list = placements[name];
    models[name].scene.traverse((node) => {
      if (!node.isMesh) return;
      const mesh = new THREE.InstancedMesh(node.geometry, node.material, list.length);
      list.forEach((placed, i) => mesh.setMatrixAt(i, matrix.multiplyMatrices(placed, node.matrixWorld)));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      scene.add(mesh);
    });
  }
}

/* ---------------------------------------------------------------- *
 * Ground: seabed, plaza rings, causeways
 * ---------------------------------------------------------------- */
function buildGround() {
  const sand = underwater(
    new THREE.MeshStandardMaterial({
      map: loadTexture("sand_color", 90, true),
      normalMap: loadTexture("sand_normal", 90),
      roughness: 1,
      vertexColors: true,
    }),
  );
  const size = 560;
  const cells = 220;
  const geometry = new THREE.PlaneGeometry(size, size, cells, cells);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colours = new Float32Array(position.count * 3);
  const sandTint = new THREE.Color(0xe9e2cf);
  const rockTint = new THREE.Color(0x5d7486);
  const tint = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const h = seabed(x, z);
    position.setY(i, h);
    // rockier where the basin wall climbs
    const slope = Math.abs(seabed(x + 2, z) - h) + Math.abs(seabed(x, z + 2) - h);
    tint.copy(sandTint).lerp(rockTint, Math.min(1, smooth(1.2, 3.2, slope) + smooth(8, 30, h) * 0.6));
    tint.toArray(colours, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  scene.add(new THREE.Mesh(geometry, sand));

  const marble = (repeatU, repeatV) => {
    const map = loadTexture("marble_color", 1, true);
    const normalMap = loadTexture("marble_normal", 1);
    map.repeat.set(repeatU, repeatV);
    normalMap.repeat.set(repeatU, repeatV);
    return underwater(new THREE.MeshStandardMaterial({ map, normalMap, roughness: 0.45, color: 0xf2f1ec, side: THREE.DoubleSide }));
  };
  const BASE = -4;
  // central island
  const island = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND, ISLAND + 0.6, PLAZA_TOP - BASE, 96), marble(10, 2));
  island.position.y = (PLAZA_TOP + BASE) / 2;
  scene.add(island);
  // the two rings: a rectangle swept around the centre
  for (const [inner, outer] of [RING_1, RING_2]) {
    const profile = [
      new THREE.Vector2(inner - 0.5, BASE),
      new THREE.Vector2(inner, PLAZA_TOP),
      new THREE.Vector2(outer, PLAZA_TOP),
      new THREE.Vector2(outer + 0.5, BASE),
    ];
    scene.add(new THREE.Mesh(new THREE.LatheGeometry(profile, 128), marble(40, 3)));
    // a thin gold line along each edge
    for (const radius of [inner + 0.25, outer - 0.25]) {
      const trim = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.07, 6, 160),
        new THREE.MeshStandardMaterial({ color: 0xcaa24a, metalness: 0.9, roughness: 0.35 }),
      );
      trim.rotation.x = Math.PI / 2;
      trim.position.y = PLAZA_TOP + 0.02;
      scene.add(trim);
    }
  }
  // causeways to the four winds
  const length = CAUSEWAY_END - ISLAND + 2;
  for (let i = 0; i < 4; i++) {
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(CAUSEWAY_HALF * 2, PLAZA_TOP - BASE, length),
      marble(2, 8),
    );
    const angle = (i * Math.PI) / 2;
    const mid = ISLAND - 2 + length / 2;
    road.position.set(Math.sin(angle) * mid, (PLAZA_TOP + BASE) / 2 - 0.01, Math.cos(angle) * mid);
    road.rotation.y = angle;
    scene.add(road);
  }
}

/* ---------------------------------------------------------------- *
 * The city
 * ---------------------------------------------------------------- */
const RELIC_SPOTS = [];

function buildCity() {
  // Centre: the round temple.
  put("round_tholos", 0, 0, { scale: 2.3 });
  RELIC_SPOTS.push([0, 5.5, 0]);

  // Ring one: colonnades between the causeways.
  for (let i = 0; i < 8; i++) {
    const angle = ((i + 0.5) * Math.PI) / 4;
    const r = 27;
    put("ionic_colonnade", Math.sin(angle) * r, Math.cos(angle) * r, { turn: angle, scale: 1.55 });
  }

  // Ring two: a circle of great columns, some of them down.
  for (let i = 0; i < 24; i++) {
    const angle = ((i + 0.5) * Math.PI) / 12;
    if (Math.min(angle % (Math.PI / 2), Math.PI / 2 - (angle % (Math.PI / 2))) < 0.15) continue;
    const r = 46;
    const x = Math.sin(angle) * r;
    const z = Math.cos(angle) * r;
    const roll = rand();
    if (roll < 0.62) put("doric_column", x, z, { scale: 1.9, turn: rand() * 6 });
    else if (roll < 0.82) put("broken_column", x, z, { scale: 1.9, turn: rand() * 6 });
    else put("fallen_column", x, z, { scale: 1.9, turn: angle + 1.2 + rand() * 0.6 });
  }

  // South approach: the gate, then an avenue of statues and braziers.
  put("archway", 0, 58, { scale: 3.2 });
  RELIC_SPOTS.push([0, 6.5, 58]);
  for (let i = 0; i < 4; i++) {
    const z = 68 + i * 11;
    for (const side of [-1, 1]) {
      if (i % 2 === 0) put("standing_woman", side * 8, z, { scale: 2.3, turn: -side * Math.PI * 0.5 });
      else put("bronze_brazier", side * 8, z, { scale: 1.7 });
    }
  }

  // North: the temple on its platform, with steps and an altar inside.
  const templeZ = -84;
  const base = seabed(0, templeZ) + 0.2;
  const S = 2.6;
  put("temple_platform", 0, templeZ, { y: base - 0.4, scale: S });
  const floor = base - 0.4 + 0.72 * S;
  put("greek_temple", 0, templeZ, { y: floor, scale: S });
  put("wave_altar", 0, templeZ - 4, { y: floor, scale: 1.8 });
  RELIC_SPOTS.push([0, floor + 4.2, templeZ - 4]);
  put("staircase", 0, templeZ + 5.2 * S + 4.2 * 0.9, { y: base - 0.4, scale: [2.6, (0.72 * S) / 2.47, 0.9] });
  for (const side of [-1, 1]) put("bronze_brazier", side * 7, templeZ + 5.2 * S + 3, { scale: 1.8 });
  put("pediment", 17, templeZ + 9, { scale: 2, turn: 0.5, tilt: -1.25, lift: 0.5 });

  // Beyond it, the colossus, half lost in the haze.
  const godZ = -142;
  put("colossal_sea_god", 0, godZ, { scale: 3.1, lift: -2.2 });
  RELIC_SPOTS.push([0, seabed(0, godZ - 0) + 4, godZ + 13]);

  // East: a quarter of broken houses.
  const walls = [
    [72, -18, 0], [72, -6, Math.PI / 2, 6], [86, 8, 0.1], [96, -4, Math.PI / 2 + 0.15],
    [104, 18, -0.2], [78, 26, Math.PI / 2 - 0.1], [92, -26, 0.25],
  ];
  for (const [x, z, turn] of walls) put("wall_doorway", x, z, { scale: 2, turn, lift: -0.3 });
  put("pediment", 84, -14, { scale: 1.8, turn: 0.8, tilt: -1.35, lift: 0.4 });
  put("fallen_column", 90, 16, { scale: 1.7, turn: 0.4 });
  put("fallen_column", 68, 10, { scale: 1.7, turn: 2.1 });
  put("broken_column", 100, 4, { scale: 1.7 });
  put("broken_column", 80, -30, { scale: 1.7, turn: 1 });
  put("bearded_bust", 88, -2, { scale: 2.4, turn: -1.4 });
  put("wave_altar", 82, 16, { scale: 1.5, turn: 0.3 });
  for (let i = 0; i < 16; i++) {
    const x = 70 + rand() * 38;
    const z = -30 + rand() * 60;
    put("amphora", x, z, { scale: 1.3 + rand() * 0.6, turn: rand() * 6, tilt: rand() < 0.4 ? 1.35 : 0, lift: rand() < 0.4 ? 0.5 : -0.1 });
  }
  RELIC_SPOTS.push([86, seabed(86, 8) + 3.4, 8]);

  // West: the garden, with a fountain in a kelp forest.
  put("fountain_basin", -82, 0, { scale: 2.6 });
  RELIC_SPOTS.push([-82, seabed(-82, 0) + 7.5, 0]);
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    put("doric_column", -82 + Math.sin(angle) * 15, Math.cos(angle) * 15, { scale: 1.2, turn: rand() * 6 });
  }
  for (let i = 0; i < 150; i++) {
    const angle = rand() * Math.PI * 2;
    const r = 20 + rand() * 34;
    const x = -92 + Math.sin(angle) * r;
    const z = 8 + Math.cos(angle) * r;
    if (Math.hypot(x, z) < 54) continue;
    put("kelp", x, z, { scale: [1.6 + rand(), 2.2 + rand() * 3.2, 1.6 + rand()], turn: rand() * 6, lift: -0.2 });
  }
  RELIC_SPOTS.push([-112, seabed(-112, 26) + 3, 26]);

  // Everywhere outside the rings: grass, coral, rocks, more kelp.
  for (let i = 0; i < 520; i++) {
    const angle = rand() * Math.PI * 2;
    const r = 56 + Math.pow(rand(), 0.8) * 100;
    const x = Math.sin(angle) * r;
    const z = Math.cos(angle) * r;
    put("sea_grass", x, z, { scale: 1.6 + rand() * 2.4, turn: rand() * 6, lift: -0.1 });
  }
  for (let i = 0; i < 90; i++) {
    const angle = rand() * Math.PI * 2;
    const r = 58 + rand() * 96;
    const x = Math.sin(angle) * r;
    const z = Math.cos(angle) * r;
    put(rand() < 0.5 ? "branching_coral" : "fan_coral", x, z, { scale: 1.4 + rand() * 2.2, turn: rand() * 6, lift: -0.15 });
  }
  // Rocks only far out, half buried, where the haze softens them.
  for (let i = 0; i < 26; i++) {
    const angle = rand() * Math.PI * 2;
    const r = 128 + rand() * 40;
    const x = Math.sin(angle) * r;
    const z = Math.cos(angle) * r;
    if (Math.abs(x) < 34 && z < 0) continue; // keep the view of the colossus clear
    const scale = 2 + rand() * 3;
    put(["rock_a", "rock_b", "rock_c"][Math.floor(rand() * 3)], x, z, { scale, turn: rand() * 6, lift: -scale * 0.9 });
  }
  for (let i = 0; i < 70; i++) {
    const angle = rand() * Math.PI * 2;
    const r = 70 + rand() * 80;
    const x = Math.sin(angle) * r;
    const z = Math.cos(angle) * r;
    if (x < -40 && Math.abs(z) < 60) continue;
    put("kelp", x, z, { scale: [1.5 + rand(), 2 + rand() * 2.5, 1.5 + rand()], turn: rand() * 6, lift: -0.2 });
  }
  // A few toppled columns out on the sand.
  for (let i = 0; i < 9; i++) {
    const angle = rand() * Math.PI * 2;
    const r = 60 + rand() * 50;
    put(rand() < 0.5 ? "fallen_column" : "broken_column", Math.sin(angle) * r, Math.cos(angle) * r, {
      scale: 1.5 + rand() * 0.6,
      turn: rand() * 6,
      lift: -0.25,
    });
  }
}

/* ---------------------------------------------------------------- *
 * Water: the view upward, shafts of light, drifting specks
 * ---------------------------------------------------------------- */
let rays = [];
let specks = null;

function buildWater() {
  // A dome so that looking up is brighter than looking out.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(600, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uDeep: { value: WATER }, uBright: { value: new THREE.Color(0x7fd6ee) }, uTime: shared.uTime },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec3 uDeep; uniform vec3 uBright; uniform float uTime; varying vec3 vDir;
        ${CAUSTIC_GLSL}
        void main(){
          float up = max(vDir.y, 0.0);
          vec3 col = mix(uDeep, uBright, pow(up, 1.6));
          // the rippling surface, seen from below
          vec2 uv = vDir.xz / max(vDir.y, 0.08);
          float glint = caustic(uv * 0.35) * smoothstep(0.25, 0.9, up);
          col += vec3(0.75, 0.95, 1.0) * glint * 0.55;
          col = mix(col, uDeep * 0.55, smoothstep(0.0, -0.6, vDir.y));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  scene.add(dome);
  buildWater.dome = dome;

  // Shafts of light: tall soft sheets that turn to face the swimmer.
  const rayMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: { uTime: shared.uTime },
    vertexShader: `
      attribute float aSeed; varying vec2 vUv; varying float vSeed; varying float vDist;
      void main(){
        vUv = uv; vSeed = aSeed;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime; varying vec2 vUv; varying float vSeed; varying float vDist;
      void main(){
        float across = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x);
        float down = smoothstep(0.0, 0.25, vUv.y) * pow(vUv.y, 0.7);
        float flicker = 0.55 + 0.45 * sin(uTime * 0.6 + vSeed * 40.0 + vUv.x * 6.0);
        float near = smoothstep(4.0, 22.0, vDist) * smoothstep(190.0, 70.0, vDist);
        gl_FragColor = vec4(vec3(0.60, 0.88, 1.0), across * down * flicker * near * 0.13);
      }`,
  });
  const rayRand = seeded(7);
  for (let i = 0; i < 46; i++) {
    const width = 5 + rayRand() * 12;
    const geometry = new THREE.PlaneGeometry(width, 78);
    geometry.translate(0, 39, 0);
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(new Float32Array(4).fill(rayRand()), 1));
    const ray = new THREE.Mesh(geometry, rayMaterial);
    const angle = rayRand() * Math.PI * 2;
    const r = Math.sqrt(rayRand()) * 150;
    ray.position.set(Math.sin(angle) * r, -6, Math.cos(angle) * r);
    ray.rotation.order = "YXZ";
    ray.userData.lean = 0.18 + rayRand() * 0.08;
    scene.add(ray);
    rays.push(ray);
  }

  // Marine snow: specks that wrap around the swimmer so the box never runs out.
  const count = touchDevice ? 900 : 1800;
  const box = 70;
  const positions = new Float32Array(count * 3);
  const speckRand = seeded(3);
  for (let i = 0; i < count * 3; i++) positions[i] = speckRand() * box;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  specks = new THREE.Points(
    geometry,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uTime: shared.uTime, uEye: { value: new THREE.Vector3() }, uBox: { value: box }, uScale: { value: 1 } },
      vertexShader: `
        uniform float uTime; uniform vec3 uEye; uniform float uBox; uniform float uScale; varying float vFade;
        void main(){
          vec3 p = position + vec3(sin(uTime * 0.15 + position.y) * 0.6, -uTime * 0.12, cos(uTime * 0.12 + position.x) * 0.6);
          p = mod(p - uEye + uBox * 0.5, uBox) - uBox * 0.5 + uEye;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          vFade = smoothstep(0.6, 3.0, d) * smoothstep(uBox * 0.5, uBox * 0.25, d);
          gl_PointSize = uScale * (1.0 + fract(position.x * 7.3) * 1.6) * 90.0 / max(d, 0.5);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vFade;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(vec3(0.85, 0.96, 1.0), smoothstep(0.5, 0.1, d) * vFade * 0.5);
        }`,
    }),
  );
  specks.frustumCulled = false;
  scene.add(specks);
}

/* ---------------------------------------------------------------- *
 * Life: schools of fish and two turtles
 * ---------------------------------------------------------------- */
const schools = [];
const turtles = [];
const mixers = [];

function buildLife() {
  const lifeRand = seeded(99);
  const fishMeshes = [];
  models.small_fish.scene.traverse((node) => node.isMesh && fishMeshes.push(node));
  const SCHOOLS = [
    { home: [0, 16, 0], radius: 34, rise: 5, speed: 0.11, count: 46 },
    { home: [-80, 12, 6], radius: 24, rise: 4, speed: -0.14, count: 34 },
    { home: [84, 9, -4], radius: 22, rise: 3, speed: 0.16, count: 30 },
    { home: [0, 14, -86], radius: 26, rise: 6, speed: -0.1, count: 34 },
    { home: [0, 10, 70], radius: 18, rise: 3, speed: 0.18, count: 26 },
  ];
  for (const info of SCHOOLS) {
    const meshes = fishMeshes.map((node) => {
      const mesh = new THREE.InstancedMesh(node.geometry, node.material, info.count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      scene.add(mesh);
      return { mesh, local: node.matrixWorld.clone() };
    });
    const fish = Array.from({ length: info.count }, () => ({
      lag: lifeRand() * 1.6,
      offset: new THREE.Vector3((lifeRand() - 0.5) * 7, (lifeRand() - 0.5) * 3.5, (lifeRand() - 0.5) * 7),
      size: 0.8 + lifeRand() * 0.9,
      beat: lifeRand() * 6,
    }));
    schools.push({ ...info, meshes, fish });
  }

  const clip = models.sea_turtle.animations[0];
  for (const info of [
    { home: [-82, 13, 0], radius: 30, speed: 0.045, size: 1.5 },
    { home: [20, 22, -30], radius: 58, speed: -0.03, size: 1.9 },
  ]) {
    const body = SkeletonUtils.clone(models.sea_turtle.scene);
    body.traverse((node) => node.isMesh && (node.frustumCulled = false));
    body.scale.setScalar(info.size);
    scene.add(body);
    if (clip) {
      const mixer = new THREE.AnimationMixer(body);
      mixer.clipAction(clip).play();
      mixers.push(mixer);
    }
    turtles.push({ ...info, body, phase: lifeRand() * 6 });
  }
}

const schoolPoint = new THREE.Vector3();
const schoolNext = new THREE.Vector3();
const fishMatrix = new THREE.Matrix4();
const faceX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);

function pathPoint(info, t, out) {
  const a = t * info.speed;
  return out.set(
    info.home[0] + Math.cos(a) * info.radius * (1 + 0.25 * Math.sin(a * 2.3)),
    info.home[1] + Math.sin(a * 1.7) * (info.rise ?? 3),
    info.home[2] + Math.sin(a) * info.radius * (1 + 0.25 * Math.cos(a * 1.9)),
  );
}

function updateLife(t, dt) {
  for (const school of schools) {
    school.fish.forEach((fish, i) => {
      const at = t - fish.lag * 3;
      pathPoint(school, at, schoolPoint).add(fish.offset);
      pathPoint(school, at + 0.4, schoolNext).add(fish.offset);
      schoolPoint.y += Math.sin(t * 1.3 + fish.beat) * 0.25;
      tmp.position.copy(schoolPoint);
      tmp.lookAt(schoolNext);
      tmp.quaternion.multiply(faceX);
      tmp.rotateY(Math.sin(t * 9 + fish.beat) * 0.16); // tail beat
      tmp.scale.setScalar(fish.size);
      tmp.updateMatrix();
      for (const { mesh, local } of school.meshes) mesh.setMatrixAt(i, fishMatrix.multiplyMatrices(tmp.matrix, local));
    });
    for (const { mesh } of school.meshes) mesh.instanceMatrix.needsUpdate = true;
  }
  for (const turtle of turtles) {
    const at = t + turtle.phase * 20;
    pathPoint(turtle, at, schoolPoint);
    pathPoint(turtle, at + 0.5, schoolNext);
    turtle.body.position.copy(schoolPoint);
    turtle.body.lookAt(schoolNext);
    turtle.body.quaternion.multiply(faceX);
  }
  for (const mixer of mixers) mixer.update(dt);
}

/* ---------------------------------------------------------------- *
 * Relics: seven lights to find
 * ---------------------------------------------------------------- */
const relics = [];
let found = 0;

function buildRelics() {
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = glowCanvas.height = 128;
  const ctx = glowCanvas.getContext("2d");
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,244,200,1)");
  gradient.addColorStop(0.25, "rgba(255,214,120,0.55)");
  gradient.addColorStop(1, "rgba(255,200,90,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffb84a, emissiveIntensity: 1.6, metalness: 0.6, roughness: 0.3 });
  const shape = new THREE.OctahedronGeometry(0.55, 0);

  for (const [x, y, z] of RELIC_SPOTS) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const gem = new THREE.Mesh(shape, gold);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }),
    );
    glow.scale.setScalar(7);
    group.add(gem, glow);
    scene.add(group);
    relics.push({ group, gem, glow, home: y, taken: 0 });
  }
  $("relics").textContent = `0 / ${relics.length}`;
}

function updateRelics(t, dt) {
  for (const relic of relics) {
    if (relic.taken) {
      // rise and fade once collected
      relic.taken += dt;
      relic.group.position.y += dt * 3;
      relic.group.scale.setScalar(Math.max(0, 1 - relic.taken / 1.2));
      if (relic.taken > 1.2) relic.group.visible = false;
      continue;
    }
    relic.group.position.y = relic.home + Math.sin(t * 1.1 + relic.home) * 0.35;
    relic.gem.rotation.y = t * 0.8;
    relic.glow.material.opacity = 0.75 + Math.sin(t * 2.3 + relic.home) * 0.2;
    if (relic.group.position.distanceTo(camera.position) < 3.2) {
      relic.taken = 0.001;
      found++;
      $("relics").textContent = `${found} / ${relics.length}`;
      toast(found === relics.length ? `All ${found} relics found.` : `Relic found. ${relics.length - found} to go.`);
      chime();
    }
  }
}

let toastTimer = 0;
function toast(text) {
  const node = $("toast");
  node.textContent = text;
  node.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("is-on"), 3200);
}

/* ---------------------------------------------------------------- *
 * Sound: a low wash of filtered noise, and a chime for relics.
 * Made in code, so there are no audio files to download.
 * ---------------------------------------------------------------- */
let audio = null;
let soundOn = true;

function startSound() {
  if (audio) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = soundOn ? 1 : 0;
  master.connect(context.destination);

  const seconds = 4;
  const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; // brown noise
    data[i] = last * 3.5;
  }
  const noise = context.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  const lowpass = context.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 320;
  const wash = context.createGain();
  wash.gain.value = 0.22;
  // a slow swell in the filter so the water breathes
  const swell = context.createOscillator();
  swell.frequency.value = 0.07;
  const swellDepth = context.createGain();
  swellDepth.gain.value = 140;
  swell.connect(swellDepth).connect(lowpass.frequency);
  noise.connect(lowpass).connect(wash).connect(master);
  noise.start();
  swell.start();
  audio = { context, master };
}

function chime() {
  if (!audio || !soundOn) return;
  const { context, master } = audio;
  const now = context.currentTime;
  [523.25, 783.99, 1046.5].forEach((frequency, i) => {
    const tone = context.createOscillator();
    tone.type = "sine";
    tone.frequency.value = frequency;
    const gain = context.createGain();
    const start = now + i * 0.11;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.14, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.8);
    tone.connect(gain).connect(master);
    tone.start(start);
    tone.stop(start + 1.9);
  });
}

$("sound").addEventListener("click", () => {
  soundOn = !soundOn;
  $("sound").textContent = soundOn ? "SOUND ON" : "SOUND OFF";
  $("sound").setAttribute("aria-pressed", String(soundOn));
  if (audio) audio.master.gain.value = soundOn ? 1 : 0;
});

/* ---------------------------------------------------------------- *
 * Swimming
 * ---------------------------------------------------------------- */
const keys = new Set();
const velocity = new THREE.Vector3();
const wish = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
let yaw = 0; // facing north, toward the city
let pitch = -0.05;
let playing = false;
const stick = { x: 0, y: 0 }; // touch movement, -1..1

camera.position.set(0, 9, 104);

addEventListener("keydown", (event) => {
  if (!playing) return;
  keys.add(event.code);
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();
  if (event.code === "KeyM") $("sound").click();
});
addEventListener("keyup", (event) => keys.delete(event.code));
addEventListener("blur", () => keys.clear());

function look(dx, dy, sensitivity) {
  yaw -= dx * sensitivity;
  pitch = Math.max(-1.45, Math.min(1.45, pitch - dy * sensitivity));
}
// While the mouse is captured, browsers (Chrome on Windows especially) now and
// then report one huge movement that never happened, which whips the view
// round. Real motion builds up over several events, so a single event far
// larger than the recent ones is dropped.
let recentMove = 0;
let skipMoves = 0;
document.addEventListener("pointerlockchange", () => {
  recentMove = 0;
  skipMoves = 2; // the first events after capture are often junk too
});
document.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== canvas) return;
  const dx = event.movementX;
  const dy = event.movementY;
  const size = Math.hypot(dx, dy);
  if (skipMoves > 0) {
    skipMoves--;
    return;
  }
  const spike = size > 300 || (size > 70 && size > recentMove * 6 + 40);
  recentMove += (Math.min(size, 300) - recentMove) * 0.35;
  if (spike) return;
  look(dx, dy, 0.0022);
});

// Touch: left half of the screen swims, right half looks.
const touches = new Map();
canvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" || !playing) return;
  canvas.setPointerCapture(event.pointerId);
  touches.set(event.pointerId, { x0: event.clientX, y0: event.clientY, x: event.clientX, y: event.clientY, move: event.clientX < innerWidth / 2 });
});
canvas.addEventListener("pointermove", (event) => {
  const touch = touches.get(event.pointerId);
  if (!touch) return;
  if (touch.move) {
    stick.x = Math.max(-1, Math.min(1, (event.clientX - touch.x0) / 70));
    stick.y = Math.max(-1, Math.min(1, (event.clientY - touch.y0) / 70));
  } else {
    look(event.clientX - touch.x, event.clientY - touch.y, 0.0045);
  }
  touch.x = event.clientX;
  touch.y = event.clientY;
});
const endTouch = (event) => {
  const touch = touches.get(event.pointerId);
  if (!touch) return;
  if (touch.move) stick.x = stick.y = 0;
  touches.delete(event.pointerId);
};
canvas.addEventListener("pointerup", endTouch);
canvas.addEventListener("pointercancel", endTouch);

// Desktop normally captures the mouse. Where the browser refuses, fall back
// to holding the mouse button and dragging to look.
let dragLook = false;

function pause() {
  playing = false;
  cover.hidden = false;
  keys.clear();
  goButton.textContent = "Keep swimming";
  $("blurb").textContent = "Paused.";
  goButton.focus();
}
function useDragLook() {
  if (playing || document.pointerLockElement === canvas) return;
  dragLook = true;
  playing = true;
  cover.hidden = true;
  toast("Hold the mouse button and drag to look.");
}
function begin() {
  startSound();
  if (audio && audio.context.state === "suspended") audio.context.resume();
  if (touchDevice || dragLook) {
    playing = true;
    cover.hidden = true;
    return;
  }
  capture(true);
}
function capture(raw) {
  try {
    // Raw input skips the system's pointer acceleration, which is steadier.
    const request = raw ? canvas.requestPointerLock({ unadjustedMovement: true }) : canvas.requestPointerLock();
    if (request && request.catch)
      request.catch((error) => {
        if (raw && error && error.name === "NotSupportedError") capture(false);
        else useDragLook();
      });
  } catch {
    if (raw) capture(false);
    else useDragLook();
  }
}
goButton.addEventListener("click", begin);
document.addEventListener("pointerlockerror", useDragLook);
document.addEventListener("pointerlockchange", () => {
  if (touchDevice) return;
  if (document.pointerLockElement === canvas) {
    dragLook = false; // the capture worked after all
    playing = true;
    cover.hidden = true;
  } else if (playing && !dragLook) pause();
});
addEventListener("keydown", (event) => {
  if (event.code === "Escape" && playing && (dragLook || touchDevice)) pause();
});
let dragging = false;
canvas.addEventListener("mousedown", () => (dragging = dragLook && playing));
addEventListener("mouseup", () => (dragging = false));
document.addEventListener("mousemove", (event) => {
  if (dragging && document.pointerLockElement !== canvas) look(event.movementX, event.movementY, 0.004);
});

function swim(dt) {
  camera.rotation.set(pitch, yaw, 0);
  camera.getWorldDirection(forward);
  right.crossVectors(forward, camera.up).normalize();

  const ahead = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) - stick.y;
  const side = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) + stick.x;
  const rise = (keys.has("Space") || keys.has("KeyE") ? 1 : 0) - (keys.has("KeyC") || keys.has("KeyQ") ? 1 : 0);
  wish.set(0, 0, 0).addScaledVector(forward, ahead).addScaledVector(right, side);
  wish.y += rise;
  if (wish.lengthSq() > 1) wish.normalize();
  const fast = keys.has("ShiftLeft") || keys.has("ShiftRight");
  wish.multiplyScalar(fast ? 15 : 7.5);

  // water drag: ease toward the speed we want, and coast to a stop
  velocity.lerp(wish, 1 - Math.exp(-dt * 2.2));
  camera.position.addScaledVector(velocity, dt);

  // stay inside the basin, above the floor and below the surface
  const p = camera.position;
  const r = Math.hypot(p.x, p.z);
  if (r > WORLD_RADIUS) {
    p.x *= WORLD_RADIUS / r;
    p.z *= WORLD_RADIUS / r;
  }
  const floor = groundAt(p.x, p.z) + 1.5;
  if (p.y < floor) {
    p.y = floor;
    velocity.y = Math.max(0, velocity.y);
  }
  if (p.y > SURFACE - 4) {
    p.y = SURFACE - 4;
    velocity.y = Math.min(0, velocity.y);
  }
}

/* ---------------------------------------------------------------- *
 * Frame loop
 * ---------------------------------------------------------------- */
const clock = new THREE.Clock();
let shownDepth = -1;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = (shared.uTime.value += dt);

  if (playing) swim(dt);
  else {
    // drift gently on the title screen
    camera.rotation.set(pitch + Math.sin(t * 0.21) * 0.02, yaw + Math.sin(t * 0.13) * 0.05, 0);
  }
  // an easy bob so the view is never perfectly still
  if (!reduceMotion) camera.position.y += Math.sin(t * 0.8) * 0.0025;

  for (const ray of rays) {
    ray.rotation.y = Math.atan2(camera.position.x - ray.position.x, camera.position.z - ray.position.z);
    ray.rotation.z = ray.userData.lean;
  }
  if (specks) {
    specks.material.uniforms.uEye.value.copy(camera.position);
    specks.material.uniforms.uScale.value = renderer.getPixelRatio();
  }
  if (buildWater.dome) buildWater.dome.position.copy(camera.position);
  updateLife(t, dt);
  updateRelics(t, dt);

  const depth = Math.round(SURFACE - camera.position.y);
  if (depth !== shownDepth) $("depth").textContent = shownDepth = depth;

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

/* ---------------------------------------------------------------- *
 * Start
 * ---------------------------------------------------------------- */
async function start() {
  try {
    buildGround();
    await loadModels();
    buildCity();
    buildInstances();
    buildWater();
    buildLife();
    buildRelics();
  } catch (error) {
    console.error(error);
    $("blurb").textContent = "The game could not load. It needs WebGL and a connection for the 3D library.";
    goButton.textContent = "Unavailable";
    return;
  }
  bar.parentElement.hidden = true;
  goButton.disabled = false;
  goButton.textContent = touchDevice ? "Tap to dive" : "Click to dive";
  goButton.focus();

  // ?cam=x,y,z,yaw,pitch places the camera, for checking views while developing.
  const cam = new URLSearchParams(location.search).get("cam");
  if (cam) {
    const [x, y, z, a = 0, b = 0] = cam.split(",").map(Number);
    camera.position.set(x, y, z);
    yaw = (a * Math.PI) / 180;
    pitch = (b * Math.PI) / 180;
    cover.hidden = true;
  }
  frame();
}
start();
