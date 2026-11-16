// The OTV in 3D, from the team's Onshape CAD (models/otv.glb), with the electronics added from photos.
// Two scenes share one robot builder:
//   #otv-3d   a tour: the stage pins while you scroll and the camera moves between six stops.
//   #otv-run  the course: the robot drives the simulator route through a 3D arena. It plays on its
//             own once pinned; scrolling pushes it ahead faster.
// three.js and the model load only when a scene is close. Without WebGL, the tour shows its chapters
// as a list and the course falls back to the 2D map. With reduced motion, the tour is a still view
// and the course is the 2D map.

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const GL = (() => { try { return !!document.createElement("canvas").getContext("webgl2"); } catch (e) { return false; } })();
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t) => t * t * (3 - 2 * t);
const sm = (a, b, v) => ease(clamp((v - a) / (b - a)));
const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
// A camera that lives in spherical coordinates around a target and eases toward where it's asked to be,
// so moves swing around the subject instead of cutting straight through it.
const orbitCam = (V3) => {
  const st = { az: 0, el: 0.4, r: 1, tgt: new V3(), ready: false };
  return {
    st,
    to(az, el, r, tgt, dt, tau = 0.45) {
      if (!st.ready || !dt) { st.az = az; st.el = el; st.r = r; st.tgt.copy(tgt); st.ready = true; return st; }
      const k = 1 - Math.exp(-dt / tau);
      st.az += angDiff(st.az, az) * k; st.el += (el - st.el) * k; st.r += (r - st.r) * k; st.tgt.lerp(tgt, k);
      return st;
    },
    place(cam, out) {
      out.set(Math.sin(st.az) * Math.cos(st.el), Math.sin(st.el), Math.cos(st.az) * Math.cos(st.el)).multiplyScalar(st.r).add(st.tgt);
      return out;
    },
  };
};

// ---------------------------------------------------------------- loading
let kitP;
const kit = () => kitP ||= (async () => {
  const V = "./vendor/three-0.170.0/";
  const [THREE, { GLTFLoader }, { MeshoptDecoder }, { RoomEnvironment }] = await Promise.all([
    import(V + "three.module.min.js"), import(V + "GLTFLoader.js"), import(V + "meshopt_decoder.module.js"), import(V + "RoomEnvironment.js"),
  ]);
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync("models/otv.glb");
  return { THREE, RoomEnvironment, gltf };
})();

const lazy = (sec, start, fail) => {
  const io = new IntersectionObserver((es) => {
    if (!es.some((e) => e.isIntersecting)) return;
    io.disconnect();
    start().catch((err) => { console.warn("otv3d", err); fail(); });
  }, { rootMargin: "150% 0px" });
  io.observe(sec);
};

const makeRenderer = (K, canvas) => {
  const { THREE } = K;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); // full-screen scenes: 1.5x keeps frames steady
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new K.RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3a32, 0.7));
  const key = new THREE.DirectionalLight(0xfff4e6, 1.5);
  key.position.set(0.5, 1, 0.35);
  scene.add(key);
  return { renderer, scene };
};

// Render only while a section is on screen.
const loopWhileVisible = (sec, frame) => {
  let visible = false, raf = 0;
  const loop = (t) => { raf = visible ? requestAnimationFrame(loop) : 0; frame(t); };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(loop); }).observe(sec);
};

