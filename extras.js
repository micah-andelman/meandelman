// Extras: code viewer, route replay status, serial monitor, Pluto status,
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
    { id: "heat", name: "Feel the heat", hint: "There's a thermometer up here somewhere." },
    { id: "serial", name: "Open the serial monitor", hint: "Press the backtick key ( ` )." },
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
    else if (id === "heat") setHeat(!document.documentElement.classList.contains("thermal"));
    else if (id === "serial") openMonitor(true);
    else if (id === "print") print();
    else if (id === "open") location.href = "/open-circuit";
  });
  const replayIntro = () => {
    if (!$("#name")) { location.href = "/?intro"; return; } // the name (and its intro) is on the home page
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

  // ---------------------------------------------------------------- Route replay status
  // What the robot is doing right now, and how long the run has taken.
  (() => {
    const fig = $("#otv-route");
    if (!fig) return;
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
    // Replay brings the map and its status onto the screen.
    fig.querySelector(".replay")?.addEventListener("click", () => {
      const r = fig.getBoundingClientRect(), top = head() + 12;
      if (r.top < top - 4 || r.bottom > innerHeight) glide(scrollY + r.top - top);
    });
    let t0 = null;
    fig.addEventListener("otvstart", () => { t0 = null; });
    fig.addEventListener("otvtick", (e) => {
      if (t0 === null) t0 = e.detail.t;
      showStat(e.detail, t0);
    });
    if (REDUCED) {
      rsState.textContent = "Still capture";
      rsTime.textContent = "8.8 s";
      rsPhase.textContent = "One full run, from start square to goal.";
    }
  })();

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
  // Sections live on different pages now: scroll if it's here, otherwise go to the page that has it.
  const go = (sel) => {
    openMonitor(false);
    const [page, hash] = sel.includes("#") ? sel.split("#") : [sel, ""];
    const el = hash && $("#" + hash);
    if (el) return scrollToEl(el);
    location.href = (page || "/") + (hash ? "#" + hash : "");
  };
  const CMDS = {
    help: () => [
      "help              this list",
      "whoami            who built this",
      "projects          list the projects",
      "open <name>       jump to buildfest, otv, pluto, brimcam, route, experience or contact",
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
    projects: () => ["BuildFest         1st place: 988-training insights tool for EveryMind", "ENES100 OTV       autonomous water-sampling robot for my ENES100 class", "Pluto             personal agent on Telegram", "BrimCam           camera cap that logs dining-hall meals"].forEach((l) => print_(l)),
    open: (a) => {
      const map = { buildfest: "/buildfest.html#buildfest", otv: "/otv.html#otv", pluto: "/pluto.html#pluto", brimcam: "/brimcam.html#brimcam", glasses: "/brimcam.html#brimcam", route: "/otv.html#otv-route", experience: "/#experience", skills: "/#skills", contact: "/#contact" };
      if (!map[a]) return print_(`open: unknown section "${esc(a || "")}". Try open otv.`, "err");
      print_(`Opening ${a}.`);
      setTimeout(() => go(map[a]), 250);
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
      else if (a === "route") { print_("Replaying the route."); if (!$("#otv-route")) return go("/otv.html#otv-route"); go("#otv-route"); setTimeout(() => $("#otv-route .replay")?.click(), 600); }
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
    if (e.target.closest?.("input, textarea, select, [contenteditable]") && e.target !== inp) return;
    e.preventDefault();
    openMonitor(mon.hidden);
  });
})();
