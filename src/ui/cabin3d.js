// A small, realistic-as-practical 3D view from a window seat.
//
// The sun is a shadow-casting directional light and the fuselage is closed
// except for the window openings, so sunlight lands on the seats, tray and
// floor exactly where the window geometry lets it through. Outside is a
// physically based sky (Preetham) above a cloud deck; bloom adds glare.
//
// Cabin frame: +Z toward the nose, +Y up, and +X toward the LEFT wing (a
// right-handed frame looking along +Z has +X on the viewer's left). Metres.

import {
  WebGLRenderer, Scene, PerspectiveCamera, Color, Vector2, Vector3, Matrix4, Object3D, Fog,
  BufferGeometry, Float32BufferAttribute, PlaneGeometry, BoxGeometry, Shape, ExtrudeGeometry,
  Mesh, InstancedMesh, MeshStandardMaterial, MeshBasicMaterial,
  DirectionalLight, HemisphereLight, Points, PointsMaterial, PMREMGenerator, CanvasTexture, RepeatWrapping,
  DoubleSide, PCFSoftShadowMap, SRGBColorSpace, ACESFilmicToneMapping,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const RAD = Math.PI / 180;

// ── Cabin dimensions (single-aisle airliner) ────────────────────────────────
const HALF_L = 9;                 // modelled length either side of the viewer
const PITCH = 0.79;               // seat pitch = window spacing
const WALL_C = 0.95;              // sidewall arc centre height
const WALL_R = 1.98;              // sidewall arc radius
const PHI0 = Math.asin((0.04 - WALL_C) / WALL_R);   // arc start, just above the floor
const PHI1 = Math.asin((1.78 - WALL_C) / WALL_R);   // arc end, under the bins
const ARC_LEN = WALL_R * (PHI1 - PHI0);
const WIN = { y: 1.17, w: 0.27, h: 0.39 };           // window opening
const SEAT_XS = [0.52, 1.0, 1.48];                   // seat centres from the aisle out
const CEILING_Y = 2.3;

const wallX = (y) => WALL_R * Math.cos(Math.asin((y - WALL_C) / WALL_R));
const rows = [];
for (let z = -HALF_L + 0.5; z < HALF_L - 0.5; z += PITCH) rows.push(+z.toFixed(3));
const viewRowZ = rows.reduce((best, z) => (Math.abs(z) < Math.abs(best) ? z : best));
// Windows sit slightly ahead of each row, as they roughly do on real aircraft.
const windowZs = rows.map((z) => z + 0.18);

// Deterministic "other passengers' window shades": fraction pulled down.
function shadeFor(sideSign, i) {
  if (windowZs[i] > viewRowZ - 0.2 && windowZs[i] < viewRowZ + 0.6) return 0; // ours and the next stay open
  const h = Math.sin((i + 1) * 12.9898 + sideSign * 78.233) * 43758.5453;
  const r = h - Math.floor(h);
  return r < 0.55 ? 0 : r < 0.8 ? 0.35 + (r - 0.55) : 1;
}

// ── Procedural textures ─────────────────────────────────────────────────────

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function repeating(c, repeat) {
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Woven-fabric look: fine noise over a faint twill. */
function fabricTexture(base, spread) {
  const N = 128;
  const [c, ctx] = canvas(N, N);
  const img = ctx.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i / N) | 0;
    const n = (Math.random() - 0.5) * spread + (((x + y) % 4) < 2 ? spread * 0.2 : -spread * 0.2);
    img.data[i * 4] = base[0] + n; img.data[i * 4 + 1] = base[1] + n; img.data[i * 4 + 2] = base[2] + n; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return repeating(c, [3, 3]);
}

function carpetTexture() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#4d5366';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = 60 + Math.random() * 40;
    ctx.fillStyle = `rgba(${v},${v + 4},${v + 18},0.35)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  ctx.strokeStyle = 'rgba(140,150,180,0.16)';
  ctx.lineWidth = 3;
  for (let k = 0; k < 256; k += 64) {
    ctx.beginPath(); ctx.arc(k + 32, 128, 20, 0, Math.PI * 2); ctx.stroke();
  }
  return repeating(c, [4, 36]);
}

function cloudTexture() {
  const N = 512;
  const [c, ctx] = canvas(N, N);
  const img = ctx.createImageData(N, N);
  // Tileable value-noise fBm.
  const octaves = [[4, 0.5], [8, 0.25], [16, 0.15], [32, 0.1]].map(([g, w]) => ({ g, w, v: Array.from({ length: g * g }, Math.random) }));
  const smooth = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let n = 0;
      for (const { g, w, v } of octaves) {
        const fx = (x / N) * g, fy = (y / N) * g;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = smooth(fx - x0), ty = smooth(fy - y0);
        const at = (i, j) => v[(j % g) * g + (i % g)];
        const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
        const bot = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
        n += (top * (1 - ty) + bot * ty) * w;
      }
      const k = Math.min(1, Math.max(0, (n - 0.36) * 2.4));
      const i = (y * N + x) * 4;
      const v = 120 + 135 * k;
      img.data[i] = v - 8 * (1 - k); img.data[i + 1] = v - 4 * (1 - k); img.data[i + 2] = v + 10 * (1 - k); img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return repeating(c, [14, 14]);
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/**
 * Sidewall colour + alpha maps. u runs along the cabin (z), v up the arc.
 * Holes are cut in the alpha map; the colour map paints window bezels,
 * panel seams and pulled-down shades.
 */
function sidewallTextures(sideSign) {
  const W = 4096, H = 512;
  const sx = W / (2 * HALF_L), sy = H / ARC_LEN;
  const [cc, c] = canvas(W, H);
  const [ac, a] = canvas(W, H);
  const vOf = (y) => WALL_R * (Math.asin((y - WALL_C) / WALL_R) - PHI0) * sy; // px up from the bottom
  const toPx = (z, yPx) => [(sideSign > 0 ? z + HALF_L : HALF_L - z) * sx, H - yPx];

  c.fillStyle = '#ebe8e1';
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 40000; i++) {
    c.fillStyle = `rgba(0,0,0,${Math.random() * 0.025})`;
    c.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  // Dado panel at the bottom and a seam every two windows.
  const dado = vOf(0.42);
  c.fillStyle = '#cfcbc3';
  c.fillRect(0, H - dado, W, dado);
  c.strokeStyle = 'rgba(0,0,0,0.12)';
  c.lineWidth = 2;
  for (let i = 0; i < windowZs.length; i += 2) {
    const [px] = toPx(windowZs[i] - PITCH / 2, 0);
    c.beginPath(); c.moveTo(px, 0); c.lineTo(px, H - dado); c.stroke();
  }

  a.fillStyle = '#fff';
  a.fillRect(0, 0, W, H);

  const wy = vOf(WIN.y);
  const ww = WIN.w * sx, wh = WIN.h * sy;
  windowZs.forEach((z, i) => {
    const [cx, cy] = toPx(z, wy);
    // Bezel: a soft recessed frame around the opening.
    const bw = ww * 1.65, bh = wh * 1.38;
    const g = c.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
    g.addColorStop(0, '#d3cfc7'); g.addColorStop(0.5, '#f4f2ed'); g.addColorStop(1, '#d3cfc7');
    c.fillStyle = g;
    rr(c, cx - bw / 2, cy - bh / 2, bw, bh, bw * 0.42); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 3;
    rr(c, cx - bw / 2, cy - bh / 2, bw, bh, bw * 0.42); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 5;
    rr(c, cx - ww / 2 - 3, cy - wh / 2 - 3, ww + 6, wh + 6, ww * 0.45); c.stroke();

    // Opening, minus whatever the shade covers from the top.
    const shade = shadeFor(sideSign, i);
    if (shade < 1) {
      const open = wh * (1 - shade);
      a.fillStyle = '#000';
      rr(a, cx - ww / 2, cy - wh / 2 + wh * shade, ww, open, shade ? [4, 4, ww * 0.45, ww * 0.45] : ww * 0.45);
      a.fill();
    }
    if (shade) {
      c.fillStyle = '#f7f6f2';
      rr(c, cx - ww / 2, cy - wh / 2, ww, wh * shade, shade < 1 ? [ww * 0.45, ww * 0.45, 3, 3] : ww * 0.45); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(cx - ww * 0.18, cy - wh / 2 + wh * shade - 7, ww * 0.36, 4); // grip
    }
  });

  const color = new CanvasTexture(cc);
  color.colorSpace = SRGBColorSpace;
  color.anisotropy = 8;
  const alpha = new CanvasTexture(ac);
  alpha.anisotropy = 8;
  return { color, alpha };
}

// ── Geometry ────────────────────────────────────────────────────────────────

/** Curved sidewall surface for one side, normals facing into the cabin. */
function sidewallGeometry(sideSign) {
  const steps = 28;
  const pos = [], nor = [], uv = [], idx = [];
  for (let j = 0; j <= steps; j++) {
    const φ = PHI0 + ((PHI1 - PHI0) * j) / steps;
    const x = sideSign * WALL_R * Math.cos(φ);
    const y = WALL_C + WALL_R * Math.sin(φ);
    for (const [k, z] of [[0, -HALF_L], [1, HALF_L]]) {
      pos.push(x, y, z);
      nor.push(-sideSign * Math.cos(φ), -Math.sin(φ), 0);
      uv.push(sideSign > 0 ? k : 1 - k, j / steps);
    }
  }
  for (let j = 0; j < steps; j++) {
    const a = j * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Overhead bin cross-section, extruded along the cabin. */
function binGeometry(sideSign) {
  const s = new Shape();
  const pts = [[1.1, 1.8], [wallX(1.78) + 0.02, 1.76], [1.86, 2.4], [1.2, 2.4], [1.06, 2.2], [1.05, 1.95]];
  pts.forEach(([x, y], i) => (i ? s.lineTo(sideSign * x, y) : s.moveTo(sideSign * x, y)));
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth: HALF_L * 2, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.015, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -HALF_L);
  return g;
}

function buildCabin(scene) {
  const add = (geo, mat, opts = {}) => {
    const m = new Mesh(geo, mat);
    if (opts.pos) m.position.set(...opts.pos);
    if (opts.rot) m.rotation.set(...opts.rot);
    m.castShadow = opts.cast ?? true;
    m.receiveShadow = opts.receive ?? true;
    scene.add(m);
    return m;
  };

  const plastic = new MeshStandardMaterial({ color: '#e9e6df', roughness: 0.55, side: DoubleSide, shadowSide: DoubleSide });

  for (const sideSign of [-1, 1]) {
    const { color, alpha } = sidewallTextures(sideSign);
    const wall = new MeshStandardMaterial({ map: color, alphaMap: alpha, alphaTest: 0.5, roughness: 0.6, side: DoubleSide, shadowSide: DoubleSide });
    add(sidewallGeometry(sideSign), wall);
    add(binGeometry(sideSign), plastic);
    // Cove light strip along the top of each bin.
    add(new BoxGeometry(0.02, 0.02, HALF_L * 2), new MeshBasicMaterial({ color: '#fff4e2' }), { pos: [sideSign * 1.12, 2.39, 0], cast: false, receive: false });
  }

  add(new PlaneGeometry(4.6, HALF_L * 2), new MeshStandardMaterial({ map: carpetTexture(), roughness: 1 }), { rot: [-Math.PI / 2, 0, 0] });
  add(new PlaneGeometry(4.6, HALF_L * 2), plastic, { pos: [0, CEILING_Y + 0.1, 0], rot: [Math.PI / 2, 0, 0] });
  add(new PlaneGeometry(4.6, 3), plastic, { pos: [0, 1.2, HALF_L], rot: [0, Math.PI, 0] });
  add(new PlaneGeometry(4.6, 3), plastic, { pos: [0, 1.2, -HALF_L] });

  // ── Seats (instanced) ──
  const fabric = new MeshStandardMaterial({ map: fabricTexture([74, 86, 120], 24), roughness: 0.95 });
  const cover = new MeshStandardMaterial({ map: fabricTexture([196, 198, 204], 10), roughness: 0.9 });
  const shell = new MeshStandardMaterial({ color: '#2b2f38', roughness: 0.5 });
  const screen = new MeshStandardMaterial({ color: '#06080d', roughness: 0.15, metalness: 0.2, emissive: '#1d3a66', emissiveIntensity: 0.9 });
  const arm = new MeshStandardMaterial({ color: '#3a3f4a', roughness: 0.6 });

  // Each part: geometry, material, offset from the seat origin, and whether it
  // leans with the seatback (pivot at the rear of the cushion).
  const parts = [
    { geo: new RoundedBoxGeometry(0.45, 0.13, 0.47, 3, 0.045), mat: fabric, at: [0, 0.45, 0.02] },
    { geo: new RoundedBoxGeometry(0.45, 0.74, 0.11, 3, 0.045), mat: fabric, at: [0, 0.88, -0.23], lean: true },
    { geo: new RoundedBoxGeometry(0.43, 0.7, 0.024, 2, 0.01), mat: shell, at: [0, 0.86, -0.297], lean: true },
    { geo: new RoundedBoxGeometry(0.3, 0.13, 0.116, 2, 0.03), mat: cover, at: [0, 1.2, -0.23], lean: true },
    { geo: new BoxGeometry(0.22, 0.135, 0.008), mat: screen, at: [0, 1.0, -0.316], lean: true },
    { geo: new RoundedBoxGeometry(0.05, 0.05, 0.4, 2, 0.02), mat: arm, at: [0.25, 0.64, -0.02] },
  ];
  const LEAN = new Matrix4().makeTranslation(0, 0.5, -0.2)
    .multiply(new Matrix4().makeRotationX(-0.16))
    .multiply(new Matrix4().makeTranslation(0, -0.5, 0.2));
  const count = rows.length * SEAT_XS.length * 2;
  const seat = new Object3D();
  const part = new Matrix4();
  for (const p of parts) {
    const mesh = new InstancedMesh(p.geo, p.mat, count);
    let i = 0;
    for (const z of rows) {
      for (const sideSign of [-1, 1]) {
        for (const sx of SEAT_XS) {
          part.makeTranslation(p.at[0] * sideSign, p.at[1], p.at[2]);
          if (p.lean) part.premultiply(LEAN);
          seat.position.set(sideSign * sx, 0, z);
          seat.updateMatrix();
          mesh.setMatrixAt(i++, seat.matrix.clone().multiply(part));
        }
      }
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // The viewer's lowered tray table, in front of both window seats.
  const trayMat = new MeshStandardMaterial({ color: '#8a8f99', roughness: 0.5 });
  for (const sideSign of [-1, 1]) {
    add(new RoundedBoxGeometry(0.4, 0.022, 0.3, 2, 0.008), trayMat, { pos: [sideSign * SEAT_XS[2], 0.73, viewRowZ + PITCH - 0.47] });
  }
}

// ── View ────────────────────────────────────────────────────────────────────

export function createCabinView(container) {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.6;
  container.prepend(renderer.domElement);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;
  scene.fog = new Fog('#c9dcf0', 3000, 26000);

  buildCabin(scene);

  // Outside: physically based sky over a cloud deck.
  const sky = new Sky();
  sky.scale.setScalar(45000);
  const u = sky.material.uniforms;
  u.turbidity.value = 1.6;
  u.rayleigh.value = 0.9;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.85;
  u.cloudCoverage.value = 0;
  scene.add(sky);

  const clouds = new Mesh(new PlaneGeometry(60000, 60000), new MeshBasicMaterial({ map: cloudTexture() }));
  clouds.rotation.x = -Math.PI / 2;
  clouds.position.y = -900;
  scene.add(clouds);

  // Stars, shown once the sky is dark.
  const starPos = [];
  for (let i = 0; i < 900; i++) {
    const az = Math.random() * Math.PI * 2, alt = Math.asin(Math.random() * 0.98 + 0.02);
    starPos.push(Math.cos(alt) * Math.sin(az) * 20000, Math.sin(alt) * 20000, Math.cos(alt) * Math.cos(az) * 20000);
  }
  const starGeo = new BufferGeometry();
  starGeo.setAttribute('position', new Float32BufferAttribute(starPos, 3));
  const stars = new Points(starGeo, new PointsMaterial({ color: '#dfe6ff', size: 1.3, sizeAttenuation: false, fog: false, transparent: true }));
  scene.add(stars);

  const hemi = new HemisphereLight('#eef2fa', '#d8d2c6', 0.35);
  scene.add(hemi);
  const sun = new DirectionalLight('#fff5e6', 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 60 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.015;
  sun.shadow.radius = 3;
  sun.target.position.set(0, 1, viewRowZ + 1.5);
  scene.add(sun, sun.target);

  // Seated by the window, looking ahead and a little toward it.
  const camera = new PerspectiveCamera(76, 1, 0.03, 60000);
  const EYE = { x: 1.42, y: 1.17, z: viewRowZ - 0.12 };
  const YAW = 24 * RAD;
  const PITCH_DOWN = 19 * RAD;
  let side = 'right';
  const placeCamera = () => {
    const s = side === 'right' ? -1 : 1;
    camera.position.set(EYE.x * s, EYE.y, EYE.z);
    camera.lookAt(EYE.x * s + Math.sin(YAW) * s, EYE.y - Math.sin(PITCH_DOWN), EYE.z + Math.cos(YAW));
  };
  placeCamera();

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Only genuinely bright things (sky through glass, sunlit patches) bloom.
  composer.addPass(new UnrealBloomPass(new Vector2(256, 256), 0.28, 0.35, 5));
  composer.addPass(new OutputPass());

  const draw = () => composer.render();
  new ResizeObserver(() => {
    const { clientWidth: w, clientHeight: h } = container;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    draw();
  }).observe(container);

  const dir = new Vector3();
  const C = (hex) => new Color(hex);
  const sunDay = C('#fff5e6'), sunGold = C('#ffb36b');
  const cloudDay = C('#ffffff'), cloudGold = C('#ffc9a0'), cloudNight = C('#0c1120');
  const fogDay = C('#c9dcf0'), fogGold = C('#e9b796'), fogNight = C('#121a30');
  let last = null;

  return {
    /** 'left' | 'right': which window seat to sit in. */
    setSide(next) {
      side = next;
      placeCamera();
      if (last) this.update(last);
    },

    /** state: a flight state from createFlight().stateAt() */
    update(state) {
      last = state;
      const { sun: pos, cabin } = state;
      const el = pos.elevation;
      const r = cabin.relative * RAD;
      const e = el * RAD;
      dir.set(-Math.sin(r) * Math.cos(e), Math.sin(e), Math.cos(r) * Math.cos(e));

      u.sunPosition.value.copy(dir);
      // The Preetham sky goes black a few degrees below the horizon; fade to a night colour instead.
      sky.visible = el > -7;
      scene.background = sky.visible ? null : fogNight;
      stars.visible = el < -5;
      stars.material.opacity = Math.min(1, (-el - 5) / 7);

      const golden = Math.min(1, Math.max(0, (14 - el) / 14));
      const night = Math.min(1, Math.max(0, -el / 6)) ** 0.5;
      clouds.material.color.copy(cloudDay).lerp(cloudGold, golden * (1 - night)).lerp(cloudNight, night);
      scene.fog.color.copy(fogDay).lerp(fogGold, golden * (1 - night)).lerp(fogNight, night);

      sun.visible = cabin.visible;
      sun.position.copy(dir).multiplyScalar(30).add(sun.target.position);
      sun.color.copy(sunDay).lerp(sunGold, golden);
      sun.intensity = 11 * Math.min(1, 0.3 + Math.max(0, el + 3) / 10);

      // Daylight-balanced cabin by day, warm mood lighting at night.
      hemi.color.set(cabin.visible ? '#eef2fa' : '#ffd9ae');
      hemi.intensity = cabin.visible ? 0.35 : 0.22;
      scene.environmentIntensity = cabin.visible ? 0.3 : 0.12;

      draw();
    },
  };
}
