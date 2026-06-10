# AGENTS.md

Guidance for coding agents working in this repository. This project is currently
spec-first; do not write application code, scaffold projects, install
dependencies, or create generated build output unless the user explicitly asks
for implementation work.

## Source Of Truth

- Primary specification: `ilovepavidf_Spec_v0.2.docx`.
- The v0.2 spec supersedes v0.1 and was updated from the June 9, 2026 viability
  and gap audit.
- If repo notes, mockups, or older docs conflict with the v0.2 spec, follow the
  v0.2 spec and call out the conflict before changing behavior.
- Preserve the v0.2 feature split and implementation flags. Do not silently
  reinterpret deferred features as v1 work.

## Immutable Stack Constraints

Use this stack. Do not propose or substitute alternatives unless the user asks
for a new spec version.

| Layer | Required technology |
| --- | --- |
| Shell | Electron, Node.js, Chromium |
| UI | React, `react-dropzone`, `react-beautiful-dnd` |
| IPC | Electron main process with `child_process.spawn()` |
| Backend | Python bundled through PyInstaller |
| PDF structure | `pypdf`, pinned to a tested minor version such as `pypdf==4.3.1` |
| PDF overlays | `reportlab` overlay PDF merged/stamped through `pypdf` |
| Image operations | Pillow |
| PDF to image | `pdf2image` plus bundled Poppler binaries |
| PDF encryption | `pypdf` plus bundled `pycryptodome` / `Crypto` modules |
| Signature font | Bundled Dancing Script TTF |
| Packaging | `electron-builder` for `.dmg` and Windows NSIS `.exe` |

Packaging constraints:

- Use PyInstaller `--onedir`, not `--onefile`.
- Bundle Poppler per platform and pass `poppler_path=get_poppler_path()` to all
  `pdf2image` calls.
- Build macOS Python bundles separately for arm64 and x64, then merge thin
  binaries or ship both inside Electron.
- Include Windows Poppler EXE/DLL dependencies explicitly in the Windows
  PyInstaller spec.
- Bundle Dancing Script as PyInstaller data and load it from the frozen app path.

## v1 Boundary

v1 is the offline desktop launch scope:

- PDF -> JPEG/PNG.
- JPEG <-> PNG.
- Images -> PDF, including a reorderable image list before conversion.
- Join/separate output toggle for multi-file or multi-output conversion jobs.
- Merge, split, reorder, delete, and compress PDFs.
- Compress JPEG and PNG.
- Sign PDF with a visual signature stamp.
- PDF annotations: text, highlight, sticky notes, and strikethrough.
- Insert image into PDF.
- Redact/censor and erase, with mandatory flattening for saved output.
- Lock/unlock PDFs.
- History.
- Language switcher for ES, EN, JP, and KO.

v1 editing model:

- Existing PDF text, fonts, and embedded images are not edited in place.
- Text, signatures, highlights, strikethroughs, inserted images, redaction
  blocks, and erase blocks use overlay/stamping workflows.
- Sticky notes use `pypdf` annotations so they remain interactive in normal edit
  output.
- Redact/erase output must flatten the document to an image-based PDF and remove
  interactive annotation data after warning the user when annotations exist.

## v2 Boundary

These are explicitly deferred. Do not pull them into v1:

- PDF -> Word.
- PDF -> PowerPoint.
- PDF -> Excel.
- Full PDF text/font editing.
- Cryptographic or certified e-signatures.
- Freehand drawing.
- True in-place redaction through PyMuPDF.

If a user request touches these features, identify it as v2 work before making
changes.

## Required Implementation Flags

Prototype or settle these early because mistakes here affect multiple features:

1. Signature canvas handoff: React HTML5 canvas -> PNG data URL -> Electron IPC
   -> Python/Pillow cleanup -> UI preview. Use luminance-based alpha mapping for
   cleanup, not a hard white threshold.
2. Page preview coordinate mapping: support display scaling, Y-axis flip,
   `/Rotate`, MediaBox origin, and CropBox vs MediaBox. Validate with a 4-corner
   matrix covering normal, rotated, non-zero-origin, and cropped pages.
3. Redaction data safety: redact and erase saves must flatten every page and
   rebuild a clean image-based PDF with `FLATTEN_DPI = 200`.
4. Poppler runtime path injection: no reliance on Homebrew, system Poppler, or
   system `PATH`.
5. `pypdf` version lock: do not upgrade without rerunning overlay, coordinate,
   annotation, and lock/unlock tests.
6. Windows Poppler binary set: include `pdftoppm.exe`, `pdftocairo.exe`, and DLLs
   from a trusted build; test on clean Windows 10 and Windows 11 VMs.
