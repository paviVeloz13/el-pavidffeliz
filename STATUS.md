# El PaviDFeliz — Development Status

**Version:** 0.1.0  
**Date:** 2026-06-10  
**Branch:** master

---

## Overview

El PaviDFeliz is an offline-first desktop application for PDF and image manipulation, built with Electron 35 + React 19 (frontend) and a Python 3.13 backend process (PyInstaller `--onedir` bundle). All processing runs locally — no cloud, no network.

---

## Architecture

| Layer | Technology |
|-------|-----------|
| Shell | Electron 35 |
| UI | React 19 + Vite 8 |
| IPC | `contextBridge` + `ipcMain.handle` / `ipcRenderer.invoke` |
| Backend | Python 3.13 worker via NDJSON stdin/stdout |
| PDF engine | pypdf 4.x + pdf2image (Poppler) + reportlab |
| Crypto | pycryptodome 3.20 |
| Bundling | PyInstaller 6.10 (`--onedir`) + electron-builder 25 |
| Platforms targeted | macOS arm64, macOS x64, Windows (NSIS) |

---

## Milestone Completion

| # | Milestone | Status | Commit |
|---|-----------|--------|--------|
| M1 | Project scaffold & Python worker protocol | ✅ Done | `2813081` |
| M2 | Health check + dependency detection | ✅ Done | `2813081` |
| M3 | Image operations (JPEG↔PNG, images→PDF) | ✅ Done | `2813081` |
| M4 | PDF → image export (JPEG/PNG) + PyInstaller smoke bundle | ✅ Done | `2813081` |
| M5 | Electron shell + IPC bridge (verified end-to-end) | ✅ Done | `ca9dee6` |
| M6 | React/Vite UI — Convert screen (end-to-end verified) | ✅ Done | `3667fa2` |
| M7 | Sortable file list for multi-image Convert | ✅ Done | `660354f` |
| M8 | Merge PDFs + Split PDF screens | ✅ Done | `970231c` |
| M9 | Lock / Unlock PDF | ✅ Done | `895e312` |
| M10 | Sign PDF (canvas, luminance cleanup, stamp overlay) | ✅ Done | `3667fa2` |
| M11 | Organize pages (thumbnail drag-to-reorder + delete) | ✅ Done | `ddca5a5` |
| M12 | Compress (PDF stream + JPEG/PNG quality reduction) | ✅ Done | `d947951` |
| M13 | Edit PDF (highlight, strikethrough, text box annotations) | ✅ Done | uncommitted |
| M14 | Redact PDF (draw-to-black boxes, flatten to image PDF) | ✅ Done | uncommitted |
| M15 | History screen (NDJSON log, relative timestamps, reveal in Finder) | ✅ Done | uncommitted |
| M16 | Settings screen (output folder, language picker, auto-persist) | ✅ Done | uncommitted |
| M17 | Production bundling (PyInstaller prod spec, build scripts, entitlements) | ✅ Done | uncommitted |

**All 17 milestones complete.**

---

## Screens

| Screen | Route key | Backend action(s) |
|--------|-----------|-------------------|
| Convert | `convert` | `pdf.to_jpeg`, `pdf.to_png`, `image.jpeg_to_png`, `image.png_to_jpeg`, `image.webp_to_png`, `image.webp_to_jpeg`, `image.images_to_pdf` |
| Merge | `merge` | `pdf.merge` |
| Split | `split` | `pdf.split_ranges`, `pdf.split_every_n`, `pdf.split_individual` |
| Compress | `compress` | `pdf.compress`, `image.compress` |
| Organize | `organize` | `pdf.render_preview`, `pdf.organize_pages` |
| Lock | `lock` | `pdf.lock` |
| Unlock | `unlock` | `pdf.unlock` |
| Edit | `edit` | `pdf.render_preview`, `pdf.apply_annotations` |
| Redact | `redact` | `pdf.render_preview`, `pdf.redact` |
| Sign | `sign` | `image.clean_signature`, `pdf.apply_signature` |
| History | `history` | IPC: `history:read`, `history:clear` |
| Settings | `settings` | IPC: `settings:read`, `settings:write` |

---

## Backend Operations (worker.py)

