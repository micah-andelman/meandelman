const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Diagram blocks: screen readers announce the visible text (name, detail, designator), so the
// accessible name always matches what's on screen. The short name stays in data-name.
document.querySelectorAll(".blk[aria-label]").forEach((b) => {
  b.dataset.name = b.getAttribute("aria-label");
  b.removeAttribute("aria-label");
});

// A note is the template's text, plus a photo when the template names one:
// <template data-k="arm" data-photo="photos/otv-arm.jpg" data-alt="...">
const noteHTML = (t) => {
  const k = t.dataset.k;
  const code = t.parentElement.querySelector(`template[data-code="${k}"]`)
    ? ` <button class="code-btn" type="button" data-code="${k}">View code</button>` : "";
  if (!t.dataset.photo) return t.innerHTML.trim() + code;
  const blk = t.closest("figure")?.querySelector(`.blk[data-k="${k}"]`);
  const alt = t.dataset.alt || (blk ? "Photo: " + blk.dataset.name : "");
  return t.innerHTML.trim() + code + `<img src="${t.dataset.photo}" alt="${alt}" loading="lazy">`;
};

// A copper pulse that runs along a trace in its direction of travel (traces are drawn source to sink).
const SVGNS = "http://www.w3.org/2000/svg";
const addPulse = (tr) => {
  if (REDUCED) return;
  const len = tr.getTotalLength();
  const p = document.createElementNS(SVGNS, "path");
  p.setAttribute("d", tr.getAttribute("d"));
  p.setAttribute("class", "pulse");
  p.style.strokeDasharray = `14 ${len + 14}`;
  tr.after(p);
  const travel = Math.max(450, len * 2.6);
  p.animate(
    [{ strokeDashoffset: 14 }, { strokeDashoffset: -len, offset: 0.7 }, { strokeDashoffset: -len }],
    { duration: travel / 0.7, iterations: Infinity, delay: Math.random() * 200 }
  );
};

// Block diagrams: selecting a block lights its traces in copper and shows its note.
document.querySelectorAll("[data-diagram]").forEach((fig) => {
  // Wrap the drawing so small screens can swipe it sideways at a readable size.
  const svg = fig.querySelector("svg");
  const wrap = document.createElement("div");
  wrap.className = "scroll";
  svg.replaceWith(wrap);
  wrap.appendChild(svg);

  // Solder pads where each trace lands on a block; they light up with the trace.
  // Endpoints come from the path data (M/H/V/L only), so this works even while the drawing is hidden.
  const ends = (d) => {
    const tok = d.match(/[MHVL]|-?[\d.]+/g);
    let x = 0, y = 0, cmd = "", first = null;
    for (let i = 0; i < tok.length; ) {
      if (/[MHVL]/.test(tok[i])) cmd = tok[i++];
      if (cmd === "H") x = +tok[i++];
      else if (cmd === "V") y = +tok[i++];
      else { x = +tok[i++]; y = +tok[i++]; }
      if (!first) first = { x, y };
    }
    return [first, { x, y }];
  };
  svg.querySelectorAll(".tr").forEach((tr) => {
    ends(tr.getAttribute("d")).forEach((pt) => {
      const pad = document.createElementNS(SVGNS, "circle");
      pad.setAttribute("cx", pt.x);
      pad.setAttribute("cy", pt.y);
      pad.setAttribute("r", 4);
      pad.setAttribute("class", "pad");
      pad.dataset.k = tr.dataset.k;
      svg.appendChild(pad);
    });
  });

  const cap = fig.querySelector(".cap");
  const notes = {};
  fig.querySelectorAll("template[data-k]").forEach((t) => (notes[t.dataset.k] = noteHTML(t)));
  let pinned = null, leaveT = 0;
  cap.addEventListener("mouseenter", () => clearTimeout(leaveT));
  cap.addEventListener("mouseleave", () => { clearTimeout(leaveT); leaveT = setTimeout(() => show(pinned), 400); });

  const show = (k) => {
    fig.querySelectorAll(".on").forEach((el) => el.classList.remove("on"));
    fig.querySelectorAll(".pulse").forEach((el) => el.remove());
    if (!k) {
      cap.textContent = cap.dataset.default;
      cap.classList.remove("live");
      return;
    }
    fig.querySelectorAll(`[data-k="${k}"]`).forEach((el) => {
      if (el.tagName !== "TEMPLATE") el.classList.add("on");
      if (el.classList.contains("tr")) addPulse(el);
    });
    cap.innerHTML = notes[k] || cap.dataset.default;
    cap.classList.add("live");
  };

  fig.querySelectorAll(".blk").forEach((b) => {
    const k = b.dataset.k;
    b.addEventListener("mouseenter", () => { clearTimeout(leaveT); show(k); });
    // Wait a moment before clearing the note, so the pointer can reach its "View code" button.
    b.addEventListener("mouseleave", () => { clearTimeout(leaveT); leaveT = setTimeout(() => show(pinned), 900); });
    b.addEventListener("focus", () => show(k));
    b.addEventListener("blur", () => show(pinned));
    b.addEventListener("click", () => {
      pinned = pinned === k ? null : k;
      show(pinned || k);
    });
    b.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pinned = pinned === k ? null : k;
        show(pinned);
      }
    });
  });
});