// ---------------------------------------------------------------- the robot
// Built in CAD coordinates (metres, +y up, +z forward) inside `root`. Everything that moves with the
// robot lives under root, so a scene can drive it around by moving root.
function buildRobot(K, { pool = true } = {}) {
  const { THREE } = K;
  const { Vector3, Group, Mesh, MeshStandardMaterial: Std } = THREE;
  const root = new Group();
  const robot = K.gltf.scene.clone(true);
  root.add(robot);
  root.updateMatrixWorld(true);
  const M = (n) => robot.getObjectByName(n);

  // Real colours, from the photos: plywood deck, black wheels, green motor mounts, purple servo holders.
  const std = (color, o = {}) => new Std({ color, roughness: 0.6, metalness: 0, ...o });
  const paint = {
    m0: std("#d8b98c", { roughness: 0.85 }),
    m11: std("#1c1e20", { roughness: 0.9 }), m12: std("#1c1e20", { roughness: 0.9 }),
    m3: std("#2f9a4a", { roughness: 0.55 }), m15: std("#2f9a4a", { roughness: 0.55 }),
    m4: std("#b4b9bd", { metalness: 0.85, roughness: 0.35 }), m14: std("#b4b9bd", { metalness: 0.85, roughness: 0.35 }),
    m16: std("#5d4b70"), m18: std("#5d4b70"),
    m1: std("#3f6fd0", { roughness: 0.4 }), m10: std("#3f6fd0", { roughness: 0.4 }),
    m9: std("#3b4046"), m7: std("#3b4046"),
    m5: std("#eeeeea"), m19: std("#eeeeea"),
    m2: std("#c8ccd0", { metalness: 0.6, roughness: 0.35 }),
    m6: std("#2b3136", { roughness: 0.5, side: THREE.DoubleSide }),
    m13: std("#9aa0a5", { metalness: 0.6, roughness: 0.4 }), m20: std("#9aa0a5", { metalness: 0.6, roughness: 0.4 }),
    m17: std("#e6e6e2"),
    m8: std("#eef2f2", { roughness: 0.3 }),
  };
  robot.traverse((o) => { if (o.isMesh && paint[o.name]) o.material = paint[o.name]; });
  if (!pool) M("m6").visible = false;

  // Pivot parts about a centre, keeping where they are now (the meshes carry quantization transforms).
  const pivot = (objs, c) => {
    const g = new Group();
    g.position.copy(c);
    robot.add(g);
    g.updateMatrixWorld(true);
    objs.forEach((o) => o && g.attach(o));
    return g;
  };
  const wheels = [pivot([M("m11")], new Vector3(-0.1025, -0.0814, 0.0659)), pivot([M("m12")], new Vector3(0.102, -0.0814, 0.0659))];
  const PIV = new Vector3(0, -0.0267, 0.0699); // servo shafts
  const arm = pivot([M("m9"), M("m2"), M("m7"), M("m5"), M("m19")], PIV);

  // Bend shader, in the robot's own frame: the tube and the sonar wire follow the arm near its tip and
  // stay put near the pump, blending in between, so nothing tears when the arm swings. It also fills the
  // tube with water from the tip back.
  const bend = {
    uAng: { value: 0 }, uPiv: { value: new THREE.Vector2(PIV.y, PIV.z) }, uZ0: { value: 0.045 }, uZ1: { value: 0.085 },
    uCut: { value: 1 }, uWater: { value: new THREE.Color("#3b8fd6") },
    uRoot: { value: new THREE.Matrix4() }, uRootInv: { value: new THREE.Matrix4() },
  };
  const bendable = (mat, water) => {
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, bend);
      sh.vertexShader = "uniform float uAng; uniform vec2 uPiv; uniform float uZ0, uZ1; uniform mat4 uRoot, uRootInv; varying vec3 vL;\n" +
        sh.vertexShader.replace("#include <project_vertex>", `
        vec4 lp = uRootInv * modelMatrix * vec4(transformed, 1.0);
        float a = uAng * smoothstep(uZ0, uZ1, lp.z);
        vec2 r = lp.yz - uPiv; float c = cos(a), s = sin(a);
        lp.yz = uPiv + vec2(r.x * c - r.y * s, r.x * s + r.y * c);
        vL = lp.xyz;
        vec4 mvPosition = viewMatrix * uRoot * lp;
        gl_Position = projectionMatrix * mvPosition;`);
      sh.fragmentShader = "uniform float uCut; uniform vec3 uWater; varying vec3 vL;\n" + sh.fragmentShader.replace("#include <color_fragment>",
        "#include <color_fragment>\n" + (water ? "if (vL.z > uCut) diffuseColor.rgb = mix(diffuseColor.rgb, uWater, 0.8);" : ""));
    };
    return mat;
  };
  bendable(paint.m8, true);

  // sonar cone, from the HC-SR04 at the arm tip down toward the water
  const sonarH = 0.06;
  const sonar = new Mesh(new THREE.ConeGeometry(0.016, sonarH, 32, 1, true), new THREE.MeshBasicMaterial({ color: "#e0965a", transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  sonar.position.set(0, -0.031 - sonarH / 2 + 0.002, 0.161);
  root.add(sonar);
  root.updateMatrixWorld(true);
  arm.attach(sonar); // the HC-SR04 rides on the arm
  // front HC-SR04 under the front edge of the deck, looking ahead for obstacles (from the photos)
  const fus = new Group(); fus.position.set(0, -0.068, 0.084); root.add(fus);
  fus.add(new Mesh(new THREE.BoxGeometry(0.045, 0.02, 0.0016), std("#2a6fb0", { roughness: 0.5 })));
  [-0.013, 0.013].forEach((x) => { const c = new Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 20), std("#c8ccd0", { metalness: 0.7, roughness: 0.3 })); c.rotation.x = Math.PI / 2; c.position.set(x, 0, 0.0065); fus.add(c); });
  // intake hose: from the end of the CAD's tube at the arm tip down into the water (it reaches past
  // the color sensor, which sits on the bottom of the arm and stays dry)
  const hoseDry = new THREE.Color("#eef2f2"), hoseWet = new THREE.Color("#3b8fd6");
  const hoseMat = std("#eef2f2", { roughness: 0.3 });
  const hose = new Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new Vector3(-0.0138, -0.056, 0.1425), new Vector3(-0.0138, -0.075, 0.1445), new Vector3(-0.0136, -0.108, 0.146)]), 20, 0.0024, 10), hoseMat);
  root.add(hose); root.updateMatrixWorld(true); arm.attach(hose);

  // electronics, from the photos (not in the CAD)
  const TOP = -0.0501; // deck top
  const box = (w, h, d, mat, x, y, z, parent) => { const m = new Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; };
  const uno = new Group(); root.add(uno);
  const pcbBlue = std("#1f4ea0", { roughness: 0.45 }), black = std("#151719", { roughness: 0.7 }), silver = std("#c6cacd", { metalness: 0.9, roughness: 0.3 });
  const UNO = new Vector3(-0.0567, TOP + 0.0045, 0.0057);
  box(0.0686, 0.0016, 0.0534, pcbBlue, UNO.x, UNO.y, UNO.z, uno);
  box(0.052, 0.0085, 0.0025, black, UNO.x + 0.006, UNO.y + 0.005, UNO.z + 0.0245, uno); // digital header
  box(0.040, 0.0085, 0.0025, black, UNO.x + 0.010, UNO.y + 0.005, UNO.z - 0.0245, uno); // power + analog header
  box(0.018, 0.003, 0.025, silver, UNO.x - 0.010, UNO.y + 0.002, UNO.z + 0.006, uno); // ESP32-S3 module
  box(0.009, 0.0035, 0.009, silver, UNO.x - 0.032, UNO.y + 0.0025, UNO.z + 0.012, uno); // USB-C
  box(0.014, 0.011, 0.009, black, UNO.x - 0.029, UNO.y + 0.006, UNO.z - 0.017, uno); // DC jack
  const ledMat = new Std({ color: "#ffd9c2", emissive: "#ff7a3c", emissiveIntensity: 0.0, roughness: 0.4 });
  box(0.016, 0.0012, 0.012, ledMat, UNO.x + 0.012, UNO.y + 0.0012, UNO.z - 0.004, uno); // LED matrix
  const BB = new Vector3(0.0468, TOP + 0.00425, 0.0058);
  const bb = new Group(); root.add(bb);
  const holes = document.createElement("canvas"); holes.width = 330; holes.height = 218;
  { const x = holes.getContext("2d"); x.fillStyle = "#f4f4f1"; x.fillRect(0, 0, 330, 218); x.fillStyle = "#2b2b2b";
    for (let i = 0; i < 30; i++) for (let j = 0; j < 10; j++) x.fillRect(14 + i * 10.4, 34 + j * 15 + (j > 4 ? 10 : 0), 4, 4);
    x.fillStyle = "#d33"; x.fillRect(10, 8, 310, 2); x.fillStyle = "#36c"; x.fillRect(10, 208, 310, 2); }
  const bbTex = new THREE.CanvasTexture(holes); bbTex.colorSpace = THREE.SRGBColorSpace;
  const bbMat = [std("#f1f1ee"), std("#f1f1ee"), new Std({ map: bbTex, roughness: 0.8 }), std("#f1f1ee"), std("#f1f1ee"), std("#f1f1ee")];
  const bbBody = new Mesh(new THREE.BoxGeometry(0.0825, 0.0085, 0.0546), bbMat); bbBody.position.copy(BB); bb.add(bbBody);
  box(0.0101, 0.0152, 0.0045, black, BB.x - 0.008, BB.y + 0.0118, BB.z - 0.004, bb); // TO-220 (pump MOSFET)
  box(0.0101, 0.0062, 0.0013, silver, BB.x - 0.008, BB.y + 0.0225, BB.z - 0.0062, bb); // its tab
  const cap = new Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.011, 20), std("#1d2026", { roughness: 0.4 }));
  cap.position.set(BB.x + 0.012, BB.y + 0.0098, BB.z + 0.006); bb.add(cap);

  // copper wires: one net per subsystem
  const copper = () => new Std({ color: "#c27434", metalness: 1, roughness: 0.32, emissive: "#ff8a3d", emissiveIntensity: 0 });
  const nets = {};
  const wire = (net, pts, bendIt) => {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new Vector3(...p)), false, "centripetal");
    const mat = nets[net] ||= copper();
    if (bendIt && !mat.userData.bent) { bendable(mat, false); mat.userData.bent = true; }
    root.add(new Mesh(new THREE.TubeGeometry(curve, 64, 0.0009, 8, false), mat));
  };
  const U = (dx, dz) => [UNO.x + dx, UNO.y + 0.0095, UNO.z + dz];
  const B = (dx, dz) => [BB.x + dx, BB.y + 0.005, BB.z + dz];
  wire("drive", [U(-0.02, 0.0245), [-0.088, -0.036, 0.03], [-0.095, -0.05, 0.022], [-0.09, -0.066, 0.012], [-0.083, -0.07, 0.008]]);
  wire("drive", [B(0.03, 0.02), [0.09, -0.04, 0.03], [0.095, -0.05, 0.022], [0.09, -0.066, 0.012], [0.083, -0.07, 0.008]]);
  wire("arm", [U(0.02, 0.0245), [-0.032, -0.034, 0.038], [-0.03, -0.031, 0.048]]);
  wire("arm", [B(-0.03, 0.024), [0.026, -0.034, 0.038], [0.024, -0.031, 0.048]]);
  wire("sonar", [U(0.026, 0.0245), [-0.022, -0.03, 0.045], [-0.016, -0.014, 0.066], [-0.013, -0.0085, 0.09], [-0.011, -0.0075, 0.125], [-0.008, -0.0085, 0.152]], true);
  wire("pump", [B(-0.008, -0.004), [0.006, -0.025, 0.006], [-0.002, -0.0205, 0.012], [-0.008, -0.0208, 0.017]]);
  wire("vision", [U(-0.028, -0.012), [-0.09, -0.035, -0.01]]);

  // soft contact shadow
  const sh = document.createElement("canvas"); sh.width = sh.height = 128;
  { const x = sh.getContext("2d"); const g = x.createRadialGradient(64, 64, 4, 64, 64, 64); g.addColorStop(0, "rgba(0,0,0,.42)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }
  const shadow = new Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, -0.1212, pool ? 0.08 : 0.01); root.add(shadow);

  return {
    root, arm, wheels, nets, ledMat, sonar, bend, UNO, BB, TOP, fus,
    // `a` runs from raised (negative) to 0 = the CAD's pose over the pool. The sensors stay above the
    // water there (the color sensor is on the bottom of the arm); the intake hose reaches down into it.
    setArm(a) { arm.rotation.x = a; bend.uAng.value = a; },
    setFlow(f) { hoseMat.color.copy(hoseDry).lerp(hoseWet, clamp(f * 1.6)); },
    sync() { root.updateMatrixWorld(true); bend.uRoot.value.copy(root.matrixWorld); bend.uRootInv.value.copy(root.matrixWorld).invert(); },
  };
}

// ---------------------------------------------------------------- tour
const tourSec = document.getElementById("otv-3d");
if (tourSec) {
  if (!GL) tourSec.classList.add("o3-off");
  else {
    tourSec.classList.add(REDUCED ? "o3-still" : "o3-live");
    if (!REDUCED) dispatchEvent(new Event("resize"));
    lazy(tourSec, () => tour(tourSec), () => { tourSec.classList.remove("o3-live", "o3-still"); tourSec.classList.add("o3-off"); dispatchEvent(new Event("resize")); });
  }
}

