# meandelman.com

My portfolio site: [meandelman.com](https://meandelman.com). I'm an electrical engineering student at the University of Maryland, and the site is laid out like a circuit board: each project is a block diagram you can hover, probe and read the code behind.

It's plain HTML, CSS and JavaScript with no framework or build step, hosted on Cloudflare Pages.

## What's in it

- **Block diagrams** for each project. Hover a part to see what it does, hover a trace to probe its signal, and open the real firmware behind each part of the robot.
- **Scroll-driven signal flow.** Each diagram pins in place while copper fills its traces from inputs to outputs.
- **OTV route replay** on a to-scale ENES100 arena, with a live status readout and a simulated logic analyzer that runs in sync.
- **Small extras:** a light/dark power switch, a thermal view, a serial monitor (press the backtick key), an oscilloscope intro and a few hidden things.
- **Print stylesheet** that turns the page into a 3-page datasheet.

## Files

| File | What it is |
|---|---|
| `index.html` | The page |
| `styles.css` | All styles, including dark mode and print |
| `main.js` | Diagrams, phone parts lists, route replay, theme switch, scroll scenes |
| `extras.js` | Probe, logic analyzer, code viewer, serial monitor, thermal view, easter eggs |
| `functions/api/pluto-status.js` | Demo status endpoint (Cloudflare Pages Function) |
| `404.html` | The "Open circuit" page |
| `photos.py` | Resizes photos in `photos-in/` and strips their metadata |
| `deploy.sh` | Builds `dist/` and deploys to Cloudflare Pages |
| `vendor/` | [Lenis](https://github.com/darkroomengineering/lenis) smooth scrolling (MIT) |

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