// Phones: the same diagram as a vertical parts list, grouped by column, tap a part to read its note.
document.querySelectorAll("[data-diagram]").forEach((fig) => {
  const notes = {};
  fig.querySelectorAll("template[data-k]").forEach((t) => (notes[t.dataset.k] = noteHTML(t)));
  const names = fig.dataset.groups ? fig.dataset.groups.split("|") : null;

  // Collect blocks, merging ones that share a key (e.g. left and right motor drivers).
  const parts = new Map();
  fig.querySelectorAll(".blk").forEach((b) => {
    const r = b.querySelector("rect");
    const x = +r.getAttribute("x"), y = +r.getAttribute("y");
    const texts = [...b.querySelectorAll("text:not(.ref)")];
    const title = texts.filter((t) => !t.classList.contains("sub")).map((t) => t.textContent).join(" ");
    const sub = texts.filter((t) => t.classList.contains("sub")).map((t) => t.textContent).join(", ");
    const k = b.dataset.k;
    if (parts.has(k)) {
      const p = parts.get(k);
      p.title = b.dataset.name;
      if (b.dataset.pins) p.pins += " " + b.dataset.pins;
      return;
    }
    parts.set(k, { k, x, y, title, sub, pins: b.dataset.pins || "", mcu: b.classList.contains("mcu") });
  });

  const col = (x) => (x < 300 ? 0 : x < 700 ? 1 : 2);
  const list = [...parts.values()].sort((a, b) => names ? col(a.x) - col(b.x) || a.y - b.y : a.x - b.x);

  const root = document.createElement("div");
  root.className = "parts" + (names ? "" : " seq");
  let group = -1, ol;
  list.forEach((p) => {
    const g = names ? col(p.x) : 0;
    if (g !== group) {
      group = g;
      if (names) {
        const h = document.createElement("p");
        h.className = "parts-h";
        h.textContent = names[g];
        root.appendChild(h);
      }
      ol = document.createElement("ul");
      root.appendChild(ol);
    }
    const li = document.createElement("li");
    li.className = p.mcu ? "mcu" : "";
    const id = `n-${fig.closest("article").id}-${p.k}`;
    li.innerHTML =
      `<button type="button" aria-expanded="false" aria-controls="${id}">` +
      `<span class="pt">${p.title}</span>` +
      (p.pins ? `<span class="pp">${p.pins}</span>` : "") +
      (p.sub ? `<span class="ps">${p.sub}</span>` : "") +
      `</button><p class="pn" id="${id}" hidden>${notes[p.k] || ""}</p>`;
    ol.appendChild(li);
  });
  fig.appendChild(root);

  root.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const open = btn.getAttribute("aria-expanded") === "true";
    root.querySelectorAll("button[aria-expanded=true]").forEach((o) => {
      o.setAttribute("aria-expanded", "false");
      o.nextElementSibling.hidden = true;
    });
    if (!open) {
      btn.setAttribute("aria-expanded", "true");
      btn.nextElementSibling.hidden = false;
    }
  });
});

// Hero: the trace drops from its via to whichever project you point at.
(() => {
  const drop = document.querySelector(".hero-trace .drop");
  const via = document.querySelector(".hero-trace .via");
  if (!drop || !matchMedia("(hover: hover) and (min-width: 761px)").matches) return;
  const links = document.querySelectorAll(".index a");
  const off = () => {
    drop.style.height = "0px";
    drop.classList.remove("on");
    links.forEach((a) => a.classList.remove("lit"));
  };
  links.forEach((a) => {
    const on = () => {
      const v = via.getBoundingClientRect();
      const r = a.getBoundingClientRect();
      drop.style.height = `${r.top + r.height / 2 - (v.bottom - 3)}px`;
      drop.classList.add("on");
      links.forEach((x) => x.classList.toggle("lit", x === a));
    };
    a.addEventListener("mouseenter", on);
    a.addEventListener("focus", on);
    a.addEventListener("mouseleave", off);
    a.addEventListener("blur", off);
  });
})();

