// Phone layout for the block diagrams. Runs before main.js builds pads, fills and pulses, so
// everything downstream works from the new geometry. On narrow screens each diagram is
// restacked top to bottom (inputs, then the controller, then outputs) on a 400-wide board,
// and every trace is rerouted as a nested L-shape so no two traces cross.
(() => {
  if (!matchMedia("(max-width: 760px)").matches) return;
  document.documentElement.classList.add("vlayout");
  const W = 400;

  const byKey = (svg) => {
    const m = {};
    svg.querySelectorAll(".blk").forEach((b) => (m[b.dataset.k] ||= []).push(b));
    return m;
  };
  const tracesByKey = (svg) => {
    const m = {};
    svg.querySelectorAll(".tr").forEach((t) => (m[t.dataset.k] ||= []).push(t));
    return m;
  };
  // Move a block (rect plus its text) to a new box. The group is translated and the rect
  // resized, so code that reads the rect's own x/y keeps working in local coordinates.
  const place = (b, x, y, w, h) => {
    const r = b.querySelector(":scope > rect");
    const ox = +r.getAttribute("x"), oy = +r.getAttribute("y"), ow = +r.getAttribute("width"), oh = +r.getAttribute("height");
    b.setAttribute("transform", `translate(${x - ox} ${y - oy})`);
    r.setAttribute("width", w);
    r.setAttribute("height", h);
    b.querySelectorAll(":scope > text").forEach((t) => {
      if (t.classList.contains("ref")) t.setAttribute("x", ox + w - 10);
      else if (+t.getAttribute("y") > oy + h - 6) t.setAttribute("y", oy + h - 14);
    });
    return { x, y, w, h };
  };
  const finish = (svg, H) => {
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const g = svg.querySelector(".grid");
    if (g) { g.setAttribute("width", W); g.setAttribute("height", H); }
    svg.querySelectorAll(".fid circle").forEach((c) => {
      c.setAttribute("cx", +c.getAttribute("cx") < 480 ? 14 : W - 14);
      c.setAttribute("cy", +c.getAttribute("cy") < 200 ? 14 : H - 14);
    });
    const pins = svg.querySelector(".pins");
    if (pins) pins.style.display = "none";
  };

  // Hub: inputs above, controller across the middle, outputs below.
  const hub = (svg, { inputs, center, outputs, hubH, rowH, outH, power }) => {
    const blocks = byKey(svg), traces = tracesByKey(svg);
    const take = (k) => blocks[k].shift();
    const takeTr = (k) => traces[k].shift();
    // Blocks leave a strip on the right for part artwork (fins, servo horn) and the power bus.
    const BX = 150, BW = 200, GAP = 12;
    let y = 20;
    const inBoxes = inputs.map((k) => { const box = place(take(k), BX, y, BW, rowH); y += rowH + GAP; return { k, box }; });
    const hubY = y + 22;
    place(take(center), 20, hubY, W - 40, hubH);
    const hubBottom = hubY + hubH;
    inBoxes.forEach(({ k, box }, i) => {
      const cx = 40 + i * 16, ty = box.y + box.h / 2;
      const t = takeTr(k);
      t.setAttribute("d", `M${BX},${ty} H${cx} V${hubY}`);
      t.dataset.stage = 0;
    });
    y = hubBottom + 34;
    const outBoxes = outputs.map((k) => { const box = place(take(k), BX, y, BW, outH); y += outH + GAP; return { k, box }; });
    outBoxes.forEach(({ k, box }, j) => {
      const cx = 40 + (outBoxes.length - 1 - j) * 16, ty = box.y + box.h / 2;
      const t = takeTr(k);
      t.setAttribute("d", `M${cx},${hubBottom} V${ty} H${BX}`);
      t.dataset.stage = 1;
    });
    if (power) {
      // Battery under the outputs, feeding both motor drivers up the right edge.
      const bat = place(take(power), BX, y + 10, BW, rowH);
      const [d1, d2] = outBoxes.filter((o) => o.k === "drive").map((o) => o.box);
      const R = BX + BW, bus = W - 10;
      const [p1, p2] = traces[power];
      p1.setAttribute("d", `M${R},${bat.y + bat.h / 2} H${bus} V${d1.y + d1.h / 2} H${R}`);
      p2.setAttribute("d", `M${bus},${d2.y + d2.h / 2} H${R}`);
      p1.dataset.stage = p2.dataset.stage = 1;
      y = bat.y + bat.h + 12;
    }
    finish(svg, y + 14);
  };

  const otv = document.querySelector("#otv [data-diagram] svg");
  if (otv) hub(otv, {
    inputs: ["vision", "front", "depth", "color"], center: "mcu",
    outputs: ["drive", "drive", "arm", "pump"], power: "power",
    hubH: 96, rowH: 56, outH: 56,
  });

  const pluto = document.querySelector("#pluto [data-diagram] svg");
  if (pluto) hub(pluto, {
    inputs: ["phone", "location", "schedule"], center: "agent",
    outputs: ["calendar", "gmail", "canvas", "grades", "planner", "transit", "places"],
    hubH: 96, rowH: 56, outH: 44,
  });

  // Flow: a vertical chain, one step under the next.
  const flow = document.querySelector("#brimcam [data-diagram] svg");
  if (flow) {
    const order = ["cap", "herald", "gemini", "macros"];
    const blocks = byKey(flow), traces = tracesByKey(flow);
    const X = 70, BW = W - 2 * X, BH = 60, STEP = 92;
    order.forEach((k, i) => {
      place(blocks[k][0], X, 16 + i * STEP, BW, BH);
      if (i > 0) traces[k][0].setAttribute("d", `M${W / 2},${16 + (i - 1) * STEP + BH} V${16 + i * STEP}`);
    });
    finish(flow, 16 + (order.length - 1) * STEP + BH + 16);
  }
})();
