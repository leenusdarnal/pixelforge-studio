# PixelForge Studio 2.2 — Mobile PWA

A touch-friendly, layer-based image editor that runs in a modern browser and can be installed as a Progressive Web App.

## Deploy with GitHub Pages

1. Open **Settings → Pages** in this repository.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select branch **main** and folder **/(root)**, then save.
4. After GitHub Pages finishes deploying, open the published HTTPS URL on your phone.
5. On Android, use the browser's **Install app** / **Add to Home screen** option. On iPhone/iPad, use Safari's **Share → Add to Home Screen**.

## Use

- Open or import an image from your device.
- Use the bottom tool strip for touch-friendly editing tools.
- Pinch with two fingers to zoom and pan.
- Tap **Panels** to open Layers, Adjust, and History.
- Export a flattened image or save an editable project file.

## Offline use

The service worker caches the editor shell and app icons after the first successful online visit. Artwork and project files remain in the browser unless explicitly exported; the app does not upload artwork to a server.

## Project files

- `index.html` — PixelForge Studio 2.2 editor
- `manifest.webmanifest` — install metadata and app icons
- `sw.js` — service worker and offline app-shell cache
- `icons/` — PWA icons

This is a browser-based image editor, not a full Photoshop replacement; it does not add native PSD/PSB support.