// Arena: replay the mission route, alternating which square the robot starts in.
(() => {
  const fig = document.getElementById("otv-route");
  if (!fig) return;
  const routes = [fig.querySelector("#route-a"), fig.querySelector("#route-b")];
  const pools = fig.querySelectorAll(".pool .site"); // [site A (top), site B (bottom)]
  const trail = fig.querySelector(".trail");
  const glow = fig.querySelector(".glow");
  const bot = fig.querySelector(".bot");
  const SPEED = 0.14; // px per ms: 1,100 px route in about 8 s
  const SAMPLE_AT = 150; // route length where the robot reaches the pool
  const SAMPLE_MS = 2200;
  let which = 0, raf = 0;

  const place = (route, d, heading) => {
    const pt = route.getPointAtLength(d);
    bot.setAttribute("transform", `translate(${pt.x} ${pt.y}) rotate(${heading})`);
    return pt;
  };
  const angleAt = (route, d) => {
    const a = route.getPointAtLength(Math.max(0, d - 1)), b = route.getPointAtLength(d + 1);
    return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  };
  const diff = (a, b) => ((b - a + 540) % 360) - 180;

  const run = () => {
    cancelAnimationFrame(raf);
    const route = routes[which];
    pools.forEach((c, i) => c.classList.toggle("on", i === which));
    routes.forEach((r, i) => r.classList.toggle("off", i !== which));
    const len = route.getTotalLength();
    [trail, glow].forEach((p) => {
      p.setAttribute("d", route.getAttribute("d"));
      p.style.strokeDasharray = `${len} ${len}`;
      p.style.strokeDashoffset = len;
    });
    pools.forEach((c) => c.classList.remove("sampling"));
    if (REDUCED) {
      trail.style.strokeDashoffset = glow.style.strokeDashoffset = 0;
      place(route, len, 0);
      return;
    }
    let heading = angleAt(route, 2), last = performance.now(), d = 0, held = 0;
    fig.dispatchEvent(new CustomEvent("otvstart"));
    const tick = (now) => {
      const dt = Math.min(250, now - last);
      last = now;
      if (d >= SAMPLE_AT && held < SAMPLE_MS) {
        held += dt;
        pools[which].classList.toggle("sampling", held < SAMPLE_MS);
      } else d = Math.min(len, d + dt * SPEED);
      // Face the direction of travel, except when backing up (keep facing forward), and turn at a finite rate.
      let target = angleAt(route, d);
      if (Math.abs(diff(heading, target)) > 120) target += 180;
      const step = diff(heading, target);
      heading += Math.sign(step) * Math.min(Math.abs(step), dt * 0.35);
      const pt = place(route, d, heading);
      trail.style.strokeDashoffset = glow.style.strokeDashoffset = len - d;
      // State for the status readout and camera overlay (extras.js, visuals.js).
      fig.dispatchEvent(new CustomEvent("otvtick", { detail: {
        t: now, d, held, turn: dt ? step / dt : 0, done: d >= len, x: pt.x, y: pt.y, h: heading,
        sampling: d >= SAMPLE_AT && held > 0 && held < SAMPLE_MS,
      } }));
      if (d < len) raf = requestAnimationFrame(tick);
      else which = 1 - which;
    };
    raf = requestAnimationFrame(tick);
  };

  // Printing shows the whole route with the robot at the goal.
  addEventListener("beforeprint", () => {
    cancelAnimationFrame(raf);
    const route = routes[which];
    const len = route.getTotalLength();
    pools.forEach((c, i) => c.classList.toggle("on", i === which));
    routes.forEach((r, i) => r.classList.toggle("off", i !== which));
    [trail, glow].forEach((p) => {
      p.setAttribute("d", route.getAttribute("d"));
      p.style.strokeDasharray = `${len} ${len}`;
      p.style.strokeDashoffset = 0;
    });
    place(route, len, 0);
  });

  place(routes[0], 0, angleAt(routes[0], 2));
  routes[1].classList.add("off");
  trail.style.strokeDasharray = glow.style.strokeDasharray = "0 99999";
  let started = false;
  new IntersectionObserver((es, io) => {
    if (es[0].isIntersecting && !started) { started = true; run(); io.disconnect(); }
  }, { threshold: 0.5 }).observe(fig.querySelector("svg"));
  fig.querySelector(".replay").addEventListener("click", run);
})();

// Header gets a rule once the page scrolls.
const header = document.querySelector(".top");
const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();


// Power switch: flips light/dark, remembers the choice, and flashes the traces once.
(() => {
  const btn = document.querySelector("button.power");
  if (!btn) return;
  const root = document.documentElement;
  const sys = matchMedia("(prefers-color-scheme: dark)");
  const isDark = () => (root.dataset.theme ? root.dataset.theme === "dark" : sys.matches);
  const sync = () => btn.setAttribute("aria-checked", String(isDark()));
  sync();
  sys.addEventListener("change", sync);
  btn.addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) {}
    sync();
    root.classList.remove("powerup");
    void root.offsetWidth;
    root.classList.add("powerup");
    setTimeout(() => root.classList.remove("powerup"), 1000);
  });
})();

