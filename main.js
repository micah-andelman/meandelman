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
  fig.querySelectorAll("template[data-k]").forEach((t) => (notes[t.dataset.k] = t.innerHTML.trim()));
  let pinned = null;

  const show = (k) => {
    fig.querySelectorAll(".on").forEach((el) => el.classList.remove("on"));
    if (!k) {
      cap.textContent = cap.dataset.default;
      cap.classList.remove("live");
      return;
    }
    fig.querySelectorAll(`[data-k="${k}"]`).forEach((el) => {
      if (el.tagName !== "TEMPLATE") el.classList.add("on");
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
  fig.querySelectorAll("template[data-k]").forEach((t) => (notes[t.dataset.k] = t.innerHTML.trim()));
  const names = fig.dataset.groups ? fig.dataset.groups.split("|") : null;

  // Collect blocks, merging ones that share a key (e.g. left and right motor drivers).
  const parts = new Map();
  fig.querySelectorAll(".blk").forEach((b) => {
    const r = b.querySelector("rect");
    const x = +r.getAttribute("x"), y = +r.getAttribute("y");
    const texts = [...b.querySelectorAll("text")];
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

// Header gets a rule once the page scrolls.
const header = document.querySelector(".top");
const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();
