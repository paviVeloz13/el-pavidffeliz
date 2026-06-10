# iLovePaviDF — Viability & Gap Audit Report (Revised)

**Reference UI:** `iloveavidf_ui_v1_final.html`  
**Auditor:** Senior Software Architect review  
**Date:** 2026-06-09

---

## ✅ Confirmed viable — no changes needed

| Item | Rationale |
|---|---|
| **pypdf for merge / split / reorder / delete** | Pure Python, no native deps, bundles cleanly with PyInstaller |
| **Pillow for JPEG ↔ PNG conversion** | Pure Python C-ext, straightforward PyInstaller support |
| **Pillow join pipeline** (`img.save(pdf, save_all=True, append_images=[...])`) | Well-tested Pillow API, no edge cases for this use |
| **JSON-over-stdout IPC via `child_process.spawn()`** | `spawn()` is the correct Node API; stdout is a Node stream with no inherent buffer ceiling — reliable for long-running jobs provided Python writes newline-delimited JSON (NDJSON) |
| **`electron.shell.showItemInFolder()`** | Explicitly cross-platform in Electron — calls Finder on macOS, Explorer on Windows; no Windows parity risk |
| **electron-builder NSIS installer (no admin rights)** | Standard pattern, well-supported |
| **Censurar screen (Redact + Erase dual-mode with tabs)** | v1 UI has the full screen: Redactar/Borrar tab selector, preview area, warning banner, options panel — matches spec Section 3.3 and Flag 3 |
| **Join/Separate output toggle in Convertir** | v1 UI has the two-button toggle between "Archivos separados" and "Unir en uno solo" — matches spec Section 3.1.1 |
| **Imágenes → PDF conversion option** | v1 UI includes it in the 5-button conversion grid, selected by default in the mockup images-detected state |
| **Sidebar navigation + language switcher (ES/EN/JP/KO)** | Standard React state; no architectural complexity |
| **History screen** (log, filter, delete) | Local JSON file + React state; no risks |
| **Settings screen** (default folder, history retention, text size, language) | `electron-store` pattern; well-trodden |
| **Pillow for signature background removal (basic)** | Feasible — see caveat on anti-aliasing below |
| **Lock/Unlock PDF screens** | v1 UI has both screens with password fields and info banners; matches spec Section 3.2 |
| **Compress screen with estimated savings banner** | v1 UI shows the reduction estimate — matches spec Section 3.2 |

---

## ⚠️ Viable with caveats — spec needs a note or small adjustment

### C1 — pdf2image + Poppler: manual PyInstaller spec required

**Issue:** pdf2image wraps native Poppler binaries (`pdftoppm`, `pdftocairo`, and their linked `.dylib` deps on macOS). PyInstaller does NOT auto-detect native binaries — they must be listed manually in the `.spec` file's `binaries` array. In a frozen app the system `PATH` does not include Homebrew paths, so pdf2image must be called with the explicit `poppler_path=` keyword argument at all call sites.

**Adjustment needed (Section 5, Step 2):** Add: "pdf2image requires explicit path injection at runtime: use the `poppler_path=` kwarg pointing to `sys._MEIPASS/poppler/bin`. All Poppler binaries and their dylib dependencies must be listed in the PyInstaller `.spec` file under `binaries`."

**Effort: Low.**

---

### C2 — PyInstaller `--onedir` vs `--onefile` must be explicit

**Issue:** `--onefile` unpacks to a temp directory on every launch — cold-start latency of 1–5 seconds, and on Windows it reliably triggers antivirus false positives (temp-dir extraction is a classic malware signature). `--onedir` starts in ~100–500 ms with no AV risk.

**Adjustment needed (Section 5, Step 2):** Mandate `--onedir` mode for both macOS and Windows. Note that the bundled folder must reside at a stable path inside the Electron app bundle.

**Effort: Low.**

---

### C3 — Cold start: per-job Python spawn vs. persistent process

**Issue:** The spec and architecture diagram don't specify whether the PyInstaller binary is spawned once at app startup (persistent) or once per job. Per-job spawning adds ~200–500 ms cold-start overhead per operation (with `--onedir`). For a 200-page PDF compression the total time is dominated by the conversion, but for fast operations like splitting or locking a small PDF the cold start is the dominant latency.