// Margin trace: one copper trace down the left gutter, drawn as you scroll,
// with a via and a stub into each section it passes. Each section's top edge is a wire
// branching off it, and copper runs across that wire once the trace reaches it.
(() => {
  const hero = document.querySelector(".hero");
  const line = document.querySelector(".hero-trace .line");
  const stops = [...document.querySelectorAll(".project :is(h1, h2), .work h2, .experience h2, .contact h2")];
  if (!hero || !line || !stops.length) return;
  const sections = [...document.querySelectorAll(".project, .work, .experience, .contact")];
  let svg, base, drawn, len = 0, vias = [], pts = [], branches = [];

  const build = () => {
    svg?.remove();
    const gutter = parseFloat(getComputedStyle(hero).paddingLeft);
    if (gutter < 32 || innerWidth <= 760) { svg = null; document.documentElement.classList.remove("mtrace-on"); return; }
    const W = document.documentElement.clientWidth;
    const X = Math.round(gutter * 0.45);
    const l = line.getBoundingClientRect();
    const y0 = l.top + scrollY + l.height / 2;
    const ys = stops.map((h) => { const r = h.getBoundingClientRect(); return r.top + scrollY + Math.min(r.height / 2, 40); });
    const bys = sections.map((s) => Math.round(s.getBoundingClientRect().top + scrollY) + 0.5);
    const end = Math.max(ys[ys.length - 1], bys[bys.length - 1]);
    svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "mtrace");
    svg.setAttribute("width", W);
    svg.setAttribute("height", end + 20);
    svg.setAttribute("aria-hidden", "true");
    const d = `M${gutter},${y0} H${X + 10} Q${X},${y0} ${X},${y0 + 10} V${end}`;
    svg.innerHTML =
      `<path class="base" d="${d}"/><path class="drawn" d="${d}"/>` +
      bys.map((y) => `<g class="br"><path class="branch" d="M${X},${y} H${W - gutter}"/><path class="bfill" d="M${X},${y} H${W - gutter}"/>` +
        `<circle class="tee" cx="${X}" cy="${y}" r="3.5"/><circle class="bend" cx="${W - gutter}" cy="${y}" r="5"/></g>`).join("") +
      ys.map((y) => `<g class="st"><path class="stub" d="M${X},${y} H${gutter - 6}"/><circle class="via" cx="${X}" cy="${y}" r="5"/></g>`).join("");
    document.body.appendChild(svg);
    base = svg.querySelector(".base");
    drawn = svg.querySelector(".drawn");
    len = base.getTotalLength();
    drawn.style.strokeDasharray = `${len} ${len}`;
    vias = [...svg.querySelectorAll("g.st")];
    pts = ys;
    branches = [...svg.querySelectorAll("g.br")].map((g, i) => {
      const fill = g.querySelector(".bfill"), bl = W - gutter - X;
      fill.style.strokeDasharray = `${bl} ${bl}`;
      return { y: bys[i], bl, fill, tee: g.querySelector(".tee"), end: g.querySelector(".bend") };
    });
    document.documentElement.classList.add("mtrace-on");
    update();
  };

  // y along the trace, sampled once per build (the path only runs down), then searched per frame
  let ys = null, ysFor = null;
  const lengthAtY = (y) => {
    if (ysFor !== base) {
      ysFor = base;
      const n = Math.max(2, Math.ceil(len / 4) + 1);
      ys = new Float32Array(n);
      for (let i = 0; i < n; i++) ys[i] = base.getPointAtLength((i / (n - 1)) * len).y;
    }
    const n = ys.length;
    let lo = 0, hi = n - 1;
    if (y <= ys[0]) return 0;
    if (y >= ys[hi]) return len;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ys[mid] < y) lo = mid; else hi = mid; }
    const f = (y - ys[lo]) / Math.max(1e-6, ys[hi] - ys[lo]);
    return ((lo + f) / (n - 1)) * len;
  };

  let queued = false;
  const update = () => {
    queued = false;
    if (!svg) return;
    const target = scrollY + innerHeight * 0.6;
    drawn.style.strokeDashoffset = len - lengthAtY(target);
    vias.forEach((g, i) => g.classList.toggle("lit", pts[i] <= target));
    // Copper runs across a section's wire over the next third of a screen after the trace reaches it.
    branches.forEach((b) => {
      const f = Math.min(1, Math.max(0, (target - b.y) / (innerHeight * 0.35)));
      b.fill.style.strokeDashoffset = b.bl * (1 - f);
      b.tee.classList.toggle("lit", f > 0);
      b.end.classList.toggle("lit", f >= 1);
    });
  };
  addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  let t;
  addEventListener("resize", () => { clearTimeout(t); t = setTimeout(build, 150); });
  // Content that grows after load (Pluto's typed brief, the 3D section) moves every section below it.
  let lastH = 0;
  new ResizeObserver(() => {
    const h = document.body.scrollHeight;
    if (Math.abs(h - lastH) < 2) return;
    lastH = h; clearTimeout(t); t = setTimeout(build, 150);
  }).observe(document.body);
  document.fonts.ready.then(build);
  addEventListener("load", build);
})();

