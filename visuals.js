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
  const waitIntro = () => document.documentElement.classList.contains("scope-pending") ? setTimeout(waitIntro, 250) : setTimeout(sheen, 400);
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
    else whenSeen(finder, () => {
      const cycle = () => {
        locks.forEach((l) => l.classList.remove("on"));
        total?.classList.remove("on");
        locks.forEach((l, i) => setTimeout(() => l.classList.add("on"), 700 + i * 900));
        setTimeout(() => total?.classList.add("on"), 700 + locks.length * 900);
        setTimeout(cycle, 700 + locks.length * 900 + 5200);
      };
      cycle();
    });
  }
})();
