// Visual layer: the hero board, component artwork on the diagram blocks, 7-segment stat
// displays, Pluto's typed brief and the Brimcam viewfinder. Loaded after main.js and extras.js.
(() => {
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NS = "http://www.w3.org/2000/svg";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const svgEl = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const whenSeen = (el, fn, threshold = 0.35) => {
    if (!el) return;
    new IntersectionObserver((es, io) => {
      if (es.some((e) => e.isIntersecting)) { io.disconnect(); fn(); }
    }, { threshold }).observe(el);
  };

  // ------------------------------------------------------------ In-view marking
  const inview = new IntersectionObserver((es) => es.forEach((e) => {
    e.target.classList.toggle("inview", e.isIntersecting);
    if (e.isIntersecting) e.target.dispatchEvent(new CustomEvent("inview"));
  }), { threshold: 0.15 });
  $$(".hero, .project, .arena, .experience, .contact, .finder, .brief, .capdraw, .otvdraw").forEach((el) => inview.observe(el));

  // ------------------------------------------------------------ Component artwork
  // Each block keeps its layout but gains the outline of the real part: pins on chips,
  // header pins on breakout boards, fins on the motor drivers, a horn on the servos,
  // an impeller on the pump and terminals on the battery. Paths only, so no extra text
  // ends up in a block's accessible name.
  const deco = (blk, draw) => {
    const r = blk.querySelector("rect");
    const x = +r.getAttribute("x"), y = +r.getAttribute("y"), w = +r.getAttribute("width"), h = +r.getAttribute("height");
    const g = svgEl("g", { class: "deco", "aria-hidden": "true" });
    blk.insertBefore(g, r);
    draw(g, x, y, w, h);
  };
  const chip = (g, x, y, w, h) => {
    for (let py = y + 14; py <= y + h - 10; py += 13) {
      svgEl("rect", { class: "pin", x: x - 7, y: py - 1.5, width: 7, height: 3 }, g);
      svgEl("rect", { class: "pin", x: x + w, y: py - 1.5, width: 7, height: 3 }, g);
    }
    for (let px = x + 18; px <= x + w - 14; px += 13) {
      svgEl("rect", { class: "pin", x: px - 1.5, y: y - 7, width: 3, height: 7 }, g);
      svgEl("rect", { class: "pin", x: px - 1.5, y: y + h, width: 3, height: 7 }, g);
    }
  };
  const pinDot = (blk) => {
    const r = blk.querySelector("rect");
    svgEl("circle", { class: "pin1", cx: +r.getAttribute("x") + 11, cy: +r.getAttribute("y") + +r.getAttribute("height") - 12, r: 3.5, "aria-hidden": "true" }, blk);
  };
  const header = (n) => (g, x, y, w, h) => {
    const gap = Math.min(9, (h - 12) / (n - 1));
    const y0 = y + h / 2 - (gap * (n - 1)) / 2;
    svgEl("rect", { class: "hdr", x: x - 9, y: y0 - 5, width: 7, height: gap * (n - 1) + 10, rx: 1 }, g);
    for (let i = 0; i < n; i++) svgEl("rect", { class: "pin", x: x - 7.5, y: y0 + i * gap - 1.5, width: 4, height: 3 }, g);
  };
  const ART = {
    vision: (g, x, y, w, h) => {
      // PCB meander antenna off the left edge.
      svgEl("path", { class: "ant", d: `M${x},${y + 14} H${x - 8} V${y + 6} H${x - 16} V${y + 22} H${x - 24} V${y + 6} H${x - 32} V${y + 22}` }, g);
    },
    front: header(4), depth: header(4), color: header(6),
    drive: (g, x, y, w, h) => {
      for (let i = 0; i < 5; i++) svgEl("rect", { class: "fin", x: x + w + 3 + i * 6, y: y + 8, width: 3, height: h - 16, rx: 1 }, g);
    },
    arm: (g, x, y, w, h) => {
      const cx = x + w + 18, cy = y + h / 2;
      svgEl("path", { class: "horn", d: `M${cx - 12},${cy} L${cx + 12},${cy}` }, g);
      svgEl("circle", { class: "hub", cx, cy, r: 5 }, g);
    },
    pump: (g, x, y, w, h) => {
      const cx = x + w + 18, cy = y + h / 2;
      svgEl("circle", { class: "hub ring", cx, cy, r: 11 }, g);
      svgEl("path", { class: "horn", d: `M${cx},${cy} L${cx + 8},${cy - 3} M${cx},${cy} L${cx - 2},${cy + 8} M${cx},${cy} L${cx - 6},${cy - 6}` }, g);
    },
    power: (g, x, y, w, h) => {
      svgEl("rect", { class: "term", x: x + w, y: y + h / 2 - 9, width: 7, height: 18, rx: 2 }, g);
      // "+" beside the terminal, drawn above the block's fill.
      const px = x + w - 16, py = y + h - 14;
      svgEl("path", { class: "sign", "aria-hidden": "true", d: `M${px - 5},${py} h10 M${px},${py - 5} v10` }, g.parentNode);
    },
  };
  $$("[data-diagram] .blk").forEach((b) => {
    if (b.classList.contains("mcu")) { deco(b, chip); pinDot(b); return; }
    const art = ART[b.dataset.k];
    if (art && b.closest("#otv")) deco(b, art);
  });

  // ------------------------------------------------------------ 7-segment displays
  // Segments a-g on a 30 x 54 cell, slanted like a bench meter. Unlit segments stay faintly visible.
  const SEG = {
    a: "M7,2 L25,2 L21,7 L11,7 Z", b: "M26,3 L26,25 L22,22 L22,8 Z", c: "M26,29 L26,51 L22,46 L22,32 Z",
    d: "M7,52 L25,52 L21,47 L11,47 Z", e: "M6,29 L10,32 L10,46 L6,51 Z", f: "M6,3 L10,8 L10,22 L6,25 Z",
    g: "M8,27 L11,24.5 L21,24.5 L24,27 L21,29.5 L11,29.5 Z",
  };
  const DIGITS = { 0: "abcdef", 1: "bc", 2: "abdeg", 3: "abcdg", 4: "bcfg", 5: "acdfg", 6: "acdefg", 7: "abc", 8: "abcdefg", 9: "abcdfg" };
  $$(".specs dt").forEach((dt) => {
    const text = dt.textContent.trim();
    let x = 0;
    const svg = svgEl("svg", { class: "seg7", "aria-hidden": "true", focusable: "false" });
    const g = svgEl("g", { transform: "skewX(-7)" }, svg);
    for (const ch of text) {
      if (DIGITS[ch]) {
        for (const s of "abcdefg") svgEl("path", { d: SEG[s], transform: `translate(${x} 0)`, class: DIGITS[ch].includes(s) ? "on" : "off" }, g);
        x += 32;
      } else if (ch === "/") {
        svgEl("path", { d: `M${x + 15},4 L${x + 5},50 L${x + 1},50 L${x + 11},4 Z`, class: "on" }, g);
        x += 18;
      } else if (ch === "," || ch === ".") {
        svgEl("path", { d: `M${x + 1},47 h6 v6 l-4,5 h-2 l2,-5 h-2 Z`, class: "on" }, g);
        x += 10;
      } else x += 14;
    }
    svg.setAttribute("viewBox", `-2 0 ${x + 6} 58`);
    svg.style.setProperty("--w", x + 6);
    const label = document.createElement("span");
    label.className = "sr";
    label.textContent = text;
    dt.textContent = "";
    dt.append(svg, label);
    dt.classList.add("lcd");
  });

  // ------------------------------------------------------------ Hero board
  // Each project in the index gets a net: a pad by its row, a trace up to the copper bus under
  // the name, and a via where it lands. Pointing at a project lights its net.
  const hero = $(".hero");
  const wide = matchMedia("(min-width: 761px)");
  const silk = document.createElement("div");
  silk.className = "silk";
  silk.setAttribute("aria-hidden", "true");
  silk.innerHTML = '<i class="mh tl"></i><i class="mh tr"></i><i class="fid"></i><span class="silk-id">MA-01</span><span class="silk-rev">Rev C, College Park, MD</span>';
  hero.prepend(silk);
  const net = svgEl("svg", { class: "hero-nets", "aria-hidden": "true" });
  hero.appendChild(net);
  const links = $$(".index a");
  let paths = [];
  const route = () => {
    if (hero.classList.contains("exploding")) return; // measured flat, at the top
    net.innerHTML = "";
    paths = [];
    if (!wide.matches) return;
    const hr = hero.getBoundingClientRect();
    const line = $(".hero-trace .line").getBoundingClientRect();
    const busY = line.top + line.height / 2 - hr.top;
    net.setAttribute("width", hr.width);
    net.setAttribute("height", hr.height);
    links.forEach((a, i) => {
      const r = a.getBoundingClientRect();
      const y = r.top + r.height / 2 - hr.top;
      const padX = r.left - hr.left - 18;
      const colX = padX - 70 - i * 64;
      const d = `M${padX},${y} H${colX + 8} Q${colX},${y} ${colX},${y - 8} V${busY}`;
      const g = svgEl("g", { class: "net" }, net);
      const p = svgEl("path", { d, class: "net-tr" }, g);
      svgEl("circle", { cx: padX, cy: y, r: 4.5, class: "net-pad" }, g);
      svgEl("circle", { cx: colX, cy: busY, r: 5, class: "net-via" }, g);
      const t = svgEl("text", { x: padX - 10, y: y - 8, class: "net-ref", "text-anchor": "end" }, g);
      t.textContent = `J${i + 1}`;
      paths.push({ g, p, a });
    });
  };
  const light = (a) => paths.forEach(({ g, p, a: x }) => {
    const on = x === a;
    g.classList.toggle("on", on);
    if (on && !REDUCED) {
      const len = p.getTotalLength();
      p.style.strokeDasharray = `${len} ${len}`;
      p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 420, easing: "ease-out" });
    }
  });
  links.forEach((a) => {
    a.addEventListener("mouseenter", () => light(a));
    a.addEventListener("focus", () => light(a));
    a.addEventListener("mouseleave", () => light(null));
    a.addEventListener("blur", () => light(null));
  });
  document.documentElement.classList.add("nets");
  route();
  addEventListener("resize", route);
  document.fonts?.ready.then(route);
  addEventListener("load", route);
  // The name is a copper pour; a sheen passes over it once the intro is done.
  const sheen = () => { if (!REDUCED) $("#name")?.classList.add("sheen"); };
  const waitIntro = () => {
    if (document.documentElement.classList.contains("scope-pending")) return setTimeout(waitIntro, 250);
    if (hero.classList.contains("inview")) return setTimeout(sheen, 400);
    hero.addEventListener("inview", () => setTimeout(sheen, 400), { once: true });
  };
  waitIntro();

  // ------------------------------------------------------------ Pluto: typed brief
  const brief = $(".brief");
  if (brief && !REDUCED) {
    const msgs = $$(".msg", brief);
    const full = msgs.map((m) => m.textContent);
    msgs.forEach((m) => { m.textContent = ""; m.classList.add("wait"); });
    whenSeen(brief, async () => {
      for (let i = 0; i < msgs.length; i++) {
        const m = msgs[i];
        m.classList.remove("wait");
        m.classList.add("typing");
        await new Promise((r) => setTimeout(r, 650));
        m.classList.remove("typing");
        for (let c = 1; c <= full[i].length; c += 2) {
          m.textContent = full[i].slice(0, c);
          await new Promise((r) => setTimeout(r, 14));
        }
        m.textContent = full[i];
        await new Promise((r) => setTimeout(r, 380));
      }
    });
  }

  // ------------------------------------------------------------ Brimcam viewfinder
  const finder = $(".finder");
  if (finder) {
    const locks = $$(".f-lock", finder), total = $(".f-total", finder);
    if (REDUCED) { locks.forEach((l) => l.classList.add("on")); total?.classList.add("on"); }
    else {
      let timers = [];
      const stop = () => { timers.forEach(clearTimeout); timers = []; };
      const play = () => {
        stop();
        locks.forEach((l) => l.classList.remove("on"));
        total?.classList.remove("on");
        locks.forEach((l, i) => timers.push(setTimeout(() => l.classList.add("on"), 500 + i * 900)));
        timers.push(setTimeout(() => total?.classList.add("on"), 500 + locks.length * 900));
      };
      new IntersectionObserver((es) => { if (es[0].isIntersecting) play(); else stop(); }, { threshold: 0.45 }).observe(finder);
    }
  }
})();