7. Sticky-note annotation pipeline: normal edit output preserves annotations;
   redact/erase output flattens and removes interactivity.

## Development Order

Follow the spec order unless the user explicitly changes the plan:

1. Python processing scripts.
   - Pin Python dependencies, including `pypdf` and `pycryptodome`.
   - Prototype Poppler path injection in a minimal frozen bundle.
   - Implement conversion, PDF structure operations, overlays, annotations,
     lock/unlock, flattening, coordinate mapping, and NDJSON command/results.
   - Add unit tests before wiring the UI.
2. PyInstaller bundle.
   - Use `--onedir`.
   - Include Poppler binaries, Dancing Script, and `Crypto` modules.
   - Test on a clean macOS machine with no Python and no Homebrew Poppler.
3. Electron shell and IPC.
   - Start one persistent Python worker at app launch.
   - Send JSON jobs over stdin and read NDJSON progress/results from stdout.
   - Surface human-readable errors and shut the worker down cleanly.
4. React UI on macOS.
   - Prototype coordinate mapping and signature canvas before building edit/sign
     screens.
   - Use CSS custom properties plus rem/em units from day one for text scaling.
   - Build the core flows, history, settings, lazy previews, and virtualized page
     grids.
5. Windows port.
   - Procure and bundle trusted Windows Poppler binaries.
   - Build and test a Windows PyInstaller `--onedir` bundle.
   - Verify install, launch, conversion, lock/unlock, previews, and redaction on
     clean Windows 10 and Windows 11 VMs.
6. Polish and release prep.
   - Run accessibility, edge-case, packaging, signing, and release-pipeline work.
   - Use Apple Developer ID signing for macOS and EV Authenticode for Windows.

## Testing Expectations

Add focused tests as each layer is built. At minimum, cover:

- Clean-machine bundle tests with no system Python and no system/Homebrew Poppler.
- `pdf2image` calls using bundled Poppler paths.
- PDF -> image DPI options and large-file handling.
- JPEG <-> PNG conversion, compression, and images -> PDF ordering.
- `pypdf` merge, split, reorder, delete, compress, lock, and unlock.
- AES lock/unlock with `pycryptodome` present in the frozen bundle.
- Overlay smoke tests for text, highlight, strikethrough, image insert,
  signatures, redaction blocks, and erase blocks.
- Coordinate accuracy for normal, rotated, non-zero-MediaBox-origin, and
  CropBox-different-from-MediaBox PDFs.
- Redact/erase flattening at `FLATTEN_DPI = 200`, including confirmation that
  underlying text and annotations are not recoverable in output.
- Sticky-note visibility in macOS Preview and Adobe Acrobat.
- Lazy preview generation, 72 DPI organize thumbnails, and virtualized page grids
  for large PDFs.
- Accessibility: keyboard navigation, screen-reader labels, WCAG AA contrast,
  48 x 48 px click targets, and root text scaling.
- Installer smoke tests for macOS and Windows.

## UI And UX Rules

- Design for older adults and non-technical users.
- Keep primary flows single-column and completable in three clicks or fewer.
- Use minimum 16 px body text and 20 px or larger labels/buttons.
- Use 48 x 48 px minimum click/tap targets, even where static mockups show
  smaller controls.
- Do not use icon-only controls; every icon needs a visible text label.
- Show success or error feedback within 300 ms.
- Confirm destructive actions.
- Keep the join/separate toggle directly below format selection and before the
  output folder row.
- For Images -> PDF reorder UI, reuse the Merge PDFs sortable-list pattern:
  drag handle, filename, file size, thumbnail when available, and trash icon.
- Use lazy/on-demand previews and virtualization for edit, sign, and organize
  page views.

## Do-Not Rules

- Do not write application code until the user asks for implementation.
- Do not change the immutable stack to avoid a risk; add a caveat, flag, or test.
- Do not add v2 features to v1.
- Do not use PyInstaller `--onefile`.
- Do not rely on system Python, Homebrew Poppler, or user-installed dependencies.
- Do not leave Poppler path resolution to ambient `PATH`.
- Do not update `pypdf` casually.
- Do not implement cryptographic/certified signatures in v1.
- Do not claim redaction is safe unless output is flattened to an image-based PDF.
- Do not preserve interactive annotations in redact/erase output.
- Do not build edit/sign screens before coordinate mapping and signature
  prototypes pass.
- Do not use small, icon-only, hidden-menu, or nested-dropdown controls for core
  workflows.
- Do not overwrite source files or generated outputs unrelated to the requested
  task.
