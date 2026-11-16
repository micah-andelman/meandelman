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
// The course run: "scrub" (default) is driven by scroll, both ways, like the kart on benmross.com;
// "lock" (?run=lock) holds the screen and plays on its own. Kept so the two can be compared.
const RUN_MODE = new URLSearchParams(location.search).get("run") === "lock" ? "lock" : "scrub";
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
      // the angle eases; the aim point follows closely, so a moving subject stays in frame
      st.az += angDiff(st.az, az) * k; st.el += (el - st.el) * k; st.r += (r - st.r) * k; st.tgt.lerp(tgt, 1 - Math.exp(-dt / Math.min(tau, 0.12)));
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
  // The CAD's caster stops 25 mm above the floor (the team's feedback noted it too): drop it onto the
  // floor and fill the gap under the deck with a wooden spacer.
  const CASTER_DROP = 0.0255;
  ["m13", "m17", "m20"].forEach((n) => { const o = M(n); if (o) o.position.y -= CASTER_DROP; });
  const spacer = new Mesh(new THREE.BoxGeometry(0.038, CASTER_DROP, 0.032), std("#c9a875", { roughness: 0.85 }));
  spacer.position.set(-0.0003, -0.0561 - CASTER_DROP / 2, -0.0469); robot.add(spacer);
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
  // Arduino UNO R4 WiFi, 68.6 x 53.4 mm: a silkscreen texture for the board (labels, outline, LED matrix
  // footprint) at 20 px/mm so it stays sharp up close, plus the parts that stand off it.
  const uno = new Group(); root.add(uno);
  const pcbBlue = std("#1d4f9c", { roughness: 0.45 }), black = std("#151719", { roughness: 0.7 }), silver = std("#c6cacd", { metalness: 0.9, roughness: 0.3 });
  const UNO = new Vector3(-0.0567, TOP + 0.0045, 0.0057);
  const UW = 0.0686, UD = 0.0534, PXM = 20000; // px per metre
  const unoCv = document.createElement("canvas"); unoCv.width = Math.round(UW * PXM); unoCv.height = Math.round(UD * PXM);
  {
    const g = unoCv.getContext("2d"), W_ = unoCv.width, H_ = unoCv.height, mm = PXM / 1000;
    g.fillStyle = "#1d4f9c"; g.fillRect(0, 0, W_, H_);
    g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = 0.25 * mm; g.strokeRect(1 * mm, 1 * mm, W_ - 2 * mm, H_ - 2 * mm);
    g.fillStyle = "#f2f4f6"; g.textBaseline = "middle";
    g.font = `700 ${4.2 * mm}px Barlow, Arial, sans-serif`; g.fillText("UNO R4", 37 * mm, 30 * mm);
    g.font = `700 ${3.2 * mm}px Barlow, Arial, sans-serif`; g.fillText("WiFi", 39 * mm, 35 * mm);
    g.font = `600 ${1.15 * mm}px Barlow, Arial, sans-serif`;
    const dig = ["SCL", "SDA", "AREF", "GND", "13", "12", "~11", "~10", "~9", "8", "7", "~6", "~5", "4", "~3", "2", "TX 1", "RX 0"];
    dig.forEach((t, i) => { g.save(); g.translate((17.5 + i * 2.54) * mm, 6.2 * mm); g.rotate(-Math.PI / 2); g.textAlign = "left"; g.fillText(t, 0, 0); g.restore(); });
    const pwr = ["IOREF", "RESET", "3.3V", "5V", "GND", "GND", "VIN", "", "A0", "A1", "A2", "A3", "A4", "A5"];
    pwr.forEach((t, i) => { if (!t) return; g.save(); g.translate((28.5 + i * 2.54) * mm, H_ - 6.2 * mm); g.rotate(-Math.PI / 2); g.textAlign = "right"; g.fillText(t, 0, 0); g.restore(); });
    g.font = `600 ${1.4 * mm}px Barlow, Arial, sans-serif`; g.textAlign = "left";
    g.fillText("RESET", 4 * mm, 18 * mm); g.fillText("ON", 60 * mm, 44 * mm); g.fillText("L", 60 * mm, 39 * mm);
    // the 12 x 8 LED matrix footprint (its LEDs are their own mesh, so they can light)
    g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(41 * mm, 39 * mm, 15 * mm, 10.5 * mm);
    // test pads and vias
    g.fillStyle = "#c9a85a"; for (let i = 0; i < 40; i++) g.fillRect(((i * 37) % 60 + 4) * mm, ((i * 23) % 40 + 7) * mm, 0.5 * mm, 0.5 * mm);
  }
  const unoTex = new THREE.CanvasTexture(unoCv); unoTex.colorSpace = THREE.SRGBColorSpace; unoTex.anisotropy = 8;
  const unoTop = new Std({ map: unoTex, roughness: 0.45 });
  const board = new Mesh(new THREE.BoxGeometry(UW, 0.0016, UD), [pcbBlue, pcbBlue, unoTop, pcbBlue, pcbBlue, pcbBlue]);
  board.position.copy(UNO); uno.add(board);
  // headers: black female strips with square sockets on top
  const holeCv = document.createElement("canvas"); holeCv.width = 512; holeCv.height = 32;
  { const g = holeCv.getContext("2d"); g.fillStyle = "#17191b"; g.fillRect(0, 0, 512, 32); g.fillStyle = "#050607"; for (let i = 0; i < 16; i++) g.fillRect(i * 32 + 10, 10, 12, 12); }
  const holeTex = new THREE.CanvasTexture(holeCv); holeTex.colorSpace = THREE.SRGBColorSpace; holeTex.wrapS = THREE.RepeatWrapping;
  const header = (n, x, z) => {
    const t = holeTex.clone(); t.needsUpdate = true; t.repeat.set(n / 16, 1);
    const m = new Mesh(new THREE.BoxGeometry(n * 0.00254, 0.0085, 0.0025), [black, black, new Std({ map: t, roughness: 0.7 }), black, black, black]);
    m.position.set(UNO.x - UW / 2 + x + (n * 0.00254) / 2, UNO.y + 0.005, UNO.z - UD / 2 + z); uno.add(m);
  };
  header(10, 0.0175 - 0.00127, 0.0025); header(8, 0.0175 + 10 * 0.00254 + 0.0012, 0.0025); // digital side
  header(8, 0.0273, UD - 0.0025); header(6, 0.0273 + 8 * 0.00254 + 0.002, UD - 0.0025);     // power and analog side
  const at = (x, z) => [UNO.x - UW / 2 + x, UNO.z - UD / 2 + z];
  const part_ = (w, h, d, mat, x, z, y = 0) => { const [px, pz] = at(x, z); const m = new Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(px, UNO.y + 0.0008 + h / 2 + y, pz); uno.add(m); return m; };
  part_(0.018, 0.0032, 0.0255, silver, 0.034, 0.016);                          // ESP32-S3 module shield
  part_(0.0055, 0.0008, 0.0255, std("#11161a"), 0.0455, 0.016);                // its antenna end
  part_(0.009, 0.0032, 0.0074, silver, -0.0005, 0.0385);                        // USB-C
  part_(0.014, 0.011, 0.009, black, 0.002, 0.0075);                             // barrel jack
  part_(0.01, 0.0014, 0.01, std("#0d0f11", { roughness: 0.35 }), 0.031, 0.034); // RA4M1
  part_(0.003, 0.0015, 0.003, std("#e8e4dc"), 0.006, 0.0215);                   // reset button
  part_(0.005, 0.003, 0.004, std("#f1f1ee"), 0.012, 0.049);                     // Qwiic connector
  const ledMat = new Std({ color: "#ffd9c2", emissive: "#ff7a3c", emissiveIntensity: 0.0, roughness: 0.4 });
  const ledGrid = new THREE.InstancedMesh(new THREE.BoxGeometry(0.0008, 0.0006, 0.0006), ledMat, 96);
  { const mtx = new THREE.Matrix4(); let k = 0; for (let r = 0; r < 8; r++) for (let c = 0; c < 12; c++) { const [px, pz] = at(0.042 + c * 0.00125, 0.040 + r * 0.00125); mtx.makeTranslation(px, UNO.y + 0.0011, pz); ledGrid.setMatrixAt(k++, mtx); } }
  uno.add(ledGrid);
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

  // Under the deck: the 9.6 V NiMH pack (eight AA cells, flat) and one DRV8871 driver per motor, wired to
  // the motors and up to the Arduino. Placed in the open space between the motors until there are photos.
  const UNDER = -0.0561; // deck underside
  const cellCv = document.createElement("canvas"); cellCv.width = 512; cellCv.height = 128;
  { const g = cellCv.getContext("2d"); g.fillStyle = "#2a62b8"; g.fillRect(0, 0, 512, 128); g.fillStyle = "rgba(0,0,0,.25)"; for (let i = 1; i < 8; i++) g.fillRect(i * 64 - 1, 0, 2, 128);
    g.fillStyle = "#e9eef5"; g.font = "600 30px Barlow, Arial, sans-serif"; g.textBaseline = "middle"; g.fillText("9.6V  NiMH", 160, 64); }
  const cellTex = new THREE.CanvasTexture(cellCv); cellTex.colorSpace = THREE.SRGBColorSpace;
  const packMat = new Std({ map: cellTex, roughness: 0.5 }), packSide = std("#2a62b8", { roughness: 0.5 });
  const pack = new Mesh(new THREE.BoxGeometry(0.116, 0.0145, 0.0505), [packSide, packSide, packSide, packMat, packSide, packSide]);
  pack.position.set(0, UNDER - 0.00725, 0.02); root.add(pack);
  const drivers = [-1, 1].map((sx) => {
    const g = new Group(); g.position.set(sx * 0.046, UNDER - 0.001, 0.062); root.add(g);
    const pcb = new Mesh(new THREE.BoxGeometry(0.0254, 0.0016, 0.0203), std("#16181b", { roughness: 0.5 })); pcb.position.y = -0.0008; g.add(pcb);
    const chip = new Mesh(new THREE.BoxGeometry(0.005, 0.0012, 0.004), std("#0b0c0d")); chip.position.set(0, -0.0022, 0); g.add(chip);
    [-0.008, 0.008].forEach((x) => { const tb = new Mesh(new THREE.BoxGeometry(0.0075, 0.007, 0.0065), std("#2f9a4a", { roughness: 0.5 })); tb.position.set(x, -0.005, 0.0065); g.add(tb); });
    return g;
  });
  const wireMat = (c) => std(c, { roughness: 0.5 });
  const cable = (pts, color, r = 0.0011) => root.add(new Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((q) => new Vector3(...q)), false, "centripetal"), 40, r, 6), wireMat(color)));
  [-1, 1].forEach((sx) => {
    // pack to the driver's power terminal (red and black)
    cable([[sx * 0.058, UNDER - 0.006, 0.03], [sx * 0.06, UNDER - 0.012, 0.05], [sx * 0.054, UNDER - 0.008, 0.069]], "#d9483b");
    cable([[sx * 0.05, UNDER - 0.006, 0.045], [sx * 0.05, UNDER - 0.013, 0.058], [sx * 0.04, UNDER - 0.008, 0.069]], "#202326");
    // driver to its motor
    cable([[sx * 0.054, UNDER - 0.008, 0.056], [sx * 0.068, UNDER - 0.012, 0.045], [sx * 0.072, -0.07, 0.03]], "#c27434", 0.0009);
    cable([[sx * 0.038, UNDER - 0.008, 0.056], [sx * 0.06, UNDER - 0.016, 0.04], [sx * 0.07, -0.074, 0.026]], "#c27434", 0.0009);
    // driver logic up through the deck to the Arduino side
    cable([[sx * 0.046, UNDER - 0.002, 0.052], [sx * 0.03, UNDER - 0.004, 0.06], [sx * 0.02, UNDER + 0.001, 0.07]], "#e0b25a", 0.0007);
  });
  // pack to the kill switch and the Arduino's VIN, up through the deck at the back
  cable([[0.0, UNDER - 0.006, -0.005], [0.0, UNDER - 0.012, -0.02], [-0.012, UNDER + 0.001, -0.03]], "#d9483b");

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
    root, arm, wheels, nets, ledMat, sonar, bend, UNO, BB, TOP, fus, pack, drivers,
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
    runSec.classList.add("o3-live", RUN_MODE === "scrub" ? "o3r-scrub" : "o3r-lockmode");
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
  const alu = std("#b9bfc4", { metalness: 0.8, roughness: 0.35 });
  const GH = 2.15, GT = 0.05; // gantry height and tube size
  [-0.3, 2.3].forEach((z) => { const post = new Mesh(new THREE.BoxGeometry(GT, GH, GT), alu); post.position.set(2, GH / 2, z); arena.add(post);
    const foot = new Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.3), alu); foot.position.set(2, 0.01, z); arena.add(foot); });
  const beam = new Mesh(new THREE.BoxGeometry(GT, GT, 2.6 + GT), alu); beam.position.set(2, GH, 1); arena.add(beam);
  const ohc = new Group(); ohc.position.set(2, GH - 0.07, 1); arena.add(ohc);
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

  // ---- timeline: a scripted run. It drives quickly between the things worth seeing and slows down
  // for them: the pool, a look at the underside, and the limbo.
  const INTRO = 1.6, HOLD = 10, OUTRO = 2.6; // seconds
  routes.forEach((R) => {
    const n = R.pts.length, x = (i) => R.pts[i][0];
    const firstAfter = (from, test) => { for (let i = from; i < n; i++) if (test(i)) return i; return n - 1; };
    const turn = R.phase[4];
    const wall = firstAfter(turn, (i) => x(i) >= 230);
    const under = firstAfter(wall, (i) => x(i) >= 470);
    const limbo = firstAfter(under, (i) => x(i) >= 590);
    const goal = firstAfter(limbo, (i) => x(i) >= 700);
    R.marks = { turn, wall, under, limbo, goal };
    // [from, to, map units per second]
    R.segs = [[0, SAMPLE_AT, 70], [SAMPLE_AT, wall, 120], [wall, under, 30], [under, limbo, 34], [limbo, goal, 30], [goal, n - 1, 80]];
    let t = INTRO;
    R.segs.forEach((s) => { s.t0 = t; t += (s[1] - s[0]) / s[2]; if (s[0] === 0) { s.hold = t; t += HOLD; } });
    R.T = t + OUTRO;
    const tAt = (dd) => { // time at distance dd (after the pool stop for dd past it)
      if (dd <= SAMPLE_AT) return INTRO + dd / R.segs[0][2];
      for (const sg of R.segs.slice(1)) if (dd <= sg[1]) return sg.t0 + (dd - sg[0]) / sg[2];
      return R.T - OUTRO;
    };
    const h0 = R.segs[0].hold;
    // chapter start times: Start, To the pool, Sample, Back off, To the wall, Obstacles, Limbo, Goal, end
    R.tb = [0, INTRO + 0.6, h0, h0 + HOLD, tAt(turn), tAt(wall), tAt(limbo), tAt(goal), R.T];
  });
  // Scroll moves the robot between stops. At a stop (the pool, the underside, the limbo) the moment plays
  // out at its own pace once you get there, even if you stop scrolling; scrolling faster pushes it
  // along, scrolling back rewinds it, and coming back down later plays it again. Nothing locks.
  // Share of the scroll per chapter: Start, To the pool, Sample, Back off, To the wall, Obstacles, Limbo, Goal
  const WEIGHTS = [0.5, 0.7, 1.4, 0.5, 0.5, 1.6, 1.1, 0.8];
  const STOPS = new Set([2, 5, 6]);
  const WSUM = WEIGHTS.reduce((a, b) => a + b, 0);
  const chapterAt = (sp) => {
    let acc = 0;
    for (let k = 0; k < WEIGHTS.length; k++) {
      const w = WEIGHTS[k] / WSUM;
      if (sp < acc + w || k === WEIGHTS.length - 1) return { k, f: clamp((sp - acc) / w), acc, w };
      acc += w;
    }
  };
  const stopClock = {}; // seconds played into each stop
  let lastSp = 0, lastK = -1;
  let which = 0, Rt = routes[0];
  // where the run is at time t: distance along the route, and seconds into the pool stop (-1 = not there)
  const stateAt = (t) => {
    if (t < INTRO) return { d: 0, hold: -1 };
    for (const s of Rt.segs) {
      const dur = (s[1] - s[0]) / s[2];
      if (s.hold !== undefined && t >= s.hold) { if (t < s.hold + HOLD) return { d: s[1], hold: t - s.hold }; continue; }
      if (t < s.t0 + dur) return { d: s[0] + (t - s.t0) * s[2], hold: s[0] >= SAMPLE_AT ? HOLD + 1 : -1 };
    }
    return { d: Rt.pts.length - 1, hold: HOLD + 1 };
  };
  const M_ = () => Rt.marks;
  const phaseOf = (t, d, hold) => {
    if (hold >= 0 && hold <= HOLD) return 2;
    if (t < INTRO + 0.6) return 0;
    if (d < SAMPLE_AT) return 1;
    if (d < M_().turn) return 3;
    if (d < M_().wall) return 4;
    if (d < M_().limbo) return 5;
    if (d < M_().goal) return 6;
    return 7;
  };

  // ---- camera script. Each shot says where the camera sits relative to the robot (azimuth relative to
  // its heading, elevation, distance) or at a fixed spot in the arena; an eased orbit camera blends
  // between them, so it swings rather than cuts.
  //   wide -> chase to the pool -> close on the arm -> pull back -> under the robot looking up ->
  //   ahead of it looking back down the arena -> round the far side of the limbo -> wide
  const SHOT = {
    wide: { world: true },
    chase: { az: Math.PI + 0.5, el: 0.42, r: 0.85 },
    pool: { az: Math.PI / 2 + 0.3, el: 0.62, r: 0.5, fwd: 0.1 },
    back: { az: Math.PI - 0.7, el: 0.72, r: 1.35 },
    under: { az: Math.PI / 2 + 0.2, el: 0.6, r: 0.62 }, // the orbit's pose while the path below takes over
    ahead: { az: 0.15, el: 0.95, r: 1.45 },
    limbo: { fixed: new Vector3(3.6, 0.1, 0.98), y: 0.07 }, // beside the lane, past the bar, low
  };
  const shotOf = (ph, t, d, T) => {
    if (t < INTRO + 0.3 || t > T - OUTRO + 0.3) return "wide";
    if (ph === 2) return "pool";
    if (ph === 1) return "chase";
    if (ph === 3 || ph === 4) return "back";
    if (d < M_().under) return "under";
    if (d < M_().limbo) return "ahead";
    if (d < M_().goal) return "limbo";
    return "wide";
  };

  // ---- tags along the way: why it moves the way it does, and what's powering it. Anchors are in the
  // robot's own (CAD) frame.
  const TAGS = {
    chase: [[[0, -0.045, -0.01], "ArUco marker: the overhead camera sends x, y and heading over Wi-Fi"],
      [[0.11, -0.08, 0.066], "Turns in place: one wheel back, one forward"],
      [[0.083, -0.07, 0.02], "2 × DRV8871 on D3 D5 and D6 D9, PWM capped at 60%"]],
    pool: [[[-0.027, -0.026, 0.065], "2 × SG90 on D11 and A2, 1° steps"],
      [[0, -0.024, 0.161], "HC-SR04 on D7 D8: median of pings = depth"],
      [[0, -0.061, 0.135], "Color sensor: a strong non-black color = polluted"],
      [[-0.014, -0.1, 0.146], "Pump: a MOSFET on D10 switches the 9.6 V pack"]],
    back: [[[0, -0.01, 0.11], "Arm up first, so it clears the rim"],
      [[0, -0.045, -0.04], "Backs straight out, then turns for the top wall"]],
    under: [[[0, -0.064, 0.02], "9.6 V NiMH pack: powers both drivers and the Arduino's VIN"],
      [[0.046, -0.06, 0.062], "DRV8871 driver per motor, on D3 D5 and D6 D9"],
      [[-0.083, -0.08, 0.04], "JGY370 worm-gear motor, one per wheel"],
      [[0, -0.118, -0.046], "Rear caster on a spacer"],
      [[0, -0.068, 0.084], "Front HC-SR04 on D2 A4"]],
    ahead: [[[0, -0.045, -0.01], "Rides the top wall, 12.5 cm off, outside the obstacle rows"],
      [[0, -0.068, 0.084], "Front sonar: an obstacle only after several close pings in a row"]],
    limbo: [[[0, 0.0, 0.0], "12.8 cm tall under an 18.4 cm bar"],
      [[0, -0.01, 0.11], "Arm held low for the bar"]],
  };
  const tagsEl = sec.querySelector(".o3-tags");
  const svgNS = "http://www.w3.org/2000/svg";
  const lsvg = document.createElementNS(svgNS, "svg"); tagsEl.appendChild(lsvg);
  const tagEls = [];
  Object.entries(TAGS).forEach(([shot, list]) => list.forEach(([at, text]) => {
    const path = document.createElementNS(svgNS, "path"); path.setAttribute("class", "o3-lead"); lsvg.appendChild(path);
    const dot = document.createElementNS(svgNS, "circle"); dot.setAttribute("r", "3"); dot.setAttribute("class", "o3-dot"); lsvg.appendChild(dot);
    const el = document.createElement("span"); el.className = "o3-tag r"; el.textContent = text; tagsEl.appendChild(el);
    tagEls.push({ shot, at: new Vector3(...at), path, dot, t: el, w: 0, o: 0 });
  }));

  // ---- camera state
  const overPos = new Vector3(-1.05, 2.75, 1.0), overTgt = new Vector3(1.55, 0, 1.0); // from behind the start end, the gantry framing the arena
  const overPosTall = new Vector3(0.95, 9.4, 1.0005), overTgtTall = new Vector3(0.95, 0, 1.0); // phones: straight down, arena above the card
  const ocam = orbitCam(Vector3);
  const wantTgt = new Vector3(), camPos = new Vector3(), camTgt = new Vector3(), fwd = new Vector3(), tmp = new Vector3(), v = new Vector3();
  const side = new Vector3(), kA = new Vector3(), kB = new Vector3(), kC = new Vector3(), rollUp = new Vector3();
  let rolling = false, rollMix = 0;
  const ROLL = new THREE.CatmullRomCurve3([
    new Vector3(0.06, 0.32, -0.6),   // behind and above
    new Vector3(0.07, 0.04, -0.32),  // low behind, just right of the caster
    new Vector3(0.07, -0.3, -0.02),  // underneath, looking up
    new Vector3(0.06, 0.04, 0.34),   // low out past the front
    new Vector3(0.05, 0.34, 0.62),   // up the other side, looking back at it
  ], false, "centripetal");
  let W = 0, H = 0, wideW = 1;
  const resize = () => {
    W = canvas.clientWidth; H = canvas.clientHeight;
    tagEls.forEach((e) => { e.w = 0; e.hgt = 0; });
    renderer.setSize(W, H, false);
    cam.aspect = W / H;
    if (W >= 760) cam.setViewOffset(W, H, -W * 0.08, H * 0.04, W, H); else cam.clearViewOffset();
    cam.updateProjectionMatrix();
    lsvg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  };
  new ResizeObserver(resize).observe(stage);

  // ---- the screen lock. When the run reaches the top of the screen the page holds still and the run
  // plays at its own pace. Scroll down once to speed it up, again to skip to the end and move on;
  // scroll up to leave. It lets go by itself when the run ends.
  const hint = sec.querySelector(".o3r-hint");
  const skipBtn = sec.querySelector(".o3r-skip");
  let locked = false, lockedAt = 0, lockY = 0, fast = false, released = false, done = false, gestures = 0, lastGesture = 0, prevTop = null;
  const secTop = () => sec.getBoundingClientRect().top + scrollY;
  const site = typeof lenis !== "undefined" ? lenis : null; // main.js's smooth scroller
  const SCROLL_KEYS = { ArrowDown: 1, PageDown: 1, " ": 1, End: 1, ArrowUp: -1, PageUp: -1, Home: -1 };
  let touchY = null;
  const lock = () => {
    locked = true; lockedAt = performance.now(); gestures = 0; fast = false;
    lockY = secTop();
    site?.stop(); site?.scrollTo(lockY, { immediate: true, force: true });
    scrollTo({ top: lockY, behavior: "instant" });
    sec.classList.add("o3r-locked"); sec.classList.remove("o3r-fast");
  };
  const unlock = () => {
    if (!locked) return;
    locked = false; site?.start();
    sec.classList.remove("o3r-locked", "o3r-fast");
  };
  const skip = () => {
    p = 1; done = true; unlock(); released = true;
    const to = secTop() + sec.offsetHeight + 1;
    if (site) site.scrollTo(to, { duration: 0.9 }); else scrollTo({ top: to, behavior: "smooth" });
  };
  const gesture = (dir) => {
    if (!locked) return;
    const now = performance.now();
    if (now - lockedAt < 700) return; // the scroll that brought you here is still coasting
    if (dir < 0) { unlock(); released = true; return; } // scrolling up: let them leave
    if (now - lastGesture < 350) { lastGesture = now; return; } // same gesture, still going
    lastGesture = now;
    gestures++;
    if (gestures === 1) { fast = true; sec.classList.add("o3r-fast"); }
    else skip();
  };
  addEventListener("wheel", (e) => { if (!locked) return; e.preventDefault(); e.stopImmediatePropagation(); gesture(Math.sign(e.deltaY)); }, { passive: false, capture: true });
  addEventListener("touchstart", (e) => { touchY = e.touches[0]?.clientY ?? null; }, { passive: true });
  addEventListener("touchmove", (e) => {
    if (!locked) return;
    e.preventDefault();
    const y = e.touches[0]?.clientY;
    if (touchY != null && y != null && Math.abs(y - touchY) > 24) { gesture(touchY > y ? 1 : -1); touchY = y; }
  }, { passive: false, capture: true });
  addEventListener("keydown", (e) => {
    if (!locked || !(e.key in SCROLL_KEYS) || e.target.closest?.("input, textarea, button")) return;
    e.preventDefault(); gesture(SCROLL_KEYS[e.key]);
  }, { capture: true });
  document.addEventListener("click", (e) => { if (locked && e.target.closest?.('a[href^="#"]')) { unlock(); released = true; } }, { capture: true });
  skipBtn.addEventListener("click", skip);

  let p = 0, last = 0, cur = -1, hudText = "", curShot = "", underMode = false;
  const restart = () => {
    which = 1 - which; Rt.trail.visible = false; Rt = routes[which];
    p = 0; cur = -1; done = false; released = false;
    sec.classList.remove("o3r-done");
    if (Math.abs(sec.getBoundingClientRect().top) < 4) lock();
  };
  replayBtn.addEventListener("click", restart);

  const frame = (time) => {
    if (!W) return;
    const dt = last ? Math.min(0.1, (time - last) / 1000) : 0;
    last = time;
    const T = Rt.T;
    let sp = 0;
    if (RUN_MODE === "scrub") {
      const r_ = sec.getBoundingClientRect(), travel = sec.offsetHeight - stage.offsetHeight;
      sp = travel > 0 ? clamp(-r_.top / travel) : 0;
      const { k, f, w } = chapterAt(sp);
      const t0 = Rt.tb[k], dur = Rt.tb[k + 1] - t0;
      let tt = t0 + dur * f; // between stops: scroll maps straight to time
      if (STOPS.has(k)) {
        // Arriving at a stop picks up from wherever the scroll is. After that, scroll moves the stop's clock
        // by exactly as much as you scroll, in either direction (so smooth-scroll wobble cancels out), and
        // the clock also runs on its own while the stage is on screen.
        if (k !== lastK || stopClock[k] === undefined) stopClock[k] = dur * f;
        else stopClock[k] += ((sp - lastSp) / w) * dur;
        if (r_.top <= 1 && r_.bottom >= innerHeight - 1) stopClock[k] += dt;
        stopClock[k] = clamp(stopClock[k], 0, dur);
        tt = t0 + stopClock[k];
      }
      STOPS.forEach((st) => { if (st !== k) delete stopClock[st]; }); // a stop plays again next time you reach it
      lastSp = sp; lastK = k;
      p += (tt / T - p) * (dt ? 1 - Math.exp(-dt / 0.22) : 1); // eased, so scroll steps don't jolt it
    } else {
      // lock when the section's top crosses the top of the screen, from either direction
      const top = sec.getBoundingClientRect().top;
      if (!locked && !done && !released && prevTop !== null && Math.sign(prevTop) !== Math.sign(top || 1) && Math.abs(top) < innerHeight * 0.9) lock();
      if (Math.abs(top) > innerHeight * 1.2) released = false; // away from the section: arm the lock again
      prevTop = top;
      if (locked && Math.abs(scrollY - lockY) > 2) scrollTo({ top: lockY, behavior: "instant" }); // scrollbar drags
      if (locked && p < 1) p = Math.min(1, p + (dt / T) * (fast ? 3 : 1));
      if (p >= 1 && !done) { done = true; unlock(); }
    }
    const t = p * T;
    const { d, hold } = stateAt(t);

    // place the robot, gliding between the route's 5 mm samples
    const n1 = Rt.pts.length - 1, i = Math.min(n1, Math.floor(d)), j = Math.min(n1, i + 1), fr = Math.min(1, d - i);
    const mx = Rt.pts[i][0] + (Rt.pts[j][0] - Rt.pts[i][0]) * fr, my = Rt.pts[i][1] + (Rt.pts[j][1] - Rt.pts[i][1]) * fr;
    const headDeg = Rt.head[i] + diff(Rt.head[i], Rt.head[j]) * fr;
    const head = headDeg * Math.PI / 180;
    carrier.position.set(mx * U, 0, my * U);
    carrier.rotation.y = Math.atan2(Math.cos(head), Math.sin(head));
    RB.wheels[0].rotation.x = Rt.wl[i] + (Rt.wl[j] - Rt.wl[i]) * fr; RB.wheels[1].rotation.x = Rt.wr[i] + (Rt.wr[j] - Rt.wr[i]) * fr;
    poolG.position.set(Rt.pool[0], 0, Rt.pool[1]);
    Rt.trail.visible = true;
    Rt.trail.geometry.setDrawRange(0, Math.max(0, i - 1) * 6);

    // the mission at the pool: arm down, depth pings, color, pump, arm up (10 s)
    const h = hold, atPoolNow = h >= 0 && h <= HOLD;
    const armDown = atPoolNow ? sm(0, 1.4, h) * (1 - sm(HOLD - 1.4, HOLD, h)) : 0;
    RB.setArm(-0.35 * (1 - armDown));
    const ping = h >= 1.5 && h <= 3.6 ? 1 : 0;
    const sec_ = time / 1000;
    RB.sonar.material.opacity = ping * (0.18 + 0.12 * Math.sin(sec_ * 9));
    const flow = h < 0 ? 0 : sm(5.0, 7.8, Math.min(h, HOLD));
    RB.bend.uCut.value = 0.15 - flow * 0.16;
    RB.setFlow(flow);
    ripples.forEach((m, k) => {
      const ph_ = (sec_ * 0.9 + k / 3) % 1;
      m.scale.setScalar(0.004 + ph_ * 0.05);
      m.material.opacity = (h >= 1.4 && h <= 8 ? 1 : 0) * (1 - ph_) * 0.55;
    });
    RB.nets.sonar && (RB.nets.sonar.emissiveIntensity = ping ? 0.7 : 0);
    RB.nets.pump && (RB.nets.pump.emissiveIntensity = h >= 5 && h <= 7.8 ? 0.7 : 0);
    RB.nets.arm && (RB.nets.arm.emissiveIntensity = (h >= 0 && h < 1.4) || (h > HOLD - 1.4 && h <= HOLD) ? 0.7 : 0);
    const driving = !atPoolNow && p < 1 && t > INTRO;
    RB.nets.drive && (RB.nets.drive.emissiveIntensity = driving ? 0.35 : 0);
    RB.sync();

    // camera
    fwd.set(Math.sin(carrier.rotation.y), 0, Math.cos(carrier.rotation.y));
    const ph = phaseOf(t, d, hold);
    const shot = shotOf(ph, t, d, T);
    if (shot !== curShot) { curShot = shot; tagEls.forEach((e) => { e.since = time; }); }
    const S = SHOT[shot];
    const narrow = cam.aspect < 1 ? Math.min(1.9, 1.05 / cam.aspect) : 1;
    wantTgt.copy(carrier.position).addScaledVector(fwd, S.fwd || 0.02).setY(S.y ?? 0.045);
    let az, el, r;
    if (S.fixed) { // a spot in the arena, looking at the robot
      tmp.copy(S.fixed).sub(wantTgt); r = tmp.length(); az = Math.atan2(tmp.x, tmp.z); el = Math.asin(tmp.y / r);
    } else if (S.world) { // the wide shot keeps the orbit near the robot so it can swing out from there
      az = carrier.rotation.y + Math.PI; el = 0.6; r = 1.2;
    } else { az = carrier.rotation.y + S.az; el = S.el; r = S.r * narrow; }
    az += 0.06 * Math.sin(time / 3900); el += 0.02 * Math.sin(time / 5200); // a little drift, so it's never dead still
    const st = ocam.to(az, el, r, wantTgt, dt, 0.55);
    ocam.place(cam, camPos);
    camTgt.copy(st.tgt);
    // Going under, as one barrel roll: the camera glides in low from behind, just right of the caster,
    // rolls as it passes underneath (that's where it looks up at the underside), keeps rolling out past
    // the front and comes up the other side upright, then turns back into the look-down shot.
    // The path rides along with the robot; it lingers a moment underneath, then speeds out.
    const mk = M_(), exitLen = (mk.limbo - mk.under) * 0.62;
    let u = -1;
    if (hold > HOLD && d >= mk.wall && d < mk.under) { const e_ = (d - mk.wall) / (mk.under - mk.wall); u = 0.5 * smoother(e_); }
    else if (d >= mk.under && d < mk.under + exitLen) { const x_ = (d - mk.under) / exitLen; u = 0.5 + 0.5 * smoother(x_); }
    rolling = u >= 0;
    if (rolling) {
      side.set(fwd.z, 0, -fwd.x);
      ROLL.getPoint(u, tmp);
      const pos = kA.copy(carrier.position).addScaledVector(side, tmp.x).addScaledVector(fwd, tmp.z).setY(tmp.y);
      // ease in from the orbit at the start and back out to it at the end
      const into = smoother(clamp(u / 0.12)), outof = smoother(clamp((u - 0.88) / 0.12));
      camPos.lerp(pos, into * (1 - outof));
      camTgt.lerp(kB.copy(carrier.position).setY(0.05), into * (1 - outof));
      // a stable "up" that never lines up with the view, then the roll on top of it
      kC.copy(camTgt).sub(camPos).normalize();
      rollUp.crossVectors(kC, side).normalize().applyAxisAngle(kC, Math.PI * smoother(clamp(u)));
      rollMix = into * (1 - outof);
    }
    // the wide shot: overview of the arena, from above on tall phone screens
    // (set by the run's time, not eased frame by frame, so it's right wherever the run is)
    wideW = Math.max(1 - smoother(clamp((t - INTRO + 0.3) / 2)), smoother(clamp((t - (T - OUTRO - 0.4)) / 2)));
    const wide = wideW;
    const tall = cam.aspect < 1;
    camPos.lerp(tall ? overPosTall : overPos, wide); camTgt.lerp(tall ? overTgtTall : overTgt, wide);
    // a tall screen looks straight down with the arena's long side running up the screen
    cam.up.set(0, 1, 0); if (tall) cam.up.lerp(tmp.set(1, 0, 0), wide).normalize();
    if (rolling && rollMix > 0) cam.up.lerp(rollUp, rollMix).normalize();
    cam.position.copy(camPos); cam.lookAt(camTgt);
    // Under the floor, the arena would only get in the way: show just the robot, seen from below.
    arena.visible = camPos.y > 0.002;
    link.visible = packet.visible = arena.visible;

    // how it knows where it is: the overhead camera reads the ArUco marker and sends x, y and heading
    la.copy(ohc.position).setY(ohc.position.y - 0.05); lb.copy(carrier.position).setY(0.13);
    setLine(link, la, lb);
    linkMat.opacity = ph <= 1 ? 0.75 : 0.22;
    packet.position.copy(la).lerp(lb, (time / 600) % 1);
    packet.visible = p < 1 && arena.visible;
    guideMat.opacity = ph === 1 ? 0.8 : 0;
    if (ph === 1) { la.copy(carrier.position).setY(0.01); lb.set(Rt.pool[0], 0.01, Rt.pool[1]); setLine(guide, la, lb); }
    // what's ahead: the front HC-SR04
    RB.fus.updateMatrixWorld(); fusW.setFromMatrixPosition(RB.fus.matrixWorld);
    const ahead = rayHit(fusW.x, fusW.z, fwd.x, fwd.z);
    frontPing.position.copy(fusW); frontPing.rotation.set(0, carrier.rotation.y, 0);
    frontPing.scale.set(1, 1, Math.min(ahead, 1.2)); pingMat.opacity = driving ? 0.1 + 0.06 * Math.sin(time / 120) : 0;
    renderer.render(scene, cam);

    // tags for the current shot, once the camera has settled on it
    const placed = [];
    tagEls.forEach((T_) => {
      const want = T_.shot === shot && time - (T_.since || 0) > 900 && (T_.shot !== "under" || camPos.y < -0.05) ? 1 : 0;
      T_.o += (want - T_.o) * (dt ? 1 - Math.exp(-dt / 0.25) : 1);
      let o = T_.o;
      if (o > 0.02) { v.copy(T_.at).applyMatrix4(RB.root.matrixWorld).project(cam); if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) o = 0; }
      T_.t.style.opacity = T_.path.style.opacity = T_.dot.style.opacity = o.toFixed(3);
      if (o < 0.02) return;
      const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H;
      const tw = T_.w ||= T_.t.offsetWidth, th = T_.hgt ||= T_.t.offsetHeight, reach = W < 600 ? 22 : 46;
      let side = x > W * 0.5 ? "r" : "l";
      if (side === "r" && x + reach + 6 + tw > W - 8) side = "l";
      else if (side === "l" && x - reach - 6 - tw < 8) side = "r";
      T_.t.classList.toggle("l", side === "l"); T_.t.classList.toggle("r", side === "r");
      const dx = side === "r" ? reach : -reach;
      let ty = y - 26;
      const lx = side === "r" ? x + dx + 6 : x + dx - 6 - tw;
      for (let k = 0; k < 8; k++) {
        const hit = placed.find((q) => lx < q.x + q.w + 6 && lx + tw + 6 > q.x && ty - 10 < q.y + q.h && ty - 10 + th > q.y);
        if (!hit) break;
        ty = hit.y + hit.h + 10 + 4;
      }
      placed.push({ x: lx, y: ty - 10, w: tw, h: th });
      T_.dot.setAttribute("cx", x.toFixed(1)); T_.dot.setAttribute("cy", y.toFixed(1));
      T_.path.setAttribute("d", `M${x.toFixed(1)},${y.toFixed(1)} L${(x + dx * 0.5).toFixed(1)},${ty.toFixed(1)} H${(x + dx).toFixed(1)}`);
      T_.t.style.transform = `translate(${(x + dx + (side === "r" ? 6 : -6)).toFixed(1)}px, ${(ty - 10).toFixed(1)}px)`;
    });

    // chapter card, bar and readout
    if (ph !== cur) {
      cur = ph;
      steps.forEach((li, k) => li.classList.toggle("on", k === ph));
      bar.forEach((b, k) => b.classList.toggle("on", k === ph));
    }
    const lines = [`Vision   x ${(mx * U).toFixed(2)} m  y ${((400 - my) * U).toFixed(2)} m  θ ${Math.round(((-headDeg % 360) + 540) % 360 - 180)}°`];
    lines.push(`Front    ${ahead < 4 ? (ahead * 100).toFixed(0) + " cm" : "no echo, clear"}`);
    if (atPoolNow) lines.push(h < 1.4 ? "Arm      lowering, 1° steps" : h < 3.6 ? "Depth    pinging, keeping the median" : h < 5 ? "Color    no strong color: clean" : h < 7.8 ? "Pump     on, D10" : "Arm      raising");
    else lines.push(ph <= 1 ? "Target   the pool" : ph >= 7 ? "Target   goal zone" : ph >= 6 ? "Target   limbo lane" : "Target   top wall, then goal");
    const txt = lines.join("\n");
    if (txt !== hudText) { hudText = txt; hud.textContent = txt; }
    if (hint) {
      const atStop = RUN_MODE === "scrub" && STOPS.has(chapterAt(sp).k);
      const msg = RUN_MODE === "scrub" ? (sp < 0.02 ? "Scroll to drive the course." : atStop && p * T < Rt.tb[chapterAt(sp).k + 1] - 0.3 ? "Playing. Keep scrolling to move on." : "")
        : !locked ? "" : fast ? "Speeding up. Scroll again to skip." : "Scroll to speed up, twice to skip.";
      if (hint.textContent !== msg) hint.textContent = msg;
    }
    if (sec.classList.contains("o3r-done") !== done) sec.classList.toggle("o3r-done", done);
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

  // crown: six panels meeting at a top button, with a center-front seam. The opening is an oval about
  // the size of a head (20 cm front to back, 17 cm across); a mid-profile crown is about 10 cm tall.
  // The back panel has the usual arch with a strap across it; a sweatband runs around the inside.
  const RX = 0.085, RY = 0.1, RZ = 0.1;
  const crown = part("crown", [0, 0, 0], [0, 0.15, -0.02]);
  // a point on the crown: th = angle around (0 = center front, +x to the side), ph = 0 at the base, PI/2 at the button
  const crownPt = (th, ph, s = 1, out = new Vector3()) => {
    const c = Math.pow(Math.cos(ph), 0.72), sy = Math.pow(Math.sin(ph), 0.95);
    const front = 1 - 0.06 * Math.max(0, Math.cos(th)) * Math.sin(ph); // structured front panels stand a little flatter
    return out.set(RX * Math.sin(th) * c * s, RY * sy * s, RZ * Math.cos(th) * c * front * s);
  };
  const ARCH = (th, ph) => Math.abs(angDiff(th, Math.PI)) < 0.42 * (1 - ph / 0.36) && ph < 0.36; // the back opening
  const crownGeo = (s) => {
    const NT = 96, NP = 36, pos = [], idx = [];
    for (let j = 0; j <= NP; j++) for (let i = 0; i <= NT; i++) { crownPt((i / NT) * Math.PI * 2, (j / NP) * Math.PI / 2, s, tmpV); pos.push(tmpV.x, tmpV.y, tmpV.z); }
    for (let j = 0; j < NP; j++) for (let i = 0; i < NT; i++) {
      const th = ((i + 0.5) / NT) * Math.PI * 2, ph = ((j + 0.5) / NP) * Math.PI / 2;
      if (ARCH(th, ph)) continue;
      const a = j * (NT + 1) + i, b = a + 1, c = a + NT + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  const tmpV = new Vector3();
  crown.g.add(new Mesh(crownGeo(1), fabric));
  crown.g.add(new Mesh(crownGeo(0.985), std("#2c343c", { roughness: 1, side: THREE.BackSide })));
  // seams: six, from the button down, each with a line of stitching either side
  for (let k = 0; k < 6; k++) {
    const th = (k / 6) * Math.PI * 2;
    for (const off of [0, -0.035, 0.035]) {
      const pts = [];
      for (let i = 0; i <= 30; i++) {
        const ph = Math.PI / 2 - (i / 30) * (Math.PI / 2 - 0.02);
        if (k === 3 && ARCH(th + off, ph)) break; // the back seam stops at the arch
        pts.push(crownPt(th + off * Math.cos(ph) ** 0.2, ph, 1.004));
      }
      if (pts.length > 2) crown.g.add(new Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, off ? 0.0004 : 0.0009, 5), off ? seamMat : fabricDk));
    }
  }
  const button = new Mesh(new THREE.SphereGeometry(0.009, 24, 12), fabricDk); button.scale.y = 0.45; button.position.y = RY; crown.g.add(button);
  for (let k = 0; k < 6; k++) { // an embroidered eyelet on each panel
    const th = ((k + 0.5) / 6) * Math.PI * 2;
    const e = new Mesh(new THREE.TorusGeometry(0.0028, 0.0009, 8, 20), seamMat);
    crownPt(th, 1.0, 1.003, e.position); e.lookAt(e.position.clone().multiplyScalar(2)); crown.g.add(e);
  }
  // sweatband inside the base, and the strap across the back arch
  const sweat = new Mesh(new THREE.CylinderGeometry(1, 1, 0.012, 64, 1, true), std("#20272e", { roughness: 1, side: THREE.DoubleSide }));
  sweat.scale.set(RX * 0.975, 1, RZ * 0.975); sweat.position.y = 0.006; crown.g.add(sweat);
  const strapPts = [];
  for (let i = 0; i <= 16; i++) { const th = Math.PI - 0.42 + (i / 16) * 0.84; strapPts.push(crownPt(th, 0.03, 1.006)); }
  const strap = new Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(strapPts), 16, 0.004, 6), fabricDk); strap.scale.y = 0.6; crown.g.add(strap);
  const snap = new Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.004), std("#20272e")); snap.position.copy(crownPt(Math.PI, 0.035, 1.012)); crown.g.add(snap);

  // brim (bill): its inner edge follows the front half of the crown's base, where it's stitched on; it
  // reaches 7 cm (2.75 in) out at center front, tapers into the crown at the sides, and is pre-curved.
  // Top ply, stiffener and bottom ply read as one 4 mm board with rows of stitching parallel to the edge.
  const brim = part("brim", [0, 0, 0], [0, -0.01, 0.07]);
  const BL = 0.07, SPAN = 1.3; // reach at center front; half-angle of the attached arc (radians)
  const brimPt = (u, f, out = new Vector3()) => { // u -1..1 across, f 0 (crown seam) .. 1 (outer edge)
    const th = u * SPAN, base = crownPt(th, 0, 1.0);
    const L = BL * Math.pow(Math.max(0, Math.cos(th * 1.18)), 0.9) * f; // tapers into the crown at the sides
    const dir = 0.55 * Math.atan2(Math.sin(th) * RZ, Math.cos(th) * RX); // between the oval's normal and straight ahead
    out.set(base.x + Math.sin(dir) * L, 0, base.z + Math.cos(dir) * L);
    out.y = -2.6 * out.x * out.x * f - 0.14 * L + 0.002; // curved down at the sides, pitched down a little
    return out;
  };
  {
    const NU = 60, NF = 10, T = 0.004, pos = [], idx = [];
    const v = new Vector3();
    for (const side of [0, 1]) for (let j = 0; j <= NF; j++) for (let i = 0; i <= NU; i++) {
      brimPt(-1 + (2 * i) / NU, j / NF, v); pos.push(v.x, v.y - side * T, v.z);
    }
    const row = NU + 1, layer = row * (NF + 1);
    for (let j = 0; j < NF; j++) for (let i = 0; i < NU; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, b, c, b, d, c); // top
      idx.push(layer + a, layer + c, layer + b, layer + b, layer + c, layer + d); // bottom
    }
    for (let i = 0; i < NU; i++) { // outer edge band
      const a = NF * row + i, b = a + 1;
      idx.push(a, layer + a, b, b, layer + a, layer + b);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    brim.g.add(new Mesh(g, std("#4a5764", { roughness: 0.95, side: THREE.DoubleSide })));
    for (let r = 0; r < 7; r++) { // stitch rows
      const f = 0.32 + r * 0.1, pts = [];
      for (let i = 0; i <= 40; i++) { brimPt(-0.92 + (1.84 * i) / 40, f, v); pts.push(v.clone().setY(v.y + 0.0006)); }
      brim.g.add(new Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.00035, 4), seamMat));
    }
    // the seam where the bill meets the crown
    const pts = []; for (let i = 0; i <= 40; i++) { brimPt(-1 + (2 * i) / 40, 0.02, v); pts.push(v.clone().setY(v.y + 0.001)); }
    brim.g.add(new Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0012, 5), fabricDk));
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

  // the shot: the camera looks down at a dining-hall tray with one plate: rice, sliced grilled chicken
  // and broccoli
  const tray = new Group(); tray.position.set(0.04, -0.3, 0.26); scene.add(tray);
  {
    const ts = new THREE.Shape(), TW = 0.18, TD = 0.135, TR = 0.025;
    ts.moveTo(-TW + TR, -TD); ts.lineTo(TW - TR, -TD); ts.quadraticCurveTo(TW, -TD, TW, -TD + TR); ts.lineTo(TW, TD - TR); ts.quadraticCurveTo(TW, TD, TW - TR, TD);
    ts.lineTo(-TW + TR, TD); ts.quadraticCurveTo(-TW, TD, -TW, TD - TR); ts.lineTo(-TW, -TD + TR); ts.quadraticCurveTo(-TW, -TD, -TW + TR, -TD);
    const tg = new THREE.ExtrudeGeometry(ts, { depth: 0.008, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 3 });
    tg.rotateX(-Math.PI / 2);
    tray.add(new Mesh(tg, std("#8f9aa3", { roughness: 0.55 })));
  }
  const plateG = new Group(); plateG.position.y = 0.013; tray.add(plateG);
  { // a 26 cm plate: flat well, raised rim
    const prof = [[0, 0], [0.085, 0], [0.095, 0.004], [0.118, 0.013], [0.13, 0.016], [0.131, 0.018], [0.128, 0.019], [0.116, 0.016], [0.094, 0.007], [0.084, 0.003], [0, 0.003]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    plateG.add(new Mesh(new THREE.LatheGeometry(prof, 64), std("#f4f2ec", { roughness: 0.25 })));
  }
  // rice: a few hundred grains piled into a mound
  {
    const grain = new THREE.CapsuleGeometry(0.0011, 0.004, 3, 6);
    const n = 420, rice = new THREE.InstancedMesh(grain, std("#f6f1e2", { roughness: 0.6 }), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new Vector3(), one = new Vector3(1, 1, 1);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 0.045;
      const hgt = 0.022 * (1 - (rr / 0.045) ** 2) * (0.75 + 0.25 * rnd());
      pv.set(-0.035 + Math.cos(a) * rr, 0.004 + hgt * rnd() ** 0.3, -0.02 + Math.sin(a) * rr * 0.85);
      e.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI); q.setFromEuler(e);
      rice.setMatrixAt(i, m4.compose(pv, q, one));
    }
    plateG.add(rice);
  }
  // grilled chicken: three slices with grill marks
  {
    const gc = document.createElement("canvas"); gc.width = 256; gc.height = 128;
    const g = gc.getContext("2d"); const grd = g.createLinearGradient(0, 0, 0, 128); grd.addColorStop(0, "#c98a4b"); grd.addColorStop(1, "#b0703a");
    g.fillStyle = grd; g.fillRect(0, 0, 256, 128); g.strokeStyle = "rgba(60,30,12,.85)"; g.lineWidth = 9;
    for (let x = -60; x < 300; x += 46) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 70, 128); g.stroke(); }
    const tex = new THREE.CanvasTexture(gc); tex.colorSpace = THREE.SRGBColorSpace;
    const meat = new Std({ map: tex, roughness: 0.65 }), side_ = std("#e9d3b4", { roughness: 0.7 });
    [[0.035, 0.03, 0.3], [0.05, 0.004, 0.18], [0.062, -0.022, 0.05]].forEach(([x, z, ry]) => {
      const sl = new Mesh(new THREE.BoxGeometry(0.06, 0.011, 0.022, 4, 1, 2), [side_, side_, meat, side_, side_, side_]);
      const pp = sl.geometry.attributes.position; // round the slice's ends a little
      for (let i = 0; i < pp.count; i++) { const x_ = pp.getX(i), y_ = pp.getY(i); pp.setY(i, y_ - (x_ / 0.03) ** 2 * 0.0025 * (y_ > 0 ? 1 : 0)); }
      sl.geometry.computeVertexNormals();
      sl.position.set(x, 0.0095, z); sl.rotation.set(0, ry, 0.12); plateG.add(sl);
    });
  }
  // broccoli: florets, each a pale stem and a clustered dark-green head
  {
    const stemM = std("#a9c27a", { roughness: 0.7 }), headM = std("#3f6b2c", { roughness: 0.95 }), headM2 = std("#557f37", { roughness: 0.95 });
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    [[-0.045, 0.055], [-0.02, 0.07], [-0.065, 0.035], [0.0, 0.058]].forEach(([x, z]) => {
      const f = new Group(); f.position.set(x, 0.004, z); f.rotation.set(0.9 + rnd() * 0.4, rnd() * 6, 0); plateG.add(f);
      const st = new Mesh(new THREE.CylinderGeometry(0.004, 0.0055, 0.016, 10), stemM); st.position.y = 0.008; f.add(st);
      for (let i = 0; i < 16; i++) {
        const b = new Mesh(new THREE.SphereGeometry(0.004 + rnd() * 0.002, 10, 8), rnd() > 0.5 ? headM : headM2);
        const a = rnd() * Math.PI * 2, rr = rnd() * 0.009;
        b.position.set(Math.cos(a) * rr, 0.018 + (0.009 - rr) * 0.7 + rnd() * 0.002, Math.sin(a) * rr); f.add(b);
      }
    });
  }
  const coneMat = new THREE.MeshBasicMaterial({ color: "#e0965a", transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const cone = new Mesh(new THREE.ConeGeometry(1, 1, 4, 1, true), coneMat);
  cone.geometry.translate(0, -0.5, 0); cone.geometry.rotateX(-Math.PI / 2); // apex at the lens, opening along +z
  scene.add(cone);

  // labels, one per part, shown while the cap is apart
  const svgNS = "http://www.w3.org/2000/svg";
  const lsvg = document.createElementNS(svgNS, "svg"); tagsEl.appendChild(lsvg);
  const names = { crown: "Crown", bat: "500 mAh LiPo", tp: "Touch pad", sw: "Slide switch", brim: "Brim", xiao: "XIAO ESP32S3 Sense", ant: "Wi-Fi antenna", led: "Recording LED" };
  const anchors = { crown: [0.03, RY * 0.9, 0.04], brim: [0.045, -0.004, 0.145] };
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