**Adjustment needed (Section 3, Architecture table + Section 5, Step 3):** Add: "The Python process must be spawned once at app startup and kept alive as a persistent worker, receiving job requests over stdin and streaming JSON responses over stdout. Do not spawn a new process per job."

**Effort: Low — protocol design decision, not a rewrite.**

---

### C4 — Page preview generation: lazy loading and memory

**Issue:** A 50-page PDF at 150 DPI produces pages of ~1275 × 1650 px each. As JPEGs: ~200–400 KB per page on disk, ~15 MB total. Generation time via pdftoppm: ~0.5–2 seconds per page → 25–100 seconds total if generated upfront. Holding all 50 decoded images in the Electron renderer simultaneously occupies ~420 MB of decoded image memory (50 × 1275 × 1650 × 4 bytes). The spec states "per-page JPEG previews cached in a temp folder" without specifying a lazy loading strategy.

**Adjustment needed (Section 3.5, Flag 2 + Section 5, Step 4):** Add: "Page previews must be generated lazily (on-demand as the user navigates to each page), not all upfront. The React page grid must use a virtualized list (`react-window`) so only pages near the viewport are decoded in memory. For the Organizar thumbnails, use 72 DPI instead of 150 DPI — sufficient for selection, 4× smaller files, 4× faster generation."

**Effort: Medium.**

---

### C5 — reportlab + Dancing Script TTF: explicit `datas` entry required

**Issue:** reportlab does not auto-discover TTF fonts from arbitrary filesystem paths in a frozen app. `DancingScript.ttf` must be listed in the PyInstaller `.spec` under `datas`. Its runtime path must be constructed using `sys._MEIPASS` when frozen.

**Adjustment needed (Section 5, Step 2):** Add: "Bundle `DancingScript.ttf` as a `datas` entry in the spec file. In Python, load via `os.path.join(sys._MEIPASS, 'DancingScript.ttf')` when frozen, fallback to a relative dev path otherwise."

**Effort: Low.**

---

### C6 — Signature background removal: anti-aliased edge quality

**Issue:** HTML5 canvas uses sub-pixel anti-aliasing. A binary white-pixel threshold (R>200 AND G>200 AND B>200 → transparent) will either leave grey haloes visible against non-white backgrounds, or clip stroke edges producing a jagged result. This is particularly visible on curved signature strokes.

**Adjustment needed (Section 3.4 + Section 3.5, Flag 1):** Add: "Background removal must use luminance-based alpha mapping: `alpha = 255 − luminance` (where `luminance ≈ 0.299R + 0.587G + 0.114B`). This makes grey anti-alias pixels semi-transparent rather than binary cut, preserving smooth stroke edges. A hard threshold alone is not acceptable."

**Effort: Low — 5 lines of Pillow code, but critical to perceived quality.**

---

### C7 — Text size setting: CSS custom properties approach works only if relative units are used from day one

**Issue:** A global CSS custom property approach (`--base-font-size` on `:root`, all text using `rem`/`em`/`calc()`) is feasible in Electron/React with no component-level restructuring — IF the codebase is built with relative units from the start. The v1 UI mockup uses exclusively hardcoded `px` values throughout (`font-size:13px`, `font-size:11px`, `padding:10px 6px`, etc.). If these are ported verbatim into React components, retrofitting the text-size system later requires touching every component.

**Adjustment needed (Section 4 + Section 5, Step 4):** Add: "All font sizes and spacing values must use CSS custom properties or `rem`/`em` from day one. Do not use hardcoded `px` values for text or interactive element sizing. The Ajustes text-size selector must apply a root-level CSS variable (`--scale`) via `document.documentElement.style.setProperty()` at startup and on change."

**Effort: Low if done from the start; Medium if retrofitted.**

---

### C8 — Windows SmartScreen: EV certificate required for target audience