// Oscilloscope intro: on the first visit a phosphor beam traces the name, then it fills in.
// Double-click the name to see it again.
(() => {
  const root = document.documentElement;
  const hero = document.querySelector(".hero");
  const h1 = hero && hero.querySelector("h1");
  if (!h1) return;

  const trace = async () => {
    await document.fonts.ready;
    const cs = getComputedStyle(h1);
    const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = font;
    const h = h1.getBoundingClientRect();
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "scope");
    svg.setAttribute("width", h.width);
    svg.setAttribute("height", h.height);
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = `<defs><filter id="phosphor" x="-10%" y="-20%" width="120%" height="140%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("filter", "url(#phosphor)");
    svg.appendChild(g);
    // Each line is revealed behind a sweeping beam, like a scope trace, outline first.
    const lines = [];
    [...h1.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).forEach((n, i) => {
      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      const m = ctx.measureText(n.textContent);
      const x = r.left - h.left, y = r.top - h.top;
      const id = `scope-clip-${i}`;
      const pad = 12;
      g.insertAdjacentHTML("beforeend",
        `<clipPath id="${id}"><rect x="${x - pad}" y="${y - pad}" width="${r.width + 2 * pad}" height="${r.height + 2 * pad}"/></clipPath>` +
        `<text clip-path="url(#${id})" x="${x}" y="${y + m.fontBoundingBoxAscent}">${n.textContent}</text>` +
        `<rect class="beam" x="${x - pad}" y="${y + r.height * 0.08}" width="3" height="${r.height * 0.84}"/>`);
      const t = g.lastElementChild.previousElementSibling;
      Object.assign(t.style, { font, letterSpacing: cs.letterSpacing });
      lines.push({ clip: g.querySelector(`#${id} rect`), beam: g.lastElementChild, w: r.width + 2 * pad });
    });
    hero.classList.add("scoping");
    root.classList.add("scope-pending");
    h1.appendChild(svg);
    const D = 1050;
    await Promise.all(lines.map(({ clip, beam, w }, i) => {
      const opts = { duration: D, delay: 120 + i * (D * 0.75), easing: "cubic-bezier(.45,.05,.35,1)", fill: "both" };
      clip.style.transformBox = "fill-box";
      clip.style.transformOrigin = "left center";
      beam.animate([{ transform: "translateX(0)", opacity: 1 }, { transform: `translateX(${w}px)`, opacity: 1 }, { transform: `translateX(${w}px)`, opacity: 0 }],
        { ...opts, duration: D + 250 });
      return clip.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], opts).finished;
    }));
    await new Promise((r) => setTimeout(r, 250));
    root.classList.remove("scope-pending");
    hero.classList.remove("scoping");
    await svg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, easing: "ease-out", fill: "forwards" }).finished;
    svg.remove();
  };

  // the easter egg list (or the serial monitor) on another page sends you here with ?intro
  if (new URLSearchParams(location.search).has("intro")) {
    history.replaceState(null, "", location.pathname + location.hash);
    if (!REDUCED) { scrollTo(0, 0); setTimeout(() => trace().catch(() => root.classList.remove("scope-pending")), 400); }
  }
  if (root.classList.contains("scope-pending") && scrollY < 80) {
    try { localStorage.setItem("scopeSeen", "1"); } catch (e) {}
    trace().catch(() => root.classList.remove("scope-pending"));
  } else {
    root.classList.remove("scope-pending");
  }
  h1.addEventListener("dblclick", () => { if (!REDUCED && !h1.querySelector(".scope")) trace(); });
})();

// Smooth scrolling (Lenis). The page still scrolls natively underneath; Lenis just eases the wheel.
// Every scroll-driven animation registers its chapter positions (absolute scroll Y values) in
// window.scrollStops, so a fast flick can't skip through one:
//   - with a wheel or trackpad, scrolling is paced so the speed stays even, and a single gesture
//     (including a trackpad's coasting) stops at the next chapter. Keep scrolling and it moves on
//     after a short beat; a fresh gesture moves on at once.
//   - on touch screens (Lenis leaves touch scrolling native), the same positions become CSS snap
//     points with scroll-snap-stop, so a fling stops at the next chapter too.
const scrollStops = () => (window.scrollStops || [])
  .flatMap((f) => { try { return f() || []; } catch (e) { return []; } })
  .filter(Number.isFinite).map(Math.round).sort((a, b) => a - b);
