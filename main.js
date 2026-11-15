const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

// A note is the template's text, plus a photo when the template names one:
// <template data-k="arm" data-photo="photos/otv-arm.jpg" data-alt="...">
const noteHTML = (t) =>
  t.innerHTML.trim() +
  (t.dataset.photo ? `<img src="${t.dataset.photo}" alt="${t.dataset.alt || ""}" loading="lazy">` : "");

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
  const pools = fig.querySelectorAll(".pool circle"); // [site A (top), site B (bottom)]
  const trail = fig.querySelector(".trail");
  const bot = fig.querySelector(".bot");
  const SPEED = 0.14; // px per ms: 1,100 px route in about 8 s
  const SAMPLE_AT = 150; // route length where the robot reaches the pool
  const SAMPLE_MS = 1400;
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
    trail.setAttribute("d", route.getAttribute("d"));
    trail.style.strokeDasharray = `${len} ${len}`;
    if (REDUCED) {
      trail.style.strokeDashoffset = 0;
      place(route, len, 0);
      return;
    }
    let heading = angleAt(route, 2), last = performance.now(), d = 0, held = 0;
    const tick = (now) => {
      const dt = Math.min(250, now - last);
      last = now;
      if (d >= SAMPLE_AT && held < SAMPLE_MS) held += dt;
      else d = Math.min(len, d + dt * SPEED);
      // Face the direction of travel, except when backing up (keep facing forward), and turn at a finite rate.
      let target = angleAt(route, d);
      if (Math.abs(diff(heading, target)) > 120) target += 180;
      const step = diff(heading, target);
      heading += Math.sign(step) * Math.min(Math.abs(step), dt * 0.35);
      place(route, d, heading);
      trail.style.strokeDashoffset = len - d;
      if (d < len) raf = requestAnimationFrame(tick);
      else which = 1 - which;
    };
    raf = requestAnimationFrame(tick);
  };

  place(routes[0], 0, angleAt(routes[0], 2));
  routes[1].classList.add("off");
  trail.style.strokeDasharray = "0 99999";
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
