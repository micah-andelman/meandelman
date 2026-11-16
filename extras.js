// Extras: signal probe, logic analyzer, code viewer, serial monitor, Pluto status,
// thermal view, and the easter-egg list. Loaded after main.js.
(() => {
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NS = "http://www.w3.org/2000/svg";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // ---------------------------------------------------------------- Easter eggs
  const EGGS = [
    { id: "intro", name: "Replay the intro", hint: "Double-click my name." },
    { id: "probe", name: "Probe a signal", hint: "Hover a trace in one of the diagrams." },
    { id: "heat", name: "Feel the heat", hint: "There's a thermometer up here somewhere." },
    { id: "serial", name: "Open the serial monitor", hint: "Press the backtick key ( ` )." },
    { id: "pluto", name: "Check on Pluto", hint: "Ask the serial monitor for its status." },
    { id: "print", name: "Print the datasheet", hint: "Print this page." },
    { id: "open", name: "Break the circuit", hint: "Visit a page that doesn't exist." },
  ];
  const found = new Set(store.get("eggs", []));
  const eggBtn = $("button.egg");
  const pop = el("div", "eggs");
  pop.id = "eggs";
  pop.hidden = true;
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", "Things to find");
  document.body.appendChild(pop);

  const renderEggs = () => {
    pop.innerHTML =
      `<p class="eh">Things to find <span>${[...found].filter((id) => EGGS.some((e) => e.id === id)).length} of ${EGGS.length}</span></p><ul>` +
      EGGS.map((e) => `<li${found.has(e.id) ? ' class="got"' : ""}><button type="button" data-egg="${e.id}"><i aria-hidden="true"></i><span><b>${e.name}</b><em>${e.hint}</em></span></button></li>`).join("") +
      "</ul>";
  };
  const markNew = (on) => eggBtn && eggBtn.classList.toggle("new", on);
  const find = (id) => {
    if (found.has(id)) return;
    found.add(id);
    store.set("eggs", [...found]);
    store.set("eggNew", 1);
    markNew(true);
    renderEggs();
  };
  renderEggs();
  markNew(store.get("eggNew", 0) === 1);

  const placePop = () => {
    const r = eggBtn.getBoundingClientRect();
    pop.style.top = r.bottom + 10 + "px";
    pop.style.right = Math.max(12, innerWidth - r.right - 6) + "px";
  };
  const openPop = (open) => {
    if (pop.hidden === !open) return;
    pop.hidden = !open;
    eggBtn.setAttribute("aria-expanded", open);
    if (open) {
      placePop(); markNew(false); store.set("eggNew", 0);
      pop.querySelector("button")?.focus({ preventScroll: true });
    } else if (pop.contains(document.activeElement)) eggBtn.focus({ preventScroll: true });
  };
  if (eggBtn) {
    eggBtn.addEventListener("click", (e) => { e.stopPropagation(); openPop(pop.hidden); });
    document.addEventListener("click", (e) => { if (!pop.hidden && !pop.contains(e.target)) openPop(false); });
    addEventListener("resize", () => !pop.hidden && placePop());
  }
  // Scroll through Lenis when it's running (main.js), so the two never fight over the page.
  const smooth = () => (typeof lenis !== "undefined" && lenis) || null;
  const glide = (y) => {
    const l = smooth();
    if (l) l.scrollTo(y, { duration: 1.2 });
    else scrollTo({ top: y, behavior: REDUCED ? "auto" : "smooth" });
  };
  const head = () => $(".top")?.offsetHeight || 0;
  const scrollToEl = (target) => {
    if (!target) return;
    // A pinned diagram: go to the end of its scene, where every trace is lit.
    const scene = target.closest(".scene");
    if (scene && scene.offsetHeight > target.offsetHeight + 40) {
      const r = scene.getBoundingClientRect();
      return glide(scrollY + r.top + scene.offsetHeight - target.offsetHeight - innerHeight * 0.1);
    }
    glide(scrollY + target.getBoundingClientRect().top - head() - 16);
  };
  pop.addEventListener("click", (e) => {
    const b = e.target.closest("[data-egg]");
    if (!b) return;
    openPop(false);
    const id = b.dataset.egg;
    if (id === "intro") replayIntro();
    else if (id === "probe") scrollToEl($("#otv [data-diagram]"));
    else if (id === "heat") setHeat(!document.documentElement.classList.contains("thermal"));
    else if (id === "serial") openMonitor(true);
    else if (id === "pluto") { openMonitor(true); run("status pluto"); }
    else if (id === "print") print();
    else if (id === "open") location.href = "/open-circuit";
  });
  const replayIntro = () => {
    glide(0);
    setTimeout(() => $("#name")?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })), REDUCED ? 0 : 1000);
  };
  $("#name")?.addEventListener("dblclick", () => find("intro"));
  addEventListener("beforeprint", () => find("print"));

  // ---------------------------------------------------------------- Thermal view
  // Estimated heat per part, from how much current it draws. Not measured.
  const HEAT = {
    vision: 0.12, front: 0.3, depth: 0.3, color: 0.38, mcu: 0.55, drive: 0.95, arm: 0.62, pump: 0.72, power: 0.8,
    phone: 0.2, location: 0.15, schedule: 0.1, agent: 0.92, calendar: 0.35, gmail: 0.45, canvas: 0.4, grades: 0.25,
    planner: 0.3, transit: 0.5, places: 0.2, cap: 0.85, herald: 0.3, gemini: 0.5, macros: 0.15,
  };
  // Inferno-style ramp: deep violet, magenta, orange, yellow.
  const RAMP = [[0, [22, 11, 54]], [0.3, [96, 18, 110]], [0.55, [190, 55, 82]], [0.78, [240, 120, 32]], [1, [250, 222, 92]]];
  const heatColor = (h) => {
    for (let i = 1; i < RAMP.length; i++) {
      if (h <= RAMP[i][0]) {
        const [a, ca] = RAMP[i - 1], [b, cb] = RAMP[i], t = (h - a) / (b - a);
        return `rgb(${ca.map((v, j) => Math.round(v + (cb[j] - v) * t)).join(",")})`;
      }
    }
    return "rgb(250,222,92)";
  };
  $$("[data-diagram] [data-k]").forEach((e) => {
    const h = HEAT[e.dataset.k];
    if (h == null) return;
    e.style.setProperty("--h", heatColor(h));
    e.style.setProperty("--hi", h > 0.6 ? "#1a0d22" : "#fff6ec");
  });
  // Copper fills (main.js) sit right after their trace and take its heat.
  $$("[data-diagram] .sig").forEach((s) => {
    const tr = s.previousElementSibling;
    if (tr && tr.classList.contains("tr")) s.style.setProperty("--h", tr.style.getPropertyValue("--h"));
  });
  $$("[data-diagram]").forEach((fig) => {
    const key = el("div", "heatkey", '<span>Cool</span><i aria-hidden="true"></i><span>Hot</span><small>Estimated from how much current each part draws, not measured.</small>');
    (fig.querySelector(".steps") || fig.querySelector(".scroll")).after(key);
  });
  const heatBtn = $("button.heat");
  const setHeat = (on) => {
    document.documentElement.classList.toggle("thermal", on);
    heatBtn?.setAttribute("aria-pressed", on);
    if (on) find("heat");
  };
  heatBtn?.addEventListener("click", () => setHeat(heatBtn.getAttribute("aria-pressed") !== "true"));

  // ---------------------------------------------------------------- Signal probe
  // What a scope would show on each trace. Values come from the OTV firmware (config.h, mission.ino).
  const SIG = {
    vision: { pin: "Wi-Fi", name: "Vision pose", wave: "bus", read: "Pose packets from the overhead camera: x, y and heading, a few times a second." },
    front: { pin: "D2 TRIG, A4 ECHO", name: "Front HC-SR04", wave: "sonar", read: "A 10 µs trigger, then an echo 5.8 µs wide per mm of distance. One ping every 60 ms." },
    depth: { pin: "D7 TRIG, D8 ECHO", name: "Arm HC-SR04", wave: "sonar", read: "25 pings per depth reading, 60 ms apart. The code keeps the median." },
    color: { pin: "D4 OUT", name: "TCS3200", wave: "square", read: "A square wave at 20% scaling. More light through the selected filter means a higher frequency." },
    drive: { pin: "D3 D5, D6 D9", name: "Motor PWM", wave: "pwm", read: "PWM 140 of 255 (55%) when driving straight. Never above 153 (60%), because the motors are rated for 6 V." },
    arm: { pin: "D11, A2", name: "SG90 servos", wave: "servo", read: "50 Hz. The pulse width sets the angle, and the code steps it 1° every 15 ms." },
    pump: { pin: "D10", name: "IRLZ44N gate", wave: "gate", read: "Logic-level MOSFET gate. HIGH runs the pump for the length of the sample." },
    power: { pin: "VIN", name: "9.6 V NiMH", wave: "dc", read: "The battery rail. It dips a little each time the motors switch on." },
    phone: { pin: "HTTPS", name: "Telegram Bot API", wave: "bus", read: "Long-polls for new messages. Replies go back over the same API." },
    location: { pin: "HTTPS POST", name: "Location fix", wave: "burst", read: "One small request per fix. Anything without the token is refused." },
    schedule: { pin: "Cron", name: "Schedule", wave: "clock", read: "Fires at 7 AM and 9 PM, plus a longer run on Sunday." },
    calendar: { pin: "API", name: "Google Calendar", wave: "burst", read: "Called only when a request needs it." },
    gmail: { pin: "API", name: "Gmail", wave: "burst", read: "Called only when a request needs it." },
    canvas: { pin: "API", name: "Canvas", wave: "clock", read: "Polled every six hours for new assignments." },
    grades: { pin: "API", name: "Grades", wave: "burst", read: "Called only when a request needs it." },
    planner: { pin: "API", name: "Study planner", wave: "burst", read: "Called only when a request needs it." },
    transit: { pin: "API", name: "Live bus positions", wave: "bus", read: "Live vehicle positions, fetched when a trip is planned." },
    places: { pin: "API", name: "Campus map", wave: "burst", read: "Looked up when a building name comes up." },
    herald: { pin: "Wi-Fi", name: "Tray photo", wave: "burst", read: "One JPEG per tray, sent over Wi-Fi to the bot." },
    gemini: { pin: "HTTPS", name: "Gemini request", wave: "burst", read: "The photo goes out in one request. Item names and portion estimates come back." },
    macros: { pin: "Lookup", name: "Nutrition facts", wave: "clock", read: "Each item is matched to UMD Dining's published facts and scaled by its portion." },
  };
  // One period of each waveform as SVG path data, in a 0..200 x 0..70 screen.
  const H = 16, L = 54;
  const WAVES = {
    pwm: { p: 25, d: (x, p) => `M${x},${L} V${H} H${x + p * 0.55} V${L} H${x + p}` },
    square: { p: 10, d: (x, p) => `M${x},${L} V${H} H${x + p / 2} V${L} H${x + p}` },
    servo: { p: 50, d: (x, p) => `M${x},${L} V${H} H${x + 3.8} V${L} H${x + p}` },
    sonar: { p: 100, d: (x, p) => `M${x},30 V8 H${x + 1.5} V30 H${x + p} M${x},62 H${x + 12} V40 H${x + 42} V62 H${x + p}` },
    gate: { p: 200, d: (x, p) => `M${x},${L} H${x + 50} V${H} H${x + 170} V${L} H${x + p}` },
    dc: { p: 100, d: (x, p) => `M${x},20 H${x + 40} L${x + 43},27 L${x + 52},21 H${x + p}` },
    bus: { p: 100, d: (x, p) => { let s = `M${x},${L}`, y = L; for (let i = 0; i < 26; i++) { const b = (i * 7 + 3) % 5 < 2; const ny = b ? H : L; if (ny !== y) { s += ` V${ny}`; y = ny; } s += ` H${x + 4 + i * 2}`; } return s + ` V${L} H${x + p}`; } },
    burst: { p: 200, d: (x, p) => { let s = `M${x},${L} H${x + 70}`, y = L; for (let i = 0; i < 22; i++) { const ny = (i * 5 + 1) % 3 ? H : L; if (ny !== y) { s += ` V${ny}`; y = ny; } s += ` H${x + 72 + i * 2.5}`; } return s + ` V${L} H${x + p}`; } },
    clock: { p: 100, d: (x, p) => `M${x},${L} H${x + 48} V${H} H${x + 52} V${L} H${x + p}` },
  };
  const probe = el("div", "probe");
  probe.hidden = true;
  probe.setAttribute("aria-hidden", "true");
  probe.innerHTML = `<div class="ph"><b></b><span></span></div>
    <svg viewBox="0 0 200 70" preserveAspectRatio="none"><g class="pg"></g><g class="pw"><path /></g></svg>
    <p></p>`;
  document.body.appendChild(probe);
  const grid = probe.querySelector(".pg");
  for (let x = 20; x < 200; x += 20) grid.insertAdjacentHTML("beforeend", `<line x1="${x}" y1="0" x2="${x}" y2="70" />`);
  for (let y = 14; y < 70; y += 14) grid.insertAdjacentHTML("beforeend", `<line x1="0" y1="${y}" x2="200" y2="${y}" />`);
  let probeAnim = null;
  const showProbe = (k, x, y) => {
    const s = SIG[k];
    if (!s) return false;
    const w = WAVES[s.wave];
    let d = "";
    for (let px = 0; px < 200 + w.p; px += w.p) d += w.d(px, w.p) + " ";
    probe.querySelector("path").setAttribute("d", d);
    probe.querySelector(".ph b").textContent = s.name;
    probe.querySelector(".ph span").textContent = s.pin;
    probe.querySelector("p").textContent = s.read;
    probe.hidden = false;
    probeAnim?.cancel();
    if (!REDUCED) probeAnim = probe.querySelector(".pw").animate([{ transform: "translateX(0)" }, { transform: `translateX(-${w.p}px)` }], { duration: w.p * 22, iterations: Infinity });
    moveProbe(x, y);
    find("probe");
    return true;
  };
  const moveProbe = (x, y) => {
    const r = probe.getBoundingClientRect();
    let left = x + 20, top = y + 20;
    if (left + r.width > innerWidth - 8) left = x - r.width - 16;
    if (top + r.height > innerHeight - 8) top = y - r.height - 16;
    probe.style.left = left + "px";
    probe.style.top = top + "px";
  };
  let probedTr = null;
  const hideProbe = (tr) => {
    probe.hidden = true;
    probeAnim?.cancel();
    (tr || probedTr)?.classList.remove("probed");
    probedTr = null;
  };
  // The page can scroll out from under a still pointer, so scrolling puts the probe away.
  addEventListener("scroll", () => { if (!probe.hidden) hideProbe(); }, { passive: true });
  $$("[data-diagram] svg").forEach((svg) => {
    const before = svg.querySelector(".blk");
    svg.querySelectorAll(".tr").forEach((tr) => {
      const hit = document.createElementNS(NS, "path");
      hit.setAttribute("d", tr.getAttribute("d"));
      hit.setAttribute("class", "hit");
      svg.insertBefore(hit, before);
      hit.addEventListener("mouseenter", (e) => { if (showProbe(tr.dataset.k, e.clientX, e.clientY)) { tr.classList.add("probed"); probedTr = tr; } });
      hit.addEventListener("mousemove", (e) => moveProbe(e.clientX, e.clientY));
      hit.addEventListener("mouseleave", () => hideProbe(tr));
    });
  });

  // ---------------------------------------------------------------- Code viewer
  const KW = /\b(if|else|while|for|return|const|constexpr|static|void|int|float|bool|unsigned|long|true|false|HIGH|LOW|#if|#else|#endif)\b/;
  const hl = (line) => {
    const c = line.indexOf("//");
    const code = c >= 0 ? line.slice(0, c) : line;
    const comment = c >= 0 ? line.slice(c) : "";
    const body = code.split(/("(?:[^"\\]|\\.)*"|\b\d+(?:\.\d+)?\b|#?\b[A-Za-z_]\w*\b)/).map((tok) => {
      if (!tok) return "";
      if (tok[0] === '"') return `<span class="s">${esc(tok)}</span>`;
      if (/^\d/.test(tok)) return `<span class="n">${tok}</span>`;
      if (KW.test(tok) && tok.replace(KW, "") === "") return `<span class="k">${tok}</span>`;
      if (/^[A-Z][A-Z0-9_]{2,}$/.test(tok)) return `<span class="c">${tok}</span>`;
      return esc(tok);
    }).join("");
    return body + (comment ? `<span class="m">${esc(comment)}</span>` : "");
  };
  const dlg = el("dialog", "codeview");
  dlg.innerHTML = `<div class="cvh"><div><b></b><span>From the OTV repository. Real code, trimmed to the relevant functions.</span></div><button type="button" class="x" aria-label="Close">Close</button></div><div class="cvb" data-lenis-prevent></div>`;
  document.body.appendChild(dlg);
  dlg.querySelector(".x").addEventListener("click", () => dlg.close());
  dlg.addEventListener("close", () => smooth()?.start());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  const openCode = (k) => {
    const t = $(`template[data-code="${k}"]`);
    if (!t) return;
    const segs = [...t.content.querySelectorAll("code")];
    const files = [...new Set(segs.map((s) => s.dataset.file))];
    const label = $(`[data-diagram] .blk[data-k="${k}"]`)?.dataset.name || k;
    dlg.querySelector(".cvh b").textContent = `${label}: ${files.join(", ")}`;
    dlg.querySelector(".cvb").innerHTML = segs.map((s) => {
      const start = +s.dataset.start;
      const lines = s.textContent.split("\n");
      return `<div class="seg"><p class="file">${s.dataset.file}, line ${start}</p><pre>${lines.map((ln, i) => `<span class="ln">${start + i}</span>${hl(ln)}`).join("\n")}</pre></div>`;
    }).join("");
    dlg.showModal();
    smooth()?.stop();
    dlg.querySelector(".cvb").scrollTop = 0;
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".code-btn");
    if (b) { e.preventDefault(); e.stopPropagation(); openCode(b.dataset.code); }
  }, true);

  // ---------------------------------------------------------------- Logic analyzer
  (() => {
    const fig = $("#otv-route");
    if (!fig) return;
    const CH = [
      ["Left motor", "D3 D5"], ["Right motor", "D6 D9"], ["Front sonar", "D2"],
      ["Arm servos", "D11"], ["Arm sonar", "D7"], ["Color OUT", "D4"], ["Pump", "D10"],
    ];
    const box = el("div", "la");
    box.innerHTML = `<canvas aria-hidden="true"></canvas><p class="lanote">Logic analyzer, simulated from the firmware's timing as the replay runs. Copper is forward, green is reverse. The sampling stop is sped up.</p>`;
    fig.querySelector("svg").after(box);

    // Live status: what the robot is doing right now, and how long the run has taken.
    const stat = el("div", "runstat");
    stat.setAttribute("aria-hidden", "true");
    stat.innerHTML = '<p class="rs-top"><i></i><span class="rs-state">Waiting</span><span class="rs-time">0.0 s</span></p><p class="rs-phase">Scroll here to start the run.</p>';
    fig.querySelector("figcaption").prepend(stat);
    const rsState = stat.querySelector(".rs-state"), rsTime = stat.querySelector(".rs-time"), rsPhase = stat.querySelector(".rs-phase");
    const phaseOf = (s) => {
      if (s.done) return "At the goal. Run complete.";
      if (s.sampling) {
        const h = s.held;
        return h < 500 ? "At the pool: lowering the arm" : h < 1050 ? "At the pool: measuring depth" : h < 1400 ? "At the pool: reading the water color" : h < 1900 ? "At the pool: pumping a sample" : "At the pool: stowing the arm";
      }
      if (s.d < 150) return "Driving to the pool";
      if (s.x < 170 && s.y > 50) return "Heading for the top wall";
      if (s.x < 515) return "Following the top wall past the obstacles";
      if (s.x < 640) return "Dropping to the limbo lane";
      if (s.x < 690) return "Driving under the limbo";
      return "Into the goal zone";
    };
    let lastPhase = "";
    const showStat = (s, start) => {
      stat.classList.toggle("live", !s.done);
      rsState.textContent = s.done ? "Done" : "Running";
      rsTime.textContent = ((s.t - start) / 1000).toFixed(1) + " s";
      const ph = phaseOf(s);
      if (ph !== lastPhase) { rsPhase.textContent = ph; lastPhase = ph; }
    };
    // Replay brings the whole bench (map, status and analyzer) onto the screen.
    fig.querySelector(".replay")?.addEventListener("click", () => {
      const r = fig.getBoundingClientRect(), top = head() + 12;
      if (r.top < top - 4 || r.bottom > innerHeight) glide(scrollY + r.top - top);
    });
    const cv = box.querySelector("canvas");
    const ctx = cv.getContext("2d");
    let WIN = 5000;
    let hist = [], W = 0, Hh = 0, dpr = 1, t0 = null;
    const ROW = 22, TOP = 20;
    const size = () => {
      dpr = devicePixelRatio || 1;
      W = cv.clientWidth;
      Hh = TOP + CH.length * ROW + 8;
      cv.width = W * dpr; cv.height = Hh * dpr;
      cv.style.height = Hh + "px";
      draw();
    };
    // Turn the replay's state into pin levels.
    const sample = (s) => {
      const out = { t: s.t, L: 0, R: 0, front: 0, servo: 0, arm: 0, color: 0, pump: 0 };
      if (s.done) return out;
      if (s.sampling) {
        const h = s.held;
        if (h < 500 || h > 1900) out.servo = 1;
        else if (h < 1050) out.arm = 1;
        else if (h < 1400) out.color = 1;
        else out.pump = 1;
        return out;
      }
      const turn = s.turn; // degrees per ms
      if (Math.abs(turn) > 0.12) {
        const p = 110 / 255;
        out.L = turn > 0 ? p : -p;
        out.R = -out.L;
      } else {
        const c = Math.max(-0.12, Math.min(0.12, turn * 0.8));
        out.L = 140 / 255 + c;
        out.R = 140 / 255 - c;
      }
      out.front = 1;
      return out;
    };
    const draw = () => {
      if (!W) return;
      const ink = css("--ink"), ink3 = css("--ink-3"), rule = css("--rule"), cu = css("--copper"), mask = css("--mask"), board = css("--board");
      const now = hist.length ? hist[hist.length - 1].t : 0;
      const LW = W < 500 ? 74 : 104;
      const PW = W - LW - 8;
      const X = (t) => LW + PW - ((now - t) / WIN) * PW;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, Hh);
      ctx.fillStyle = board;
      ctx.fillRect(LW, 0, PW, Hh);
      ctx.font = `500 ${W < 500 ? 11 : 12}px Barlow, sans-serif`;
      ctx.textBaseline = "middle";
      // Time grid: one line per second.
      ctx.strokeStyle = rule; ctx.lineWidth = 1;
      ctx.fillStyle = ink3;
      const base = t0 ?? now;
      for (let s = base + Math.max(0, Math.ceil((now - WIN - base) / 1000)) * 1000; s <= now; s += 1000) {
        const x = Math.round(X(s)) + 0.5;
        ctx.beginPath(); ctx.moveTo(x, TOP - 4); ctx.lineTo(x, Hh); ctx.stroke();
        if (x > LW + 14) ctx.fillText(`${Math.round((s - base) / 1000)} s`, x + 4, 9);
      }
      CH.forEach(([name, pin], i) => {
        const y0 = TOP + i * ROW, hi = y0 + 4, lo = y0 + ROW - 5;
        ctx.fillStyle = ink;
        ctx.fillText(name, 0, y0 + ROW / 2 - 1);
        if (W >= 500) { ctx.fillStyle = ink3; ctx.fillText(pin, 70, y0 + ROW / 2 - 1); }
        const key = ["L", "R", "front", "servo", "arm", "color", "pump"][i];
        ctx.lineWidth = 1.5;
        // Baseline.
        ctx.strokeStyle = ink3;
        ctx.beginPath(); ctx.moveTo(LW, lo); ctx.lineTo(LW + PW, lo); ctx.stroke();
        for (let j = 1; j < hist.length; j++) {
          const a = hist[j - 1], b = hist[j];
          const v = a[key];
          if (!v) continue;
          const x0 = Math.max(LW, X(a.t)), x1 = X(b.t);
          if (x1 <= LW) continue;
          if (key === "L" || key === "R") {
            // PWM at 490 Hz is far too fast to resolve here, so it reads as a band. Denser = higher duty.
            ctx.fillStyle = v > 0 ? cu : mask;
            ctx.globalAlpha = 0.25 + Math.abs(v) * 0.9;
            ctx.fillRect(x0, hi, x1 - x0 + 0.5, lo - hi);
            ctx.globalAlpha = 1;
          } else if (key === "front" || key === "arm" || key === "servo") {
            const period = key === "servo" ? 20 : key === "arm" ? 60 : 60;
            ctx.strokeStyle = cu;
            for (let t = Math.ceil(a.t / period) * period; t < b.t; t += period) {
              const x = X(t);
              if (x < LW) continue;
              ctx.beginPath(); ctx.moveTo(x, lo); ctx.lineTo(x, hi); ctx.lineTo(x + 1.2, hi); ctx.lineTo(x + 1.2, lo); ctx.stroke();
            }
          } else if (key === "color") {
            ctx.fillStyle = cu; ctx.globalAlpha = 0.55;
            ctx.fillRect(x0, hi, x1 - x0 + 0.5, lo - hi);
            ctx.globalAlpha = 1;
          } else if (key === "pump") {
            // A held HIGH level: edges only where it actually rises or falls.
            ctx.strokeStyle = cu;
            ctx.beginPath();
            if (!hist[j - 2]?.[key]) { ctx.moveTo(x0, lo); ctx.lineTo(x0, hi); } else ctx.moveTo(x0, hi);
            ctx.lineTo(x1, hi);
            if (!b[key]) ctx.lineTo(x1, lo);
            ctx.stroke();
          }
        }
      });
      // "Now" cursor.
      ctx.strokeStyle = cu; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(LW + PW + 0.5, TOP - 6); ctx.lineTo(LW + PW + 0.5, Hh); ctx.stroke();
    };
    let pending = false;
    fig.addEventListener("otvstart", () => { hist = []; t0 = null; });
    fig.addEventListener("otvtick", (e) => {
      if (t0 === null) t0 = e.detail.t;
      showStat(e.detail, t0);
      hist.push(sample(e.detail));
      const cut = e.detail.t - WIN - 500;
      while (hist.length > 2 && hist[1].t < cut) hist.shift();
      if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; draw(); }); }
    });
    addEventListener("resize", size);
    new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    size();
    // With reduced motion the replay doesn't animate, so show one finished run as a still capture.
    if (REDUCED) {
      const seg = [[0, 1100, 0], [1100, 1350, 0.3], [1350, 3550, "s"], [3550, 3800, -0.3], [3800, 6200, 0.02], [6200, 6450, -0.3], [6450, 8800, 0]];
      seg.forEach(([a, b, turn]) => {
        for (let t = a; t < b; t += 16) {
          hist.push(sample(turn === "s" ? { t, sampling: true, held: t - a } : { t, turn }));
        }
      });
      hist.push(sample({ t: 8800, done: true }));
      t0 = 0;
      WIN = 8800;
      stat.classList.remove("live");
      rsState.textContent = "Still capture";
      rsTime.textContent = "8.8 s";
      rsPhase.textContent = "One full run, from start square to goal.";
      draw();
    }
  })();

  // ---------------------------------------------------------------- Pluto status (demo endpoint)
  const statusRow = $("#pluto .status dd");
  const fmtET = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";
  const getStatus = () => fetch("/api/pluto-status", { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  if (statusRow) {
    getStatus().then((s) => {
      statusRow.innerHTML = `<i class="led${s.online ? " on" : ""}" aria-hidden="true"></i>${s.online ? "Online" : "Offline"}, last brief ${fmtET(s.last_brief)} <abbr title="This status comes from a stand-in endpoint with demo data, not the live server.">demo</abbr>`;
    }).catch(() => { statusRow.innerHTML = '<i class="led" aria-hidden="true"></i>Status unavailable'; });
  }

  // ---------------------------------------------------------------- Serial monitor
  const mon = el("div", "serial");
  mon.hidden = true;
  mon.setAttribute("role", "dialog");
  mon.setAttribute("aria-label", "Serial monitor");
  mon.innerHTML = `<div class="sh"><b>Serial monitor</b><span>115200 baud</span><button type="button" class="x" aria-label="Close serial monitor">Close</button></div>
    <pre class="out" aria-live="polite" data-lenis-prevent></pre>
    <form><label for="sm-in">&gt;</label><input id="sm-in" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="Type help, then press Enter"></form>`;
  document.body.appendChild(mon);
  const out = mon.querySelector(".out"), inp = mon.querySelector("input");
  const print_ = (s, cls) => { out.insertAdjacentHTML("beforeend", `<span${cls ? ` class="${cls}"` : ""}>${s}</span>\n`); out.scrollTop = out.scrollHeight; };
  let booted = false;
  const hist2 = [];
  let hi2 = 0;
  const openMonitor = (open) => {
    mon.hidden = !open;
    if (!open) return;
    find("serial");
    if (!booted) {
      booted = true;
      const built = new Date(document.lastModified);
      print_(`meandelman.com build: ${built.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`, "dim");
      print_("Target: PORTFOLIO", "dim");
      print_("Type help to see what this board understands.");
    }
    inp.focus({ preventScroll: true });
  };
  const go = (sel) => { openMonitor(false); scrollToEl($(sel)); };
  const CMDS = {
    help: () => [
      "help              this list",
      "whoami            who built this",
      "projects          list the projects",
      "open <name>       jump to otv, pluto, brimcam, route, experience or contact",
      "status pluto      ask Pluto how it's doing",
      "ping micah        start an email to me",
      "resume            open my résumé",
      "thermal           toggle the thermal view",
      "theme dark|light  switch the theme",
      "replay intro      replay the oscilloscope intro",
      "replay route      replay the OTV route",
      "eggs              things to find on this site",
      "clear, exit",
    ].forEach((l) => print_(esc(l))),
    whoami: () => print_("Micah Andelman. Electrical engineering at the University of Maryland, class of 2030."),
    projects: () => ["ENES100 OTV       autonomous water-sampling robot for my ENES100 class", "Pluto             personal agent on Telegram", "Brimcam           camera cap that logs dining-hall meals"].forEach((l) => print_(l)),
    open: (a) => {
      const map = { otv: "#otv", pluto: "#pluto", brimcam: "#brimcam", glasses: "#brimcam", route: "#otv-route", experience: "#experience", contact: "#contact" };
      if (!map[a]) return print_(`open: unknown section "${esc(a || "")}". Try open otv.`, "err");
      print_(`Opening ${a}.`);
      setTimeout(() => go(map[a]), 250);
    },
    status: (a) => {
      if (a !== "pluto") return print_("status: try status pluto", "err");
      print_("GET /api/pluto-status ...", "dim");
      find("pluto");
      getStatus().then((s) => {
        print_(`online         ${s.online ? "yes" : "no"}`);
        print_(`last brief     ${fmtET(s.last_brief)}`);
        print_(`next brief     ${fmtET(s.next_brief)}`);
        print_(`messages today ${s.messages_today}`);
        print_(`uptime         ${s.uptime_days} days`);
        print_("(demo data from a stand-in endpoint)", "dim");
      }).catch(() => print_("No response. Pluto's demo endpoint only runs on the live site.", "err"));
    },
    ping: (a) => {
      if (a !== "micah") return print_("ping: try ping micah", "err");
      const mail = $('a[href^="mailto:"]');
      print_("PING micah: usually replies within a day.");
      if (mail) setTimeout(() => (location.href = mail.href), 400);
    },
    resume: () => { print_("Opening resume.pdf"); open("resume.pdf", "_blank", "noopener"); },
    thermal: () => { setHeat(!document.documentElement.classList.contains("thermal")); print_(`Thermal view ${document.documentElement.classList.contains("thermal") ? "on" : "off"}.`); },
    theme: (a) => {
      const sw = $("button.power");
      const dark = matchMedia("(prefers-color-scheme: dark)").matches;
      const isDark = (document.documentElement.dataset.theme || (dark ? "dark" : "light")) === "dark";
      if (a !== "dark" && a !== "light") return print_("theme: dark or light", "err");
      if ((a === "dark") !== isDark) sw?.click();
      print_(`Theme: ${a}.`);
    },
    replay: (a) => {
      if (a === "intro") { print_("Replaying the intro."); openMonitor(false); replayIntro(); }
      else if (a === "route") { print_("Replaying the route."); go("#otv-route"); setTimeout(() => $("#otv-route .replay")?.click(), 600); }
      else print_("replay: intro or route", "err");
    },
    eggs: () => { openMonitor(false); openPop(true); },
    sudo: () => print_("Permission denied. This board has no root.", "err"),
    clear: () => { out.innerHTML = ""; },
    exit: () => openMonitor(false),
  };
  const run = (line) => {
    const [cmd, ...rest] = line.trim().toLowerCase().split(/\s+/);
    if (!cmd) return;
    print_(`&gt; ${esc(line.trim())}`, "cmd");
    (CMDS[cmd] || (() => print_(`Unknown command "${esc(cmd)}". Type help.`, "err")))(rest.join(" "));
  };
  mon.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (inp.value.trim()) { hist2.push(inp.value); hi2 = hist2.length; }
    run(inp.value);
    inp.value = "";
  });
  inp.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" && hi2 > 0) { inp.value = hist2[--hi2]; e.preventDefault(); }
    else if (e.key === "ArrowDown") { hi2 = Math.min(hist2.length, hi2 + 1); inp.value = hist2[hi2] || ""; e.preventDefault(); }
  });
  mon.querySelector(".x").addEventListener("click", () => openMonitor(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if (!mon.hidden) openMonitor(false); if (!pop.hidden) openPop(false); return; }
    if (e.key !== "`" || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest("input, textarea, select, [contenteditable]") && e.target !== inp) return;
    e.preventDefault();
    openMonitor(mon.hidden);
  });
})();