**Issue:** The spec mentions Authenticode signing (Step 6) but doesn't distinguish EV from standard OV certificates. Standard OV Authenticode reduces but does not eliminate SmartScreen warnings for new publishers — the "Windows protected your PC" dialog appears until the binary accumulates reputation (can take months). For older-adult, non-technical users, this warning will cause significant install abandonment.

**Adjustment needed (Section 5, Step 6):** Add: "Windows signing must use an EV (Extended Validation) certificate — not a standard OV certificate. EV certificates suppress SmartScreen immediately without reputation accumulation. Budget ~$300–500/year for the EV certificate before Windows launch."

**Effort: Low — procurement decision, not development.**

---

## 🔴 Gaps or contradictions — spec and reality do not align

### G1 — `pycryptodome` undeclared dependency for AES-128 encryption

**Gap:** The spec (Section 3.2) and the v1 UI ("Cifrado AES de 128 bits") both require AES-128 encryption via pypdf. In pypdf 3.0+, AES encryption requires `pycryptodome` as an additional package. Without it, only RC4 (cryptographically broken) encryption is available — calling `writer.encrypt(..., algorithm='AES-128-CBC')` raises a `DependencyError` at runtime.

**Why it's a problem:** The app will silently produce RC4-encrypted PDFs (or crash) in the PyInstaller bundle if `pycryptodome` C extensions are not explicitly collected. This will pass all development-machine tests, then fail on a clean user machine.

**Minimum spec change:** Add `pycryptodome` to the stack table (Section 2.1). Add to Section 5, Step 2: "PyInstaller requires `--collect-all Crypto` (or `--hidden-import Crypto.Cipher.AES`) to bundle pycryptodome C extensions. Verify the bundled binary produces AES-encrypted output on a clean machine before shipping."

---

### G2 — `merge_page()` API status in pypdf 3.x / 4.x requires version pinning

**Gap:** The spec (Sections 2.1 and 3.3) references `pypdf.merge_page()`. In pypdf 4.x (released 2024), `merge_page()` was deprecated in favor of `merge_transformed_page()` and raises a `DeprecationWarning`. Behavior around dimension matching and transformation also shifted between pypdf 3.x and 4.x. The spec uses the older API name without pinning a pypdf version.

**Why it's a problem:** The entire overlay pipeline — annotations, signatures, and redaction — depends on stable `merge_page()` behavior. A future `pip install pypdf` could pull a version where this method is removed or behaves differently, silently breaking all edit/sign/redact features.

**Minimum spec change (Section 2.1 + Section 5, Step 1):** Pin pypdf to a tested minor version (e.g., `pypdf==4.3.1`). Add: "Before using `merge_page()`, verify it exists on the pinned version. If using pypdf 4.x, prefer `page.merge_transformed_page(overlay_page, pypdf.Transformation())`. Do not update pypdf without re-running the full 4-corner coordinate validation test and the Lock/Unlock smoke test."

---

### G3 — macOS arm64 + x64 universal binary: requires two separate PyInstaller runs

**Gap:** The architecture diagram and spec state "arm64 + x64 universal" for macOS. electron-builder can produce a universal Electron app in a single run. However, **PyInstaller cannot produce a universal (fat) Python binary in a single run.** PyInstaller bundles C extensions for the architecture of the machine it runs on. Getting both architectures requires:

1. Run PyInstaller on an arm64 Mac → arm64 bundle
2. Run PyInstaller on an x64 Mac (or under Rosetta with the x86_64 Python interpreter) → x64 bundle
3. Use `lipo` to merge thin binaries, or ship two separate Python bundles inside the Electron `.app`

**Why it's a problem:** The spec implies this is handled by electron-builder. A single-machine PyInstaller run will produce a bundle that runs under Rosetta on Apple Silicon or crashes on x64, depending on the build machine. This affects the CI/CD pipeline design significantly.

**Minimum spec change (Section 5, Step 2):** Replace "Build macOS x64 version and create a universal binary" with: "PyInstaller must be run separately on arm64 and x64 host machines. The two `dist/` directories are merged using a `lipo`-based script for thin binaries, or the electron-builder config ships both bundles. Do not assume a single PyInstaller run produces a universal binary."

---

### G4 — Coordinate mapping ignores rotated pages and non-zero MediaBox origin

