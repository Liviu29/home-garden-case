import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Original top-down botanical artwork (ADR-007 §visual layer), drawn as SVG
 * symbols for this project — no external assets, no licensing, no network,
 * crisp at every zoom level. Rendered once per page; consumers reference the
 * symbols with `<use href="#pv-…">` and tint them through the `--pv-a/b/c`
 * custom properties set by the PlantVisualResolver's palette.
 *
 * Every symbol lives in a −50…50 square, is centered on (0,0) and carries its
 * own soft ground shadow, so instances can be scaled/rotated freely.
 *
 * Shading is palette-neutral. `url()` paints (the gradients below) resolve in
 * this defs' context, where the `--pv-*` properties are NOT set, so every
 * gradient uses only white or ink (#1c1917) stops with stop-opacity. Each part
 * is painted in its palette colour first and then shaded by translucent
 * overlays drawn on top of it: tip-darkening along each leaf (rim shading),
 * a darker half-blade beside a pale midrib and veins, domed highlight/shade
 * on tufts, clumps and fruit, cast shadows under inner rings and a soft
 * top-left glow (the scene's light source). Depth therefore reads the same
 * for every palette, on light and dark surfaces alike.
 *
 * Shared parts (leaves, blades, petals, tufts, fruit) are `<g>` groups reused
 * through `<use>`, which keeps each symbol to a few dozen elements even when
 * the map clones it 100+ times. No filters, images or animation.
 */
@Component({
  selector: 'app-plant-artwork-defs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', style: 'position:absolute;width:0;height:0;overflow:hidden' },
  template: `
    <svg width="0" height="0" focusable="false">
      <defs>
        <!-- Neutral overlays: white/ink stops only, so they shade any palette -->
        <radialGradient id="pv-g-shadow">
          <stop offset="0" stop-color="#1c1917" stop-opacity="0.26" />
          <stop offset="0.6" stop-color="#1c1917" stop-opacity="0.16" />
          <stop offset="1" stop-color="#1c1917" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="pv-g-glow">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0.34" />
          <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="pv-g-tip" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0.3" stop-color="#1c1917" stop-opacity="0" />
          <stop offset="1" stop-color="#1c1917" stop-opacity="0.3" />
        </linearGradient>
        <linearGradient id="pv-g-petal" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stop-color="#1c1917" stop-opacity="0.3" />
          <stop offset="0.4" stop-color="#1c1917" stop-opacity="0" />
          <stop offset="0.75" stop-color="#ffffff" stop-opacity="0" />
          <stop offset="1" stop-color="#ffffff" stop-opacity="0.26" />
        </linearGradient>
        <radialGradient id="pv-g-dome" fx="0.34" fy="0.3">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0.3" />
          <stop offset="0.45" stop-color="#ffffff" stop-opacity="0" />
          <stop offset="0.72" stop-color="#1c1917" stop-opacity="0" />
          <stop offset="1" stop-color="#1c1917" stop-opacity="0.34" />
        </radialGradient>
        <radialGradient id="pv-g-rim">
          <stop offset="0.5" stop-color="#1c1917" stop-opacity="0" />
          <stop offset="1" stop-color="#1c1917" stop-opacity="0.4" />
        </radialGradient>
        <radialGradient id="pv-g-gloss" fx="0.3" fy="0.28">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0.6" />
          <stop offset="0.2" stop-color="#ffffff" stop-opacity="0.14" />
          <stop offset="0.45" stop-color="#ffffff" stop-opacity="0" />
          <stop offset="0.7" stop-color="#1c1917" stop-opacity="0" />
          <stop offset="1" stop-color="#1c1917" stop-opacity="0.36" />
        </radialGradient>

        <!-- Shared shapes: bare outlines (paint inherits from the using group) -->
        <path id="pv-leaf-d" d="M0 0 C 7 -8, 10.5 -25, 0 -44 C -10.5 -25, -7 -8, 0 0 Z" />
        <path
          id="pv-serrate-d"
          d="M0 0 Q5.9 -3.5 6.4 -7 Q10.6 -9.5 10.7 -11.9 L8.1 -13.5 Q12.1 -15.9 11.4 -18.3 L8.3 -19.9 Q11.7 -22.3 10.5 -24.7 L7.3 -26.3 Q9.8 -28.7 8.2 -31.1 L5.5 -32.8 Q6.6 -35.2 4.9 -37.6 L2.8 -39.2 Q2.4 -41.6 0 -44 Q-2.4 -41.6 -2.8 -39.2 L-4.9 -37.6 Q-6.6 -35.2 -5.5 -32.8 L-8.2 -31.1 Q-9.8 -28.7 -7.3 -26.3 L-10.5 -24.7 Q-11.7 -22.3 -8.3 -19.9 L-11.4 -18.3 Q-12.1 -15.9 -8.1 -13.5 L-10.7 -11.9 Q-10.6 -9.5 -6.4 -7 Q-5.9 -3.5 0 0 Z"
        />
        <path
          id="pv-leaflet-d"
          d="M0 0 Q3 -1.4 4.7 -4.9 Q6.7 -5 7 -6.6 L6.2 -7.8 Q8.2 -8.8 8.2 -10.3 L6.9 -10.9 Q8.7 -12.7 8.1 -13.8 L6.6 -13.8 Q7.7 -16.1 6.6 -16.8 L5 -16.1 Q5.2 -18.7 3.7 -18.8 L2.3 -17.5 Q1.5 -19.9 0 -19 Q-1.5 -19.9 -2.3 -17.5 L-3.7 -18.8 Q-5.2 -18.7 -5 -16.1 L-6.6 -16.8 Q-7.7 -16.1 -6.6 -13.8 L-8.1 -13.8 Q-8.7 -12.7 -6.9 -10.9 L-8.2 -10.3 Q-8.2 -8.8 -6.2 -7.8 L-7 -6.6 Q-6.7 -5 -4.7 -4.9 Q-3 -1.4 0 0 Z"
        />
        <path id="pv-blade-d" d="M0 0 C 3.4 -12, 4.4 -30, 1.6 -46 C -1.4 -31, -3.6 -13, 0 0 Z" />
        <path
          id="pv-petal-d"
          d="M0 0 C 4.5 -3, 11 -13, 7.4 -21.5 C 5.2 -26.8, -5.2 -26.8, -7.4 -21.5 C -11 -13, -4.5 -3, 0 0 Z"
        />
        <path
          id="pv-spike-d"
          d="M0 1 C 9 -5, 12.5 -22, 2.2 -40 L 0 -45 L -2.2 -40 C -12.5 -22, -9 -5, 0 1 Z"
        />
        <path
          id="pv-tuft-d"
          d="M2.1 -10.5 Q7.7 -12.5 9 -7.1 Q14.2 -4.7 11.1 0.3 Q13.3 5.2 8.6 7.6 Q6.6 12.1 1.6 10.4 Q-2.8 13.6 -5.9 9.7 Q-11.1 8.8 -10.3 3.4 Q-13.8 -0.4 -9.8 -3.8 Q-10.2 -9 -5 -9.2 Q-2 -13.1 2.1 -10.5 Z"
        />
        <path
          id="pv-clump-d"
          d="M1.4 -14.4 Q10.3 -16.9 12.7 -8.2 Q19.5 -2.4 15 5 Q15.8 15.4 5.3 14.6 Q-2 19.5 -7.7 12.6 Q-18.1 11.7 -15.6 2 Q-20.1 -6.8 -10.9 -10.7 Q-7.1 -19.6 1.4 -14.4 Z"
        />
        <path
          id="pv-berry-d"
          d="M0 1 C 6.4 1, 7.6 -5, 5.6 -9.4 C 4.2 -12.6, 1.6 -14.8, 0 -15.2 C -1.6 -14.8, -4.2 -12.6, -5.6 -9.4 C -7.6 -5, -6.4 1, 0 1 Z"
        />

        <!-- Shaded parts: palette fill, crisp ink edge, then neutral overlays -->
        <g id="pv-leaf">
          <use href="#pv-leaf-d" stroke="#1c1917" stroke-opacity="0.22" stroke-width="0.6" />
          <use href="#pv-leaf-d" fill="url(#pv-g-tip)" />
          <path d="M0 0 C 7 -8, 10.5 -25, 0 -44 Z" fill="#1c1917" fill-opacity="0.13" />
          <path
            d="M0 -3 Q 0.9 -22 0 -40 M0 -11 L 4.2 -17 M0 -19 L 5.4 -26 M0 -27 L 4.4 -33.5 M0 -15 L -4.6 -21.5 M0 -23 L -5.2 -30 M0 -31 L -3.6 -36.5"
            fill="none"
            stroke="#ffffff"
            stroke-opacity="0.3"
            stroke-width="0.8"
            stroke-linecap="round"
          />
        </g>
        <g id="pv-serrate">
          <use href="#pv-serrate-d" stroke="#1c1917" stroke-opacity="0.24" stroke-width="0.6" />
          <use href="#pv-serrate-d" fill="url(#pv-g-tip)" />
          <path
            d="M0 -2 L 0 -42"
            fill="none"
            stroke="#1c1917"
            stroke-opacity="0.16"
            stroke-width="3.4"
            stroke-linecap="round"
            transform="translate(1.7 0)"
          />
          <path
            d="M0 -3 Q 0.9 -22 0 -40 M0 -11 L 4.2 -17 M0 -19 L 5.4 -26 M0 -27 L 4.4 -33.5 M0 -15 L -4.6 -21.5 M0 -23 L -5.2 -30 M0 -31 L -3.6 -36.5"
            fill="none"
            stroke="#ffffff"
            stroke-opacity="0.32"
            stroke-width="0.8"
            stroke-linecap="round"
          />
        </g>
        <g id="pv-trifoliate">
          <use href="#pv-leaflet" transform="translate(0 -15) rotate(-44) scale(0.92)" />
          <use href="#pv-leaflet" transform="translate(0 -15) rotate(44) scale(0.92)" />
          <use href="#pv-leaflet" transform="translate(0 -15) rotate(0)" />
        </g>
        <g id="pv-leaflet">
          <use href="#pv-leaflet-d" stroke="#1c1917" stroke-opacity="0.24" stroke-width="0.55" />
          <use href="#pv-leaflet-d" fill="url(#pv-g-tip)" />
          <path
            d="M0 -1 L 0 -17 M0 -5 L 4 -9 M0 -9.5 L 4.4 -13.5 M0 -5 L -4 -9 M0 -9.5 L -4.4 -13.5"
            fill="none"
            stroke="#ffffff"
            stroke-opacity="0.3"
            stroke-width="0.7"
            stroke-linecap="round"
          />
        </g>
        <g id="pv-blade">
          <use href="#pv-blade-d" stroke="#1c1917" stroke-opacity="0.18" stroke-width="0.4" />
          <path
            d="M0 0 C 3.4 -12, 4.4 -30, 1.6 -46 Q 0.6 -24, 0 0 Z"
            fill="#1c1917"
            fill-opacity="0.14"
          />
          <path
            d="M0 -3 C 0.8 -18, 1.4 -32, 1.3 -42"
            fill="none"
            stroke="#ffffff"
            stroke-opacity="0.3"
            stroke-width="0.6"
            stroke-linecap="round"
          />
        </g>
        <g id="pv-petal">
          <use href="#pv-petal-d" stroke="#1c1917" stroke-opacity="0.2" stroke-width="0.5" />
          <use href="#pv-petal-d" fill="url(#pv-g-petal)" />
          <path
            d="M0 -4 L 0 -21 M-2.6 -8 Q -4.4 -15 -3.6 -21 M2.6 -8 Q 4.4 -15 3.6 -21"
            fill="none"
            stroke="#ffffff"
            stroke-opacity="0.3"
            stroke-width="0.6"
            stroke-linecap="round"
          />
        </g>
        <g id="pv-spike">
          <use href="#pv-spike-d" stroke="#1c1917" stroke-opacity="0.22" stroke-width="0.6" />
          <path d="M0 1 C 9 -5, 12.5 -22, 2.2 -40 L 0 -45 Z" fill="#1c1917" fill-opacity="0.15" />
          <path
            d="M0 -4 L 0 -38"
            fill="none"
            stroke="#ffffff"
            stroke-opacity="0.28"
            stroke-width="1.2"
            stroke-linecap="round"
          />
          <path
            d="M0 -45 L 3.2 -37.2 C 1.4 -38.6, -1.4 -38.6, -3.2 -37.2 Z"
            fill="var(--pv-c)"
            fill-opacity="0.9"
          />
        </g>
        <g id="pv-tuft">
          <use href="#pv-tuft-d" stroke="#1c1917" stroke-opacity="0.22" stroke-width="0.6" />
          <use href="#pv-tuft-d" fill="url(#pv-g-dome)" />
          <path
            d="M-6 -2 q 1.4 -2.6 3.6 -2.8 M0 -7 q 2.2 -1 3.8 0.6 M-2.4 2.2 q 2 -1.6 4 -0.8 M3.6 -0.4 q 1.6 -2 3.4 -1.4 M-7.4 3.6 q 1 -2 3 -2.6"
            fill="none"
            stroke="#ffffff"
            stroke-opacity="0.3"
            stroke-width="1"
            stroke-linecap="round"
          />
          <path
            d="M0.6 6.6 q 2.2 -0.4 3.6 -2.2 M5.4 2.8 q 1.2 -1.6 1 -3.6 M-3.8 6.8 q 2 0 3.4 -1.2"
            fill="none"
            stroke="#1c1917"
            stroke-opacity="0.22"
            stroke-width="1"
            stroke-linecap="round"
          />
        </g>
        <g id="pv-clump">
          <use href="#pv-clump-d" stroke="#1c1917" stroke-opacity="0.26" stroke-width="0.7" />
          <use href="#pv-clump-d" fill="url(#pv-g-dome)" />
          <path
            d="M-8 -3 q 2 -3.4 5 -3.6 M0 -10 q 3 -1.2 5.2 0.8 M-3.4 3 q 2.8 -2.2 5.6 -1 M5 -1 q 2.2 -2.6 4.6 -1.8 M-10 5 q 1.4 -2.8 4.2 -3.4"
            fill="none"
            stroke="#ffffff"
            stroke-opacity="0.26"
            stroke-width="1.2"
            stroke-linecap="round"
          />
          <path
            d="M1 9 q 3 -0.6 5 -3 M7.4 4 q 1.6 -2.2 1.4 -5 M-5.2 9.2 q 2.8 0 4.6 -1.6"
            fill="none"
            stroke="#1c1917"
            stroke-opacity="0.24"
            stroke-width="1.2"
            stroke-linecap="round"
          />
        </g>
        <g id="pv-tomato">
          <circle r="7" stroke="#1c1917" stroke-opacity="0.3" stroke-width="0.6" />
          <circle r="7" fill="url(#pv-g-gloss)" />
          <path
            d="M0.8 -3.9 L0.9 -0.8 L4 -0.5 L1 0.6 L1.7 3.6 L-0.2 1.2 L-2.9 2.7 L-1.2 0.1 L-3.5 -2 L-0.5 -1.1 Z"
            fill="var(--pv-a)"
            stroke="#1c1917"
            stroke-opacity="0.25"
            stroke-width="0.4"
            stroke-linejoin="round"
          />
          <ellipse
            cx="-3"
            cy="-3.6"
            rx="1.7"
            ry="1.1"
            transform="rotate(-35 -3 -3.6)"
            fill="#ffffff"
            fill-opacity="0.75"
          />
        </g>
        <g id="pv-berry">
          <use href="#pv-berry-d" stroke="#1c1917" stroke-opacity="0.3" stroke-width="0.55" />
          <use href="#pv-berry-d" fill="url(#pv-g-gloss)" />
          <path
            d="M-3.2 -2.4h0.01 M0 -2h0.01 M3.2 -2.4h0.01 M-4.4 -5.8h0.01 M-1.5 -5.4h0.01 M1.5 -5.4h0.01 M4.4 -5.8h0.01 M-3 -8.8h0.01 M0 -8.6h0.01 M3 -8.8h0.01 M-1.5 -11.8h0.01 M1.5 -11.8h0.01"
            fill="none"
            stroke="#ffffff"
            stroke-opacity="0.7"
            stroke-width="1.05"
            stroke-linecap="round"
          />
          <path
            d="M1.5 -5 L1.2 -1.1 L5.1 -1.2 L1.5 0.5 L3.5 3.8 L0.4 1.6 L-1.5 5 L-1.2 1.1 L-5.1 1.2 L-1.5 -0.5 L-3.5 -3.8 L-0.4 -1.6 Z"
            fill="var(--pv-b)"
            stroke="#1c1917"
            stroke-opacity="0.25"
            stroke-width="0.4"
            stroke-linejoin="round"
          />
        </g>

        <!-- Shrub (boxwood): lobed mound of small domed leaf tufts, lime new growth -->
        <symbol id="pv-shrub" viewBox="-50 -50 100 100">
          <ellipse cx="3" cy="5" rx="45" ry="42" fill="url(#pv-g-shadow)" />
          <path
            d="M0 -39.4 Q9.4 -44.4 16.1 -36.1 Q26.4 -36.3 29.5 -26.5 Q38.8 -22.4 37.1 -12 Q45.6 -4.8 40.3 4.2 Q43.9 14.3 35.4 20.4 Q33 29.7 22.9 31.6 Q18.8 42.1 8.4 39.6 Q0 46.3 -8.1 38.2 Q-17.6 39.6 -23.1 31.8 Q-33.5 30.2 -35.2 20.3 Q-42.4 13.8 -39.2 4.1 Q-45.1 -4.7 -37.7 -12.3 Q-38 -22 -29.5 -26.5 Q-26.5 -36.5 -16.3 -36.6 Q-9.7 -45.6 0 -39.4 Z"
            fill="var(--pv-a)"
            stroke="#1c1917"
            stroke-opacity="0.26"
            stroke-width="0.7"
          />
          <path
            d="M0 -39.4 Q9.4 -44.4 16.1 -36.1 Q26.4 -36.3 29.5 -26.5 Q38.8 -22.4 37.1 -12 Q45.6 -4.8 40.3 4.2 Q43.9 14.3 35.4 20.4 Q33 29.7 22.9 31.6 Q18.8 42.1 8.4 39.6 Q0 46.3 -8.1 38.2 Q-17.6 39.6 -23.1 31.8 Q-33.5 30.2 -35.2 20.3 Q-42.4 13.8 -39.2 4.1 Q-45.1 -4.7 -37.7 -12.3 Q-38 -22 -29.5 -26.5 Q-26.5 -36.5 -16.3 -36.6 Q-9.7 -45.6 0 -39.4 Z"
            fill="url(#pv-g-rim)"
          />
          <g fill="var(--pv-a)">
            <use href="#pv-tuft" transform="translate(0 -27) scale(1.2)" />
            <use href="#pv-tuft" transform="translate(19 -19) rotate(40) scale(1.2)" />
            <use href="#pv-tuft" transform="translate(27 0) rotate(80) scale(1.2)" />
            <use href="#pv-tuft" transform="translate(19 19) rotate(120) scale(1.2)" />
            <use href="#pv-tuft" transform="translate(0 27) rotate(160) scale(1.2)" />
            <use href="#pv-tuft" transform="translate(-19 19) rotate(200) scale(1.2)" />
            <use href="#pv-tuft" transform="translate(-27 0) rotate(240) scale(1.2)" />
            <use href="#pv-tuft" transform="translate(-19 -19) rotate(280) scale(1.2)" />
          </g>
          <g fill="var(--pv-b)">
            <use href="#pv-tuft" transform="translate(-1 -12) rotate(20) scale(1.1)" />
            <use href="#pv-tuft" transform="translate(11 -3) rotate(70) scale(1.1)" />
            <use href="#pv-tuft" transform="translate(6 11) rotate(130) scale(1.1)" />
            <use href="#pv-tuft" transform="translate(-8 9) rotate(190) scale(1.1)" />
            <use href="#pv-tuft" transform="translate(-12 -3) rotate(250) scale(1.1)" />
            <use href="#pv-tuft" transform="translate(-3 -3)" />
          </g>
          <ellipse cx="-9" cy="-10" rx="24" ry="22" fill="url(#pv-g-glow)" />
          <path
            d="M-6 -19h0.01 M8 -14h0.01 M20 -8h0.01 M-18 -8h0.01 M2 4h0.01 M14 12h0.01 M-12 14h0.01 M-24 6h0.01 M22 22h0.01 M-2 22h0.01 M-8 -2h0.01 M26 -14h0.01"
            fill="none"
            stroke="var(--pv-c)"
            stroke-width="1.9"
            stroke-linecap="round"
          />
        </symbol>

        <!-- Generic: clean sprout rosette with a bud -->
        <symbol id="pv-generic" viewBox="-50 -50 100 100">
          <ellipse cx="2" cy="5" rx="42" ry="39" fill="url(#pv-g-shadow)" />
          <g fill="var(--pv-a)" transform="scale(0.94)">
            <use href="#pv-leaf" transform="rotate(20)" />
            <use href="#pv-leaf" transform="rotate(80)" />
            <use href="#pv-leaf" transform="rotate(140)" />
            <use href="#pv-leaf" transform="rotate(200)" />
            <use href="#pv-leaf" transform="rotate(260)" />
            <use href="#pv-leaf" transform="rotate(320)" />
          </g>
          <g
            fill="#1c1917"
            fill-opacity="0.16"
            transform="translate(1.2 1.8) rotate(50) scale(0.6)"
          >
            <use href="#pv-leaf-d" transform="rotate(0)" />
            <use href="#pv-leaf-d" transform="rotate(120)" />
            <use href="#pv-leaf-d" transform="rotate(240)" />
          </g>
          <g fill="var(--pv-b)" transform="rotate(50) scale(0.6)">
            <use href="#pv-leaf" transform="rotate(0)" />
            <use href="#pv-leaf" transform="rotate(120)" />
            <use href="#pv-leaf" transform="rotate(240)" />
          </g>
          <ellipse cx="-5" cy="-6" rx="11" ry="10" fill="url(#pv-g-glow)" />
          <circle
            r="4.6"
            fill="var(--pv-c)"
            stroke="#1c1917"
            stroke-opacity="0.25"
            stroke-width="0.5"
          />
          <circle r="4.6" fill="url(#pv-g-dome)" />
        </symbol>

        <!-- Flower: leafy base, two petal rings, stamen disc -->
        <symbol id="pv-flower" viewBox="-50 -50 100 100">
          <ellipse cx="2" cy="5" rx="44" ry="41" fill="url(#pv-g-shadow)" />
          <g fill="var(--pv-a)" transform="rotate(30) scale(0.97)">
            <use href="#pv-leaf" transform="rotate(0)" />
            <use href="#pv-leaf" transform="rotate(60)" />
            <use href="#pv-leaf" transform="rotate(120)" />
            <use href="#pv-leaf" transform="rotate(180)" />
            <use href="#pv-leaf" transform="rotate(240)" />
            <use href="#pv-leaf" transform="rotate(300)" />
          </g>
          <g fill="var(--pv-b)" transform="scale(1.12)">
            <use href="#pv-petal" transform="rotate(0)" />
            <use href="#pv-petal" transform="rotate(45)" />
            <use href="#pv-petal" transform="rotate(90)" />
            <use href="#pv-petal" transform="rotate(135)" />
            <use href="#pv-petal" transform="rotate(180)" />
            <use href="#pv-petal" transform="rotate(225)" />
            <use href="#pv-petal" transform="rotate(270)" />
            <use href="#pv-petal" transform="rotate(315)" />
          </g>
          <g
            fill="#1c1917"
            fill-opacity="0.16"
            transform="translate(1.2 1.8) rotate(22.5) scale(0.8)"
          >
            <use href="#pv-petal-d" transform="rotate(0)" />
            <use href="#pv-petal-d" transform="rotate(45)" />
            <use href="#pv-petal-d" transform="rotate(90)" />
            <use href="#pv-petal-d" transform="rotate(135)" />
            <use href="#pv-petal-d" transform="rotate(180)" />
            <use href="#pv-petal-d" transform="rotate(225)" />
            <use href="#pv-petal-d" transform="rotate(270)" />
            <use href="#pv-petal-d" transform="rotate(315)" />
          </g>
          <g fill="var(--pv-b)" transform="rotate(22.5) scale(0.8)">
            <use href="#pv-petal" transform="rotate(0)" />
            <use href="#pv-petal" transform="rotate(45)" />
            <use href="#pv-petal" transform="rotate(90)" />
            <use href="#pv-petal" transform="rotate(135)" />
            <use href="#pv-petal" transform="rotate(180)" />
            <use href="#pv-petal" transform="rotate(225)" />
            <use href="#pv-petal" transform="rotate(270)" />
            <use href="#pv-petal" transform="rotate(315)" />
          </g>
          <ellipse cx="-6" cy="-7" rx="16" ry="15" fill="url(#pv-g-glow)" />
          <circle
            r="8"
            fill="var(--pv-c)"
            stroke="#1c1917"
            stroke-opacity="0.3"
            stroke-width="0.6"
          />
          <circle r="8" fill="url(#pv-g-dome)" />
          <path
            d="M0.6 -5.6h0.01 M3.1 -4.7h0.01 M4.9 -2.7h0.01 M5.6 -0.1h0.01 M5 2.5h0.01 M3.3 4.5h0.01 M0.8 5.5h0.01 M-1.9 5.3h0.01 M-4.1 3.8h0.01 M-5.4 1.5h0.01 M-5.5 -1.2h0.01 M-4.3 -3.6h0.01 M-2.1 -5.2h0.01 M1.2 -2.8h0.01 M2.9 -0.8h0.01 M2.4 1.8h0.01 M0.1 3h0.01 M-2.3 2h0.01 M-3 -0.5h0.01 M-1.4 -2.6h0.01 M0 0h0.01"
            fill="none"
            stroke="#1c1917"
            stroke-opacity="0.34"
            stroke-width="1.15"
            stroke-linecap="round"
          />
          <path
            d="M-4 -4.3h0.01 M-1.8 -5.6h0.01 M-5.4 -2h0.01"
            fill="none"
            stroke="#ffffff"
            stroke-opacity="0.65"
            stroke-width="1"
            stroke-linecap="round"
          />
        </symbol>

        <!-- Herb: fine many-bladed tuft, lighter heart -->
        <symbol id="pv-herb" viewBox="-50 -50 100 100">
          <ellipse cx="2" cy="6" rx="40" ry="37" fill="url(#pv-g-shadow)" />
          <g fill="var(--pv-a)">
            <use href="#pv-blade" transform="rotate(0) scale(1)" />
            <use href="#pv-blade" transform="rotate(29) scale(0.84)" />
            <use href="#pv-blade" transform="rotate(48) scale(0.97)" />
            <use href="#pv-blade" transform="rotate(81) scale(0.8)" />
            <use href="#pv-blade" transform="rotate(99) scale(0.93)" />
            <use href="#pv-blade" transform="rotate(129) scale(1.02)" />
            <use href="#pv-blade" transform="rotate(149) scale(0.83)" />
            <use href="#pv-blade" transform="rotate(182) scale(0.98)" />
            <use href="#pv-blade" transform="rotate(208) scale(0.86)" />
            <use href="#pv-blade" transform="rotate(229) scale(1)" />
            <use href="#pv-blade" transform="rotate(260) scale(0.82)" />
            <use href="#pv-blade" transform="rotate(281) scale(0.95)" />
            <use href="#pv-blade" transform="rotate(310) scale(0.88)" />
            <use href="#pv-blade" transform="rotate(331) scale(0.99)" />
          </g>
          <g fill="var(--pv-b)" transform="rotate(13) scale(0.7)">
            <use href="#pv-blade" transform="rotate(0)" />
            <use href="#pv-blade" transform="rotate(36) scale(0.86)" />
            <use href="#pv-blade" transform="rotate(72) scale(0.95)" />
            <use href="#pv-blade" transform="rotate(108) scale(0.8)" />
            <use href="#pv-blade" transform="rotate(144) scale(0.92)" />
            <use href="#pv-blade" transform="rotate(180)" />
            <use href="#pv-blade" transform="rotate(216) scale(0.86)" />
            <use href="#pv-blade" transform="rotate(252) scale(0.95)" />
            <use href="#pv-blade" transform="rotate(288) scale(0.8)" />
            <use href="#pv-blade" transform="rotate(324) scale(0.92)" />
          </g>
          <g fill="var(--pv-c)" transform="rotate(40) scale(0.42)">
            <use href="#pv-blade" transform="rotate(0)" />
            <use href="#pv-blade" transform="rotate(60) scale(0.85)" />
            <use href="#pv-blade" transform="rotate(120) scale(0.94)" />
            <use href="#pv-blade" transform="rotate(180)" />
            <use href="#pv-blade" transform="rotate(240) scale(0.85)" />
            <use href="#pv-blade" transform="rotate(300) scale(0.94)" />
          </g>
          <ellipse cx="-2" cy="-3" rx="16" ry="15" fill="url(#pv-g-glow)" />
        </symbol>

        <!-- Vegetable (tomato): serrated rosette, glossy fruits with calyx stars -->
        <symbol id="pv-vegetable" viewBox="-50 -50 100 100">
          <ellipse cx="2" cy="5" rx="45" ry="42" fill="url(#pv-g-shadow)" />
          <g fill="var(--pv-a)" transform="rotate(10)">
            <use href="#pv-serrate" transform="rotate(0)" />
            <use href="#pv-serrate" transform="rotate(51.4) scale(0.94)" />
            <use href="#pv-serrate" transform="rotate(102.9) scale(0.98)" />
            <use href="#pv-serrate" transform="rotate(154.3)" />
            <use href="#pv-serrate" transform="rotate(205.7) scale(0.94)" />
            <use href="#pv-serrate" transform="rotate(257.1) scale(0.98)" />
            <use href="#pv-serrate" transform="rotate(308.6)" />
          </g>
          <g
            fill="#1c1917"
            fill-opacity="0.16"
            transform="translate(1.2 1.8) rotate(46) scale(0.6)"
          >
            <use href="#pv-serrate-d" transform="rotate(0)" />
            <use href="#pv-serrate-d" transform="rotate(72)" />
            <use href="#pv-serrate-d" transform="rotate(144)" />
            <use href="#pv-serrate-d" transform="rotate(216)" />
            <use href="#pv-serrate-d" transform="rotate(288)" />
          </g>
          <g fill="var(--pv-b)" transform="rotate(46) scale(0.6)">
            <use href="#pv-serrate" transform="rotate(0)" />
            <use href="#pv-serrate" transform="rotate(72)" />
            <use href="#pv-serrate" transform="rotate(144)" />
            <use href="#pv-serrate" transform="rotate(216)" />
            <use href="#pv-serrate" transform="rotate(288)" />
          </g>
          <ellipse cx="-6" cy="-8" rx="16" ry="15" fill="url(#pv-g-glow)" />
          <g fill="var(--pv-c)">
            <use href="#pv-tomato" transform="translate(-17 -9) rotate(10)" />
            <use href="#pv-tomato" transform="translate(-8 -20) rotate(60) scale(0.8)" />
            <use href="#pv-tomato" transform="translate(15 -13) rotate(140) scale(0.88)" />
            <use href="#pv-tomato" transform="translate(12 14) rotate(200) scale(1.05)" />
            <use href="#pv-tomato" transform="translate(-6 19) rotate(280) scale(0.84)" />
          </g>
        </symbol>

        <!-- Fruit (strawberry): mounded trifoliate canopy, seeded berries -->
        <symbol id="pv-fruit" viewBox="-50 -50 100 100">
          <ellipse cx="2" cy="6" rx="45" ry="42" fill="url(#pv-g-shadow)" />
          <path
            d="M3 -30.2 Q12.4 -32.9 17.5 -24.3 Q28.1 -23 29.3 -13.2 Q34.5 -5.6 29.6 3 Q33.8 12.8 24.9 17.9 Q22 26.9 12.6 27.9 Q5.7 35.2 -3 30.2 Q-12.5 32.9 -18.7 25.9 Q-28.5 23.3 -27.3 12.3 Q-35.5 5.8 -29.9 -3 Q-34.3 -13 -25.9 -18.7 Q-23.6 -28.9 -13.2 -29.2 Q-6.1 -37.4 3 -30.2 Z"
            fill="var(--pv-a)"
            stroke="#1c1917"
            stroke-opacity="0.24"
            stroke-width="0.6"
          />
          <path
            d="M3 -30.2 Q12.4 -32.9 17.5 -24.3 Q28.1 -23 29.3 -13.2 Q34.5 -5.6 29.6 3 Q33.8 12.8 24.9 17.9 Q22 26.9 12.6 27.9 Q5.7 35.2 -3 30.2 Q-12.5 32.9 -18.7 25.9 Q-28.5 23.3 -27.3 12.3 Q-35.5 5.8 -29.9 -3 Q-34.3 -13 -25.9 -18.7 Q-23.6 -28.9 -13.2 -29.2 Q-6.1 -37.4 3 -30.2 Z"
            fill="url(#pv-g-rim)"
          />
          <g fill="var(--pv-a)">
            <use href="#pv-trifoliate" transform="rotate(10) scale(1.14)" />
            <use href="#pv-trifoliate" transform="rotate(70) scale(1.06)" />
            <use href="#pv-trifoliate" transform="rotate(130) scale(1.1)" />
            <use href="#pv-trifoliate" transform="rotate(190) scale(1.14)" />
            <use href="#pv-trifoliate" transform="rotate(250) scale(1.06)" />
            <use href="#pv-trifoliate" transform="rotate(310) scale(1.1)" />
          </g>
          <g fill="var(--pv-c)">
            <use href="#pv-berry" transform="translate(-24 -16) rotate(-56)" />
            <use href="#pv-berry" transform="translate(26 -8) rotate(72) scale(0.95)" />
            <use href="#pv-berry" transform="translate(10 26) rotate(160) scale(1.05)" />
            <use href="#pv-berry" transform="translate(-22 18) rotate(230) scale(0.9)" />
          </g>
          <g fill="var(--pv-b)" transform="rotate(40) scale(0.74)">
            <use href="#pv-trifoliate" transform="rotate(0)" />
            <use href="#pv-trifoliate" transform="rotate(72)" />
            <use href="#pv-trifoliate" transform="rotate(144)" />
            <use href="#pv-trifoliate" transform="rotate(216)" />
            <use href="#pv-trifoliate" transform="rotate(288)" />
          </g>
          <g fill="var(--pv-b)" transform="rotate(15) scale(0.42)">
            <use href="#pv-trifoliate" transform="rotate(0)" />
            <use href="#pv-trifoliate" transform="rotate(120)" />
            <use href="#pv-trifoliate" transform="rotate(240)" />
          </g>
          <ellipse cx="-6" cy="-7" rx="14" ry="13" fill="url(#pv-g-glow)" />
          <g fill="var(--pv-c)">
            <use href="#pv-berry" transform="translate(4 -10) rotate(20) scale(0.78)" />
          </g>
        </symbol>

        <!-- Tree: dark under-canopy, lobed leaf clumps, lit crown -->
        <symbol id="pv-tree" viewBox="-50 -50 100 100">
          <ellipse cx="4" cy="7" rx="45" ry="42" fill="url(#pv-g-shadow)" />
          <path
            d="M6.2 -41.3 Q20.6 -44.3 28.5 -32.4 Q42.4 -26.8 40.1 -11.5 Q50.9 0.4 41.7 12.6 Q41.7 27.2 28 32.8 Q21.1 47.1 5.7 41.7 Q-7.4 49.3 -17.9 38.5 Q-32.5 37 -35.2 22.3 Q-48.4 13.8 -41.2 -0.3 Q-46.4 -14 -36.5 -23.8 Q-33.7 -39.5 -16.8 -37.6 Q-6.5 -48 6.2 -41.3 Z"
            fill="var(--pv-c)"
            stroke="#1c1917"
            stroke-opacity="0.3"
            stroke-width="0.8"
          />
          <path
            d="M6.2 -41.3 Q20.6 -44.3 28.5 -32.4 Q42.4 -26.8 40.1 -11.5 Q50.9 0.4 41.7 12.6 Q41.7 27.2 28 32.8 Q21.1 47.1 5.7 41.7 Q-7.4 49.3 -17.9 38.5 Q-32.5 37 -35.2 22.3 Q-48.4 13.8 -41.2 -0.3 Q-46.4 -14 -36.5 -23.8 Q-33.7 -39.5 -16.8 -37.6 Q-6.5 -48 6.2 -41.3 Z"
            fill="url(#pv-g-rim)"
          />
          <g fill="var(--pv-a)">
            <use href="#pv-clump" transform="translate(0 -26) scale(1.08)" />
            <use href="#pv-clump" transform="translate(22 -14) rotate(50) scale(1.02)" />
            <use href="#pv-clump" transform="translate(25 11) rotate(100) scale(1.08)" />
            <use href="#pv-clump" transform="translate(6 27) rotate(150) scale(1.02)" />
            <use href="#pv-clump" transform="translate(-18 21) rotate(200) scale(1.06)" />
            <use href="#pv-clump" transform="translate(-27 -1) rotate(250) scale(1.02)" />
            <use href="#pv-clump" transform="translate(-17 -21) rotate(300) scale(1.04)" />
          </g>
          <g fill="var(--pv-b)">
            <use href="#pv-clump" transform="translate(9 6) rotate(30) scale(1.05)" />
            <use href="#pv-clump" transform="translate(-9 5) rotate(120)" />
            <use href="#pv-clump" transform="translate(4 -11) rotate(200) scale(1.02)" />
            <use href="#pv-clump" transform="translate(-9 -10) rotate(280) scale(0.92)" />
          </g>
          <ellipse cx="-10" cy="-11" rx="24" ry="22" fill="url(#pv-g-glow)" opacity="0.7" />
        </symbol>

        <!-- Succulent: layered pointed rosette, pale tips -->
        <symbol id="pv-succulent" viewBox="-50 -50 100 100">
          <ellipse cx="2" cy="5" rx="43" ry="40" fill="url(#pv-g-shadow)" />
          <g fill="var(--pv-a)">
            <use href="#pv-spike" transform="rotate(0)" />
            <use href="#pv-spike" transform="rotate(45)" />
            <use href="#pv-spike" transform="rotate(90)" />
            <use href="#pv-spike" transform="rotate(135)" />
            <use href="#pv-spike" transform="rotate(180)" />
            <use href="#pv-spike" transform="rotate(225)" />
            <use href="#pv-spike" transform="rotate(270)" />
            <use href="#pv-spike" transform="rotate(315)" />
          </g>
          <g
            fill="#1c1917"
            fill-opacity="0.16"
            transform="translate(1.2 1.8) rotate(22.5) scale(0.7)"
          >
            <use href="#pv-spike-d" transform="rotate(0)" />
            <use href="#pv-spike-d" transform="rotate(45)" />
            <use href="#pv-spike-d" transform="rotate(90)" />
            <use href="#pv-spike-d" transform="rotate(135)" />
            <use href="#pv-spike-d" transform="rotate(180)" />
            <use href="#pv-spike-d" transform="rotate(225)" />
            <use href="#pv-spike-d" transform="rotate(270)" />
            <use href="#pv-spike-d" transform="rotate(315)" />
          </g>
          <g fill="var(--pv-b)" transform="rotate(22.5) scale(0.7)">
            <use href="#pv-spike" transform="rotate(0)" />
            <use href="#pv-spike" transform="rotate(45)" />
            <use href="#pv-spike" transform="rotate(90)" />
            <use href="#pv-spike" transform="rotate(135)" />
            <use href="#pv-spike" transform="rotate(180)" />
            <use href="#pv-spike" transform="rotate(225)" />
            <use href="#pv-spike" transform="rotate(270)" />
            <use href="#pv-spike" transform="rotate(315)" />
          </g>
          <g
            fill="#1c1917"
            fill-opacity="0.16"
            transform="translate(1.2 1.8) rotate(8) scale(0.43)"
          >
            <use href="#pv-spike-d" transform="rotate(0)" />
            <use href="#pv-spike-d" transform="rotate(60)" />
            <use href="#pv-spike-d" transform="rotate(120)" />
            <use href="#pv-spike-d" transform="rotate(180)" />
            <use href="#pv-spike-d" transform="rotate(240)" />
            <use href="#pv-spike-d" transform="rotate(300)" />
          </g>
          <g fill="var(--pv-b)" transform="rotate(8) scale(0.43)">
            <use href="#pv-spike" transform="rotate(0)" />
            <use href="#pv-spike" transform="rotate(60)" />
            <use href="#pv-spike" transform="rotate(120)" />
            <use href="#pv-spike" transform="rotate(180)" />
            <use href="#pv-spike" transform="rotate(240)" />
            <use href="#pv-spike" transform="rotate(300)" />
          </g>
          <ellipse cx="-4" cy="-5" rx="14" ry="13" fill="url(#pv-g-glow)" />
          <circle
            r="3.2"
            fill="var(--pv-b)"
            stroke="#1c1917"
            stroke-opacity="0.2"
            stroke-width="0.4"
          />
          <circle r="3.2" fill="url(#pv-g-dome)" />
        </symbol>
      </defs>
    </svg>
  `,
})
export class PlantArtworkDefs {}
