# Changelog

## 2.4.0 — Direct SvelteKit editor integration

- Removed the active iframe dependency and mounted the editor directly in the SvelteKit route.
- Separated the workbench into a Svelte component, markup module, stylesheet, editor runtime, project contract, IndexedDB storage service and history-budget module.
- Reworked the editor-to-host bridge to use same-window events for project autosave, recovery and update-safe state capture.
- Kept the previous iframe page as an inactive rollback reference during migration.
- Preserved the existing canvas tools, layers, masks, adjustments, editable text and project snapshot behavior.
- Updated smoke checks to verify direct mounting and the same-window recovery bridge.

The editor runtime is still a transitional consolidated module; deeper feature-level decomposition and Web Worker processing remain next-stage work.

## 2.3.0 — Framework migration foundation

- Added a SvelteKit, Svelte 5, TypeScript and Tailwind CSS 4 application shell.
- Added the Vercel SvelteKit adapter.
- Preserved the existing v2.2 editor as a temporary compatibility module.
- Added IndexedDB autosave and local recovery in the SvelteKit host.
- Added a 24 MP document target and proportional image import scaling.
- Added a bounded snapshot-history estimate.
- Added a versioned SvelteKit service worker and offline app-shell cache.
- Added basic editable text layers with font family, size, weight, colour, alignment, line spacing and opacity.
- Preserved text-layer metadata in local autosaves and .pfs project snapshots.
- Added a layer action to reopen and edit saved text content.
- Added CI checks, 24 MP tests and smoke checks.
- Updated PWA metadata and project documentation.
- Added the MIT licence.

This is a migration foundation. Selection-mask redesign, non-destructive transforms, worker filters and dirty-region rendering remain future roadmap work.
