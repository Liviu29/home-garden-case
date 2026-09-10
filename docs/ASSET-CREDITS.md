# Visual Asset Credits

All botanical artwork in this application — the eight top-down plant symbols
(shrub, generic sprout, flower, herb, vegetable, fruit bush, tree, succulent)
in `apps/web/src/app/shared/ui/plant-visuals/plant-artwork-defs.ts` — is
**original vector artwork created for this project**. No third-party images,
icon packs, stock photos or generated assets are used; nothing is fetched from
the network at runtime.

Consequences, by design (feature brief §5/§46/§47):

- zero licensing/attribution obligations and zero redistribution risk;
- fully offline/CI-safe — the visuals work after `npm install` with no network;
- ~6 kB of SVG paths inside the lazy map chunk instead of image payloads;
- crisp at every zoom level, tinted at runtime via CSS custom properties
  (`--pv-a/b/c`) from the PlantVisualResolver's deterministic palettes.