const lenis = (() => {
  if (REDUCED || !window.Lenis) return null;
  const head = document.querySelector(".top");
  let last = 0, gate = null, gateDir = 0, heldAt = 0;
  const govern = (t) => {
    const ev = t.event;
    if (!ev.type.includes("wheel") || ev.ctrlKey) return true;
    // Anything swallowed here must also cancel the wheel event: Lenis only cancels the events it
    // scrolls, and an uncancelled one scrolls the page natively, in a raw jump.
    const swallow = () => { if (ev.cancelable) ev.preventDefault(); return false; };
    const raw = t.deltaY, dir = Math.sign(raw), now = performance.now();
    if (!dir) return true;
    // Even speed: the scroll target never runs more than half a screen ahead of the page, so a hard
    // flick and a steady roll move at the same pace. Nothing is thrown away, it's just paced.
    const LEAD = innerHeight * 0.5, ahead = l.targetScroll - l.animatedScroll;
    let d = dir > 0 ? Math.min(raw, Math.max(0, LEAD - ahead)) : Math.max(raw, Math.min(0, -LEAD - ahead));
    if (now - last > 240 || dir !== gateDir) { gate = null; heldAt = 0; } // a new gesture
    last = now;
    if (gate != null && (gate - l.targetScroll) * dir < -1) gate = null; // already past it (keys, scrollbar)
    if (gate == null) {
      const pos = l.targetScroll, S = scrollStops();
      gate = (dir > 0 ? S.find((s) => s > pos + 3) : S.reverse().find((s) => s < pos - 3)) ?? null;
      gateDir = dir;
    }
    if (gate != null) {
      const room = gate - l.targetScroll;
      if (Math.abs(room) < 1) { // parked on a chapter
        heldAt ||= now;
        // only a long, still-strong push carries on; a fling and its fading coast stop here
        if (now - heldAt > 1200 && Math.abs(raw) >= 40) { gate = null; heldAt = 0; }
        return swallow();
      }
      if (dir > 0 ? d > room : d < room) d = room;
    }
    if (Math.abs(d) < 0.5) return swallow();
    t.deltaY = d;
    return true;
  };
  const l = new Lenis({ lerp: 0.1, virtualScroll: govern, anchors: { offset: -(head ? head.offsetHeight : 0) - 8 } });
  const raf = (t) => { l.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  return l;
})();
// Touch screens: the chapter positions as native snap points.
(() => {
  if (REDUCED || !matchMedia("(pointer: coarse)").matches) return;
  const box = document.createElement("div");
  box.className = "snapstops";
  box.setAttribute("aria-hidden", "true");
  document.body.appendChild(box);
  let key = "";
  const place = () => {
    const S = scrollStops(), k = S.join(",");
    if (k === key) return;
    key = k;
    box.replaceChildren(...S.map((y) => { const i = document.createElement("i"); i.style.top = y + "px"; return i; }));
    document.documentElement.classList.toggle("snapping", S.length > 0);
  };
  // Moving snap points mid-scroll makes Safari jump, so they're only placed again when the width
  // changes or the page's length really changes, not when the toolbar slides in and out.
  let t = 0, lastW = 0, lastLen = 0;
  const later = () => { clearTimeout(t); t = setTimeout(place, 300); };
  addEventListener("load", later);
  addEventListener("resize", () => { if (innerWidth !== lastW) { lastW = innerWidth; later(); } });
  new ResizeObserver(() => {
    const len = document.documentElement.scrollHeight;
    if (Math.abs(len - lastLen) > 150) { lastLen = len; later(); }
  }).observe(document.body);
  lastW = innerWidth; lastLen = document.documentElement.scrollHeight;
  later();
})();

// Signal scenes. Each diagram with groups sits in a tall section and stays pinned while you scroll
// through it. Scroll position drives the signal: copper runs in from the inputs, the controller
// lights, then copper runs out to the outputs. Once a trace is lit, dots keep flowing along it.
// Diagrams without groups just fill as they scroll into view.
(() => {
  if (REDUCED) return;
  const head = document.querySelector(".top");
  const wide = matchMedia("(min-width: 761px)");
  const clamp = (v) => Math.min(1, Math.max(0, v));
  const ease = (t) => t * t * (3 - 2 * t);
  const pathInfo = (d) => {
    const tok = d.match(/[MHVL]|-?[\d.]+/g);
    let x = 0, y = 0, cmd = "", len = 0, x0 = null;
    for (let i = 0; i < tok.length; ) {
      if (/[MHVL]/.test(tok[i])) cmd = tok[i++];
      const px = x, py = y;
      if (cmd === "H") x = +tok[i++];
      else if (cmd === "V") y = +tok[i++];
      else { x = +tok[i++]; y = +tok[i++]; }
      if (cmd === "M") x0 ??= x;
      else len += Math.hypot(x - px, y - py);
    }
    return { len, x0 };
  };
  const circle = (g, cls, r) => {
    const c = document.createElementNS(SVGNS, "circle");
    c.setAttribute("r", r);
    c.setAttribute("class", cls);
    g.appendChild(c);
    return c;
  };

  const scenes = [...document.querySelectorAll("[data-diagram]")].map((fig) => {
    const svg = fig.querySelector("svg");
    const mid = (svg.viewBox.baseVal.width || 960) / 2;
    const groups = fig.dataset.groups ? fig.dataset.groups.split("|") : null;
    const dots = document.createElementNS(SVGNS, "g");
    dots.setAttribute("class", "dots");
    svg.insertBefore(dots, svg.querySelector(".blk"));
    const traces = [...svg.querySelectorAll(".tr")].map((tr) => {
      const { len, x0 } = pathInfo(tr.getAttribute("d"));
      const s = document.createElementNS(SVGNS, "path");
      s.setAttribute("d", tr.getAttribute("d"));
      s.setAttribute("class", "sig");
      s.style.strokeDasharray = `${len} ${len + 2}`;
      tr.after(s);
      return {
        tr, s, len, x0, f: -1,
        stage: tr.dataset.stage != null ? +tr.dataset.stage : groups && x0 >= mid ? 1 : 0,
        lead: circle(dots, "lead", 4.5),
        flow: [circle(dots, "drop", 3), circle(dots, "drop", 3)],
      };
    });
    // Within a stage, traces start in order from left to right.
    [0, 1].forEach((st) => {
      const xs = traces.filter((t) => t.stage === st).map((t) => t.x0);
      const lo = Math.min(...xs), span = Math.max(...xs) - lo || 1;
      traces.filter((t) => t.stage === st).forEach((t) => (t.k = (t.x0 - lo) / span));
    });
    let steps = null, wrap = null;
    if (groups) {
      wrap = document.createElement("div");
      wrap.className = "scene";
      fig.before(wrap);
      wrap.appendChild(fig);
      steps = document.createElement("ol");
      steps.className = "steps";
      steps.setAttribute("aria-hidden", "true");
      steps.innerHTML = groups.map((g) => `<li>${g}</li>`).join("") + (fig.hasAttribute("data-schem") ? "<li>Schematic</li>" : "");
      fig.querySelector(".scroll").after(steps);
    }
    // A diagram with a schematic gets a fourth stage, so the first three play a little faster.
    const T = fig.hasAttribute("data-schem")
      ? { a: [0.03, 0.27], b: [0.36, 0.6], hot: 0.25, cur: [0.25, 0.36, 0.64], len: 2.8 }
      : { a: [0.04, 0.4], b: [0.54, 0.9], hot: 0.36, cur: [0.36, 0.54, 2], len: 1.8 };
    return { fig, svg, wrap, steps, traces, T, mcu: svg.querySelector(".blk.mcu"), extra: 0, p: -1, onScreen: false };
  });

  // Each pinned diagram stops at the start, after the copper comes in, after it goes out, and at the end.
  (window.scrollStops ||= []).push(() => scenes.flatMap((sc) => {
    if (!sc.wrap || !sc.extra) return [];
    const base = sc.wrap.getBoundingClientRect().top + scrollY - sc.pin;
    return [0, sc.T.a[1], sc.T.b[1], 1].map((f) => base + sc.extra * f);
  }));

  // Size each scene: the pinned diagram plus about two screens of scroll to play through.
  const layout = () => {
    const h = head ? head.offsetHeight : 0;
    scenes.forEach((sc) => {
      if (!sc.wrap) return;
      if (!wide.matches) { sc.wrap.style.height = ""; sc.extra = 0; return; }
      const fh = sc.fig.offsetHeight;
      const room = innerHeight - h;
      sc.pin = h + Math.max(8, (room - fh) / 2);
      sc.fig.style.top = sc.pin + "px";
      sc.extra = Math.round(innerHeight * sc.T.len);
      sc.wrap.style.height = fh + sc.extra + "px";
    });
  };

  const fillOf = (sc, t, p) => {
    if (!sc.wrap) return ease(clamp((p - t.k * 0.35) / 0.65));
    const [a, b] = t.stage === 0 ? sc.T.a : sc.T.b;
    const w = (b - a) * 0.6;
    return ease(clamp((p - a - t.k * (b - a - w)) / w));
  };

  const render = (now) => {
    scenes.forEach((sc) => { try { frame(sc, now); } catch (e) {} });
    if (scenes.some((sc) => sc.onScreen)) requestAnimationFrame(render);
    else running = false;
  };
  // Points along each trace, sampled once: getPointAtLength on every dot every frame was the
  // biggest cost while scrolling past a diagram.
  const ptAt = (t, d) => {
    if (!t.pts) {
      const n = Math.max(2, Math.ceil(t.len / 2) + 1);
      t.pts = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { const q = t.tr.getPointAtLength((i / (n - 1)) * t.len); t.pts[2 * i] = q.x; t.pts[2 * i + 1] = q.y; }
    }
    const n = t.pts.length / 2, x = Math.min(n - 1, Math.max(0, (d / t.len) * (n - 1))), i = Math.min(n - 2, Math.floor(x)), f = x - i;
    return { x: t.pts[2 * i] + (t.pts[2 * i + 2] - t.pts[2 * i]) * f, y: t.pts[2 * i + 1] + (t.pts[2 * i + 3] - t.pts[2 * i + 1]) * f };
  };
  const frame = (sc, now) => {
    {
      if (!sc.onScreen || !sc.svg.getClientRects().length) return;
      const moving = !!lenis && Math.abs(lenis.velocity) > 0.3;
      let p;
      if (sc.wrap && sc.extra) {
        const top = sc.wrap.getBoundingClientRect().top;
        p = clamp((sc.pin - top) / sc.extra);
      } else {
        const r = sc.svg.getBoundingClientRect();
        p = clamp((innerHeight * 0.92 - r.top) / (innerHeight * 0.55));
      }
      sc.traces.forEach((t) => {
        const f = fillOf(sc, t, p);
        if (f !== t.f) { t.s.style.strokeDashoffset = t.len * (1 - f); t.f = f; }
        // A bright dot rides the leading edge while the trace is filling.
        if (f > 0.001 && f < 0.999) {
          const pt = ptAt(t, f * t.len);
          t.lead.setAttribute("cx", pt.x); t.lead.setAttribute("cy", pt.y);
          t.lead.style.opacity = 1;
        } else t.lead.style.opacity = 0;
        // Once lit, dots keep flowing toward the sink. They hold still while the page is moving, so
        // repainting the diagram never competes with the scroll.
        if (moving && f >= 0.999) return;
        const period = Math.max(900, t.len * 6);
        t.flow.forEach((d, i) => {
          if (f < 0.999) { d.style.opacity = 0; return; }
          const u = ((now / period) + i / t.flow.length + t.k * 0.37) % 1;
          const pt = ptAt(t, u * t.len);
          d.setAttribute("cx", pt.x); d.setAttribute("cy", pt.y);
          d.style.opacity = Math.min(1, u * 6, (1 - u) * 6);
        });
      });
      if (sc.mcu) sc.mcu.classList.toggle("hot", p > sc.T.hot);
      // Tell the page how far through its scene this diagram is (visuals.js runs the schematic wipe).
      if (p !== sc.p) { sc.p = p; sc.fig.dispatchEvent(new CustomEvent("sceneprogress", { detail: p })); }
      if (sc.steps) {
        const [c1, c2, c3] = sc.T.cur;
        const cur = p < c1 ? 0 : p < c2 ? 1 : p < c3 ? 2 : 3;
        [...sc.steps.children].forEach((li, i) => li.classList.toggle("on", i === cur && p > 0.02));
      }
    }
  };

  let running = false;
  const kick = () => { if (!running) { running = true; requestAnimationFrame(render); } };
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => { const sc = scenes.find((s) => s.fig === e.target); if (sc) sc.onScreen = e.isIntersecting; });
    kick();
  });
  scenes.forEach((sc) => io.observe(sc.fig));

  layout();
  addEventListener("resize", () => { layout(); kick(); });
  document.fonts?.ready.then(() => { layout(); lenis?.resize(); dispatchEvent(new Event("resize")); });
  // Printing shows every trace lit.
  addEventListener("beforeprint", () => scenes.forEach((sc) => sc.traces.forEach((t) => { t.s.style.strokeDashoffset = 0; t.f = 1; })));
})();

