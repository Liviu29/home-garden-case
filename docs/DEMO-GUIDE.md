# Demo guide

A walk through the ten features added after the case, in the order that tells the story best,
using the **Demo Account** profile the seed creates.

## Before the demo

| Run                                      | Open                  | Use it for                                                                                                                                          |
| ---------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run demo`                           | http://localhost:8080 | the main demo: the production build, exactly what the container runs, with a fresh database and the demo data on every start (ready in 1–2 minutes) |
| `npm run dev`, then `npm run seed:reset` | http://localhost:4200 | the development app, for the Web Vitals in the console (step 9)                                                                                     |
| `npm run storybook`                      | http://localhost:6006 | step 8                                                                                                                                              |

On the welcome screen, choose **Demo Account**. Its gardens:

| Garden                      | Shows                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------- |
| Ghent Courtyard Garden      | two beds planted days ago (watered daily), the outdoor humidity, the planner and charts |
| Antwerp Allotment           | 95% full: _Needs attention_, and the capacity rule refuses a 1 m² plant                 |
| Bathroom Window Ferns       | plants want ~83% humidity against a 40% target; no coordinates, so no outdoor reading   |
| Spare Cutting Bed           | the one to delete and bring back                                                        |
| Community Allotment Plot 14 | shared: every profile sees it                                                           |

The newly planted beds are dated from the day of the seed; `npm run demo` seeds on every start, and
with `npm run dev` run `npm run seed:reset` shortly before the demo.

## The ten features

### 1. A live demo, one command or one click away

- **Where:** the terminal running `npm run demo`, and http://localhost:8080.
- **Show:** the API and the production build start together, and the demo data is added through the
  API. The same thing runs in the container (`Dockerfile`); `render.yaml` deploys it on Render's
  free plan with one click (README, _Deploying the demo_), and CI builds and starts the image on
  every push.

### 2. Demo data in one command

- **Where:** the welcome screen, and the terminal.
- **Show:** four profiles — Demo Account, Liviu, Maya, Tom — and fifteen gardens.
  `npm run seed:reset` removes the demo data (and only that) and adds it again; the seed goes through
  the public API, so it retries the API's deliberate 500s and obeys the capacity rule.

### 3. Each profile sees its own gardens

- **Where:** _Gardens_ as Demo Account, then the profile menu (top right) → **Switch profile** →
  **Maya Lin**.
- **Show:** Demo Account sees its four gardens plus _Community Allotment Plot 14_; Maya sees her own
  (_Tropical Greenhouse_, …) and the same shared allotment, none of Demo's. A garden created as Maya
  stays Maya's.

### 4. Water today

- **Where:** _Dashboard_ → the **N to water today** chip in the header, and the **Water today**
  section at the bottom.
- **Show:** the beds to water, by garden and watering zone. _Ghent Courtyard Garden_ says **2 newly
  planted, watered daily for now**: the tomato and basil went in days ago. The rule is on screen:
  humid beds daily, balanced every 2 days, dry every 4, new plants daily for two weeks.

### 5. Outdoor humidity (Open-Meteo)

- **Where:** _Gardens_ → **Ghent Courtyard Garden**, under the average humidity.
- **Show:** **Outdoors now** with the live humidity and temperature at the garden's coordinates, and
  its source. _Bathroom Window Ferns_ has no coordinates, so it asks for nothing. Needs an internet
  connection; coordinates leave the browser rounded to about a kilometre.

### 6. Dutch and English

- **Where:** http://localhost:8080 (`npm run demo`), the **EN | NL** switch in the top bar.
- **Show:** **NL** opens the same page in Dutch — _Goedemorgen, Demo_, _Vandaag water geven_, and
  decimal commas (_13,6 / 24 m²_ on Ghent Courtyard Garden). The choice is remembered, and a first visit follows the browser's language.
  Garden and plant names stay as typed. (The development server serves one language; the switch
  appears on the production build.)

### 7. Undo after a delete

- **Where:** _Gardens_ → **Spare Cutting Bed** → delete it and confirm.
- **Show:** the toast **Garden “Spare Cutting Bed” deleted.** offers **Undo**: the garden comes back
  with its three plants and their places on the plan. Deleting a single plant offers Undo the same
  way.

### 8. Storybook, with an accessibility check on every story

- **Where:** http://localhost:6006 (`npm run storybook`).
- **Show:** 43 stories of the shared components (gauge, capacity bar and status, toasts, confirm
  dialog, plant artwork, …), the light/dark toolbar, and the **Accessibility** panel on each.
  `npm run build-storybook && npm run storybook:a11y` scans every story with axe (WCAG 2.2 AA) and
  prints _43/43 stories pass axe_; CI runs it.

### 9. Web Vitals and error reporting

- **Where:** the development app (http://localhost:4200), browser DevTools → **Console**.
- **Show:** switch to another tab and back: `[vitals] TTFB … (good)`, `FCP`, `LCP`, `CLS` (and `INP`
  after a click), measured with the browser's own PerformanceObserver. In production nothing leaves
  the browser until a `telemetryEndpoint` is set; then errors and vitals are sent with `sendBeacon`.

### 10. Save as PNG

- **Where:** the **PNG** button on the _Portfolio map_ (Dashboard), the _Garden plan_ and the
  _Humidity profile_ (a garden).
- **Show:** the picture is drawn in the browser, plant artwork included, and saved as a file.

## Also worth a minute

- **The capacity rule:** in _Antwerp Allotment_ (0.5 m² free), add a 1 m² plant — the form refuses it
  while you type, and the server agrees.
- **Needs attention:** _Antwerp Allotment_ (almost full) and _Bathroom Window Ferns_ (humidity
  drift), also marked on the portfolio map; choose a bubble to open its garden.
- **The hostile API:** every response takes 200–2000 ms and one in ten fails on purpose — skeletons,
  ghosts and quiet retries instead of spinners.