**Gap:** The spec's coordinate formula (Section 3.5, Flag 2): `pdf_x = ui_x / scale`, `pdf_y = page_height_pts − (ui_y / scale)` assumes: the MediaBox origin is (0, 0), the page has `/Rotate` = 0, and the rendered image corresponds to the MediaBox. All three assumptions can be false:

- **Rotated pages (`/Rotate: 90` or `270`):** pdf2image renders the visual (post-rotation) orientation. Python's formula operates on the unrotated coordinate system. Overlays will be in the wrong position or on the wrong axis entirely.
- **Non-zero MediaBox origin:** Some PDFs (especially those cropped from larger sheets) have a MediaBox like `[100 200 700 900]`. The formula ignores the origin offset — overlays will be shifted by the inset amount.
- **CropBox ≠ MediaBox:** pdf2image renders the CropBox region (the visible area). If CropBox is `[50 50 562 742]` and MediaBox is `[0 0 612 792]`, coordinates derived from the image will be offset by the CropBox inset — wrong in all edit/sign/redact operations.

**Why it's a problem:** These cases are common in real-world PDFs (scanned documents from multifunction printers frequently use non-zero origins; many scans are stored rotated). All edit, sign, and redact features share this formula — positional errors will appear as bugs on a significant fraction of user documents.

**Minimum spec change (Section 3.5, Flag 2):** Extend the coordinate formula: "Before computing coordinates, Python must read: (a) `/Rotate` — if 90 or 270, swap x/y roles and adjust the origin accordingly; (b) MediaBox origin — subtract `mediabox.left` from `pdf_x` and `mediabox.bottom` from the translated Y value; (c) use CropBox dimensions (not MediaBox) as the reference rectangle when a CropBox is present, since pdf2image renders the CropBox region. These three cases must be added to the 4-corner validation test matrix."

---

### G5 — Redaction flatten DPI not specified; 150 DPI produces poor saved-document quality

**Gap:** Section 3.5, Flag 3 mandates a flatten-to-image pipeline for redacted documents. The spec gives 150 DPI as the preview DPI but does not specify the DPI for the flatten step used when actually saving the final redacted document.

**Why it's a problem:** 150 DPI produces noticeably blurry body text in a printed or zoomed document (standard A4 at 150 DPI = 1240 × 1754 px). For a redacted legal or financial document, this is a quality defect. Conversely, 300 DPI produces ~4× larger files (~50–100 MB for a 20-page PDF vs 5–10 MB at 150 DPI). The spec should be explicit.

**Minimum spec change (Section 3.5, Flag 3):** Add: "The flatten pipeline for saving redacted documents must use 200 DPI (separate from the 150 DPI used for previews). This balances text legibility with file size. Define this as an internal constant `FLATTEN_DPI = 200` so it can be adjusted without hunting through call sites."

---

### G6 — Images→PDF drag-to-reorder list not shown in v1 Convertir screen mockup

**Gap:** The spec (Section 3.1) states: "Reorder images before converting via drag-and-drop list." The v1 Convertir screen shows a detected-files banner and the format/toggle selectors, but no drag-to-reorder list for the dropped image files. The developer has no visual reference for this interaction surface.

**Why it's a problem:** The drag-to-reorder image list is a non-trivial UI component (needs `react-beautiful-dnd`, thumbnails or filenames, add/remove controls). Without a mockup, the developer will design it independently — risking inconsistency with the rest of the UI's design language and potentially underestimating the implementation scope.

**Minimum spec change (Section 3.1, Images→PDF paragraph):** Add: "The v1 UI mockup does not include the image reorder list state. The design for this state should follow the Combinar PDFs screen pattern: a sortable list with `ti-grip-vertical` drag handles, filename, file size, and a trash icon — consistent with the existing drag-list component used in Combinar."

---

## 🚩 Implementation flags to add to the spec

*(In addition to existing Flags 1, 2, 3 in Section 3.5)*

### Flag 4 — Poppler runtime path injection (macOS + Windows): prototype before any pdf2image call