// ===================================================================== Round two
// Exploded hero layers, schematic view, camera's-eye arena, linked animations,
// cursor lighting, current in the name and panel rails.
(() => {
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FINE = matchMedia("(hover: hover) and (pointer: fine) and (min-width: 761px)");
  const WIDE = matchMedia("(min-width: 761px)");
  const NS = "http://www.w3.org/2000/svg";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const svgEl = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const clamp = (v) => Math.min(1, Math.max(0, v));
  const ease = (t) => t * t * (3 - 2 * t);

  // ------------------------------------------------------------ Exploded hero layers
  // The hero pins for a moment while scrolling and comes apart into the layers of a real
  // board: FR-4 core, solder mask, copper (the name and its traces) and silkscreen.
  const hero = $(".hero");
  if (hero && !REDUCED) {
    const setHH = () => document.documentElement.style.setProperty("--hh", ($(".top")?.offsetHeight || 52) + "px");
    setHH();
    addEventListener("resize", setHH);
    const scene = document.createElement("div");
    scene.className = "hero-scene";
    hero.before(scene);
    scene.appendChild(hero);
    document.documentElement.classList.add("explode");
    const plate = (cls, label) => {
      const d = document.createElement("div");
      d.className = `ly ${cls}`;
      d.setAttribute("aria-hidden", "true");
      d.innerHTML = `<span class="ly-tag">${label}</span>`;
      return d;
    };
    hero.prepend(plate("ly-mask", "Solder mask"));
    hero.prepend(plate("ly-core", "FR-4 core"));
    const tagCu = document.createElement("span");
    tagCu.className = "ly-tag ly-tag-cu";
    tagCu.textContent = "Copper";
    tagCu.setAttribute("aria-hidden", "true");
    const tagSilk = document.createElement("span");
    tagSilk.className = "ly-tag ly-tag-silk";
    tagSilk.textContent = "Silkscreen";
    tagSilk.setAttribute("aria-hidden", "true");
    hero.append(tagCu, tagSilk);
    let last = -1;
    const run = () => {
      const span = innerHeight * 0.75;
      const e = ease(clamp((scrollY - innerHeight * 0.04) / span));
      if (Math.abs(e - last) < 0.001) return;
      last = e;
      hero.style.setProperty("--e", e.toFixed(4));
      hero.style.transform = e < 0.001 ? "none"
        : WIDE.matches
          ? `rotateX(${(e * 52).toFixed(2)}deg) rotateZ(${(-e * 24).toFixed(2)}deg) scale(${(1 - e * 0.3).toFixed(4)})`
          : `rotateX(${(e * 48).toFixed(2)}deg) rotateZ(${(-e * 10).toFixed(2)}deg) scale(${(1 - e * 0.36).toFixed(4)})`;
      hero.classList.toggle("exploding", e > 0.001);
    };
    addEventListener("scroll", run, { passive: true });
    run();
  }

  // ------------------------------------------------------------ Schematic view (OTV)
  const otvFig = $("#otv [data-diagram]");
  if (otvFig) {
    const SYM = {
      vision: { v: "Camera link", d: (cx, cy) => `M${cx},${cy + 14} V${cy - 4} M${cx - 10},${cy - 14} L${cx + 10},${cy - 14} L${cx},${cy - 2} Z` },
      front: { v: "HC-SR04", d: (cx, cy) => `M${cx - 10},${cy - 10} h8 v20 h-8 Z M${cx - 2},${cy - 10} l10,-6 v32 l-10,-6 M${cx + 13},${cy - 8} q6,8 0,16 M${cx + 18},${cy - 12} q9,12 0,24` },
      depth: { v: "HC-SR04", d: (cx, cy) => `M${cx - 10},${cy - 10} h8 v20 h-8 Z M${cx - 2},${cy - 10} l10,-6 v32 l-10,-6 M${cx + 13},${cy - 8} q6,8 0,16 M${cx + 18},${cy - 12} q9,12 0,24` },
      color: { v: "TCS3200", d: (cx, cy) => `M${cx - 9},${cy - 8} h18 l-9,14 Z M${cx - 9},${cy + 7} h18 M${cx},${cy - 8} v-8 M${cx},${cy + 7} v9 M${cx - 22},${cy - 18} l9,9 m-5,0 h5 v-5 M${cx - 24},${cy - 6} l9,9 m-5,0 h5 v-5` },
      drive: { v: "DRV8871 to motor", d: (cx, cy) => `M${cx + 12},${cy} m-12,0 a12,12 0 1,0 24,0 a12,12 0 1,0 -24,0`, t: "M" },
      arm: { v: "SG90 servos", d: (cx, cy) => `M${cx + 12},${cy} m-12,0 a12,12 0 1,0 24,0 a12,12 0 1,0 -24,0 M${cx + 24},${cy} h6 M${cx + 30},${cy - 9} v18 h5 v-18 Z`, t: "M" },
      pump: { v: "IRLZ44N, pump", d: (cx, cy) => `M${cx - 16},${cy} h8 M${cx - 8},${cy - 10} v20 M${cx - 4},${cy - 12} v6 M${cx - 4},${cy - 3} v6 M${cx - 4},${cy + 6} v6 M${cx - 4},${cy - 9} h10 v-8 M${cx - 4},${cy + 9} h10 v8 M${cx - 4},${cy} h10 v9 M${cx + 1},${cy} l-4,-3 v6 Z` },
      power: { v: "9.6 V NiMH", d: (cx, cy) => `M${cx - 12},${cy} h6 M${cx - 6},${cy - 13} v26 M${cx},${cy - 7} v14 M${cx + 6},${cy - 13} v26 M${cx + 12},${cy - 7} v14 M${cx + 12},${cy} h6 M${cx - 10},${cy - 18} h6 M${cx - 7},${cy - 21} v6` },
    };
    $$(".blk", otvFig).forEach((b) => {
      const r = b.querySelector(":scope > rect");
      const x = +r.getAttribute("x"), y = +r.getAttribute("y"), w = +r.getAttribute("width"), h = +r.getAttribute("height");
      const ref = b.querySelector(".ref")?.textContent || "";
      const g = svgEl("g", { class: "sym", "aria-hidden": "true" }, b);
      if (b.classList.contains("mcu")) {
        const t1 = svgEl("text", { x: x + 16, y: y + 28, class: "sym-ref" }, g); t1.textContent = ref;
        const t2 = svgEl("text", { x: x + 16, y: y + 50, class: "sym-v" }, g); t2.textContent = "Arduino UNO R4 WiFi";
        const t3 = svgEl("text", { x: x + 16, y: y + 70, class: "sym-v" }, g); t3.textContent = "RA4M1 with ESP32-S3";
        return;
      }
      const s = SYM[b.dataset.k];
      if (!s) return;
      const cx = x + 34, cy = y + h / 2;
      svgEl("path", { d: s.d(cx, cy), class: "sym-p" }, g);
      if (s.t) { const m = svgEl("text", { x: cx + 12, y: cy + 5, class: "sym-m", "text-anchor": "middle" }, g); m.textContent = s.t; }
      const t1 = svgEl("text", { x: x + 72, y: y + 24, class: "sym-ref" }, g); t1.textContent = ref;
      const t2 = svgEl("text", { x: x + 72, y: y + 43, class: "sym-v" }, g); t2.textContent = s.v;
    });
    // Schematic wipe: a copy of the board drawn as a schematic sits on top and is revealed
    // left to right as the fourth scroll stage (or as the board scrolls by on a phone).
    if (!REDUCED) {
      const sc = otvFig.querySelector(".scroll");
      const svg = otvFig.querySelector(".scroll > svg");
      const layer = document.createElement("div");
      layer.className = "schem-layer diagram schem";
      layer.setAttribute("aria-hidden", "true");
      const copy = svg.cloneNode(true);
      ["role", "aria-label", "aria-labelledby"].forEach((a) => copy.removeAttribute(a));
      copy.querySelectorAll("[id]").forEach((e) => e.removeAttribute("id"));
      copy.querySelectorAll("[tabindex]").forEach((e) => e.removeAttribute("tabindex"));
      copy.querySelectorAll(".pulse, .dots, .hit, title").forEach((e) => e.remove());
      copy.querySelectorAll(".sig").forEach((e) => (e.style.strokeDashoffset = 0));
      layer.appendChild(copy);
      const edge = document.createElement("i");
      edge.className = "schem-edge";
      edge.setAttribute("aria-hidden", "true");
      sc.classList.add("has-schem");
      sc.append(layer, edge);
      // Hover and linked highlights on the real board show on the schematic too.
      const sel = ".blk, .tr, .pad";
      const orig = [...svg.querySelectorAll(sel)], twin = [...copy.querySelectorAll(sel)];
      if (orig.length === twin.length) {
        new MutationObserver((ms) => ms.forEach((m) => {
          const i = orig.indexOf(m.target);
          if (i >= 0) twin[i].setAttribute("class", m.target.getAttribute("class"));
        })).observe(svg, { subtree: true, attributes: true, attributeFilter: ["class"] });
      }
      const setW = (w) => {
        w = clamp(w);
        sc.style.setProperty("--w", w.toFixed(4));
        sc.classList.toggle("wiping", w > 0.001 && w < 0.999);
      };
      // Desktop: the pinned scene's progress drives it (stage four, then a short hold).
      otvFig.addEventListener("sceneprogress", (e) => { if (WIDE.matches) setW((e.detail - 0.64) / 0.24); });
      // Phone: driven by how far the board has scrolled up the screen.
      const onScroll = () => {
        if (WIDE.matches) return;
        const r = svg.getBoundingClientRect();
        setW((innerHeight * 0.55 - r.top) / (r.height * 0.85));
      };
      addEventListener("scroll", onScroll, { passive: true });
      setW(0);
      onScroll();
    }
  }

  // ------------------------------------------------------------ Arena: camera's-eye view
  const arena = $("#otv-route");
  if (arena) {
    const bot = $(".bot", arena);
    const layer = bot.parentNode;
    const det = svgEl("g", { class: "det", "aria-hidden": "true" }, layer);
    svgEl("path", { class: "det-box", d: "M-24,-14 v-10 h10 M14,-24 h10 v10 M24,14 v10 h-10 M-14,24 h-10 v-10" }, det);
    svgEl("path", { class: "det-axis", d: "M0,0 H30" }, det);
    const lab = svgEl("g", { class: "det-lab" }, det);
    svgEl("rect", { x: 28, y: -34, width: 150, height: 20, rx: 3 }, lab);
    const txt = svgEl("text", { x: 34, y: -20 }, lab);
    txt.textContent = "ArUco";
    const hud = svgEl("g", { class: "cam-hud", "aria-hidden": "true" }, arena.querySelector("svg"));
    svgEl("path", { d: "M8,24 V8 H24 M856,8 H872 V24 M872,452 V468 H856 M24,468 H8 V452" }, hud);
    const camT = svgEl("text", { x: 36, y: 14 }, hud);
    camT.textContent = "Overhead camera";
    arena.addEventListener("otvtick", (e) => {
      const s = e.detail;
      if (s.x == null) return;
      const xm = s.x / 200, ym = (400 - s.y) / 200;
      let th = -(s.h ?? 0);
      th = ((th + 540) % 360) - 180;
      det.setAttribute("transform", `translate(${s.x.toFixed(1)} ${s.y.toFixed(1)})`);
      det.querySelector(".det-axis").setAttribute("transform", `rotate(${(s.h ?? 0).toFixed(1)})`);
      txt.textContent = `x ${xm.toFixed(2)} m   y ${ym.toFixed(2)} m   θ ${Math.round(th)}°`;
      det.classList.add("on");
    });
  }

  // ------------------------------------------------------------ Linked animations
  // Light a diagram block and pulse its traces for a moment (addPulse comes from main.js).
  const flash = (fig, k, ms = 2400) => {
    if (!fig || REDUCED) return;
    const added = [];
    $$(`[data-k="${k}"]`, fig).forEach((el) => {
      if (el.tagName === "TEMPLATE") return;
      el.classList.add("on", "linked");
      if (el.classList.contains("tr") && typeof addPulse === "function") {
        addPulse(el);
        added.push(el.nextElementSibling);
      }
    });
    setTimeout(() => {
      $$(`[data-k="${k}"].linked`, fig).forEach((el) => el.classList.remove("on", "linked"));
      added.forEach((p) => p?.classList.contains("pulse") && p.remove());
    }, ms);
  };
  // Pluto: each line of the brief lights the tool it came from.
  const plutoFig = $("#pluto [data-diagram]");
  const BRIEF_KEYS = [["calendar", "schedule"], ["canvas", "planner"], ["transit"]];
  $$(".brief .msg").forEach((m, i) => {
    new MutationObserver(() => {
      if (m.classList.contains("typing") && !m.dataset.lit) {
        m.dataset.lit = "1";
        (BRIEF_KEYS[i] || []).forEach((k, j) => setTimeout(() => flash(plutoFig, k), j * 300));
      }
    }).observe(m, { attributes: true, attributeFilter: ["class"] });
  });
  // Brimcam: when the viewfinder totals up, the photo travels camera to Herald to Gemini to macros.
  const flowFig = $("#brimcam [data-diagram]");
  const total = $(".finder .f-total");
  if (total && flowFig) {
    new MutationObserver(() => {
      if (!total.classList.contains("on")) return;
      ["herald", "gemini", "macros"].forEach((k, i) => setTimeout(() => flash(flowFig, k, 1800), i * 500));
    }).observe(total, { attributes: true, attributeFilter: ["class"] });
  }

  // ------------------------------------------------------------ Phone boards
  $$("[data-diagram]").forEach((fig) => {
    const sc = fig.querySelector(".scroll");
    if (!sc) return;
    const hint = document.createElement("p");
    hint.className = "swipe-hint";
    hint.textContent = document.documentElement.classList.contains("vlayout")
      ? (fig.classList.contains("flow") ? "Tap a step for details below." : "Tap a part for details below.")
      : (fig.classList.contains("flow") ? "Swipe to follow the steps. Tap one for details below." : "Swipe to see the whole board. Tap a part for details below.");
    (fig.querySelector(".figbar") || sc).after(hint);
    sc.addEventListener("click", (e) => {
      if (WIDE.matches) return;
      const b = e.target.closest(".blk");
      if (!b) return;
      const sel = `.parts button[aria-controls$="-${b.dataset.k}"]`;
      const btn = fig.querySelector(sel) || fig.parentElement.querySelector(sel);
      if (!btn) return;
      if (btn.getAttribute("aria-expanded") !== "true") btn.click();
      setTimeout(() => {
        const l = typeof lenis !== "undefined" && lenis;
        if (l) l.scrollTo(btn, { offset: -innerHeight * 0.3, duration: 0.9 });
        else btn.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "center" });
      }, 60);
    });
  });

  // ------------------------------------------------------------ Cursor lighting
  // A highlight follows the pointer across diagrams, like a board under a lamp.
  if (FINE.matches && !REDUCED) {
    $$(".diagram .scroll, .capdraw svg, .otvdraw svg").forEach((el) => {
      const host = el.tagName === "svg" ? el.parentNode : el;
      host.classList.add("lit-host");
      const glint = document.createElement("i");
      glint.className = "glint";
      glint.setAttribute("aria-hidden", "true");
      host.appendChild(glint);
      let raf = 0;
      host.addEventListener("pointermove", (e) => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const r = host.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
          host.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
          host.style.setProperty("--my", (py * 100).toFixed(1) + "%");
          host.classList.add("lamp");
        });
      });
      host.addEventListener("pointerleave", () => {
        cancelAnimationFrame(raf);
        host.classList.remove("lamp");
      });
    });
  } else if (!REDUCED) {
    const hosts = $$(".diagram .scroll, .capdraw, .otvdraw, .finder").map((host) => {
      host.classList.add("lit-host", "sweep");
      const glint = document.createElement("i");
      glint.className = "glint";
      glint.setAttribute("aria-hidden", "true");
      host.appendChild(glint);
      return host;
    });
    let ticking = false;
    const sweep = () => {
      ticking = false;
      hosts.forEach((h) => {
        const r = h.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) return;
        const t = clamp((innerHeight - r.top) / (innerHeight + r.height));
        h.style.setProperty("--mx", (10 + t * 80).toFixed(1) + "%");
        h.style.setProperty("--my", (90 - t * 80).toFixed(1) + "%");
      });
    };
    addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(sweep); } }, { passive: true });
    sweep();
  }

  // ------------------------------------------------------------ Current in the name
  // A faint flow of current runs through the copper letters; pointing at a project net speeds it up.
  if (hero) {
    $$(".index a").forEach((a) => {
      a.addEventListener("mouseenter", () => hero.classList.add("hot"));
      a.addEventListener("mouseleave", () => hero.classList.remove("hot"));
    });
  }

  // ------------------------------------------------------------ Panel rails
  // The page sits in a manufacturing panel: tooling rails down both edges with holes and fiducials.
  const rails = document.createElement("div");
  rails.className = "rails";
  rails.setAttribute("aria-hidden", "true");
  rails.innerHTML = '<i class="rail l"><b>Panel MA-01</b></i><i class="rail r"></i>';
  document.body.appendChild(rails);
})();
