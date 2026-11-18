# meandelman.com

My portfolio site: [meandelman.com](https://meandelman.com). I'm an electrical engineering student at the University of Maryland, and the site is laid out like a circuit board: each project is a block diagram you can explore, with the real code behind it.

It's plain HTML, CSS and JavaScript with no framework or build step, hosted on Cloudflare Pages. A short home page links to one page per project (`/buildfest`, `/otv`, `/brimcam`, `/pluto`), where the full write-ups, diagrams and 3D walkthroughs live.

## What's in it

- **Exploded hero.** Scrolling takes the home page's board apart into its layers; the core turns out to be green protoboard with an LED sign that lights up PORTFOLIO.
- **Project cards** on the home page, each playing its project's 3D scene on its own while it's on screen.
- **Block diagrams** for each project. Hover a part to see what it does and open the real firmware behind each part of the robot.
- **Scroll-driven signal flow.** Each diagram pins in place while copper fills its traces from inputs to outputs.
- **OTV route replay** on a to-scale ENES100 arena, with a live status readout.
- **Scroll stops.** Every scroll animation registers its chapters (`window.scrollStops`); a fast flick or a trackpad's coasting stops at the next one instead of skipping it. On touch screens they're native snap points.
- **Small extras:** a light/dark power switch, a thermal view, a serial monitor (press the backtick key), an oscilloscope intro and a few hidden things.
- **Print stylesheet** that turns a page into a datasheet.

## Files

| File | What it is |
|---|---|
| `index.html` | Home: the hero, project cards, experience and contact |
| `buildfest.html`, `otv.html`, `brimcam.html`, `pluto.html` | One page per project, with tabs across the top to move between them |
| `styles.css` | All styles, including dark mode and print |
| `main.js` | Diagrams, phone parts lists, route replay, theme switch, scroll scenes |
| `visuals.js` | The hero (exploded layers, protoboard sign), component artwork, schematic view, linked animations, card art |
| `extras.js` | Code viewer, replay status, serial monitor, thermal view, easter eggs |
| `functions/api/pluto-status.js` | Demo status endpoint (Cloudflare Pages Function) |
| `404.html` | The "Open circuit" page. Links are absolute, since it's served at whatever address was broken |
| `_headers` | Cloudflare Pages response headers: security headers (CSP, HSTS, no framing) and long caching for `vendor/` and `fonts/` |
| `photos.py` | Resizes photos in `photos-in/` and strips their metadata |
| `deploy.sh` | Builds `dist/` and deploys to Cloudflare Pages |
| `vendor/` | [Lenis](https://github.com/darkroomengineering/lenis) smooth scrolling (MIT) and [three.js](https://threejs.org) 0.170.0 for the 3D OTV (MIT) |
| `otv3d.js` | The 3D scenes: the OTV tour, the course run (scroll between stops; the pool, the underside and the limbo play out on their own), the exploded Brimcam cap and Pluto as a 3D sequence diagram (one lane per service, each message an arrow, lane heads that fill in and stick with you as you scroll). Also plays the home page cards on a clock. Loads three.js and the model only when a scene is near (on the home page, in idle time after load) |
| `models/otv.glb` | The OTV, converted from the team's Onshape STEP export (meshopt-compressed). The Arduino, breadboard and wiring are drawn in `otv3d.js` from photos |

## Run it locally

```sh
python -m http.server 8765
```

Links between pages use the `.html` names so this works; on Cloudflare they redirect to the clean URLs. The Pluto status light needs the Pages Function, and the `_headers` file only applies on Cloudflare, so for either use `npx wrangler pages dev .` instead.

## Deploy

```sh
./deploy.sh
```

This copies the site into `dist/`, adds content hashes to the CSS and JS links so browsers never run a stale copy, and deploys with Wrangler.