pdf2image locates Poppler binaries via system `PATH` by default. In a PyInstaller `--onedir` bundle, system `PATH` is unavailable. Bundled Poppler binaries reside at `sys._MEIPASS/poppler/bin/`. pdf2image must always be called with `poppler_path=get_poppler_path()` where `get_poppler_path()` returns `sys._MEIPASS/poppler/bin` when frozen. This path differs between macOS (Mach-O `.dylib`-linked binaries) and Windows (`.exe` + `.dll` files — a completely different binary set from `poppler-windows` releases).

**Required before any pdf2image code:** Build a minimal PyInstaller `--onedir` bundle that calls `pdf2image.convert_from_path(..., poppler_path=get_poppler_path())`. Confirm it works on a clean macOS machine with no Homebrew installed. Repeat on Windows before starting the Windows port phase.

---

### Flag 5 — pypdf version lock: pin to a tested version before any overlay work

The `merge_page()` API, the AES encryption interface, and page-dimension utilities all changed across pypdf 2.x, 3.x, and 4.x. The entire overlay pipeline (Section 3.3), signature placement (Section 3.4), and coordinate mapping (Section 3.5, Flag 2) depend on stable pypdf behavior.

**Required:** Pin `pypdf` to a specific minor version in `requirements.txt` (e.g., `pypdf==4.3.1`) before writing any overlay code. Document the tested version in the spec. Do not update pypdf without re-running the full 4-corner coordinate validation test and the Lock/Unlock smoke test.

---

### Flag 6 — Windows Poppler binary set: separate procurement and packaging task

Windows requires a completely different Poppler binary set from macOS — native Windows builds (`.exe` files: `pdftoppm.exe`, `pdftocairo.exe`, plus ~15–20 `.dll` dependencies). These must be sourced from a trusted build (e.g., `oschwartz10612/poppler-windows`), tested on clean Windows 10 and Windows 11 VMs, and added to a separate Windows `.spec` file. This is not a minor config change.

**Required (Section 5, Step 5):** Add: "Before beginning the Windows port, procure and test the Windows Poppler binary set. Add all binaries and DLL dependencies to the Windows `.spec` file. Estimate one full day for this task alone."

---

### Flag 7 — Sticky note / annotation API split: resolve before building Edit screen

The spec (Section 3.3) describes sticky notes as using "pypdf's annotation API" (`AnnotationBuilder`) — a different pipeline from the reportlab overlay used by all other edit tools (text, highlight, strikethrough, image, redact, erase). This creates a split implementation invisible in the UI:

- pypdf annotations are vector objects in the PDF — they survive as interactive annotations in Preview, Acrobat, etc.
- reportlab overlays are baked into the page content stream — not interactive annotations
- If both types are applied to the same page, order of operations and the flatten pipeline (used for redaction) interact non-trivially. pypdf annotations on a page that was then flattened to image will be destroyed unless handled explicitly.

**Required before building the Edit screen:** Decide whether sticky notes are vector annotations (pypdf) or baked overlays (reportlab filled rectangle + text). Document the decision and the pipeline order. If vector annotations are chosen, add a step to the redact flatten pipeline that handles pages with existing annotations.

---

## 📋 Summary table

