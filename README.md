# meandelman.com

My portfolio site: [meandelman.com](https://meandelman.com). I'm an electrical engineering student at the University of Maryland, and the site is laid out like a circuit board: each project is a block diagram you can explore, with the real code behind it.

It's plain HTML, CSS and JavaScript with no framework or build step, hosted on Cloudflare Pages.

## What's in it

- **Block diagrams** for each project. Hover a part to see what it does and open the real firmware behind each part of the robot.
- **Scroll-driven signal flow.** Each diagram pins in place while copper fills its traces from inputs to outputs.
- **OTV route replay** on a to-scale ENES100 arena, with a live status readout.
- **Small extras:** a light/dark power switch, a thermal view, a serial monitor (press the backtick key), an oscilloscope intro and a few hidden things.
- **Print stylesheet** that turns the page into a 3-page datasheet.

## Files

| File | What it is |
|---|---|
| `index.html` | The page |
| `styles.css` | All styles, including dark mode and print |
| `main.js` | Diagrams, phone parts lists, route replay, theme switch, scroll scenes |
| `extras.js` | Code viewer, replay status, serial monitor, thermal view, easter eggs |
| `functions/api/pluto-status.js` | Demo status endpoint (Cloudflare Pages Function) |
| `404.html` | The "Open circuit" page |
| `photos.py` | Resizes photos in `photos-in/` and strips their metadata |
| `deploy.sh` | Builds `dist/` and deploys to Cloudflare Pages |
| `vendor/` | [Lenis](https://github.com/darkroomengineering/lenis) smooth scrolling (MIT) and [three.js](https://threejs.org) 0.170.0 for the 3D OTV (MIT) |
| `otv3d.js` | The 3D scenes: the OTV tour (six stops), the course run through a 3D arena (plays on its own, scrolling speeds it up or rewinds it) and the exploded Brimcam cap. Loads three.js and the model only when a scene is near |
| `models/otv.glb` | The OTV, converted from the team's Onshape STEP export (meshopt-compressed). The Arduino, breadboard and wiring are drawn in `otv3d.js` from photos |

## Run it locally

```sh
python -m http.server 8765
```

The Pluto status light needs the Pages Function, so for that use `npx wrangler pages dev .` instead.

## Deploy

```sh
./deploy.sh
```

This copies the site into `dist/`, adds content hashes to the CSS and JS links so browsers never run a stale copy, and deploys with Wrangler.