async function tour(sec) {
  const K = await kit();
  const { THREE } = K;
  const { Vector3, Mesh, MeshStandardMaterial: Std } = THREE;
  const stage = sec.querySelector(".o3-stage");
  const canvas = sec.querySelector("canvas");
  const tagsEl = sec.querySelector(".o3-tags");
  const steps = [...sec.querySelectorAll(".o3-steps li")];
  const bar = [...sec.querySelectorAll(".o3-bar span")];
  const { renderer, scene } = makeRenderer(K, canvas);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.005, 5);
  const R = buildRobot(K, { pool: true });
  scene.add(R.root);
  R.sync();
  const { UNO, BB, TOP, wheels, nets, ledMat, sonar } = R;

  // the pool, with water
  const POOL = new Vector3(0.0027, -0.1214 + 0.04, 0.167); // water 40 mm deep; the rim is at 71 mm
  const water = new Mesh(new THREE.CircleGeometry(0.0615, 64), new Std({ color: "#2f6f9e", roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.82 }));
  water.rotation.x = -Math.PI / 2;
  water.position.copy(POOL);
  scene.add(water);
  const ripples = [0, 1, 2].map(() => {
    const m = new Mesh(new THREE.RingGeometry(0.97, 1, 64), new THREE.MeshBasicMaterial({ color: "#cfe8ff", transparent: true, opacity: 0, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(POOL.x, POOL.y + 0.0004, 0.158);
    scene.add(m);
    return m;
  });

  // shots: camera position, target, and labels (3D anchor, text, which side)
  const shots = [
    { pos: [0.33, 0.13, 0.4], tgt: [0, -0.065, 0.075],
      tags: [[[0.07, TOP, -0.045], "Plywood deck", "r"], [[0, -0.008, 0.12], "Sampling arm", "r"], [[0.06, -0.058, 0.215], "Pool", "r"]] },
    { pos: [0.3, 0.02, -0.17], tgt: [0.05, -0.08, 0.02],
      tags: [[[0.108, -0.06, 0.08], "8 cm wheel, direct drive", "r"], [[0.083, -0.068, 0.008], "JGY370 worm gear, 6 V, 30 RPM", "r"], [[0, -0.107, -0.047], "Rear caster", "l"]] },
    { pos: [0.02, 0.24, -0.15], tgt: [0, -0.05, 0.012],
      tags: [[[UNO.x, UNO.y, UNO.z], "Arduino UNO R4 WiFi", "r"], [[BB.x - 0.008, BB.y + 0.02, BB.z], "Pump MOSFET", "r"], [[-0.009, -0.021, 0.017], "Peristaltic pump", "r"]] },
    { pos: [-0.3, 0.05, 0.17], tgt: [0, -0.03, 0.09],
      tags: [[[-0.027, -0.026, 0.065], "2 × SG90 servo", "l"], [[0, -0.01, 0.11], "Sampling arm", "r"], [[0, -0.061, 0.135], "Color sensor, under the arm", "r"]] },
    { pos: [0.15, 0.1, 0.36], tgt: [0, -0.07, 0.15],
      tags: [[[0, -0.024, 0.161], "HC-SR04", "r"], [[0.04, POOL.y, 0.19], "20, 30 or 40 mm deep", "r"]] },
    { pos: [-0.12, 0.2, 0.31], tgt: [0, -0.045, 0.095],
      tags: [[[-0.009, 0.004, 0.1], "Sample line", "l"], [[-0.014, -0.098, 0.146], "Intake hose", "r"], [[-0.009, -0.021, 0.017], "Pump, on D10", "r"]] },
  ];
  const N = shots.length;
  shots.forEach((s) => {
    s.pos = new Vector3(...s.pos); s.tgt = new Vector3(...s.tgt);
    const o = s.pos.clone().sub(s.tgt);
    s.r = o.length(); s.az = Math.atan2(o.x, o.z); s.el = Math.asin(o.y / s.r);
  });
  const ocam = orbitCam(Vector3);
  let lastT = 0;

  // labels: one SVG for the leaders, one span per label
  const svgNS = "http://www.w3.org/2000/svg";
  const lsvg = document.createElementNS(svgNS, "svg");
  tagsEl.appendChild(lsvg);
  shots.forEach((s) => {
    s.els = s.tags.map(([at, text, side]) => {
      const path = document.createElementNS(svgNS, "path"); path.setAttribute("class", "o3-lead"); lsvg.appendChild(path);
      const dot = document.createElementNS(svgNS, "circle"); dot.setAttribute("r", "3"); dot.setAttribute("class", "o3-dot"); lsvg.appendChild(dot);
      const t = document.createElement("span"); t.className = "o3-tag " + side; t.textContent = text; tagsEl.appendChild(t);
      return { at: new Vector3(...at), path, dot, t, side };
    });
  });

  let W = 0, H = 0;
  const resize = () => {
    W = canvas.clientWidth; H = canvas.clientHeight;
    shots.forEach((s_) => s_.els.forEach((e) => { e.w = 0; }));
    renderer.setSize(W, H, false);
    cam.aspect = W / H;
    // Wide screens: nudge the robot right and up, clear of the chapter card in the bottom-left.
    if (W >= 760) cam.setViewOffset(W, H, -W * 0.09, H * 0.05, W, H); else cam.clearViewOffset();
    cam.updateProjectionMatrix();
    lsvg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  };
  new ResizeObserver(resize).observe(stage);

  const tmpP = new Vector3(), tmpT = new Vector3(), v = new Vector3();
  const progress = () => {
    if (REDUCED) return 0;
    const r = sec.getBoundingClientRect();
    const travel = sec.offsetHeight - stage.offsetHeight;
    return travel > 0 ? clamp(-r.top / travel) : 0;
  };

  let cur = -1;
  const frame = (time) => {
    if (!W) return;
    const s = progress() * (N - 1);
    const i = Math.min(N - 2, Math.floor(s)), f = s - i;
    // Hold at each stop and swing around the robot in between: angle, height and distance are
    // interpolated separately, then eased, with a slow drift so the frame never sits dead still.
    const dt = lastT ? Math.min(0.1, (time - lastT) / 1000) : 0;
    lastT = time;
    const t = smoother(clamp((f - 0.12) / 0.76));
    const A = shots[i], B = shots[i + 1];
    const k = 1.45 * (cam.aspect < 1.25 ? Math.min(2.1, 1.25 / cam.aspect) : 1); // narrow screens: back off
    const drift = REDUCED ? 0 : 1;
    tmpT.lerpVectors(A.tgt, B.tgt, t);
    const az = A.az + angDiff(A.az, B.az) * t + drift * 0.09 * Math.sin(time / 4200);
    const el = A.el + (B.el - A.el) * t + drift * 0.025 * Math.sin(time / 5300);
    const st = ocam.to(az, el, (A.r + (B.r - A.r) * t) * k, tmpT, dt, 0.35);
    ocam.place(cam, cam.position);
    cam.lookAt(st.tgt);
    const on = Math.round(s);
    if (on !== cur) {
      cur = on;
      steps.forEach((li, j) => li.classList.toggle("on", j === on));
      bar.forEach((b, j) => b.classList.toggle("on", j === on));
      Object.entries(nets).forEach(([n, m]) => { m.userData.on = ({ 1: "drive", 2: "vision", 3: "arm", 4: "sonar", 5: "pump" })[on] === n; });
    }
    wheels.forEach((w) => { w.rotation.x = s * 5.5; });
    R.setArm(REDUCED ? 0 : -0.95 * (1 - sm(2.35, 2.9, s)));
    R.setFlow(sm(4.6, 5.0, s)); // raised until the Arm stop, then swings down over the pool
    const sec_ = time / 1000;
    const ping = REDUCED ? 0 : clamp(1 - Math.abs(s - 4) * 1.6);
    sonar.material.opacity = ping * (0.18 + 0.12 * Math.sin(sec_ * 9));
    R.bend.uCut.value = 0.15 - sm(4.6, 5.0, s) * 0.16; // water runs from the pool back toward the pump
    ripples.forEach((m, j) => {
      const ph = (sec_ * 0.9 + j / 3) % 1;
      const amp = Math.max(ping, clamp(1 - Math.abs(s - 5) * 1.6));
      m.scale.setScalar(0.004 + ph * 0.05);
      m.material.opacity = REDUCED ? 0 : amp * (1 - ph) * 0.55;
    });
    ledMat.emissiveIntensity = on === 2 ? 0.6 + 0.4 * Math.sin(sec_ * 4) : 0;
    Object.values(nets).forEach((m) => { m.emissiveIntensity = m.userData.on ? 0.55 + 0.35 * Math.sin(sec_ * 5) : 0; });
    renderer.render(scene, cam);

    // labels for the current stop, faded by how close we are to it
    const near = clamp(1 - Math.abs(s - on) * 3.2);
    const placed = [];
    shots.forEach((sh_, j) => sh_.els.forEach((e) => {
      const show = j === on && near > 0.02;
      e.t.style.opacity = e.path.style.opacity = e.dot.style.opacity = show ? near : 0;
      if (!show) return;
      v.copy(e.at).project(cam);
      const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H;
      // Keep every label on screen: flip it to the other side when it would run off an edge.
      const tw = e.w ||= e.t.offsetWidth, reach = W < 600 ? 36 : 60;
      let side = e.side;
      if (side === "r" && x + reach + 6 + tw > W - 8) side = "l";
      else if (side === "l" && x - reach - 6 - tw < 8) side = "r";
      e.t.classList.toggle("l", side === "l"); e.t.classList.toggle("r", side === "r");
      const dx = side === "r" ? reach : -reach;
      // Labels at the same stop never overlap: step down past any label already placed.
      let ty = y - 34;
      const lx = side === "r" ? x + dx + 6 : x + dx - 6 - tw;
      for (let n = 0; n < 6; n++) {
        const hit = placed.find((p) => lx < p.x + p.w + 8 && lx + tw + 8 > p.x && ty - 10 < p.y + 22 && ty + 12 > p.y);
        if (!hit) break;
        ty = hit.y + 22 + 10 + 2;
      }
      placed.push({ x: lx, y: ty - 10, w: tw });
      e.dot.setAttribute("cx", x.toFixed(1)); e.dot.setAttribute("cy", y.toFixed(1));
      e.path.setAttribute("d", `M${x.toFixed(1)},${y.toFixed(1)} L${(x + dx * 0.5).toFixed(1)},${ty.toFixed(1)} H${(x + dx).toFixed(1)}`);
      e.t.style.transform = `translate(${(x + dx + (side === "r" ? 6 : -6)).toFixed(1)}px, ${(ty - 10).toFixed(1)}px)`;
    }));
  };

  resize();
  sec.classList.add("o3-ready");
  if (REDUCED) {
    const draw = () => { resize(); frame(0); };
    new ResizeObserver(draw).observe(stage);
    draw();
    return;
  }
  loopWhileVisible(sec, frame);
}

// ---------------------------------------------------------------- the course
// The 2D map's route (#route-a, #route-b) in map units: 200 per metre, x along the 4 m arena,
// y down the 2 m side. Sampled here, before the 2D map is hidden.
const runSec = document.getElementById("otv-run");
const map2d = document.getElementById("otv-route");
if (runSec && map2d) {
  if (!GL || REDUCED) runSec.classList.add("o3-off");
  else {
    const routes = ["#route-a", "#route-b"].map((id) => {
      const p = map2d.querySelector(id);
      const len = p.getTotalLength();
      const pts = [];
      for (let d = 0; d <= len; d += 1) { const q = p.getPointAtLength(d); pts.push([q.x, q.y]); }
      return { len, pts };
    });
    const note = map2d.querySelector("figcaption > p");
    const noteEl = document.querySelector(".o3r-note");
    if (note && noteEl) noteEl.textContent = note.textContent;
    runSec.classList.add("o3-live");
    document.documentElement.classList.add("o3r-on");
    dispatchEvent(new Event("resize"));
    lazy(runSec, () => course(runSec, routes), () => {
      runSec.classList.remove("o3-live"); runSec.classList.add("o3-off");
      document.documentElement.classList.remove("o3r-on"); dispatchEvent(new Event("resize"));
    });
  }
}

async function course(sec, routes) {
  const K = await kit();
  const { THREE } = K;
  const { Vector3, Group, Mesh, MeshStandardMaterial: Std } = THREE;
  const stage = sec.querySelector(".o3-stage");
  const canvas = sec.querySelector("canvas");
  const steps = [...sec.querySelectorAll(".o3-steps li")];
  const bar = [...sec.querySelectorAll(".o3-bar span")];
  const hud = sec.querySelector(".o3r-hud");
  const replayBtn = sec.querySelector(".o3r-replay");
  const { renderer, scene } = makeRenderer(K, canvas);
  const cam = new THREE.PerspectiveCamera(36, 1, 0.01, 30);

  const std = (color, o = {}) => new Std({ color, roughness: 0.6, metalness: 0, ...o });
  const U = 1 / 200; // map units to metres
  const GROUND = -0.1214; // wheel bottoms, in the robot's frame
  const AXLE_Z = 0.0659; // drive axle, in the robot's frame: the robot turns about this point

  // ---- prepare each route: heading per unit of travel (turning at a finite rate, facing forward while
  // backing up), wheel angles, phase boundaries and the pool position.
  const SAMPLE_AT = 150;
  const diff = (a, b) => ((b - a + 540) % 360) - 180;
  routes.forEach((R) => {
    const n = R.pts.length;
    const dirAt = (i) => { const a = R.pts[Math.max(0, i - 1)], b = R.pts[Math.min(n - 1, i + 1)]; return Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; };
    R.head = new Float32Array(n); R.wl = new Float32Array(n); R.wr = new Float32Array(n);
    let h = dirAt(2), wl = 0, wr = 0, prev = h;
    for (let i = 0; i < n; i++) {
      let target = dirAt(i), back = false;
      if (Math.abs(diff(h, target)) > 120) { target += 180; back = true; }
      const step = diff(h, target);
      h += Math.sign(step) * Math.min(Math.abs(step), 3);
      // wheels: 1 unit of travel plus the turn, over an 4 cm radius
      const dth = diff(prev, h) * Math.PI / 180; prev = h;
      const ds = (i ? U : 0) * (back ? -1 : 1);
      wl += (ds + dth * 0.1025) / 0.04; wr += (ds - dth * 0.1025) / 0.04;
      R.head[i] = h; R.wl[i] = wl; R.wr[i] = wr;
    }
    const x = (i) => R.pts[i][0];
    const firstAfter = (from, test) => { for (let i = from; i < n; i++) if (test(i)) return i; return n - 1; };
    const iWall = firstAfter(SAMPLE_AT + 5, (i) => Math.abs(x(i) - 160) < 0.6); // the turn toward the top wall
    R.phase = [0, 30, SAMPLE_AT, SAMPLE_AT + 0.001, iWall, firstAfter(iWall, (i) => x(i) >= 230), firstAfter(iWall, (i) => x(i) >= 500), firstAfter(iWall, (i) => x(i) >= 700)];
    // where the arm reaches when the robot stops to sample: 16 cm ahead of the axle, the CAD's pool spot
    const a = R.head[SAMPLE_AT] * Math.PI / 180, p = R.pts[SAMPLE_AT];
    R.pool = [p[0] * U + Math.cos(a) * 0.1015, p[1] * U + Math.sin(a) * 0.1015];
  });

  // ---- the arena
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || "#888";
  const floorCv = document.createElement("canvas"); floorCv.width = 2048; floorCv.height = 1024;
  const floorTex = new THREE.CanvasTexture(floorCv); floorTex.colorSpace = THREE.SRGBColorSpace; floorTex.anisotropy = 8;
  const PX = 512; // canvas px per metre
  const drawFloor = () => {
    const g = floorCv.getContext("2d");
    const board = css("--board"), rule = css("--rule"), ink3 = css("--ink-3"), mask = css("--mask"), copper = css("--copper");
    g.fillStyle = board; g.fillRect(0, 0, 2048, 1024);
    g.strokeStyle = rule; g.lineWidth = 2;
    for (let m = 0.5; m < 4; m += 0.5) { g.beginPath(); g.moveTo(m * PX, 0); g.lineTo(m * PX, 1024); g.stroke(); }
    for (let m = 0.5; m < 2; m += 0.5) { g.beginPath(); g.moveTo(0, m * PX); g.lineTo(2048, m * PX); g.stroke(); }
    // start squares, the goal zone and the mission sites
    g.setLineDash([14, 10]); g.strokeStyle = ink3; g.lineWidth = 3;
    g.strokeRect(4, 4, PX - 4, PX - 6); g.strokeRect(4, PX + 2, PX - 4, PX - 6);
    g.setLineDash([]);
    g.globalAlpha = 0.14; g.fillStyle = mask; g.fillRect(3.5 * PX, 0, 0.5 * PX, 1024); g.globalAlpha = 1;
    g.strokeStyle = mask; g.lineWidth = 3; g.setLineDash([10, 8]); g.beginPath(); g.moveTo(3.5 * PX, 0); g.lineTo(3.5 * PX, 1024); g.stroke(); g.setLineDash([]);
    routes.forEach((R) => { g.strokeStyle = copper; g.globalAlpha = 0.5; g.lineWidth = 3; g.beginPath(); g.arc(R.pool[0] * PX, R.pool[1] * PX, 0.17 * PX, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; });
    g.fillStyle = ink3; g.font = "600 44px Barlow, system-ui, sans-serif"; g.textBaseline = "top";
    g.fillText("A", 22, 18); g.fillText("B", 22, PX + 18);
    g.textAlign = "center"; g.fillText("Goal", 3.75 * PX, 1024 - 70);
    floorTex.needsUpdate = true;
  };
  drawFloor();
  new MutationObserver(drawFloor).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", drawFloor);

  const arena = new Group(); scene.add(arena);
  const floor = new Mesh(new THREE.PlaneGeometry(4, 2), new Std({ map: floorTex, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(2, 0, 1); arena.add(floor);
  const wallMat = new Std({ color: "#9aa3a0", roughness: 0.8 });
  const woodMat = new Std({ color: "#c9a875", roughness: 0.8 });
  const darkMat = new Std({ color: "#3b4046", roughness: 0.6 });
  const block = (x0, z0, x1, z1, h, mat) => { const m = new Mesh(new THREE.BoxGeometry(x1 - x0, h, z1 - z0), mat); m.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2); arena.add(m); return m; };
  const WT = 0.02, WH = 0.1;
  block(-WT, -WT, 4 + WT, 0, WH, wallMat); block(-WT, 2, 4 + WT, 2 + WT, WH, wallMat);
  block(-WT, 0, 0, 2, WH, wallMat); block(4, 0, 4 + WT, 2, WH, wallMat);
  // obstacle rows and the limbo, from the 2D map
  block(280 * U, 50 * U, 320 * U, 350 * U, 0.16, woodMat); block(440 * U, 50 * U, 480 * U, 350 * U, 0.16, woodMat);
  block(652 * U, 0, 668 * U, 44 * U, 0.08, woodMat); block(652 * U, 156 * U, 668 * U, 2, 0.08, woodMat);
  const LB = 0.184 + 0.0125; // rod centre: 18.4 cm clearance under a 2.5 cm rod (Arena Details)
  block(649 * U, 40 * U, 671 * U, 48 * U, LB + 0.02, darkMat); block(649 * U, 152 * U, 671 * U, 160 * U, LB + 0.02, darkMat);
  const barM = new Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, (152 - 48) * U, 20), darkMat);
  barM.rotation.x = Math.PI / 2; barM.position.set(660 * U, LB, 100 * U); arena.add(barM);

  // what the front ultrasonic can see (x0, z0, x1, z1): walls, obstacle rows, limbo side walls
  const solids = [[-WT, -WT, 4 + WT, 0], [-WT, 2, 4 + WT, 2 + WT], [-WT, 0, 0, 2], [4, 0, 4 + WT, 2],
    [280 * U, 50 * U, 320 * U, 350 * U], [440 * U, 50 * U, 480 * U, 350 * U], [652 * U, 0, 668 * U, 44 * U], [652 * U, 156 * U, 668 * U, 2]];
  const rayHit = (ox, oz, dx, dz) => { // nearest hit along a ray in the floor plane (slab method)
    let best = Infinity;
    solids.forEach(([x0, z0, x1, z1]) => {
      let t0 = -Infinity, t1 = Infinity;
      for (const [o, d, a, b] of [[ox, dx, x0, x1], [oz, dz, z0, z1]]) {
        if (Math.abs(d) < 1e-9) { if (o < a || o > b) return; continue; }
        let ta = (a - o) / d, tb = (b - o) / d; if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      }
      if (t0 <= t1 && t1 > 0 && t0 > 0) best = Math.min(best, t0);
    });
    return best;
  };
  // overhead camera: the vision system, above the arena, linked to the robot's ArUco marker
  const ohc = new Group(); ohc.position.set(2, 1.9, 1); scene.add(ohc);
  ohc.add(new Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.07), darkMat));
  const ohl = new Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 20), std("#11161a", { roughness: 0.2 })); ohl.position.y = -0.035; ohc.add(ohl);
  const linkMat = new THREE.LineDashedMaterial({ color: css("--copper"), dashSize: 0.04, gapSize: 0.03, transparent: true, opacity: 0.6 });
  const link = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new Vector3(), new Vector3()]), linkMat); scene.add(link);
  const packet = new Mesh(new THREE.SphereGeometry(0.012, 12, 8), new THREE.MeshBasicMaterial({ color: css("--copper") })); scene.add(packet);
  const guideMat = new THREE.LineDashedMaterial({ color: css("--copper"), dashSize: 0.03, gapSize: 0.025, transparent: true, opacity: 0 });
  const guide = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new Vector3(), new Vector3()]), guideMat); scene.add(guide);
  const setLine = (line, a, b) => { const pos = line.geometry.attributes.position; pos.setXYZ(0, a.x, a.y, a.z); pos.setXYZ(1, b.x, b.y, b.z); pos.needsUpdate = true; line.computeLineDistances(); };
  const pingMat = new THREE.MeshBasicMaterial({ color: "#e0965a", transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const frontPing = new Mesh(new THREE.ConeGeometry(0.06, 1, 24, 1, true), pingMat);
  frontPing.geometry.translate(0, -0.5, 0); frontPing.geometry.rotateX(-Math.PI / 2); // apex at the sensor, opening along +z
  scene.add(frontPing);
  const la = new Vector3(), lb = new Vector3(), fusW = new Vector3();

  // the pool (the CAD's size) with water and ripples
  const poolG = new Group(); arena.add(poolG);
  const poolMat = new Std({ color: "#2b3136", roughness: 0.5, side: THREE.DoubleSide });
  const wallP = new Mesh(new THREE.CylinderGeometry(0.0655, 0.0655, 0.071, 64, 1, true), poolMat);
  wallP.position.y = 0.0355; poolG.add(wallP);
  const pbase = new Mesh(new THREE.CircleGeometry(0.0655, 64), poolMat); pbase.rotation.x = -Math.PI / 2; pbase.position.y = 0.002; poolG.add(pbase);
  const water = new Mesh(new THREE.CircleGeometry(0.0625, 64), new Std({ color: "#2f6f9e", roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 }));
  water.rotation.x = -Math.PI / 2; water.position.y = 0.04; poolG.add(water); // 40 mm deep
  const ripples = [0, 1, 2].map(() => {
    const m = new Mesh(new THREE.RingGeometry(0.97, 1, 48), new THREE.MeshBasicMaterial({ color: "#cfe8ff", transparent: true, opacity: 0, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.0405; poolG.add(m); return m;
  });

  // copper trail on the floor, laid down behind the robot
  const trailMat = new Std({ color: css("--copper"), emissive: css("--copper"), emissiveIntensity: 0.45, roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide });
  const makeTrail = (R) => {
    const n = R.pts.length, w = 0.009, pos = new Float32Array(n * 6), idx = [];
    for (let i = 0; i < n; i++) {
      const a = R.pts[Math.max(0, i - 2)], b = R.pts[Math.min(n - 1, i + 2)];
      let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const x = R.pts[i][0] * U, z = R.pts[i][1] * U;
      pos.set([x - dy * w, 0.0015, z + dx * w, x + dy * w, 0.0015, z - dx * w], i * 6);
      if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new Mesh(g, trailMat); m.visible = false; arena.add(m); return m;
  };
  routes.forEach((R) => { R.trail = makeTrail(R); });

  // ---- the robot
  const RB = buildRobot(K, { pool: false });
  const carrier = new Group(); scene.add(carrier); // sits on the floor at the axle midpoint, faces +z
  RB.root.position.set(0, -GROUND, -AXLE_Z);
  carrier.add(RB.root);

  // ---- timeline: drive at a steady pace, stop at the pool to sample, then drive on.
  const V = 46; // map units per second of playback (about 23 cm/s)
  const HOLD = 6; // seconds at the pool
  let which = 0, Rt = routes[0];
  const total = () => Rt.len / V + HOLD;
  const stateAt = (t) => {
    const tS = SAMPLE_AT / V;
    if (t < tS) return { d: t * V, hold: -1 };
    if (t < tS + HOLD) return { d: SAMPLE_AT, hold: t - tS };
    return { d: Math.min(Rt.len, SAMPLE_AT + (t - tS - HOLD) * V), hold: HOLD + 1 };
  };
  const phaseOf = (d, hold) => {
    if (hold >= 0 && hold <= HOLD) return 2;
    let p = 0;
    Rt.phase.forEach((b, i) => { if (d >= b && i !== 2 && i !== 3) p = i; });
    if (p < 3 && hold > HOLD) p = 3;
    return p;
  };

  // ---- camera: overview at the start and the end, a chase camera in between
  const overPos = new Vector3(2, 2.6, 3.7), overTgt = new Vector3(2, 0, 0.95);
  const camPos = new Vector3().copy(overPos), camTgt = new Vector3().copy(overTgt);
  const ocam = orbitCam(Vector3);
  const wantPos = new Vector3(), wantTgt = new Vector3(), fwd = new Vector3(), side = new Vector3();
  let W = 0, H = 0;
  const resize = () => {
    W = canvas.clientWidth; H = canvas.clientHeight;
    renderer.setSize(W, H, false);
    cam.aspect = W / H;
    if (W >= 760) cam.setViewOffset(W, H, -W * 0.08, H * 0.04, W, H); else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(stage);

  // ---- progress: the run's own clock moves it forward; scrolling moves it too, either way
  let p = 0, last = 0, lastSP = null, cur = -1, pending = 0, hudText = "";
  const scrollP = () => {
    const r = sec.getBoundingClientRect();
    const travel = sec.offsetHeight - stage.offsetHeight;
    return travel > 0 ? clamp(-r.top / travel) : 0;
  };
  const pinned = () => { const r = sec.getBoundingClientRect(); return r.top <= 1 && r.bottom >= innerHeight - 1; };
  const restart = () => {
    which = 1 - which; Rt.trail.visible = false; Rt = routes[which];
    p = 0; cur = -1; pending = 0;
    sec.classList.remove("o3r-done");
  };
  replayBtn.addEventListener("click", restart);

  const frame = (time) => {
    if (!W) return;
    const dt = last ? Math.min(0.25, (time - last) / 1000) : 0;
    last = time;
    const T = total();
    const sp = scrollP();
    if (lastSP === null) { p = sp; lastSP = sp; } // arriving from below starts at the end
    // Scroll arrives in uneven steps from frame to frame; feed it in through a short ease.
    pending += sp - lastSP; lastSP = sp;
    const take = dt ? pending * (1 - Math.exp(-dt / 0.12)) : pending;
    pending -= take;
    p = clamp(p + (pinned() && p < 1 ? dt / T : 0) + take);
    const t = p * T;
    const { d, hold } = stateAt(t);
    // Glide between the route's 5 mm samples rather than snapping to the nearest one.
    const n1 = Rt.pts.length - 1, i = Math.min(n1, Math.floor(d)), j = Math.min(n1, i + 1), fr = Math.min(1, d - i);
    const mx = Rt.pts[i][0] + (Rt.pts[j][0] - Rt.pts[i][0]) * fr, my = Rt.pts[i][1] + (Rt.pts[j][1] - Rt.pts[i][1]) * fr;
    const headDeg = Rt.head[i] + diff(Rt.head[i], Rt.head[j]) * fr;
    const head = headDeg * Math.PI / 180;
    // place the robot: map (x, y) -> world (x, z); heading measured in the map's plane
    carrier.position.set(mx * U, 0, my * U);
    carrier.rotation.y = Math.atan2(Math.cos(head), Math.sin(head));
    RB.wheels[0].rotation.x = Rt.wl[i] + (Rt.wl[j] - Rt.wl[i]) * fr; RB.wheels[1].rotation.x = Rt.wr[i] + (Rt.wr[j] - Rt.wr[i]) * fr;
    poolG.position.set(Rt.pool[0], 0, Rt.pool[1]);
    Rt.trail.visible = true;
    Rt.trail.geometry.setDrawRange(0, Math.max(0, i - 1) * 6);
    // the mission at the pool: arm down, depth ping, pump, arm up
    const h = hold;
    // Driving, the arm rides slightly lifted (low enough for the limbo); at the pool it swings down.
    const armDown = h < 0 ? 0 : h > HOLD ? 0 : sm(0, 1.0, h) * (1 - sm(HOLD - 1.0, HOLD, h));
    RB.setArm(-0.35 * (1 - armDown));
    const ping = h >= 1.1 && h <= 2.6 ? 1 : 0;
    const sec_ = time / 1000;
    RB.sonar.material.opacity = ping * (0.18 + 0.12 * Math.sin(sec_ * 9));
    const flow = h < 0 ? 0 : sm(2.6, 4.4, Math.min(h, HOLD));
    RB.bend.uCut.value = 0.15 - flow * 0.16;
    RB.setFlow(flow);
    ripples.forEach((m, j) => {
      const ph = (sec_ * 0.9 + j / 3) % 1;
      m.scale.setScalar(0.004 + ph * 0.05);
      m.material.opacity = (h >= 1 && h <= 4.6 ? 1 : 0) * (1 - ph) * 0.55;
    });
    RB.nets.sonar && (RB.nets.sonar.emissiveIntensity = ping ? 0.7 : 0);
    RB.nets.pump && (RB.nets.pump.emissiveIntensity = h >= 2.6 && h <= 4.4 ? 0.7 : 0);
    RB.nets.drive && (RB.nets.drive.emissiveIntensity = (h < 0 || h > HOLD) && p < 1 ? 0.35 : 0);
    RB.sync();

    // camera: circles the robot as it drives, about one and a quarter turns over the run, so every
    // side of the OTV comes round. At the pool it slows, rises and moves in to look down into the water.
    fwd.set(Math.sin(carrier.rotation.y), 0, Math.cos(carrier.rotation.y));
    const ph = phaseOf(d, hold);
    const atPool = h < 0 || h > HOLD ? 0 : smoother(clamp(h / 1.2)) * (1 - smoother(clamp((h - (HOLD - 1.2)) / 1.2)));
    const travel = d / Rt.len + (h < 0 ? 0 : Math.min(h, HOLD) * 0.012);
    const az = carrier.rotation.y + Math.PI + travel * Math.PI * 2.5 + 0.12 * Math.sin(time / 3800);
    const el = 0.5 + 0.28 * atPool + 0.03 * Math.sin(time / 5100); // at the pool: rise and look down into it
    const narrow = cam.aspect < 1 ? Math.min(1.8, 1 / cam.aspect) : 1;
    const r = (0.82 - 0.26 * atPool) * narrow;
    wantTgt.copy(carrier.position).addScaledVector(fwd, 0.04 + 0.1 * atPool).setY(0.045);
    const st = ocam.to(az, el, r, wantTgt, dt, 0.55);
    ocam.place(cam, wantPos);
    // wide shot of the whole arena at the start and the end, eased in and out
    const intro = 1 - smoother(clamp((t - 0.3) / 3.2)), outro = smoother(clamp((t - (T - 3)) / 2.8));
    const wide = Math.max(intro, outro);
    camPos.copy(wantPos).lerp(overPos, wide); camTgt.copy(st.tgt).lerp(overTgt, wide);
    cam.position.copy(camPos); cam.lookAt(camTgt);
    renderer.render(scene, cam);

    // how it knows where it is: the overhead camera reads the ArUco marker and sends x, y and heading
    la.copy(ohc.position).setY(ohc.position.y - 0.05); lb.copy(carrier.position).setY(0.13);
    setLine(link, la, lb);
    linkMat.opacity = ph === 0 ? 0.75 : 0.22;
    packet.position.copy(la).lerp(lb, (time / 600) % 1);
    packet.material.opacity = 1; packet.visible = p < 1;
    // where it's going: a guide to the pool while it turns and drives at it
    guideMat.opacity = ph === 1 ? 0.8 : 0;
    if (ph === 1) { la.copy(carrier.position).setY(0.01); lb.set(Rt.pool[0], 0.01, Rt.pool[1]); setLine(guide, la, lb); }
    // what's ahead: the front HC-SR04
    RB.fus.updateMatrixWorld(); fusW.setFromMatrixPosition(RB.fus.matrixWorld);
    const ahead = rayHit(fusW.x, fusW.z, fwd.x, fwd.z);
    const driving = (h < 0 || h > HOLD) && p < 1;
    const reach = Math.min(ahead, 1.2);
    frontPing.position.copy(fusW); frontPing.rotation.set(0, carrier.rotation.y, 0);
    frontPing.scale.set(1, 1, reach); pingMat.opacity = driving ? 0.1 + 0.06 * Math.sin(time / 120) : 0;
    const lines = [`Vision   x ${(mx * U).toFixed(2)} m  y ${((400 - my) * U).toFixed(2)} m  θ ${Math.round(((-headDeg % 360) + 540) % 360 - 180)}°`];
    lines.push(`Front    ${ahead < 4 ? (ahead * 100).toFixed(0) + " cm" : "no echo, clear"}`);
    if (h >= 0 && h <= HOLD) lines.push(h < 1.1 ? "Arm      lowering, 1° steps" : h < 2.6 ? "Depth    pinging, keeping the median" : h < 4.4 ? "Pump     on, D10" : "Color    no strong color: clean");
    else lines.push(ph === 1 ? "Target   the pool" : ph >= 7 ? "Target   goal zone" : ph >= 6 ? "Target   limbo lane" : "Target   top wall, then goal");

    // chapter card, bar and readout
    if (ph !== cur) {
      cur = ph;
      steps.forEach((li, j) => li.classList.toggle("on", j === ph));
      bar.forEach((b, j) => b.classList.toggle("on", j === ph));
    }
    const txt = lines.join("\n");
    if (txt !== hudText) { hudText = txt; hud.textContent = txt; } // only touch the DOM when it changes
    if (sec.classList.contains("o3r-done") !== (p >= 1)) sec.classList.toggle("o3r-done", p >= 1);
  };

  resize();
  sec.classList.add("o3-ready");
  loopWhileVisible(sec, frame);
}

// ---------------------------------------------------------------- Brimcam, exploded in 3D
// Drawn from the parts list on the page (there's no CAD for the cap). The small parts grow as they come
// out, as the caption says. The 2D drawing stays for print, reduced motion and no WebGL.
const capSec = document.getElementById("cap-3d");
if (capSec) {
  if (!GL || REDUCED) capSec.classList.add("o3-off");
  else {
    capSec.classList.add("o3-live");
    document.documentElement.classList.add("o3c-on");
    dispatchEvent(new Event("resize"));
    lazy(capSec, () => capScene(capSec), () => {
      capSec.classList.remove("o3-live"); capSec.classList.add("o3-off");
      document.documentElement.classList.remove("o3c-on"); dispatchEvent(new Event("resize"));
    });
  }
}

async function capScene(sec) {
  const K = await kit();
  const { THREE } = K;
  const { Vector3, Group, Mesh, MeshStandardMaterial: Std } = THREE;
  const stage = sec.querySelector(".o3-stage");
  const canvas = sec.querySelector("canvas");
  const tagsEl = sec.querySelector(".o3-tags");
  const steps = [...sec.querySelectorAll(".o3-steps li")];
  const bar = [...sec.querySelectorAll(".o3-bar span")];
  const flashEl = sec.querySelector(".o3c-flash");
  const { renderer, scene } = makeRenderer(K, canvas);
  const cam = new THREE.PerspectiveCamera(32, 1, 0.01, 10);
  const std = (color, o = {}) => new Std({ color, roughness: 0.6, metalness: 0, ...o });

  // parts: each is a group with an assembled position, an exploded offset and a growth factor
  const parts = [];
  const part = (name, p0, off, grow = 1) => {
    const g = new Group(); g.position.set(...p0); scene.add(g);
    const P = { name, g, p0: new Vector3(...p0), off: new Vector3(...off), grow };
    parts.push(P);
    return P;
  };
  const fabric = std("#4a5764", { roughness: 0.95 });
  const fabricDk = std("#3a4550", { roughness: 0.95 });
  const seamMat = std("#7a8895", { roughness: 0.9 });

  // crown: a six-panel dome with seams, a top button, eyelets and the band
  const RX = 0.09, RY = 0.105, RZ = 0.095;
  const crown = part("crown", [0, 0, 0], [0, 0.15, -0.02]);
  const dome = new Mesh(new THREE.SphereGeometry(1, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), fabric);
  dome.scale.set(RX, RY, RZ); crown.g.add(dome);
  const lining = new Mesh(new THREE.SphereGeometry(0.985, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), std("#2c343c", { roughness: 1, side: THREE.BackSide }));
  lining.scale.set(RX, RY, RZ); crown.g.add(lining);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6, pts = [];
    for (let i = 0; i <= 24; i++) { const t = (i / 24) * Math.PI / 2; pts.push(new Vector3(Math.sin(t) * Math.sin(a) * RX * 1.004, Math.cos(t) * RY * 1.004, Math.sin(t) * Math.cos(a) * RZ * 1.004)); }
    crown.g.add(new Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0009, 6), seamMat));
  }
  const button = new Mesh(new THREE.SphereGeometry(0.009, 24, 12), fabricDk); button.scale.y = 0.45; button.position.y = RY; crown.g.add(button);
  [[-0.7, 0.62], [0.7, 0.62], [2.4, 0.62], [-2.4, 0.62]].forEach(([a, t]) => {
    const e = new Mesh(new THREE.TorusGeometry(0.003, 0.0009, 8, 20), seamMat);
    e.position.set(Math.sin(t) * Math.sin(a) * RX, Math.cos(t) * RY, Math.sin(t) * Math.cos(a) * RZ);
    e.lookAt(e.position.clone().multiplyScalar(2)); crown.g.add(e);
  });
  const band = new Mesh(new THREE.TorusGeometry(1, 0.045, 10, 64), fabricDk);
  band.rotation.x = Math.PI / 2; band.scale.set(RX, RZ, 0.09); band.position.y = 0.004; crown.g.add(band);

  // brim: a half-oval, curved down at the sides and tilted a little
  const brim = part("brim", [0, 0.006, RZ - 0.03], [0, -0.01, 0.07]);
  const shp = new THREE.Shape();
  shp.moveTo(-0.088, 0);
  for (let i = 0; i <= 40; i++) { const t = Math.PI - (i / 40) * Math.PI; shp.lineTo(Math.cos(t) * 0.088, Math.sin(t) * 0.085); }
  const bg = new THREE.ExtrudeGeometry(shp, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0012, bevelSegments: 2, curveSegments: 40 });
  bg.rotateX(Math.PI / 2); // the shape's y becomes forward (+z)
  const bp = bg.attributes.position;
  for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), z = bp.getZ(i); bp.setY(i, bp.getY(i) - 2.4 * x * x - 0.12 * z); }
  bg.computeVertexNormals();
  brim.g.add(new Mesh(bg, fabric));
  for (const r of [0.07, 0.077]) { // stitching
    const pts = [];
    for (let i = 0; i <= 40; i++) { const t = (i / 40) * Math.PI; const x = Math.cos(t) * r * 1.02, z = Math.sin(t) * r; pts.push(new Vector3(x, 0.0013 - 2.4 * x * x - 0.12 * z, z)); }
    brim.g.add(new Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0006, 5), seamMat));
  }

  // battery: a protected 500 mAh pouch cell under the crown, at the back
  const bat = part("bat", [0, 0.072, -0.03], [0, 0.06, -0.05], 1.4);
  bat.g.rotation.x = 0.35;
  bat.g.add(new Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.042), std("#c9cdd0", { metalness: 0.5, roughness: 0.4 })));
  const pcm = new Mesh(new THREE.BoxGeometry(0.03, 0.004, 0.006), std("#1f6b46")); pcm.position.set(0, 0, 0.024); bat.g.add(pcm);

  // touch pad on the side of the crown, slide switch on the band
  const tp = part("tp", [-RX * 0.93, 0.045, 0.012], [-0.08, 0.04, 0.01], 2.0);
  tp.g.rotation.z = Math.PI / 2 - 0.45;
  tp.g.add(new Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.0016, 32), std("#1f4ea0")));
  const ring = new Mesh(new THREE.TorusGeometry(0.0045, 0.0011, 8, 24), std("#e0b25a", { metalness: 0.8, roughness: 0.3 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.0009; tp.g.add(ring);
  const sw = part("sw", [-RX * 1.0, 0.007, 0.035], [-0.08, -0.03, 0.03], 2.2);
  sw.g.rotation.y = -1.2;
  sw.g.add(new Mesh(new THREE.BoxGeometry(0.012, 0.005, 0.005), std("#2a3035")));
  const knob = new Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.003), std("#c9cdd0")); knob.position.set(-0.002, 0.004, 0); sw.g.add(knob);

  // under the brim: the XIAO ESP32S3 Sense and its camera, the Wi-Fi antenna, the recording LED
  const xiao = part("xiao", [0, -0.024, RZ + 0.025], [0, -0.08, 0.08], 2.4);
  xiao.g.rotation.x = 0.5;
  xiao.g.add(new Mesh(new THREE.BoxGeometry(0.0175, 0.0012, 0.021), std("#0e6a4c", { roughness: 0.5 })));
  const sense = new Mesh(new THREE.BoxGeometry(0.0175, 0.0012, 0.021), std("#0b4f39", { roughness: 0.5 })); sense.position.y = -0.003; xiao.g.add(sense);
  const can = new Mesh(new THREE.BoxGeometry(0.009, 0.0016, 0.011), std("#b9bec2", { metalness: 0.8, roughness: 0.3 })); can.position.set(0, 0.0013, -0.002); xiao.g.add(can);
  const camMod = new Mesh(new THREE.BoxGeometry(0.008, 0.0035, 0.008), std("#20262b")); camMod.position.set(0, -0.0058, 0.004); xiao.g.add(camMod);
  const lens = new Mesh(new THREE.CylinderGeometry(0.0026, 0.0026, 0.0026, 24), std("#11161a", { roughness: 0.2, metalness: 0.4 })); lens.position.set(0, -0.0085, 0.004); xiao.g.add(lens);
  const glass = new Mesh(new THREE.CircleGeometry(0.0018, 24), std("#3b5d8a", { roughness: 0.05, metalness: 0.6 })); glass.rotation.x = Math.PI / 2; glass.position.set(0, -0.0099, 0.004); xiao.g.add(glass);
  const ant = part("ant", [0.03, -0.014, RZ + 0.045], [0.08, -0.02, 0.07], 1.7);
  ant.g.rotation.y = 0.15;
  ant.g.add(new Mesh(new THREE.BoxGeometry(0.035, 0.0008, 0.008), std("#d08a2e", { metalness: 0.6, roughness: 0.35 })));
  const led = part("led", [0, -0.016, RZ + 0.05], [-0.04, -0.04, 0.1], 2.6);
  const ledMat = new Std({ color: "#ff5a4f", emissive: "#ff3b2f", emissiveIntensity: 1.2, roughness: 0.3 });
  led.g.add(new Mesh(new THREE.SphereGeometry(0.0028, 20, 12), ledMat));
  const ledBody = new Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.003, 20), ledMat); ledBody.position.y = 0.0015; led.g.add(ledBody);

  // wires between pins on the parts, rebuilt as the parts move apart
  const P = Object.fromEntries(parts.map((q) => [q.name, q]));
  const wireDefs = [
    ["bat", [0.012, 0, 0.026], "sw", [0.004, 0, 0], "#d9483b"],
    ["sw", [-0.004, 0, 0], "xiao", [-0.008, 0, -0.01], "#d9483b"],
    ["bat", [-0.012, 0, 0.026], "xiao", [0.008, 0, -0.01], "#4b545a"],
    ["tp", [0, 0, 0], "xiao", [-0.006, 0, 0.0], "#c27434"],
    ["led", [0, 0.003, 0], "xiao", [0.006, 0, 0.01], "#c27434"],
    ["ant", [-0.017, 0, 0], "xiao", [0.008, 0.001, 0.008], "#9aa0a5"],
  ].map(([a, pa, b, pb, color]) => {
    const mesh = new Mesh(new THREE.BufferGeometry(), new Std({ color, roughness: 0.5, metalness: color === "#c27434" ? 0.8 : 0.1 }));
    scene.add(mesh);
    return { a: P[a], pa: new Vector3(...pa), b: P[b], pb: new Vector3(...pb), mesh };
  });
  const wa = new Vector3(), wb = new Vector3(), wm = new Vector3();
  const drawWires = () => wireDefs.forEach((w) => {
    w.a.g.updateMatrixWorld(); w.b.g.updateMatrixWorld();
    wa.copy(w.pa).applyMatrix4(w.a.g.matrixWorld); wb.copy(w.pb).applyMatrix4(w.b.g.matrixWorld);
    wm.copy(wa).add(wb).multiplyScalar(0.5); wm.y -= 0.01 + wa.distanceTo(wb) * 0.12;
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([wa.clone(), wm.clone(), wb.clone()]), 28, 0.0009, 6);
    w.mesh.geometry.dispose(); w.mesh.geometry = g;
  });

  // the shot: a view cone from the lens down to a tray
  const tray = new Group(); tray.position.set(0.04, -0.3, 0.26); scene.add(tray);
  tray.add(new Mesh(new THREE.BoxGeometry(0.36, 0.012, 0.27), std("#c9c3b6", { roughness: 0.8 })));
  [[-0.08, 0.03, 0.07, "#c98b4a"], [0.08, -0.04, 0.06, "#7aa35a"], [0.1, 0.07, 0.035, "#d9c27a"]].forEach(([x, z, r, c]) => {
    const pl = new Mesh(new THREE.CylinderGeometry(r, r * 0.8, 0.012, 32), std("#f1f1ee")); pl.position.set(x, 0.012, z); tray.add(pl);
    const food = new Mesh(new THREE.SphereGeometry(r * 0.6, 20, 10), std(c, { roughness: 0.9 })); food.scale.y = 0.35; food.position.set(x, 0.022, z); tray.add(food);
  });
  const coneMat = new THREE.MeshBasicMaterial({ color: "#e0965a", transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const cone = new Mesh(new THREE.ConeGeometry(1, 1, 4, 1, true), coneMat);
  cone.geometry.translate(0, -0.5, 0); cone.geometry.rotateX(-Math.PI / 2); // apex at the lens, opening along +z
  scene.add(cone);

  // labels, one per part, shown while the cap is apart
  const svgNS = "http://www.w3.org/2000/svg";
  const lsvg = document.createElementNS(svgNS, "svg"); tagsEl.appendChild(lsvg);
  const names = { crown: "Crown", bat: "500 mAh LiPo", tp: "Touch pad", sw: "Slide switch", brim: "Brim", xiao: "XIAO ESP32S3 Sense", ant: "Wi-Fi antenna", led: "Recording LED" };
  const anchors = { crown: [0.03, RY * 0.9, 0.04], brim: [0.05, 0, 0.06] };
  const tags = parts.map((q) => {
    const path = document.createElementNS(svgNS, "path"); path.setAttribute("class", "o3-lead"); lsvg.appendChild(path);
    const dot = document.createElementNS(svgNS, "circle"); dot.setAttribute("r", "3"); dot.setAttribute("class", "o3-dot"); lsvg.appendChild(dot);
    const t = document.createElement("span"); t.className = "o3-tag r"; t.textContent = names[q.name]; tagsEl.appendChild(t);
    return { q, at: new Vector3(...(anchors[q.name] || [0, 0, 0])), path, dot, t, w: 0 };
  });

  let W = 0, H = 0;
  const resize = () => {
    W = canvas.clientWidth; H = canvas.clientHeight;
    tags.forEach((e) => { e.w = 0; });
    renderer.setSize(W, H, false);
    cam.aspect = W / H;
    if (W >= 760) cam.setViewOffset(W, H, -W * 0.08, H * 0.02, W, H); else cam.clearViewOffset();
    cam.updateProjectionMatrix();
    lsvg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  };
  new ResizeObserver(resize).observe(stage);

  const progress = () => {
    const r = sec.getBoundingClientRect();
    const travel = sec.offsetHeight - stage.offsetHeight;
    return travel > 0 ? clamp(-r.top / travel) : 0;
  };
  const ocam = orbitCam(Vector3);
  const tgt = new Vector3(), v = new Vector3(), lensW = new Vector3(), trayW = new Vector3();
  let lastT = 0, lastE = -1, cur = -1, shot = false;

  const frame = (time) => {
    if (!W) return;
    const dt = lastT ? Math.min(0.1, (time - lastT) / 1000) : 0;
    lastT = time;
    const p = progress();
    // 0-0.3 apart, 0.3-0.6 hold, 0.6-0.8 back together, 0.82-0.92 the camera's view, then the shot
    const e = p < 0.6 ? smoother(clamp(p / 0.3)) : 1 - smoother(clamp((p - 0.6) / 0.2));
    if (Math.abs(e - lastE) > 1e-4) {
      parts.forEach((q) => { q.g.position.copy(q.p0).addScaledVector(q.off, e); q.g.scale.setScalar(1 + (q.grow - 1) * e); });
      drawWires(); lastE = e;
    }
    wireDefs.forEach((w) => { w.mesh.visible = e > 0.02; });
    const view = smoother(clamp((p - 0.82) / 0.1));
    tray.visible = view > 0.01;
    xiao.g.updateMatrixWorld(); lensW.set(0, -0.01, 0.004).applyMatrix4(xiao.g.matrixWorld);
    trayW.copy(tray.position).setY(tray.position.y + 0.02);
    cone.position.copy(lensW); cone.lookAt(trayW);
    cone.scale.set(0.2 * view + 0.001, 0.15 * view + 0.001, lensW.distanceTo(trayW));
    coneMat.opacity = 0.16 * view;
    if (p > 0.93 && !shot) {
      shot = true;
      flashEl.classList.remove("go"); void flashEl.offsetWidth; flashEl.classList.add("go");
      document.dispatchEvent(new Event("capshot"));
    } else if (p < 0.8) shot = false;
    ledMat.emissiveIntensity = 0.8 + 0.6 * Math.max(0, Math.sin(time / 300));

    // camera: one full turn around the cap while it's open, then it settles beside it for the shot
    const spin = smoother(clamp((p - 0.04) / 0.74));
    const az = 0.7 + spin * Math.PI * 2 + 0.08 * Math.sin(time / 4200) + view * 0.9;
    const el = 0.38 + 0.12 * Math.sin(spin * Math.PI) - view * 0.18;
    const narrow = cam.aspect < 1 ? Math.min(1.9, 1.05 / cam.aspect) : 1;
    const r = (0.5 + 0.42 * e + 0.45 * view) * narrow;
    tgt.set(0.02 * view, 0.03 + 0.015 * e - 0.14 * view, 0.03 + 0.07 * e + 0.12 * view);
    const st = ocam.to(az, el, r, tgt, dt, 0.4);
    ocam.place(cam, cam.position); cam.lookAt(st.tgt);
    renderer.render(scene, cam);

    const ch = p < 0.15 ? 0 : p < 0.6 ? 1 : p < 0.82 ? 2 : 3;
    if (ch !== cur) { cur = ch; steps.forEach((li, j) => li.classList.toggle("on", j === ch)); bar.forEach((b, j) => b.classList.toggle("on", j === ch)); }

    // labels while it's apart: flip at the screen edges, never overlap
    const show = smoother(clamp((e - 0.7) / 0.3)) * (1 - view);
    const placed = [];
    tags.forEach((T) => {
      let o = show;
      if (o >= 0.02) { v.copy(T.at).applyMatrix4(T.q.g.matrixWorld).project(cam); if (v.z > 1) o = 0; }
      T.t.style.opacity = T.path.style.opacity = T.dot.style.opacity = o;
      if (o < 0.02) return;
      const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H;
      const tw = T.w ||= T.t.offsetWidth, reach = W < 600 ? 30 : 48;
      let side = x > W * 0.5 ? "r" : "l";
      if (side === "r" && x + reach + 6 + tw > W - 8) side = "l";
      else if (side === "l" && x - reach - 6 - tw < 8) side = "r";
      T.t.classList.toggle("l", side === "l"); T.t.classList.toggle("r", side === "r");
      const dx = side === "r" ? reach : -reach;
      let ty = y - 26;
      const lx = side === "r" ? x + dx + 6 : x + dx - 6 - tw;
      for (let n = 0; n < 8; n++) {
        const hit = placed.find((q) => lx < q.x + q.w + 6 && lx + tw + 6 > q.x && ty - 10 < q.y + 22 && ty + 12 > q.y);
        if (!hit) break;
        ty = hit.y + 22 + 10 + 2;
      }
      placed.push({ x: lx, y: ty - 10, w: tw });
      T.dot.setAttribute("cx", x.toFixed(1)); T.dot.setAttribute("cy", y.toFixed(1));
      T.path.setAttribute("d", `M${x.toFixed(1)},${y.toFixed(1)} L${(x + dx * 0.5).toFixed(1)},${ty.toFixed(1)} H${(x + dx).toFixed(1)}`);
      T.t.style.transform = `translate(${(x + dx + (side === "r" ? 6 : -6)).toFixed(1)}px, ${(ty - 10).toFixed(1)}px)`;
    });
  };

  resize();
  sec.classList.add("o3-ready");
  loopWhileVisible(sec, frame);
}
