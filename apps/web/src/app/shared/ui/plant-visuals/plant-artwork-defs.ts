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
 */
@Component({
  selector: 'app-plant-artwork-defs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', style: 'position:absolute;width:0;height:0;overflow:hidden' },
  template: `
    <svg width="0" height="0" focusable="false">
      <defs>
        <!-- Shared leaf shapes -->
        <path id="pv-leaf" d="M0 0 C 9 -12, 9 -30, 0 -44 C -9 -30, -9 -12, 0 0 Z" />
        <path id="pv-blade" d="M0 0 C 3.5 -14, 3.5 -32, 0 -46 C -3.5 -32, -3.5 -14, 0 0 Z" />
        <path id="pv-spike" d="M0 2 L 7 -10 L 0 -46 L -7 -10 Z" />

        <!-- Rosette shrub: two leaf rings, light heart -->
        <symbol id="pv-shrub" viewBox="-50 -50 100 100">
          <ellipse cx="2" cy="5" rx="40" ry="36" fill="#1c1917" opacity="0.14" />
          <g fill="var(--pv-a)">
            <use href="#pv-leaf" transform="rotate(0)" />
            <use href="#pv-leaf" transform="rotate(45)" />
            <use href="#pv-leaf" transform="rotate(90)" />
            <use href="#pv-leaf" transform="rotate(135)" />
            <use href="#pv-leaf" transform="rotate(180)" />
            <use href="#pv-leaf" transform="rotate(225)" />
            <use href="#pv-leaf" transform="rotate(270)" />
            <use href="#pv-leaf" transform="rotate(315)" />
          </g>
          <g fill="var(--pv-b)" transform="scale(0.62) rotate(22)">
            <use href="#pv-leaf" transform="rotate(0)" />
            <use href="#pv-leaf" transform="rotate(60)" />
            <use href="#pv-leaf" transform="rotate(120)" />
            <use href="#pv-leaf" transform="rotate(180)" />
            <use href="#pv-leaf" transform="rotate(240)" />
            <use href="#pv-leaf" transform="rotate(300)" />
          </g>
          <circle r="5" fill="var(--pv-c)" opacity="0.9" />
        </symbol>

        <!-- Generic sprout rosette -->
        <symbol id="pv-generic" viewBox="-50 -50 100 100">
          <ellipse cx="2" cy="5" rx="36" ry="32" fill="#1c1917" opacity="0.13" />
          <g fill="var(--pv-a)" transform="scale(0.9)">
            <use href="#pv-leaf" transform="rotate(20)" />
            <use href="#pv-leaf" transform="rotate(80)" />
            <use href="#pv-leaf" transform="rotate(140)" />
            <use href="#pv-leaf" transform="rotate(200)" />
            <use href="#pv-leaf" transform="rotate(260)" />
            <use href="#pv-leaf" transform="rotate(320)" />
          </g>
          <g fill="var(--pv-b)" transform="scale(0.5) rotate(50)">
            <use href="#pv-leaf" transform="rotate(0)" />
            <use href="#pv-leaf" transform="rotate(120)" />
            <use href="#pv-leaf" transform="rotate(240)" />
          </g>
          <circle r="4.5" fill="var(--pv-c)" />
        </symbol>

        <!-- Flower: leafy base + petal ring + disc -->
        <symbol id="pv-flower" viewBox="-50 -50 100 100">
          <ellipse cx="2" cy="5" rx="38" ry="34" fill="#1c1917" opacity="0.13" />
          <g fill="var(--pv-a)" transform="scale(0.98) rotate(30)">
            <use href="#pv-leaf" transform="rotate(0)" />
            <use href="#pv-leaf" transform="rotate(72)" />
            <use href="#pv-leaf" transform="rotate(144)" />
            <use href="#pv-leaf" transform="rotate(216)" />
            <use href="#pv-leaf" transform="rotate(288)" />
          </g>
          <g fill="var(--pv-b)">
            <circle cx="0" cy="-17" r="10.5" />
            <circle cx="16.2" cy="-5.3" r="10.5" />
            <circle cx="10" cy="13.8" r="10.5" />
            <circle cx="-10" cy="13.8" r="10.5" />
            <circle cx="-16.2" cy="-5.3" r="10.5" />
          </g>
          <circle r="7.5" fill="var(--pv-c)" />
          <circle r="3" fill="#1c1917" opacity="0.25" />
        </symbol>

        <!-- Herb: fine blade tuft -->
        <symbol id="pv-herb" viewBox="-50 -50 100 100">
          <ellipse cx="2" cy="6" rx="32" ry="28" fill="#1c1917" opacity="0.12" />
          <g fill="var(--pv-a)">
            <use href="#pv-blade" transform="rotate(0) scale(1)" />
            <use href="#pv-blade" transform="rotate(30) scale(0.85)" />
            <use href="#pv-blade" transform="rotate(65) scale(1.02)" />
            <use href="#pv-blade" transform="rotate(100) scale(0.8)" />
            <use href="#pv-blade" transform="rotate(140) scale(0.95)" />
            <use href="#pv-blade" transform="rotate(175) scale(1.05)" />
            <use href="#pv-blade" transform="rotate(215) scale(0.82)" />
            <use href="#pv-blade" transform="rotate(250) scale(1)" />
            <use href="#pv-blade" transform="rotate(285) scale(0.88)" />
            <use href="#pv-blade" transform="rotate(325) scale(0.96)" />
          </g>
          <g fill="var(--pv-b)" transform="scale(0.6) rotate(15)">
            <use href="#pv-blade" transform="rotate(20)" />
            <use href="#pv-blade" transform="rotate(95)" />
            <use href="#pv-blade" transform="rotate(170)" />
            <use href="#pv-blade" transform="rotate(245)" />
            <use href="#pv-blade" transform="rotate(320)" />
          </g>
        </symbol>

        <!-- Vegetable: rosette + ripe fruits -->
        <symbol id="pv-vegetable" viewBox="-50 -50 100 100">
          <ellipse cx="2" cy="5" rx="40" ry="36" fill="#1c1917" opacity="0.14" />
          <g fill="var(--pv-a)" transform="rotate(10)">
            <use href="#pv-leaf" transform="rotate(0)" />
            <use href="#pv-leaf" transform="rotate(51)" />
            <use href="#pv-leaf" transform="rotate(103)" />
            <use href="#pv-leaf" transform="rotate(154)" />
            <use href="#pv-leaf" transform="rotate(206)" />
            <use href="#pv-leaf" transform="rotate(257)" />
            <use href="#pv-leaf" transform="rotate(309)" />
          </g>
          <g fill="var(--pv-b)" transform="scale(0.58) rotate(36)">
            <use href="#pv-leaf" transform="rotate(0)" />
            <use href="#pv-leaf" transform="rotate(72)" />
            <use href="#pv-leaf" transform="rotate(144)" />
            <use href="#pv-leaf" transform="rotate(216)" />
            <use href="#pv-leaf" transform="rotate(288)" />
          </g>
          <g fill="var(--pv-c)">
            <circle cx="-14" cy="-8" r="6.5" />
            <circle cx="13" cy="-14" r="5.5" />
            <circle cx="10" cy="12" r="7" />
            <circle cx="-7" cy="16" r="5" />
          </g>
          <g fill="#ffffff" opacity="0.35">
            <circle cx="-16" cy="-10" r="2" />
            <circle cx="11.5" cy="-15.5" r="1.7" />
            <circle cx="8" cy="10" r="2.1" />
          </g>
        </symbol>

        <!-- Fruit bush: mounded canopy + berries -->
        <symbol id="pv-fruit" viewBox="-50 -50 100 100">
          <ellipse cx="2" cy="6" rx="41" ry="37" fill="#1c1917" opacity="0.15" />
          <g fill="var(--pv-a)">
            <circle cx="-14" cy="-8" r="22" />
            <circle cx="14" cy="-10" r="20" />
            <circle cx="0" cy="12" r="23" />
            <circle cx="-20" cy="12" r="16" />
            <circle cx="20" cy="10" r="16" />
          </g>
          <g fill="var(--pv-b)">
            <circle cx="-10" cy="-12" r="14" />
            <circle cx="12" cy="-6" r="12" />
            <circle cx="-2" cy="10" r="14" />
          </g>
          <g fill="var(--pv-c)">
            <circle cx="-18" cy="2" r="4.4" />
            <circle cx="6" cy="-18" r="4" />
            <circle cx="18" cy="14" r="4.6" />
            <circle cx="-4" cy="20" r="3.8" />
            <circle cx="14" cy="-2" r="3.4" />
          </g>
          <g fill="#ffffff" opacity="0.4">
            <circle cx="-19.3" cy="0.7" r="1.4" />
            <circle cx="4.8" cy="-19.2" r="1.3" />
            <circle cx="16.8" cy="12.8" r="1.4" />
          </g>
        </symbol>

        <!-- Tree: lobed canopy with lit crown -->
        <symbol id="pv-tree" viewBox="-50 -50 100 100">
          <ellipse cx="3" cy="7" rx="45" ry="41" fill="#1c1917" opacity="0.18" />
          <g fill="var(--pv-a)">
            <circle cx="0" cy="0" r="34" />
            <circle cx="-24" cy="-12" r="17" />
            <circle cx="22" cy="-16" r="16" />
            <circle cx="28" cy="10" r="15" />
            <circle cx="-26" cy="14" r="15" />
            <circle cx="-2" cy="-28" r="15" />
            <circle cx="4" cy="28" r="15" />
          </g>
          <g fill="var(--pv-b)">
            <circle cx="-8" cy="-8" r="24" />
            <circle cx="10" cy="-14" r="13" />
            <circle cx="-20" cy="0" r="11" />
          </g>
          <g
            stroke="var(--pv-c)"
            stroke-width="1.6"
            opacity="0.5"
            fill="none"
            stroke-linecap="round"
          >
            <path d="M0 0 L -18 -20" />
            <path d="M0 0 L 20 -14" />
            <path d="M0 0 L 24 12" />
            <path d="M0 0 L -20 16" />
            <path d="M0 0 L 2 -26" />
          </g>
          <circle r="4" fill="var(--pv-c)" opacity="0.85" />
        </symbol>

        <!-- Succulent: thick pointed rosette -->
        <symbol id="pv-succulent" viewBox="-50 -50 100 100">
          <ellipse cx="2" cy="5" rx="36" ry="32" fill="#1c1917" opacity="0.13" />
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
          <g fill="var(--pv-b)" transform="scale(0.62) rotate(22.5)">
            <use href="#pv-spike" transform="rotate(0)" />
            <use href="#pv-spike" transform="rotate(45)" />
            <use href="#pv-spike" transform="rotate(90)" />
            <use href="#pv-spike" transform="rotate(135)" />
            <use href="#pv-spike" transform="rotate(180)" />
            <use href="#pv-spike" transform="rotate(225)" />
            <use href="#pv-spike" transform="rotate(270)" />
            <use href="#pv-spike" transform="rotate(315)" />
          </g>
          <circle r="6" fill="var(--pv-c)" />
        </symbol>
      </defs>
    </svg>
  `,
})
export class PlantArtworkDefs {}
