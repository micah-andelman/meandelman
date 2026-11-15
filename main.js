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

// Header gets a rule once the page scrolls.
const header = document.querySelector(".top");
const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();