```
health
image.jpeg_to_png      image.png_to_jpeg      image.webp_to_png      image.webp_to_jpeg
image.images_to_pdf    image.compress
image.clean_signature
pdf.to_jpeg            pdf.to_png             pdf.render_preview     pdf.flatten_to_image_pdf
pdf.merge              pdf.split_ranges       pdf.split_every_n      pdf.split_individual
pdf.reorder            pdf.delete_pages
pdf.compress           pdf.organize_pages
pdf.lock               pdf.unlock
pdf.apply_signature
pdf.apply_annotations
pdf.redact
```

---

## i18n

Full string coverage in 4 languages: **English, Español, 日本語, 한국어**  
Default language: Español. User-selectable from Settings screen, persisted to `userData/settings.json`.

---

## Persistence

| Data | Location | Format |
|------|----------|--------|
| Settings (outputDir, lang) | `userData/settings.json` | JSON |
| History log | `userData/history.ndjson` | NDJSON (append-only) |

---

## Build

### Requirements

- Python 3.13 + `.venv` with all dependencies installed
- macOS arm64: Poppler vendor at `python/vendor/poppler/macos-arm64/`
- Font at `python/assets/fonts/DancingScript.ttf`
- Node.js + `npm install` in `electron/`

### Commands

```bash
# Full build (Python worker + macOS DMG)
./build.sh

# Skip Python rebuild (use existing dist/)
./build.sh --no-py

# Python worker only
cd python && .venv/bin/python scripts/build_worker.py

# Electron dev
cd electron && npm start
```

### Output

```
electron/dist-electron/
  El PaviDFeliz-0.1.0-arm64.dmg
  El PaviDFeliz-0.1.0.dmg          # x64
```

---

## Post-Milestone Cleanup (2026-06-10)

| Change | Files changed | Description |
|--------|--------------|-------------|
| Product rename | `electron/renderer-src/components/Sidebar.jsx`, `electron/renderer-src/App.jsx`, `electron/src/main.js`, `electron/package.json`, `python/pyproject.toml`, `python/src/pavidffeliz_backend/constants.py`, `python/pyinstaller/worker.spec`, `build.sh`, `STATUS.md`, `ilovepavidf_Spec_v0.2.docx` | Renamed product from `iLovePaviDF` to `El PaviDFeliz` across all source, config, build, and spec files. Python module renamed `ilovepavidf_backend` → `pavidffeliz_backend`; binary renamed `ilovepavidf-worker` → `pavidffeliz-worker`. Package name in `pyproject.toml` corrected to `pavidffeliz-backend`. Worker rebuilt. |
| Sidebar logo markup | `electron/renderer-src/components/Sidebar.jsx:27` | Updated hardcoded logo text from `<span>i</span>LovePavi<span>DF</span>` to `El <span>P</span>avi<span>DF</span>eliz` — accent color applied to **P** and **DF**. |
| Removed unused dependency | `electron/package.json` | Removed `react-beautiful-dnd` — declared but never imported; app uses native HTML5 drag-and-drop in `FileList.jsx`. |
| Removed dead component | `electron/renderer-src/screens/StubScreen.jsx`, `App.jsx:16` | Deleted `StubScreen.jsx` placeholder and its dead import from `App.jsx`. |
| Removed unused Python import | `python/src/pavidffeliz_backend/operations/pdf_overlay.py:7` | Removed `import tempfile` — imported but never referenced in the module. |

---

## Post-Milestone Fixes (2026-06-10)

Fixes applied after all 17 milestones completed, discovered during live testing.

