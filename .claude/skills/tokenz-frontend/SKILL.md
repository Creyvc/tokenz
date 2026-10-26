---
name: tokenz-frontend
description: Builds Tokenz website pages and components, and explains how frontend/ is put together — the team's rules, the shared sidebar copied into every page, the scripts each page loads, the stylesheet's conventions, what the owner calls each piece, and how to screenshot a change. Use when creating or editing anything in frontend/.
---

# Tokenz frontend rules

- React + Vite + Tailwind. One component per file in src/components/.
- Colors: ink #16171A, violet #5B4FD6, light violet #8B7FF2, background #F6F6F3.
- Fonts: Geist for headings and the logo, Inter for body text.
- Logo: the Cut t mark (see src/components/Logo.jsx). Never redraw it.
- All API calls go through src/services/api.js. No API keys in the frontend.
- Label sample numbers as "Sample data" until real results exist.

**These rules don't all match the code yet.** `frontend/` is still plain HTML and CSS: no React,
Vite, Tailwind or `src/` folder, black and grey on a white background, Inter only, and the logo
is the squeeze mark in `assets/logo-mark.svg`. Until the site is moved over, don't convert it
or create `src/` files without asking first. These apply now: never put API keys in the
frontend, label sample numbers "Sample data", and never redraw the logo (use the existing file).

The rest of this file describes the site as it's built today.

# How the site is built today

A static site: plain HTML, one stylesheet and a few small scripts in `frontend/`, no build step
and no framework. Open any page straight from disk to see it.

The compression engine (TokenSaver, a friend's Python project) lives in `backend/`, with its
own README, tests and Streamlit test app. Compare and Results use it through
`backend/web_api.py`, a local web API that also serves the site: `backend/start-web.sh`, then
http://127.0.0.1:8000/. It offers NLP and TF-IDF, plus the AI rewrite through `backend/optimizer/` (below). The
backend's own files belong to the friend: keep changes there small, tested and recorded in
`backend/docs/`.

- `api.js`: every call to the engine (`/api/health`, `/api/inspect`, `/api/compress`).
- `compare.js`: the Compare form and result. Keeps the form in `tokenz_compare_draft` and each
  finished run in `tokenz_runs` (sessionStorage, this visit only).
- `results.js`: reads `tokenz_runs` for the Results chart and table; never calls the engine.
- Compare's third method, **AI rewrite**, calls `/api/optimize` once per ticked model (Qwen and GPT-OSS
  120B on Groq, Gemini on Google, through `backend/optimizer/`), so each card shows as it lands. It's the only option that sends the prompt off the computer, so its
  section says so and shows the setup status from `/api/health`. It never re-runs by itself. Its run
  stores the shortest accepted rewrite as `result`, so Results charts it like the other two.
- Prompt text is always set with `textContent`, never as HTML. Each result says it needs human
  review, and "Original kept" (0 tokens saved) is a valid outcome, not a failure.

## Files

- Pages, each a full HTML file with its own copy of the sidebar: `index.html` (Home),
  `compare.html`, `results.html`, `how-it-works.html`, `about.html`.
- `info.html` and `cookies.html` are not pages. They only forward to `index.html#info` /
  `#cookies`, where `modal.js` opens them as a window over the page.
- `styles.css`: every style for the whole site.
- `assets/logo-mark.svg` (sidebar logo) and `assets/favicon.svg` (browser tab icon, cropped
  tighter so the mark looks bigger in the tab). Same artwork; change them separately.

## Scripts and what each page loads

Every page's `<head>` loads, in this order:

```html
<script src="reload.js"></script>
<link rel="stylesheet" href="styles.css">
<script src="consent.js" defer></script>
<script src="modal.js" defer></script>
```

