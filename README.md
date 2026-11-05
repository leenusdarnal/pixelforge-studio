# PixelForge Studio 2.3

A mobile-friendly, offline-first image editor with layers, masks, selection tools, filters and editable .pfs project files.

PixelForge is an open-source project under the **MIT License**. It runs in the browser and keeps artwork and autosaves on the user's device. The application does not provide cloud sync or upload artwork to a remote service.

## Development stack

- SvelteKit and Svelte 5
- TypeScript
- Tailwind CSS 4
- HTML Canvas API
- Web Workers for background image processing (planned; not active yet)
- IndexedDB for local autosave and recovery
- Vercel for hosting and deployment

## Run locally

Requirements: Node.js 20 or newer and npm.

    npm install
    npm run dev

## Checks

    npm run check
    npm test
    npm run build
    npm run smoke

The CI workflow runs these checks for pull requests and pushes to main.

## Deploy to Vercel

The GitHub repository is connected to Vercel. Push or merge to main to trigger a production deployment. Vercel should detect SvelteKit and use the included Vercel adapter. Keep the project root at the repository root and use npm run build.

## Existing editor migration

The v2.2 editor is preserved in static/legacy/index.html and hosted inside the SvelteKit application while its UI and image operations are migrated into Svelte components and editor modules in stages. This compatibility layer keeps existing tools available; it is not the final component architecture.

## Text layers

Text layers support basic editable metadata: content, font family, size, weight, colour, alignment, opacity and line spacing. Their settings are included in project snapshots and local autosaves. Painting, filters, masks, cropping and geometric transforms rasterize the text so the visual result remains consistent; duplicate a text layer first to keep an editable copy before applying those operations.

## Local storage and recovery

- Autosaves are stored in IndexedDB on the current device.
- The latest autosave and up to three recovery copies are retained.
- No account or cloud sync is required.
- Browser storage can be cleared by the user or removed by the browser. Export a .pfs file for a separate backup.
- Browser storage quotas vary by device.

## Image size target

The initial image target is **24 megapixels**, with a maximum document side of 6,000 pixels. Imported images above the target are scaled down proportionally. New documents, resizes and project files above the target are rejected.

This is a guardrail, not a guarantee that every device can safely handle every 24 MP project. Layer count, masks, browser memory and available device resources affect performance.

## Project files

- src/routes/ — SvelteKit application routes
- src/lib/editor/ — Svelte workbench, markup, styles, runtime and size utilities
- src/service-worker.ts — offline app-shell and update cache
- static/legacy/ — inactive rollback reference; not used by the active app
- static/manifest.webmanifest — PWA metadata
- static/icons/ — app icons
- tests/ — automated unit tests
- scripts/smoke.mjs — project smoke checks

## Roadmap

1. Project safety, history and autosave.
2. Mobile layout and accessibility.
3. Modular SvelteKit + Tailwind architecture.
4. Selection masks, transform and editable text.
5. Background filters, rendering improvements and HiDPI support.
6. Export, PWA polish and open-source release preparation.

Advanced text effects, adjustment layers, cloud sync and collaboration are outside the v2.3 scope.