| Feature | Viability | Risk Level | Action Required |
|---|---|---|---|
| **Electron + React shell** | ✅ Viable | Low | None |
| **PyInstaller bundling (general, `--onedir`)** | ⚠️ Caveat | Medium | Mandate `--onedir`; add to spec (C2) |
| **PyInstaller + Poppler binaries (macOS)** | ⚠️ Caveat | High | Manual spec config + runtime path injection (C1, Flag 4) |
| **PyInstaller + reportlab + Dancing Script TTF** | ⚠️ Caveat | Low | Explicit `datas` entry (C5) |
| **PyInstaller + pycryptodome (AES-128)** | 🔴 Gap | High | Add `pycryptodome` to dependency list; bundle with `--collect-all Crypto` (G1) |
| **macOS arm64 + x64 universal binary** | 🔴 Gap | High | Two separate PyInstaller runs required; spec currently incorrect (G3) |
| **Electron ↔ Python stdout IPC (`spawn`)** | ✅ Viable | Low | Use persistent process model, not per-job spawn (C3) |
| **macOS Gatekeeper / App Sandbox** | ✅ Viable | Low | `.dmg` distribution does not require App Sandbox |
| **pypdf `merge_page()` overlay pipeline** | ⚠️ Caveat | Medium | Version-pin pypdf; verify API on pinned version (G2, Flag 5) |
| **Coordinate mapping formula (Flag 2)** | 🔴 Gap | High | Formula ignores rotation, non-zero MediaBox origin, CropBox (G4) |
| **reportlab overlay on encrypted PDFs** | ⚠️ Caveat | Medium | Must decrypt before merge; add note to spec |
| **Redaction flatten pipeline** | ✅ Viable | Low | Pipeline is correct; set `FLATTEN_DPI = 200` (G5) |
| **Flatten DPI for saved redacted docs** | 🔴 Gap | Medium | Not specified in spec; add `FLATTEN_DPI = 200` constant (G5) |
| **Page preview generation (50 pages)** | ⚠️ Caveat | Medium | Lazy loading + `react-window` required; 72 DPI for thumbnails (C4) |
| **Signature canvas → PNG → Pillow handoff** | ✅ Viable | Low | No IPC size concern |
| **Signature background removal (anti-aliasing)** | ⚠️ Caveat | Low | Use luminance-based alpha, not hard threshold (C6) |
| **pypdf AES-128 Lock/Unlock** | 🔴 Gap | High | `pycryptodome` undeclared; must bundle (G1) |
| **Censurar screen (Redact + Erase dual-mode)** | ✅ Viable | Low | Full design present in v1 UI — matches spec |
| **Join/Separate output toggle in Convertir** | ✅ Viable | Low | Present in v1 UI — matches spec |
| **Imágenes → PDF conversion option** | ✅ Viable | Low | Present in v1 UI — matches spec |
| **Images → PDF drag-to-reorder list** | 🔴 Gap | Medium | No mockup state shown; follow Combinar screen pattern (G6) |
| **Edit / Sign page canvas (coordinate-based placement)** | ⚠️ Caveat | High | Not shown in static mockup (expected); prototype per Flag 2 before any screen work |
| **Sticky note annotation API split** | ⚠️ Caveat | Medium | Resolve pypdf vs reportlab path before building Edit screen (Flag 7) |
| **Text size setting (CSS custom properties)** | ⚠️ Caveat | Medium | Requires relative units from day one (C7) |
| **48×48px click targets** | ⚠️ Caveat | Low | `.pg-del` delete button is 17×17px in v1 mockup — must be enlarged in implementation |
| **Windows Poppler binary set** | 🔴 Gap | High | Separate procurement step; entirely different binaries from macOS (Flag 6) |
| **Windows SmartScreen** | ⚠️ Caveat | Medium | EV certificate required for target demographic (C8) |
| **PyInstaller `--onefile` AV false positives (Win)** | ⚠️ Caveat | Medium | Use `--onedir` on Windows (C2) |
| **`shell.showItemInFolder()`** | ✅ Viable | Low | Cross-platform in Electron — no change needed |
| **electron-builder cross-platform packaging** | ✅ Viable | Low | Standard config, well-documented |

---

## Critical path before writing any application code

1. **G3** — Establish two PyInstaller build machines (arm64 + x64) and design the CI/CD merge strategy before any other build work
2. **G1** — Add `pycryptodome` to `requirements.txt` and confirm PyInstaller collects it correctly on a clean machine
3. **Flag 4** — Prototype Poppler path injection in a minimal frozen bundle on a clean macOS machine before any pdf2image code
4. **Flag 5** — Pin pypdf version and validate `merge_page()` (or its replacement) against that version before any overlay code
5. **G4** — Extend the coordinate mapping formula for rotation, non-zero MediaBox origin, and CropBox before building any edit, sign, or redact screen
6. **Flag 2 prototype** — Complete the 4-corner placement validation test before building any screen that depends on coordinates

---

*iLovePaviDF · Audit Report v1.1 · Reference UI: iloveavidf_ui_v1_final.html · Confidential*