`index.html` also loads `intro.js`, straight after `reload.js`, then `grainient.js` (deferred)
and `home.js` (not deferred, so it can hide Home's text before the first paint) after `modal.js`.

- `reload.js`: refreshing any page (Cmd+R) starts over like a fresh visit: back to Home, intro
  and cookie banner again.
- `intro.js`: Home only, once per visit. The academic-project notice, then the TOKENZ animation.
- `consent.js`: the cookie banner. Uses cookies, or local storage when opened from disk.
- `modal.js`: the Info and Cookies windows. Their text lives in its `CONTENT` object.
- `grainient.js`: React Bits' Grainient (a drifting grainy gradient the cursor drags like paint)
  without React, as `Grainient(element, options)`; the options are the component's props.
- `home.js`: Home only. Puts Grainient in `.home-panel` after the intro has finished, and plays the
  text mask animation (from olivierlarose/text-mask-animation) on the sentence and headline: each
  line rises from behind a mask, 0.75s, 0.075s apart, a quarter of a second after the intro uncovers the page.
  It also runs Home's scroll effect (over 800px wide, not for reduced motion): TOKENZ slides out of its
  mask, the panel's clip widens until the gradient fills the window (over the sidebar), and the text
  draws together. A white copy of the text inside the panel shows only where the gradient is. The
  sidebar stays on top throughout: a white copy of it (`.nav-copy`, inert, hidden from screen readers,
  its dot without the page-switch name) shows where the gradient is behind it, and the real sidebar
  is masked (not clipped, so its links stay clickable) everywhere else.

## The sidebar is copied into every page

There's no templating, so the whole `<header class="nav">` is repeated in each page. Any change
to it (a new link, a new element) has to be made in all five pages. Only the active link differs:

```html
<a href="about.html" class="active" data-label="About">About<span class="nav-dot"></span></a>
```

Every nav link needs `data-label` set to its text: CSS uses it to reserve the bold width so
the links don't shift when one becomes active.

### Adding a page

1. Copy an existing page such as `how-it-works.html`, and change its `<title>` to
   `Name · Tokenz`.
2. Move `class="active"` and the `<span class="nav-dot"></span>` to the new page's link.
3. Add the new link to the nav in every other page, in the same position.
4. Put the content in `<main class="content">`, and its styles at the end of `styles.css`.

Main links (Home … About) get the moving dot. Info and Cookies sit in `.nav-extra`, are lighter
grey, and never get the dot.

## Pieces of the design, and what the owner calls them

- **"the thin line"** (sometimes "the scroll bar"): the 1px line that used to grow down the
  sidebar when scrolling. The owner had it removed on 26 October 2026, with `scroll-line.js`.
  It's in git history (`.nav-line`) if it's ever wanted back.
- **"the dot"**: `.nav-dot`, slid between links by the page-switch animation (`@view-transition`).
- **"the banner" / bottom-left logo**: `.tz-lockup`, the tall black badge at the bottom of the
  sidebar, touching the screen's left edge: white mark on top, "Tokenz | Token saver" turned to
  read upwards. Hidden on narrow screens.
- **the Home box**: `.home-panel`, a rounded panel pinned to the right of Home (from 60% across,
  20px in from the top, right and bottom), holding the Grainient background. Full width under
  the top bar at 800px and below.
- **the cookie banner**: `.consent`, bottom right, built by `consent.js`.
- **the windows**: Info and Cookies, `.modal`, built by `modal.js`.

## Styles

- Font: Inter everywhere. JetBrains Mono only on the intro's academic-project notice.
- Colours are written out, not variables: near-black `#16171A`, body text `#262626`, greys
  `#5c5c5c` / `#8a8a8a` / `#9a9a9a`, light lines `#E5E4DF`, white background.
- Sidebar is 210px wide and fixed; `.content` leaves `margin-left: 210px` for it. At 800px and
  below it becomes a top bar; at 600px and below the links centre and wrap.
- Comments explain what something looks like or why, in plain words, above each rule. Match that.
- Honour `prefers-reduced-motion` for any new animation.

## Checking how a change looks

Use the `playwright-cli` skill (Microsoft's Playwright CLI, installed globally with
`npm install -g @playwright/cli@latest`; it drives the installed Chrome). It blocks `file://`,
and page-switch animations only run over http anyway, so serve the site first, in the background:

```sh
cd frontend && python3 -I -m http.server 8765 --bind 127.0.0.1
```

For Compare and Results, start the engine instead (`backend/start-web.sh`, port 8000): the plain
server above has no `/api/`, so Compare would show its "engine isn't running" notice.

Then, for example:

```sh
playwright-cli open "http://127.0.0.1:8765/how-it-works.html"
playwright-cli resize 1000 700                    # over 800 wide for the sidebar
playwright-cli mousewheel 0 400                   # scroll down the page
playwright-cli screenshot --filename=<scratchpad>/shot.png
playwright-cli open --device="iPhone 15" "http://127.0.0.1:8765/about.html"   # a real phone width
playwright-cli close
```

Read the screenshot with the Read tool. When finished, close the browser and stop the server.

Useful checks:
- Page-switch animations: click a link and list `document.getAnimations()` in the same
  `run-code` call. The dot's travel shows as `::view-transition-group(nav-dot)`.
- `set-reduced-motion reduce` checks the reduced-motion versions; `video-start` / `video-stop`
  records an animation to watch.
- On Home the intro covers the page on a first visit, so use another page to check the sidebar.
- The cookie banner shows on every fresh browser; click Accept All or Deny All if it's in the way.
- Output goes to `.playwright-cli/` in the project, which is in `.gitignore`.

Without Playwright, headless Chrome can still take a screenshot of a page from disk
(`--headless=new --screenshot=<file> --window-size=1000,700 file:///...`), but it can't scroll,
doesn't run page-switch animations, draws no scrollbars and won't go below about 500px wide.

## What's built stays as it is

Two outside design skills are in this project for new work and advice:

- `emil-design-eng` (Emil Kowalski's animation and polish rules).
- `impeccable` (Paul Bakaus's design rules, with reviews such as `/impeccable audit` and
  `/impeccable critique`). It only runs when someone types `/impeccable`. Its edit hooks are
  left out: don't turn them on without asking.

GreenSock's official GSAP skills (`gsap-core`, `gsap-timeline`, `gsap-scrolltrigger`,
`gsap-plugins`, `gsap-utils`, `gsap-performance`, `gsap-react`) are here too, but the site
doesn't use GSAP. Keep small UI motion in CSS, reach for GSAP only for new animation CSS can't
do well, and ask before adding it to a page. With no build step it would load from a pinned CDN
script tag in each page's `<head>`, like the other scripts.

`extract-design` (the `designlang` tool) reads the colours, fonts, spacing and motion off a
website, for inspiration or to document this site's own design. Extracting is read-only: never
apply its output to the site without asking.

`transitions-dev` has twelve ready-made CSS transitions (number pop-in, text swap, dropdown,
success check, error shake and more). Use them for new UI only, never in place of the existing
windows or page-switch motion.

Don't use any of these to change what's already built. Every existing timing, easing, position, font
and animation was chosen by the owner, and some break their rules on purpose:

- The dot takes 0.6s to travel, with a slight bounce.
- The intro notice uses a monospace font, and Info/Cookies open as windows. Impeccable's rules
  discourage both.
- The intro, the Info/Cookies windows and the cookie banner keep their current motion.

If one of their rules would improve something existing, suggest it and wait for a yes.

## Working with the owner

Changes usually come as quick visual tweaks ("a little to the left", "slower", "go back").
Make the one small change asked for, say what the new value is and where it lives, and undo
exactly when they say go back. If something is unclear, like which line or logo, make the most
likely change and name the other reading in one line.