// Projects dropdown in the top bar: a disclosure button. Click (or tap) to open; it also opens on
// hover with a mouse. Escape, a click elsewhere or tabbing out closes it.
(() => {
  const box = document.querySelector(".pmenu");
  if (!box) return;
  const btn = box.querySelector(".pmenu-btn"), list = box.querySelector(".pmenu-list");
  // closeT: the short delay before closing when the mouse leaves; hideT: hiding the list once it has faded
  let closeT = 0, hideT = 0, byHover = false;
  const set = (on, focus) => {
    clearTimeout(closeT);
    if (on === box.classList.contains("open")) return;
    clearTimeout(hideT);
    btn.setAttribute("aria-expanded", on);
    if (on) { list.hidden = false; void list.offsetWidth; box.classList.add("open"); if (focus) list.querySelector("a")?.focus(); }
    else { box.classList.remove("open"); hideT = setTimeout(() => { list.hidden = true; }, 170); }
  };
  // If a hover opened it, the first click on "Projects" just keeps it open; the next one closes it.
  btn.addEventListener("click", () => {
    const open = box.classList.contains("open");
    if (open && byHover) { byHover = false; return; }
    byHover = false;
    set(!open);
  });
  btn.addEventListener("keydown", (e) => { if (e.key === "ArrowDown") { e.preventDefault(); set(true, true); } });
  const hover = matchMedia("(hover: hover) and (pointer: fine)");
  box.addEventListener("pointerenter", (e) => { if (hover.matches && e.pointerType === "mouse" && !box.classList.contains("open")) { byHover = true; set(true); } });
  box.addEventListener("pointerleave", (e) => { if (hover.matches && e.pointerType === "mouse" && byHover) closeT = setTimeout(() => set(false), 220); });
  document.addEventListener("click", (e) => { if (!box.contains(e.target)) set(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && box.classList.contains("open")) { set(false); btn.focus(); } });
  box.addEventListener("focusout", (e) => { if (!box.contains(e.relatedTarget)) set(false); });
  // arrow keys move between the links
  list.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const links = [...list.querySelectorAll("a")], i = links.indexOf(document.activeElement);
    links[(i + (e.key === "ArrowDown" ? 1 : -1) + links.length) % links.length].focus();
  });
})();
