// OTV in 3D: the team's Onshape CAD (models/otv.glb), with the electronics added from photos.
// The stage pins while you scroll; the camera moves between six stops and each stop has a
// chapter card, labels on the parts and its own small animation (wheels, arm, sonar, pump).
// three.js and the model load only when the section is close. Without WebGL, or with
// reduced motion, the chapters show as a plain list over a still view.
const sec = document.querySelector(".o3");
if (sec) boot();

function boot() {
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let gl = false;
  try { gl = !!document.createElement("canvas").getContext("webgl2"); } catch (e) {}
  if (!gl) { sec.classList.add("o3-off"); return; }
  sec.classList.add(REDUCED ? "o3-still" : "o3-live");
  if (!REDUCED) dispatchEvent(new Event("resize")); // the section just got taller: let the margin trace re-measure
  const io = new IntersectionObserver((es) => {
    if (!es.some((e) => e.isIntersecting)) return;
    io.disconnect();
    start(REDUCED).catch((err) => { console.warn("otv3d", err); sec.classList.remove("o3-live", "o3-still"); sec.classList.add("o3-off"); dispatchEvent(new Event("resize")); });
  }, { rootMargin: "150% 0px" });
  io.observe(sec);
}

async function start(REDUCED) {
  const V = "./vendor/three-0.170.0/";
  const [THREE, { GLTFLoader }, { MeshoptDecoder }, { RoomEnvironment }] = await Promise.all([
    import(V + "three.module.min.js"), import(V + "GLTFLoader.js"), import(V + "meshopt_decoder.module.js"), import(V + "RoomEnvironment.js"),
  ]);
  const { Vector3, Group, Mesh, MeshStandardMaterial: Std } = THREE;
  const stage = sec.querySelector(".o3-stage");
  const canvas = sec.querySelector("canvas");
  const tagsEl = sec.querySelector(".o3-tags");
  const steps = [...sec.querySelectorAll(".o3-steps li")];
  const bar = [...sec.querySelectorAll(".o3-bar span")];

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3a32, 0.7));
  const key = new THREE.DirectionalLight(0xfff4e6, 1.5);
  key.position.set(0.5, 1, 0.35);
  scene.add(key);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.005, 5);

  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync("models/otv.glb");
  const robot = gltf.scene;
  scene.add(robot);
  robot.updateMatrixWorld(true);
  const M = (n) => robot.getObjectByName(n);

  // Real colours, from the photos: pine deck, black wheels, green motor mounts, purple servo holders.
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

  // ---- moving parts
  // Pivot a part about a centre, keeping where it is now (the meshes carry quantization transforms).
  const pivot = (objs, c, axis = "x") => {
    const g = new Group();
    g.position.copy(c);
    robot.add(g);
    g.updateMatrixWorld(true);
    objs.forEach((o) => o && g.attach(o));
    g.userData.axis = axis;
    return g;
  };
  const wheels = [pivot([M("m11")], new Vector3(-0.1025, -0.0814, 0.0659)), pivot([M("m12")], new Vector3(0.102, -0.0814, 0.0659))];
  const PIV = new Vector3(0, -0.0267, 0.0699); // servo shafts
  const arm = pivot([M("m9"), M("m2"), M("m7"), M("m5"), M("m19")], PIV);

  // Bend shader: the tube and the sonar wire follow the arm near its tip and stay put near the pump,
  // blending in between, so nothing tears when the arm swings. Also fills the tube with water.
  const bend = { uAng: { value: 0 }, uPiv: { value: new THREE.Vector2(PIV.y, PIV.z) }, uZ0: { value: 0.045 }, uZ1: { value: 0.085 },
    uCut: { value: 1 }, uWater: { value: new THREE.Color("#3b8fd6") } };
  const bendable = (mat, water) => {
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, bend);
      sh.vertexShader = "uniform float uAng; uniform vec2 uPiv; uniform float uZ0, uZ1; varying vec3 vW;\n" + sh.vertexShader.replace("#include <project_vertex>", `
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
        float a = uAng * smoothstep(uZ0, uZ1, wp.z);
        vec2 r = wp.yz - uPiv; float c = cos(a), s = sin(a);
        wp.yz = uPiv + vec2(r.x * c - r.y * s, r.x * s + r.y * c);
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;`);
      sh.fragmentShader = "uniform float uCut; uniform vec3 uWater; varying vec3 vW;\n" + sh.fragmentShader.replace("#include <color_fragment>",
        "#include <color_fragment>\n" + (water ? "if (vW.z > uCut) diffuseColor.rgb = mix(diffuseColor.rgb, uWater, 0.8);" : ""));
    };
    return mat;
  };
  bendable(paint.m8, true);

  // ---- the pool, with water
  const POOL = new Vector3(0.0027, -0.074, 0.167);
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
  // sonar cone, from the HC-SR04 at the arm tip down to the water
  const sonarH = 0.06;
  const sonar = new Mesh(new THREE.ConeGeometry(0.016, sonarH, 32, 1, true), new THREE.MeshBasicMaterial({ color: "#e0965a", transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  sonar.position.set(0, -0.031 - sonarH / 2 + 0.002, 0.161);
  scene.add(sonar);

  // ---- electronics, from the photos (not in the CAD)
  const TOP = -0.0501; // deck top
  const box = (w, h, d, mat, x, y, z, parent = scene) => { const m = new Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; };
  const uno = new Group(); scene.add(uno);
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
  const bb = new Group(); scene.add(bb);
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

  // ---- copper wires: one net per subsystem, lit when its chapter is on
  const copper = () => new Std({ color: "#c27434", metalness: 1, roughness: 0.32, emissive: "#ff8a3d", emissiveIntensity: 0 });
  const nets = {};
  const wire = (net, pts, bendIt) => {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new Vector3(...p)), false, "centripetal");
    const mat = nets[net] ||= copper();
    if (bendIt && !mat.userData.bent) { bendable(mat, false); mat.userData.bent = true; }
    const m = new Mesh(new THREE.TubeGeometry(curve, 64, 0.0009, 8, false), mat);
    scene.add(m);
    return m;
  };
  const U = (dx, dz) => [UNO.x + dx, UNO.y + 0.0095, UNO.z + dz];
  const B = (dx, dz) => [BB.x + dx, BB.y + 0.005, BB.z + dz];
  wire("drive", [U(-0.02, 0.0245), [-0.088, -0.036, 0.03], [-0.095, -0.05, 0.022], [-0.09, -0.066, 0.012], [-0.083, -0.07, 0.008]]);
  wire("drive", [B(0.03, 0.02), [0.09, -0.04, 0.03], [0.095, -0.05, 0.022], [0.09, -0.066, 0.012], [0.083, -0.07, 0.008]]);
  wire("arm", [U(0.02, 0.0245), [-0.032, -0.034, 0.038], [-0.03, -0.031, 0.048]]);
  wire("arm", [B(-0.03, 0.024), [0.026, -0.034, 0.038], [0.024, -0.031, 0.048]]);
  wire("sonar", [U(0.026, 0.0245), [-0.022, -0.03, 0.045], [-0.016, -0.014, 0.066], [-0.013, -0.0085, 0.09], [-0.011, -0.0075, 0.125], [-0.008, -0.0085, 0.152]], true);
  wire("pump", [B(-0.008, -0.004), [0.006, -0.025, 0.006], [-0.002, -0.0205, 0.012], [-0.008, -0.0208, 0.017]]);
  wire("vision", [U(-0.028, -0.012), [-0.09, -0.035, -0.01]]); // Wi-Fi antenna side, kept short

  // ---- soft contact shadow
  const sh = document.createElement("canvas"); sh.width = sh.height = 128;
  { const x = sh.getContext("2d"); const g = x.createRadialGradient(64, 64, 4, 64, 64, 64); g.addColorStop(0, "rgba(0,0,0,.42)"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }
  const shadow = new Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, -0.1213, 0.08); scene.add(shadow);

  // ---- shots: camera position, target, and labels (3D anchor, text, which side)
  const shots = [
    { pos: [0.33, 0.13, 0.4], tgt: [0, -0.065, 0.075],
      tags: [[[0.07, TOP, -0.045], "Plywood deck", "r"], [[0, -0.008, 0.12], "Sampling arm", "r"], [[0.06, -0.058, 0.215], "Pool", "r"]] },
    { pos: [0.3, 0.02, -0.17], tgt: [0.05, -0.08, 0.02],
      tags: [[[0.108, -0.06, 0.08], "8 cm wheel, direct drive", "r"], [[0.083, -0.068, 0.008], "JGY370 worm gear, 6 V, 30 RPM", "r"], [[0, -0.107, -0.047], "Rear caster", "l"]] },
    { pos: [0.02, 0.24, -0.15], tgt: [0, -0.05, 0.012],
      tags: [[[UNO.x, UNO.y, UNO.z], "Arduino UNO R4 WiFi", "r"], [[BB.x - 0.008, BB.y + 0.02, BB.z], "Pump MOSFET", "r"], [[-0.009, -0.021, 0.017], "Peristaltic pump", "r"]] },
    { pos: [-0.3, 0.05, 0.17], tgt: [0, -0.03, 0.09],
      tags: [[[-0.027, -0.026, 0.065], "2 × SG90 servo", "l"], [[0, -0.01, 0.11], "Sampling arm", "r"], [[0, -0.055, 0.135], "Sensors at the tip", "r"]] },
    { pos: [0.16, 0.0, 0.37], tgt: [0, -0.055, 0.15],
      tags: [[[0, -0.024, 0.161], "HC-SR04", "r"], [[0.04, POOL.y, 0.19], "20, 30 or 40 mm deep", "r"]] },
    { pos: [-0.12, 0.2, 0.31], tgt: [0, -0.045, 0.095],
      tags: [[[-0.009, 0.004, 0.1], "Sample line", "l"], [[-0.009, -0.021, 0.017], "Pump, on D10", "r"]] },
  ];
  const N = shots.length;
  shots.forEach((s) => { s.pos = new Vector3(...s.pos); s.tgt = new Vector3(...s.tgt); });

  // labels: one SVG for the leaders, one span per label
  const svgNS = "http://www.w3.org/2000/svg";
  const lsvg = document.createElementNS(svgNS, "svg");
  tagsEl.appendChild(lsvg);
  shots.forEach((s, si) => {
    s.els = s.tags.map(([at, text, side]) => {
      const path = document.createElementNS(svgNS, "path"); path.setAttribute("class", "o3-lead"); lsvg.appendChild(path);
      const dot = document.createElementNS(svgNS, "circle"); dot.setAttribute("r", "3"); dot.setAttribute("class", "o3-dot"); lsvg.appendChild(dot);
      const t = document.createElement("span"); t.className = "o3-tag " + side; t.textContent = text; tagsEl.appendChild(t);
      return { at: new Vector3(...at), path, dot, t, side };
    });
  });

  // ---- layout
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
    dirty = true;
  };
  let dirty = true;
  new ResizeObserver(resize).observe(stage);

  const ease = (t) => t * t * (3 - 2 * t);
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const sm = (a, b, v) => ease(clamp((v - a) / (b - a)));
  const tmpP = new Vector3(), tmpT = new Vector3(), v = new Vector3();

  const progress = () => {
    if (REDUCED) return 0;
    const r = sec.getBoundingClientRect();
    const travel = sec.offsetHeight - stage.offsetHeight;
    return travel > 0 ? clamp(-r.top / travel) : 0;
  };

  let cur = -1;
  const frame = (time) => {
    const s = progress() * (N - 1); // 0 .. N-1
    const i = Math.min(N - 2, Math.floor(s)), f = s - i;
    const t = sm(0.3, 0.7, f); // hold at each stop, move in the middle
    tmpP.lerpVectors(shots[i].pos, shots[i + 1].pos, t);
    tmpT.lerpVectors(shots[i].tgt, shots[i + 1].tgt, t);
    // narrow screens: back off so the robot fits
    const k = 1.45 * (cam.aspect < 1.25 ? Math.min(2.1, 1.25 / cam.aspect) : 1);
    cam.position.copy(tmpT).addScaledVector(tmpP.sub(tmpT), k);
    cam.lookAt(tmpT);
    // the card and labels follow the nearest stop
    const on = Math.round(s);
    if (on !== cur) {
      cur = on;
      steps.forEach((li, j) => li.classList.toggle("on", j === on));
      bar.forEach((b, j) => b.classList.toggle("on", j === on));
      Object.entries(nets).forEach(([n, m]) => { m.userData.on = ({ 1: "drive", 2: "vision", 3: "arm", 4: "sonar", 5: "pump" })[on] === n; });
    }
    // animations
    wheels.forEach((w) => { w.rotation.x = s * 5.5; });
    const ang = -0.95 * (1 - sm(2.35, 2.9, s)); // raised until the Arm stop, then swings down over the pool
    arm.rotation.x = ang; bend.uAng.value = ang;
    const sec_ = time / 1000;
    const ping = REDUCED ? 0 : clamp(1 - Math.abs(s - 4) * 1.6);
    sonar.material.opacity = ping * (0.18 + 0.12 * Math.sin(sec_ * 9));
    sonar.scale.setScalar(1);
    const flow = sm(4.6, 5.0, s);
    bend.uCut.value = 0.15 - flow * 0.16; // water runs from the pool back toward the pump
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
      for (let k = 0; k < 6; k++) {
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

  if (REDUCED) {
    // A still view of the whole robot with the arm down.
    const draw = () => { arm.rotation.x = 0; bend.uAng.value = 0; frame(0); };
    new ResizeObserver(() => { resize(); draw(); }).observe(stage);
    resize(); draw();
    sec.classList.add("o3-ready");
    return;
  }
  // Render only while the section is on screen.
  let visible = false, raf = 0;
  const loop = (t) => { raf = visible ? requestAnimationFrame(loop) : 0; if (W) frame(t); };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(loop); }).observe(sec);
  resize();
  sec.classList.add("o3-ready");
}