| Fix | Files changed | Description |
|-----|--------------|-------------|
| Production startup crash | `electron/src/main.js` | `resolveWorkerBinary()` had an extra `'pavidffeliz-worker'` path segment. electron-builder flattens `extraResources` one level, so the binary lands at `python-worker/pavidffeliz-worker`, not `python-worker/pavidffeliz-worker/pavidffeliz-worker`. Removing the extra segment fixed the `spawn ENOTDIR` error on the installed DMG. |
| PDF→image join toggle removed | `electron/renderer-src/screens/Convert.jsx` | Stitching PDF pages into one tall image hit a 10,000 px height limit and gave users the wrong mental model. Removed join/separate toggle for `pdf_to_png` / `pdf_to_jpeg` entirely; pages always export as individual files. |
| DPI labels user-friendly | `electron/renderer-src/i18n/strings.js`, `Convert.jsx` | Replaced raw DPI numbers (72/150/300) with Small/Normal/Alta labels and descriptive hover hints in all 4 languages. |
| Per-page info note | `Convert.jsx`, `Convert.css`, `strings.js` | Added a subtle info line below the quality selector when a PDF→image tool is active ("Each page is exported as a separate image file.") in all 4 languages. |
| pdftoppm 60-second timeout | `python/src/pavidffeliz_backend/operations/pdf_render.py` | Added `timeout=60` to `convert_from_path(...)` in `_render_page`. Without this, if pdftoppm ever hangs (macOS TCC dialog, slow PDF, etc.) the UI would be stuck in "Converting…" indefinitely. Now surfaces a clear "Poppler timed out" error after 60 seconds. |
| Spec appendix updated | `ilovepavidf_Spec_v0.2.docx` | Added "Implementation Status — June 2026" table: flags 1–5 resolved, flag 6 open (Windows/x64 Poppler vendor), flag 7 deviation (annotations via reportlab, not pypdf AnnotationBuilder). |
| Test suite fixed | `python/pyproject.toml`, `python/tests/test_dependency_imports.py` | Added `pythonpath = ["tests"]` to pytest config (fixed `ModuleNotFoundError: helpers`); fixed hardcoded `Path("python/requirements.txt")` to use `Path(__file__).parent.parent`. Result: 59/59 tests pass. |

---

## Known Limitations / Not Yet Done

- **macOS x64 release build** is not self-contained yet — current x64 packaging from the Apple Silicon host embeds an arm64 Python worker and arm64 Pillow binaries, and `python/vendor/poppler/macos-x64/` is still effectively empty
- **Windows release build** still requires a Windows-native build/test pass — the Windows Poppler vendor tree is present, but the self-contained Windows worker and NSIS installer must be built and smoke-tested on Windows 10/11
- **No code signing** — DMGs are unsigned; macOS Gatekeeper will show an "unidentified developer" warning on first launch
- **Distribution metadata** for pdf2image, Pillow, pypdf not preserved by PyInstaller (cosmetic health check warnings only; functionality unaffected)
- **No auto-update** mechanism
- **No test suite** (unit or integration)
- **StubScreen** component still present in codebase (unused placeholder)

---

## Debugging Log

### 2026-06-10 — Multiple PDF→PNG conversion freeze

**Symptom:** Converting a single PDF to PNG worked. Selecting two PDFs and clicking Convert caused the UI to freeze in "Converting…" indefinitely with no error.

**Investigation steps:**

1. Confirmed the Python worker and Poppler binaries are correct — direct NDJSON test of the PyInstaller binary produced both outputs in under 2 seconds.
2. Confirmed both individual files converted successfully when loaded one at a time.
3. Sent two sequential `pdf.to_png` commands through a single pipe session to the worker — both converted correctly. Ruled out a Python worker bug.
4. Added `[worker:invoke] →/✓` logging to `ipcMain.handle('worker:invoke')` in `main.js` and restarted. The first conversion attempt after the restart produced 4 successful log lines (user had clicked Convert twice, 2 PDFs × 2 runs = 4).

**Root cause:** The freeze only reproduced with the **old worker binary** (before the rebuild). The rebuilt binary with `timeout=60` on `convert_from_path` resolved the hang. Best hypothesis: the first run after a fresh install caused macOS to show a TCC consent dialog for pdftoppm accessing the output directory (`~/Downloads/El PaviDFeliz/` by default). pdftoppm inherits the worker's stdin and blocks waiting for user approval; the dialog appeared behind the Electron window, so the user never saw it. After the user changed the output directory to `~/Documents` and the new binary was in use, all subsequent conversions succeeded immediately.

**Fix applied:** `timeout=60` in `_render_page` (`pdf_render.py`) converts any future pdftoppm hang into a clean "Poppler timed out" error within 60 seconds rather than an infinite freeze. Worker rebuilt and re-tested.
