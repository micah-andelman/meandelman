const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

// A note is the template's text, plus a photo when the template names one:
// <template data-k="arm" data-photo="photos/otv-arm.jpg" data-alt="...">
const noteHTML = (t) => {
  if (!t.dataset.photo) return t.innerHTML.trim();
  const blk = t.closest("figure")?.querySelector(`.blk[data-k="${t.dataset.k}"]`);
  const alt = t.dataset.alt || (blk ? "Photo: " + blk.getAttribute("aria-label") : "");
  return t.innerHTML.trim() + `<img src="${t.dataset.photo}" alt="${alt}" loading="lazy">`;
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
  let pinned = null;

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
    b.addEventListener("mouseenter", () => show(k));
    b.addEventListener("mouseleave", () => show(pinned));
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
      p.title = b.getAttribute("aria-label");
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
      place(route, d, heading);
      trail.style.strokeDashoffset = glow.style.strokeDashoffset = len - d;
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
  const btn = document.querySelector(".power");
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
// with a via and a stub into each section it passes.
(() => {
  const hero = document.querySelector(".hero");
  const line = document.querySelector(".hero-trace .line");
  const stops = [...document.querySelectorAll(".project h2, .experience h2, .contact h2")];
  if (!hero || !line || !stops.length) return;
  let svg, base, drawn, len = 0, vias = [], pts = [];

  const build = () => {
    svg?.remove();
    const gutter = parseFloat(getComputedStyle(hero).paddingLeft);
    if (gutter < 32 || innerWidth <= 760) { svg = null; return; }
    const X = Math.round(gutter * 0.45);
    const l = line.getBoundingClientRect();
    const y0 = l.top + scrollY + l.height / 2;
    const ys = stops.map((h) => { const r = h.getBoundingClientRect(); return r.top + scrollY + Math.min(r.height / 2, 40); });
    const end = ys[ys.length - 1];
    svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "mtrace");
    svg.setAttribute("width", gutter);
    svg.setAttribute("height", end + 20);
    svg.setAttribute("aria-hidden", "true");
    const d = `M${gutter},${y0} H${X + 10} Q${X},${y0} ${X},${y0 + 10} V${end}`;
    svg.innerHTML =
      `<path class="base" d="${d}"/><path class="drawn" d="${d}"/>` +
      ys.map((y) => `<g><path class="stub" d="M${X},${y} H${gutter - 6}"/><circle class="via" cx="${X}" cy="${y}" r="5"/></g>`).join("");
    document.body.appendChild(svg);
    base = svg.querySelector(".base");
    drawn = svg.querySelector(".drawn");
    len = base.getTotalLength();
    drawn.style.strokeDasharray = `${len} ${len}`;
    vias = [...svg.querySelectorAll("g")];
    pts = ys;
    update();
  };

  const lengthAtY = (y) => {
    let lo = 0, hi = len;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (base.getPointAtLength(mid).y < y) lo = mid; else hi = mid;
    }
    return lo;
  };

  let queued = false;
  const update = () => {
    queued = false;
    if (!svg) return;
    const target = scrollY + innerHeight * 0.6;
    drawn.style.strokeDashoffset = len - lengthAtY(target);
    vias.forEach((g, i) => g.classList.toggle("lit", pts[i] <= target));
  };
  addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  let t;
  addEventListener("resize", () => { clearTimeout(t); t = setTimeout(build, 150); });
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

  if (root.classList.contains("scope-pending") && scrollY < 80) {
    try { localStorage.setItem("scopeSeen", "1"); } catch (e) {}
    trace().catch(() => root.classList.remove("scope-pending"));
  } else {
    root.classList.remove("scope-pending");
  }
  h1.addEventListener("dblclick", () => { if (!REDUCED && !h1.querySelector(".scope")) trace(); });
})();

// Scroll signal flow: as a diagram scrolls into view, copper fills its traces left to right
// (inputs, then controller outputs). Once it's fully in view, one pulse runs down every trace.
(() => {
  if (REDUCED) return;
  const pathLen = (d) => {
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
  const figs = [...document.querySelectorAll("[data-diagram]")].map((fig) => {
    const svg = fig.querySelector("svg");
    const vbW = svg.viewBox.baseVal.width || 960;
    const sigs = [...svg.querySelectorAll(".tr")].map((tr) => {
      const { len, x0 } = pathLen(tr.getAttribute("d"));
      const s = document.createElementNS(SVGNS, "path");
      s.setAttribute("d", tr.getAttribute("d"));
      s.setAttribute("class", "sig");
      s.style.strokeDasharray = `${len} ${len}`;
      s.style.strokeDashoffset = len;
      tr.after(s);
      return { tr, s, len, start: (x0 / vbW) * 0.55 };
    });
    return { fig, svg, sigs, fired: false };
  });
  const onePulse = (tr, delay) => {
    const len = tr.getTotalLength();
    const p = document.createElementNS(SVGNS, "path");
    p.setAttribute("d", tr.getAttribute("d"));
    p.setAttribute("class", "pulse");
    p.style.strokeDasharray = `14 ${len + 14}`;
    p.style.strokeDashoffset = 14;
    tr.after(p);
    p.animate([{ strokeDashoffset: 14 }, { strokeDashoffset: -len }],
      { duration: Math.max(450, len * 2.6), delay, easing: "ease-in-out", fill: "backwards" })
      .finished.then(() => p.remove(), () => p.remove());
  };
  let ticking = false;
  const update = () => {
    ticking = false;
    const vh = innerHeight;
    figs.forEach((f) => {
      if (!f.svg.getClientRects().length) return; // hidden (phone parts list)
      const r = f.svg.getBoundingClientRect();
      // 0 when the drawing's top reaches 95% of the screen, 1 when its top reaches 40%.
      const prog = Math.min(1, Math.max(0, (vh * 0.95 - r.top) / (vh * 0.55)));
      f.sigs.forEach(({ s, len, start }) => {
        const p = Math.min(1, Math.max(0, (prog - start) / 0.45));
        s.style.strokeDashoffset = len * (1 - p);
      });
      if (prog >= 1 && !f.fired) {
        f.fired = true;
        f.sigs.forEach(({ tr, start }) => onePulse(tr, start * 900));
      } else if (prog === 0) f.fired = false;
    });
  };
  const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  addEventListener("scroll", req, { passive: true });
  addEventListener("resize", req);
  update();
})();
