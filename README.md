# SnapGrab

A Manifest V3 browser extension that watches what you click and type on a page and automatically turns it into an annotated, editable step-by-step guide — like Scribe, but running entirely locally in your browser (no account, no server, no data leaves your machine).

## Features

- **One-click recording** — start from the toolbar popup, then just use the site normally.
- **Automatic screenshots** — every click, form entry, and page navigation is captured.
- **Annotated markers** — clicks are marked with a numbered red circle on the screenshot, drawn where you actually clicked.
- **Smart step descriptions** — e.g. `Clicked the button "Sign in"`, `Typed "jane@doe.com" into "Email"`. Password/credit-card fields are automatically masked.
- **On-page recording indicator** — a small pill shows the live step count and lets you stop without opening the popup.
- **Guide editor** — reorder steps by drag-and-drop, edit titles/notes, delete steps, and preview each screenshot full-size.
- **Export** — download as a self-contained HTML file, a Markdown file (with embedded images), or print/save as PDF.
- **Local-only storage** — everything is kept in the browser's extension storage; nothing is uploaded anywhere.

## Install (Developer Mode)

This works identically in **Google Chrome** and **Brave** since both are Chromium-based and support the same Manifest V3 extension APIs.

1. Open `chrome://extensions` (Chrome) or `brave://extensions` (Brave).
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this folder (`d:\projects\screencapture`).
4. Pin the **SnapGrab** icon to your toolbar for quick access.

## Usage

1. Click the SnapGrab icon → **Start Recording**.
2. Use the page as you normally would — click buttons/links, fill in forms, navigate between pages.
3. Click **Stop** (either from the popup or the on-page pill).
4. A **Guide Editor** tab opens automatically with all captured steps.
5. Edit titles/notes, reorder steps, delete any you don't want, then **Export HTML**, **Export Markdown**, or **Print / PDF**.

## Notes & limitations

- Screenshots capture the visible viewport of the tab (like most "share screenshot" APIs) — not the full scrollable page.
- Single-page-app route changes that don't trigger a full page load won't produce an automatic "Navigated to…" step; clicks within the app are still captured normally.
- Extension pages (`chrome://…`, the Chrome Web Store, etc.) can't be recorded — this is a browser restriction, not specific to this extension.
- No icons are bundled; Chrome/Brave will show a default placeholder icon in the toolbar. Add `icons/16.png`, `48.png`, `128.png` and reference them in `manifest.json` if you want custom branding.
