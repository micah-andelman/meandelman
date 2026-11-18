// Visual layer: the hero board, component artwork on the diagram blocks, 7-segment stat
// displays and Pluto's typed brief. Loaded after main.js and extras.js.
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
  $$(".hero, .project, .work, .arena, .experience, .contact, .brief, .capdraw").forEach((el) => inview.observe(el));

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
    // off-board parts plug in: a 3-pin servo header for the arm, a 2-way screw terminal for the pump
    arm: (g, x, y, w, h) => {
      const cx = x + w + 4, cy = y + h / 2;
      svgEl("rect", { class: "hdr", x: cx, y: cy - 16, width: 12, height: 32, rx: 1.5 }, g);
      svgEl("rect", { class: "pin", x: cx + 3.4, y: cy - 12.6, width: 5.2, height: 5.2 }, g);
      [0, 10].forEach((d) => svgEl("circle", { class: "pin", cx: cx + 6, cy: cy + d, r: 2.6 }, g));
    },
    pump: (g, x, y, w, h) => {
      const cx = x + w + 4, cy = y + h / 2;
      svgEl("rect", { class: "hdr", x: cx, y: cy - 14, width: 16, height: 28, rx: 1.5 }, g);
      [-6.5, 6.5].forEach((d) => { svgEl("circle", { class: "hub ring", cx: cx + 8, cy: cy + d, r: 4.2 }, g); svgEl("path", { class: "horn", d: `M${cx + 5.5},${cy + d + 2.5} l5,-5` }, g); });
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

  // ------------------------------------------------------------ A finished board (OTV)
  // The OTV diagram reads as a made PCB rather than perfboard: a hatched ground pour that keeps
  // clear of every trace and part, silkscreen outlines round the parts and the board's name in
  // the corner. The schematic copy hides all of it (styles.css).
  const otvSvg = $("#otv [data-diagram] svg");
  if (otvSvg) {
    const vb = otvSvg.viewBox.baseVal, VW = vb.width || 960, VH = vb.height || 440;
    const defs = otvSvg.querySelector("defs");
    const pat = svgEl("pattern", { id: "pour", width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
    svgEl("line", { x1: 0, y1: 0, x2: 0, y2: 6, class: "pour-ln" }, pat);
    const ep = svgEl("linearGradient", { id: "epoxy", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    svgEl("stop", { offset: 0, class: "ep0" }, ep); svgEl("stop", { offset: 1, class: "ep1" }, ep);
    const first = otvSvg.querySelector(".tr");
    const under = (el) => { first.before(el); return el; };
    under(svgEl("rect", { class: "pour", x: 30, y: 30, width: VW - 60, height: VH - 60, rx: 8, "aria-hidden": "true" }));
    $$(".tr", otvSvg).forEach((t) => under(svgEl("path", { d: t.getAttribute("d"), class: "keep", "aria-hidden": "true" })));
    $$(".blk", otvSvg).forEach((b) => {
      const r = b.querySelector(":scope > rect");
      const x = +r.getAttribute("x"), y = +r.getAttribute("y"), w = +r.getAttribute("width"), h = +r.getAttribute("height");
      let bb = null; try { bb = b.getBBox(); } catch (e) { bb = null; }
      const box = bb && bb.width ? { x: bb.x, y: bb.y, w: bb.width, h: bb.height } : { x, y, w, h };
      const k = svgEl("rect", { class: "keep-blk", x: box.x - 10, y: box.y - 10, width: box.w + 20, height: box.h + 20, rx: 6, "aria-hidden": "true" });
      const tf = b.getAttribute("transform");
      if (tf) k.setAttribute("transform", tf);
      under(k);
      r.after(svgEl("rect", { class: "court", x: x - 5, y: y - 5, width: w + 10, height: h + 10, rx: 3, "aria-hidden": "true" })); // after the body, so :scope > rect still finds the body
    });
    const name = svgEl("text", { class: "silk-name", x: VW - 42, y: VH - 13, "text-anchor": "end", "aria-hidden": "true" }, otvSvg);
    name.textContent = "ENES100 OTV";
  }

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
  if (hero) (() => { // only the home page has the hero
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
  })();

  // ------------------------------------------------------------ Card art (home page)
  // The OTV card's robot runs on SMIL: pause it off screen, and freeze it mid-route when
  // motion is reduced. (The CSS-animated cards pause through .work:not(.inview).)
  $$(".art-otv svg").forEach((svg) => {
    if (REDUCED) { svg.pauseAnimations(); svg.setCurrentTime(6); return; }
    new IntersectionObserver(([e]) => (e.isIntersecting ? svg.unpauseAnimations() : svg.pauseAnimations())).observe(svg);
  });

  // ------------------------------------------------------------ BuildFest: the 3D screenshot ring
  // Screenshots stand on a ring that turns one step every few seconds while it's on screen. Hovering
  // or focusing holds it; the arrows step it by hand. Reduced motion, or no JS, leaves a plain grid.
  $$(".bf-show").forEach((show) => {
    if (REDUCED) return;
    const ring = $(".bf-ring", show), panels = $$(".bf-panel", show), n = panels.length;
    const cap = $(".bf-cap", show), [capT, capS] = [$("b", cap), $("span", cap)];
    let k = 0, timer = 0, held = false, visible = false;
    const show_ = () => {
      ring.style.setProperty("--rot", `${(-k * 360) / n}deg`);
      const front = ((k % n) + n) % n;
      panels.forEach((p, i) => {
        const d = Math.min((i - front + n) % n, (front - i + n) % n);
        p.classList.toggle("far", d === 1);
        p.classList.toggle("back", d > 1);
        p.setAttribute("aria-hidden", d === 0 ? "false" : "true");
      });
      capT.textContent = panels[front].dataset.title;
      capS.textContent = panels[front].dataset.cap;
    };
    const step = (d) => { k += d; show_(); };
    const tick = () => { clearTimeout(timer); if (visible && !held) timer = setTimeout(() => { step(1); tick(); }, 3600); };
    $(".bf-prev", show).addEventListener("click", () => { step(-1); tick(); });
    $(".bf-next", show).addEventListener("click", () => { step(1); tick(); });
    const stage = $(".bf-stage", show);
    stage.addEventListener("pointerenter", () => { held = true; clearTimeout(timer); });
    stage.addEventListener("pointerleave", () => { held = false; tick(); });
    show.addEventListener("focusin", () => { held = true; clearTimeout(timer); });
    show.addEventListener("focusout", (e) => { if (!show.contains(e.relatedTarget)) { held = false; tick(); } });
    stage.addEventListener("click", () => { step(1); tick(); });
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; tick(); }, { threshold: 0.25 }).observe(show);
    show.classList.add("on");
    show_();
  });

  // ------------------------------------------------------------ Pluto: typed brief
  $$(".brief").forEach((brief) => {
    if (REDUCED) return;
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
  });

})();

// ===================================================================== Round two
// Exploded hero layers, schematic view, camera's-eye arena, linked animations,
// cursor lighting, current in the name and the exploded Brimcam cap.
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

    // ---------------------------------------------------------- The core is a protoboard sign
    // As the board comes apart, the core turns out to be green protoboard carrying an LED sign:
    // 5x7 LED letters spelling PORTFOLIO, wired like a real multiplexed matrix. Row buses run
    // along each row of LEDs from an ATmega328P (through a resistor each), column wires drop to
    // 74HC595 shift registers under the letters, and a screw terminal brings in 5 V.
    // It is drawn once as SVG and painted into canvases at two to three times screen
    // resolution: Chrome rasterises live SVG inside the tilted 3D plate at flat-screen
    // resolution, so the near edge came out soft. A canvas is a texture the GPU samples
    // directly, so it stays sharp at any tilt. The lit LEDs are a second canvas that a
    // compositor-only wipe reveals left to right once the layers above have cleared.
    const core = $(".ly-core", hero);
    $(".ly-tag", core).textContent = "Protoboard";
    const cvBoard = document.createElement("canvas");
    cvBoard.className = "pb";
    const litWrap = document.createElement("div");
    litWrap.className = "pb-litwrap";
    const cvLit = document.createElement("canvas");
    cvLit.className = "pb-lit";
    litWrap.appendChild(cvLit);
    core.prepend(cvBoard, litWrap);
    const PB_CSS = `
      text { font-family: "Barlow", "Arial Narrow", Arial, sans-serif; }
      .pad { fill: #c8834a; } .hole { fill: #0a1f15; } .mh { fill: #0a1f15; stroke: #c8834a; stroke-width: 3; }
      .j { fill: #d4d7da; stroke: #8d9196; stroke-width: .06; }
      .bare { fill: none; stroke: #c4c8cc; stroke-width: .18; stroke-linecap: round; stroke-linejoin: round; }
      .ins, .core { fill: none; stroke-linecap: round; stroke-linejoin: round; }
      .ins { stroke: rgba(0,0,0,.45); stroke-width: .4; } .core { stroke-width: .26; }
      .red { stroke: #e2453a; } .blk { stroke: #2a2d31; } .blu { stroke: #3d8ee8; } .grn { stroke: #42c07c; }
      .ylw { stroke: #f2c230; } .wht { stroke: #eef0f2; } .org { stroke: #f08a2c; } .vio { stroke: #9a66e0; }
      .ref { font-size: .72px; font-weight: 700; fill: #f4f1e8; }
      .val { font-size: .6px; font-weight: 600; fill: #cfe0d4; }
      .icn { font-size: .72px; font-weight: 600; fill: #b9bcc0; letter-spacing: .02px; }
      .leg { fill: none; stroke: #b7bbbf; stroke-width: .13; stroke-linecap: round; }
      .lead { fill: none; stroke-width: .36; stroke-linecap: round; }
      .res { fill: #d9c49a; stroke: rgba(0,0,0,.35); stroke-width: .06; }
      .ecap { fill: #22364f; stroke: #0d1726; stroke-width: .08; } .ecap-s { fill: none; stroke: #c7d2df; stroke-width: .26; }
      .ecap-t { fill: none; stroke: #8796a8; stroke-width: .07; }
      .disc { fill: #e2a335; stroke: #9a6516; stroke-width: .07; }
      .ic { fill: #1d1f22; stroke: #000; stroke-width: .06; } .notch { fill: #0b0c0d; }
      .xtal { fill: #cfd2d6; stroke: #7d8186; stroke-width: .08; }
      .term { fill: #2f8f4e; stroke: #1b5a30; stroke-width: .08; } .screw { fill: #c9ccd0; stroke: #7d8186; stroke-width: .06; }
      .rim { fill: #5c1a14; } .lens { fill: #7a2318; } .hot { fill: rgba(255,255,255,.3); }
      .lens-on { fill: #ffd9c2; } .hot-on { fill: rgba(255,255,255,.75); }`;
    const FONT = {
      P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
      O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
      R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
      T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
      F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
      L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
      I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
    };
    // paint an SVG into a canvas at k times its size
    const paint = async (svg, cv, w, h, k) => {
      svg.setAttribute("xmlns", NS);
      svg.setAttribute("width", w);
      svg.setAttribute("height", h);
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        cv.width = Math.round(w * k);
        cv.height = Math.round(h * k);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      } finally { URL.revokeObjectURL(url); }
    };
    let built = "", job = 0;
    const buildPB = async () => {
      const W = core.offsetWidth, H = core.offsetHeight;
      const key = W + "x" + H;
      if (!W || key === built) return;
      built = key;
      const my = ++job;
      const lines = W >= 700 ? ["PORTFOLIO"] : ["PORT", "FOLIO"];
      const LINE_H = 24; // a line of letters (rows 0..12) and its shift registers (16..19)
      const cols = lines.map((s) => s.length * 6 - 1);
      const right = Math.max(...cols) * 2;
      // Phones: the letters get the width. The controller is left off and the row lines come in on a
      // header (J1), as if the sign plugs into a controller board elsewhere.
      const narrow = lines.length > 1;
      const top = -4, bottom = (lines.length - 1) * LINE_H + 24, left = narrow ? -9 : -33;
      const p = Math.min((W - 40) / (right - left + 6), (H - 40) / (bottom - top + 8));
      const ox = Math.round((W - (right + left) * p) / 2 / p) * p, oy = Math.round((H - (bottom + top) * p) / 2 / p) * p;

      const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}` });
      svgEl("style", {}, svg).textContent = PB_CSS;
      // the pad grid lines up with the parts: every lead lands in a hole
      const pat = svgEl("pattern", { id: "pads", patternUnits: "userSpaceOnUse", width: p, height: p, x: ox - p / 2, y: oy - p / 2 }, svgEl("defs", {}, svg));
      svgEl("circle", { class: "pad", cx: p / 2, cy: p / 2, r: p * 0.34 }, pat);
      svgEl("circle", { class: "hole", cx: p / 2, cy: p / 2, r: p * 0.14 }, pat);
      svgEl("rect", { x: 6, y: 6, width: W - 12, height: H - 12, fill: "url(#pads)" }, svg);
      [[18, 18], [W - 18, 18], [18, H - 18], [W - 18, H - 18]].forEach(([x, y]) => svgEl("circle", { class: "mh", cx: x, cy: y, r: 7 }, svg));
      const g = svgEl("g", { transform: `translate(${ox},${oy}) scale(${p})` }, svg);
      const wires = svgEl("g", {}, g), parts = svgEl("g", {}, g), jumpers = svgEl("g", {}, g), joints = svgEl("g", {}, g), leds = svgEl("g", {}, g);
      // the lit LEDs, cropped to the letters
      const bx = ox - 2.6 * p, by = oy - 2.6 * p, bw = (right + 3.2) * p, bh = ((lines.length - 1) * LINE_H + 17.2) * p;
      const lit = svgEl("svg", { viewBox: `${bx} ${by} ${bw} ${bh}` });
      svgEl("style", {}, lit).textContent = PB_CSS;
      const rg = svgEl("radialGradient", { id: "glow" }, svgEl("defs", {}, lit));
      svgEl("stop", { offset: "0", "stop-color": "#ff8a55", "stop-opacity": ".85" }, rg);
      svgEl("stop", { offset: ".45", "stop-color": "#ff5a30", "stop-opacity": ".36" }, rg);
      svgEl("stop", { offset: "1", "stop-color": "#ff4020", "stop-opacity": "0" }, rg);
      const lg = svgEl("g", { transform: `translate(${ox},${oy}) scale(${p})` }, lit);

      const seen = new Set();
      const pin = (x, y) => { const k = x + "," + y; if (!seen.has(k)) { seen.add(k); svgEl("circle", { class: "j", cx: x, cy: y, r: 0.24 }, joints); } };
      const poly = (pts) => "M" + pts.map((q) => q.join(",")).join(" L");
      const bare = (pts) => { svgEl("path", { class: "bare", d: poly(pts) }, wires); pin(...pts[0]); pin(...pts[pts.length - 1]); };
      const wire = (d, col) => { svgEl("path", { class: "ins", d }, jumpers); svgEl("path", { class: `core ${col}`, d }, jumpers); };
      const jump = (a, b, col, bow = 0.2) => { // an insulated jumper that arcs over whatever it crosses
        const [x1, y1] = a, [x2, y2] = b, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
        const k = Math.min(3, len * bow), cx = (x1 + x2) / 2 + (dy / len) * k, cy = (y1 + y2) / 2 - (Math.abs(dx) / len) * k;
        wire(`M${x1},${y1} Q${cx.toFixed(2)},${cy.toFixed(2)} ${x2},${y2}`, col);
        pin(x1, y1); pin(x2, y2);
      };
      const route = (pts, col) => { wire(poly(pts), col); pin(...pts[0]); pin(...pts[pts.length - 1]); };
      const text = (x, y, s, cls = "ref", anchor = "middle") => { const t = svgEl("text", { x, y, class: cls, "text-anchor": anchor }, parts); t.textContent = s; };
      const BANDS = { "220": ["#d1352b", "#d1352b", "#6b3a1e"], "10k": ["#6b3a1e", "#111", "#e07a1f"] };
      const res = (x1, x2, y, val) => { // horizontal resistor, leads at (x1, y) and (x2, y)
        svgEl("path", { class: "leg", d: `M${x1},${y} L${x2},${y}` }, parts);
        const mx = (x1 + x2) / 2;
        svgEl("rect", { class: "res", x: mx - 1.2, y: y - 0.42, width: 2.4, height: 0.84, rx: 0.38 }, parts);
        BANDS[val].concat("#c9a227").forEach((c, i) => svgEl("rect", { x: mx - 0.8 + i * 0.4 + (i === 3 ? 0.3 : 0), y: y - 0.42, width: 0.18, height: 0.84, fill: c }, parts));
        pin(x1, y); pin(x2, y);
      };
      const ecap = (x1, x2, y, r) => { // radial electrolytic lying across two rails
        const cx = (x1 + x2) / 2;
        svgEl("path", { class: "leg", d: `M${x1},${y} L${x2},${y}` }, parts);
        svgEl("circle", { class: "ecap", cx, cy: y, r }, parts);
        svgEl("path", { class: "ecap-s", d: `M${cx + r * 0.78},${y - r * 0.62} A${r},${r} 0 0 1 ${cx + r * 0.78},${y + r * 0.62}` }, parts);
        svgEl("circle", { class: "ecap-t", cx, cy: y, r: r * 0.55 }, parts);
        pin(x1, y); pin(x2, y);
      };
      const disc = (x1, x2, y) => { // ceramic disc
        svgEl("path", { class: "leg", d: `M${x1},${y} L${x2},${y}` }, parts);
        svgEl("ellipse", { class: "disc", cx: (x1 + x2) / 2, cy: y, rx: 0.75, ry: 0.5 }, parts);
        pin(x1, y); pin(x2, y);
      };
      const dipH = (x0, yt, n, name, ref) => { // DIP-2n lying across: pins x0..x0+n-1 at yt and yt+3
        for (let i = 0; i < n; i++) { pin(x0 + i, yt); pin(x0 + i, yt + 3); }
        svgEl("rect", { class: "ic", x: x0 - 0.55, y: yt + 0.35, width: n - 1 + 1.1, height: 2.3, rx: 0.12 }, parts);
        svgEl("path", { class: "notch", d: `M${x0 - 0.55},${yt + 1.1} a0.4,0.4 0 0 1 0,0.8` }, parts);
        text(x0 + (n - 1) / 2, yt + 1.78, name, "icn");
        text(x0 - 0.6, yt + 4.3, ref, "ref", "start");
      };
      const dipV = (x0, y0, n, name, ref) => { // DIP-2n standing up: pins y0..y0+n-1 at x0 and x0+3
        for (let i = 0; i < n; i++) { pin(x0, y0 + i); pin(x0 + 3, y0 + i); }
        svgEl("rect", { class: "ic", x: x0 + 0.35, y: y0 - 0.55, width: 2.3, height: n - 1 + 1.1, rx: 0.12 }, parts);
        svgEl("path", { class: "notch", d: `M${x0 + 1.1},${y0 - 0.55} a0.4,0.4 0 0 0 0.8,0` }, parts);
        const t = svgEl("text", { class: "icn", x: 0, y: 0, "text-anchor": "middle", transform: `translate(${x0 + 1.75},${y0 + (n - 1) / 2}) rotate(90)` }, parts);
        t.textContent = name;
        text(x0 + 1.5, y0 + n + 0.6, ref);
      };

      // ---- the letters: LEDs on a 2-hole pitch, a row bus under each row, a wire per column
      let n595 = 0, prevChain = null;
      lines.forEach((word, li) => {
        const y0 = li * LINE_H, c = cols[li];
        for (let r = 0; r < 7; r++) bare([[-4, y0 + 2 * r], [(c - 1) * 2, y0 + 2 * r]]);
        const chips = Math.ceil(c / 8);
        for (let k = 0; k < chips; k++) {
          const x0 = 16 * k + 4, yt = y0 + 16;
          dipH(x0, yt, 8, "74HC595", `U${2 + n595++}`);
          jump([x0, yt + 3], [x0, y0 + 21], "red", 0.5);         // VCC
          jump([x0 + 7, yt + 3], [x0 + 7, y0 + 22], "blk", 0.4); // GND
          if (prevChain) route([prevChain, [prevChain[0], y0 + 20], [x0 + 1, y0 + 20], [x0 + 1, yt + 3]], "ylw");
          prevChain = [x0 + 6, yt + 3];
        }
        bare([[-4, y0 + 21], [16 * chips + 2, y0 + 21]]);
        bare([[-4, y0 + 22], [16 * chips + 2, y0 + 22]]);
        for (let col = 0; col < c; col++) {
          const letter = FONT[word[Math.floor(col / 6)]], lc = col % 6;
          if (lc === 5) continue;
          const rows = [0, 1, 2, 3, 4, 5, 6].filter((r) => letter[r][lc] === "1");
          if (!rows.length) continue; // an empty column (the sides of the I) has no LEDs and no wire
          const x = col * 2, xw = x + 1, k = Math.floor(col / 8), j = col % 8;
          // cathode wire: down the column beside the LEDs, then over to its 595 output
          route([[xw, y0 + 2 * rows[0]], [xw, y0 + 13.4], [16 * k + 4 + j, y0 + 15], [16 * k + 4 + j, y0 + 16]], "blu");
          rows.forEach((r) => {
            const y = y0 + 2 * r;
            svgEl("path", { class: "leg", d: `M${x + 0.5},${y} L${xw},${y}` }, wires);
            svgEl("circle", { class: "rim", cx: x, cy: y, r: 0.82 }, leds);
            svgEl("circle", { class: "lens", cx: x, cy: y, r: 0.64 }, leds);
            svgEl("circle", { class: "hot", cx: x - 0.22, cy: y - 0.24, r: 0.2 }, leds);
            svgEl("circle", { cx: x, cy: y, r: 2.1, fill: "url(#glow)" }, lg);
            svgEl("circle", { class: "rim", cx: x, cy: y, r: 0.82 }, lg);
            svgEl("circle", { class: "lens-on", cx: x, cy: y, r: 0.64 }, lg);
            svgEl("circle", { class: "hot-on", cx: x - 0.22, cy: y - 0.24, r: 0.22 }, lg);
          });
        }
        // a second line shares the first line's row drive
        if (li > 0) for (let r = 0; r < 7; r++) jump([-4, 2 * r], [-4, y0 + 2 * r], ["red", "org", "ylw", "grn", "blu", "vio", "wht"][r], 0.06 + r * 0.025);
      });

      if (narrow) {
        // a 1x7 header for the rows, and a 2-pin header for the shift registers' clock and data
        svgEl("rect", { class: "ic", x: -6.6, y: -0.6, width: 1.2, height: 13.2, rx: 0.15 }, parts);
        for (let r = 0; r < 7; r++) { pin(-6, 2 * r); bare([[-6, 2 * r], [-4, 2 * r]]); }
        text(-6, -1.3, "J1");
        svgEl("rect", { class: "ic", x: -6.6, y: 15.4, width: 1.2, height: 3.2, rx: 0.15 }, parts);
        pin(-6, 16); pin(-6, 18); text(-6, 20.3, "J2");
        jump([-6, 16], [5, 19], "ylw", 0.12); jump([-6, 18], [6, 19], "grn", 0.12);
      } else {
        // ---- the controller, left of the letters. Rails: +5 V at x = -24, ground at x = -22.
        for (let r = 0; r < 7; r++) { res(-9, -5, 2 * r, "220"); bare([[-11, 2 * r], [-9, 2 * r]]); bare([[-5, 2 * r], [-4, 2 * r]]); }
        text(-7, -1.2, "R1–R7", "val");
        dipV(-14, 0, 14, "ATMEGA328P", "U1");
        bare([[-24, -1], [-24, 20]]);
        bare([[-22, 3], [-22, 22]]);
        // 5 V in through a screw terminal
        svgEl("rect", { class: "term", x: -31.3, y: -0.6, width: 2.6, height: 4.2, rx: 0.2 }, parts);
        svgEl("circle", { class: "screw", cx: -30, cy: 0, r: 0.62 }, parts);
        svgEl("circle", { class: "screw", cx: -30, cy: 2, r: 0.62 }, parts);
        svgEl("path", { class: "lead red", d: `M${left - 2},-0.4 C${left + 0.5},-0.4 ${left + 0.5},0 -31.3,0` }, parts);
        svgEl("path", { class: "lead blk", d: `M${left - 2},2.8 C${left + 0.5},2.8 ${left + 0.5},2 -31.3,2` }, parts);
        pin(-28, 0); pin(-28, 2);
        text(-30, -1.3, "J1"); text(-30, 4.6, "5V IN", "val");
        bare([[-28, 0], [-24, 0]]);
        jump([-28, 2], [-22, 3], "blk", 0.3);
        ecap(-24, -22, 7, 1.15); text(-25.6, 7.25, "C1", "ref", "end"); text(-25.6, 8.1, "100µ", "val", "end");
        disc(-24, -22, 12); text(-25.6, 12.25, "C2", "ref", "end"); text(-25.6, 13.1, "100n", "val", "end");
        // reset pull-up, power and ground
        res(-20, -16, 0, "10k"); bare([[-24, 0], [-20, 0]]); bare([[-16, 0], [-14, 0]]);
        jump([-14, 6], [-24, 5], "red", 0.18);
        bare([[-22, 7], [-14, 7]]);
        // 16 MHz crystal on XTAL1/XTAL2 (pins 9 and 10) and its load caps
        svgEl("rect", { class: "xtal", x: -17.65, y: 7.6, width: 1.3, height: 2.8, rx: 0.65 }, parts);
        pin(-17, 8); pin(-17, 10);
        disc(-22, -20, 8); disc(-22, -20, 10);
        bare([[-20, 8], [-14, 8]]); bare([[-20, 10], [-17, 10]]);
        jump([-17, 10], [-14, 9], "wht", 0.3);
        text(-17, 12.3, "Y1", "ref"); text(-17, 13.1, "16M", "val");
        // supply for the shift registers
        jump([-24, 20], [-4, 21], "red", 0.06);
        bare([[-22, 22], [-4, 22]]);
        // data, clock and latch out to the first shift register
        jump([-11, 9], [5, 19], "ylw", 0.1);
        jump([-11, 11], [6, 19], "grn", 0.1);
        jump([-11, 13], [7, 19], "vio", 0.1);
      }
      g.append(joints); // solder over the wires
      g.append(leds);

      const k = Math.min((devicePixelRatio || 1) * 1.75, 3, Math.sqrt(9e6 / (W * H)));
      await Promise.all([paint(svg, cvBoard, W, H, k), paint(lit, cvLit, bw, bh, k)]).catch(() => { built = ""; });
      if (my !== job) return;
      Object.assign(litWrap.style, { left: bx + "px", top: by + "px", width: bw + "px", height: bh + "px" });
    };
    buildPB();
    addEventListener("resize", () => { if (!hero.classList.contains("exploding")) buildPB(); });
    // the sign lights once the layers above have cleared, and goes dark again on the way back
    const lamp = () => hero.classList.toggle("pb-on", last > (hero.classList.contains("pb-on") ? 0.5 : 0.66));

    // one stop: the board fully apart with the sign lit
    (window.scrollStops ||= []).push(() => [innerHeight * 0.79 + 2]);
    addEventListener("scroll", run, { passive: true });
    run();
    addEventListener("scroll", lamp, { passive: true });
    lamp();
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
      // Labels never get cut by the scan line: a part's block label fades out when the line
      // reaches it, and its schematic label fades in once the line has passed it.
      const pairs = orig.length === twin.length
        ? orig.map((o, i) => [o, twin[i]]).filter(([o]) => o.classList.contains("blk")) : [];
      const setW = (w) => {
        w = clamp(w);
        sc.style.setProperty("--w", w.toFixed(4));
        sc.classList.toggle("wiping", w > 0.001 && w < 0.999);
        const R = svg.getBoundingClientRect();
        if (!R.width || !R.height) return;
        const vert = !WIDE.matches;
        pairs.forEach(([o, t]) => {
          const b = (o.querySelector(":scope > rect") || o).getBoundingClientRect();
          const a0 = vert ? (b.top - R.top) / R.height : (b.left - R.left) / R.width;
          const a1 = vert ? (b.bottom - R.top) / R.height : (b.right - R.left) / R.width;
          o.toggleAttribute("data-lo", w > a0);
          t.toggleAttribute("data-lo", w < a1);
        });
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
    // Real boards are routed with 45-degree corners: cut each square corner of the board's
    // traces (and their fills and clearances). Endpoints stay put, so pads still line up.
    const chamfer = (d, C = 10) => {
      const tok = d.match(/[MHVL]|-?[\d.]+/g), pts = [];
      let x = 0, y = 0, cmd = "";
      for (let i = 0; i < tok.length; ) {
        if (/[MHVL]/.test(tok[i])) cmd = tok[i++];
        if (cmd === "H") x = +tok[i++]; else if (cmd === "V") y = +tok[i++]; else { x = +tok[i++]; y = +tok[i++]; }
        if (cmd === "M" && pts.length) return d; // more than one subpath: leave it alone
        pts.push([x, y]);
      }
      if (pts.length < 3) return d;
      const out = [`M${pts[0][0]},${pts[0][1]}`];
      for (let i = 1; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i], [cx, cy] = pts[i + 1];
        const l1 = Math.hypot(bx - ax, by - ay), l2 = Math.hypot(cx - bx, cy - by), c = Math.min(C, l1 / 2, l2 / 2);
        if (!l1 || !l2) continue;
        out.push(`L${(bx - (bx - ax) / l1 * c).toFixed(1)},${(by - (by - ay) / l1 * c).toFixed(1)}`, `L${(bx + (cx - bx) / l2 * c).toFixed(1)},${(by + (cy - by) / l2 * c).toFixed(1)}`);
      }
      const e = pts[pts.length - 1]; out.push(`L${e[0]},${e[1]}`);
      return out.join(" ");
    };
    $$(".scroll > svg .tr, .scroll > svg .sig, .scroll > svg .keep", otvFig).forEach((p) => p.setAttribute("d", chamfer(p.getAttribute("d"))));
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
    const labBox = svgEl("rect", { x: 28, y: -34, width: 150, height: 20, rx: 3 }, lab);
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
      // Keep the readout inside the arena: flip it left near the goal wall, and below near the top wall.
      const w = Math.ceil(txt.getComputedTextLength()) + 12;
      labBox.setAttribute("width", w);
      const left = s.x + 28 + w > 800, below = s.y < 40;
      labBox.setAttribute("x", left ? -28 - w : 28);
      labBox.setAttribute("y", below ? 14 : -34);
      txt.setAttribute("x", left ? -22 - w : 34);
      txt.setAttribute("y", below ? 28 : -20);
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
  // Pluto: each message lights the tools it came from (data-keys on the message).
  const plutoFig = $("#pluto [data-diagram]");
  $$(".brief .msg").forEach((m) => {
    new MutationObserver(() => {
      if (m.classList.contains("typing") && !m.dataset.lit) {
        m.dataset.lit = "1";
        (m.dataset.keys || "").split(" ").filter(Boolean).forEach((k, j) => setTimeout(() => flash(plutoFig, k), j * 300));
      }
    }).observe(m, { attributes: true, attributeFilter: ["class"] });
  });
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
    $$(".diagram .scroll, .capdraw svg").forEach((el) => {
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
    const hosts = $$(".diagram .scroll, .capdraw").map((host) => {
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
  const heroEl = $(".hero");
  if (heroEl) {
    $$(".index a").forEach((a) => {
      a.addEventListener("mouseenter", () => heroEl.classList.add("hot"));
      a.addEventListener("mouseleave", () => heroEl.classList.remove("hot"));
    });
  }

  // ------------------------------------------------------------ Exploded Brimcam cap
  // The cap pins while you scroll: it comes apart into its parts, holds with every part
  // labeled, goes back together, then the camera looks down at a tray and takes the shot,
  // which runs through the flow diagram below (camera, Herald, Gemini, macros).
  // The 3D cap (otv3d.js) takes its shot by dispatching "capshot"; light the flow diagram the same way.
  document.addEventListener("capshot", () => {
    const fig = $("#brimcam [data-diagram]");
    ["cap", "herald", "gemini", "macros"].forEach((k, i) => setTimeout(() => flash(fig, k, 1600), 300 + i * 450));
  });
  const cap = $(".capx");
  if (cap) {
    const svg = cap.querySelector("svg");
    const scene = cap.closest(".capscene");
    // Each part moves by (dx, dy) and, for the small ones, grows by up to s about its centre c.
    const layers = $$(".cl", svg).map((g) => {
      const dx = +g.dataset.dx || 0, dy = +g.dataset.dy || 0, s = +g.dataset.s || 1;
      const [cx, cy] = (g.dataset.c || "0,0").split(",").map(Number);
      g.style.setProperty("--dx", dx);
      g.style.setProperty("--dy", dy);
      const part = g.querySelector(":scope > .part");
      part?.removeAttribute("style");
      const pins = {};
      (g.dataset.pins || "").split(" ").filter(Boolean).forEach((p) => {
        const [k, xy] = p.split(":");
        const [x, y] = xy.split(",").map(Number);
        pins[k] = { x, y };
      });
      return { dx, dy, s, cx, cy, part, pins };
    });
    const grow = (l, e) => 1 + (l.s - 1) * e;
    const pinAt = (k, e) => {
      for (const l of layers) {
        const p = l.pins[k];
        if (!p) continue;
        const g = grow(l, e);
        return { x: l.cx + (p.x - l.cx) * g + l.dx * e, y: l.cy + (p.y - l.cy) * g + l.dy * e };
      }
      return null;
    };
    const wires = $$(".cw path", svg);
    const drawWires = (e) => wires.forEach((w) => {
      const a = pinAt(w.dataset.a, e), b = pinAt(w.dataset.b, e);
      if (!a || !b) return;
      const mx = (a.x + b.x) / 2;
      w.setAttribute("d", `M${a.x.toFixed(1)},${a.y.toFixed(1)} C${mx.toFixed(1)},${a.y.toFixed(1)} ${mx.toFixed(1)},${b.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`);
    });
    const set = (e, lab, fov) => {
      svg.style.setProperty("--e", e.toFixed(4));
      svg.style.setProperty("--lab", lab.toFixed(3));
      svg.style.setProperty("--fov", fov.toFixed(3));
      layers.forEach((l) => l.part && l.part.setAttribute("transform", `translate(${l.cx} ${l.cy}) scale(${grow(l, e).toFixed(4)}) translate(${-l.cx} ${-l.cy})`));
      drawWires(e);
    };
    if (REDUCED) {
      // A still exploded view with every part labeled.
      set(1, 1, 0);
    } else {
      document.documentElement.classList.add("capx-on");
      const flashEl = $(".flash", svg);
      const flowFig = $("#brimcam [data-diagram]");
      let shot = false, last = -1;
      const run = () => {
        const r = scene.getBoundingClientRect();
        const travel = scene.offsetHeight - cap.offsetHeight;
        const top = parseFloat(getComputedStyle(cap).top) || 0;
        const p = travel > 0 ? clamp((top - r.top) / travel) : 0;
        if (Math.abs(p - last) < 0.0005) return;
        last = p;
        // 0-0.3 apart, 0.3-0.6 hold, 0.6-0.8 back together, 0.82-0.92 the camera's view.
        const e = p < 0.6 ? ease(clamp(p / 0.3)) : 1 - ease(clamp((p - 0.6) / 0.2));
        const lab = clamp((e - 0.75) / 0.25);
        const fov = clamp((p - 0.82) / 0.1);
        set(e, lab, fov);
        if (p > 0.93 && !shot) {
          shot = true;
          flashEl.classList.remove("go");
          void flashEl.getBBox();
          flashEl.classList.add("go");
          ["cap", "herald", "gemini", "macros"].forEach((k, i) => setTimeout(() => flash(flowFig, k, 1600), 300 + i * 450));
        } else if (p < 0.8) shot = false;
      };
      addEventListener("scroll", run, { passive: true });
      addEventListener("resize", () => { last = -1; run(); });
      run();
    }
  }
})();
