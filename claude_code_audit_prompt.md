# iLovePaviDF — Viability & Gap Audit

## Your role
You are a senior software architect doing a **pre-development viability audit**.
Do NOT generate application code. Do NOT scaffold files. Do NOT suggest rewrites.
Your only job is to read the attached documents, identify gaps, contradictions, and
risks between what the spec describes and what is actually achievable with the chosen
stack, and produce a structured findings report.

---

## Reference files — read these first, in this order

1. `ilovepavidf_Spec_v0.1.docx` — full application specification
2. `iloveavidf_ui_v1_final.html` — latest interactive UI mockup (open in browser or read source)
3. `file_converter_app_architecture.svg` — architecture diagram
4. `claude_code_audit_prompt.md`
5. `audit_report.md`
6. `SPEC_V02_PROJECT_INSTRUCTIONS.md`

---

## Stack context (do not change this — it is fixed)

- **Shell:** Electron (Node.js + Chromium)
- **UI:** React (inside Electron renderer process)
- **Backend:** Python, bundled via PyInstaller — no system Python required on user machine
- **PDF structure ops:** pypdf
- **PDF overlay / annotations:** reportlab + pypdf merge_page()
- **Image conversion:** Pillow
- **PDF → image (previews + conversion):** pdf2image (requires Poppler binaries bundled)
- **Packaging:** electron-builder → .dmg (macOS arm64 + x64 universal) and .exe/NSIS (Windows)
- **Primary test platform:** macOS first, Windows after
- **Target users:** Spanish-speaking, all ages, emphasis on older adults — offline, no subscription

---

## Audit scope — assess each of the following areas

### 1. PyInstaller bundling feasibility
- Which Python libraries in the spec (pypdf, reportlab, pdf2image, Pillow, Poppler binaries,
  Dancing Script TTF font) are known to have PyInstaller packaging issues?
- Are there any hidden system-level binary dependencies (e.g. Poppler, libffi, Cairo)
  that PyInstaller will NOT bundle automatically and require manual spec file configuration?
- Will the bundle work correctly on macOS arm64 AND x64 from a single build, or does
  each architecture require a separate PyInstaller run?
- Flag any library that is known to fail silently inside a PyInstaller bundle.

### 2. Electron ↔ Python IPC design
- The spec describes spawning the PyInstaller binary as a child process via Node.js
  `child_process.spawn()` and communicating via JSON over stdout.
- Assess: is this pattern reliable for long-running jobs (e.g. compressing a 200-page PDF)?
  What are the stdout buffer limits and how should streaming progress be handled?
- Are there any macOS Gatekeeper / App Sandbox restrictions that would prevent Electron
  from spawning a bundled binary as a child process?
- Flag any timing or startup latency issues with this approach (cold start of Python process
  per job vs. persistent process).

### 3. PDF overlay pipeline (reportlab + pypdf)
- The spec uses reportlab to draw a transparent overlay page, then pypdf.merge_page()
  to stamp it onto the original. Assess: is merge_page() the correct pypdf API for this,
  or has it been renamed/deprecated in recent pypdf versions (v3+)?
- Are there known rendering issues with this overlay approach on PDFs that use non-standard
  page sizes, rotated pages, or encrypted PDFs?
- The redaction and erase features mandate a flatten-to-image step after overlaying.
  Assess the pipeline: reportlab overlay → pypdf merge → pdf2image rasterize → Pillow →
  new PDF. Are there any steps where page dimensions, DPI, or color profile could degrade?

### 4. Coordinate mapping (UI → PDF)
- The spec describes: pdf_x = ui_x / scale, pdf_y = page_height_pts − (ui_y / scale).
  Assess: does this formula correctly account for all edge cases — rotated pages (90°/270°),
  pages with a non-zero MediaBox origin (some PDFs use a non-0,0 origin), and pages
  where CropBox differs from MediaBox?
- What is the correct pypdf or pdf2image API to retrieve the actual rendered page dimensions
  in points before computing the scale factor?

### 5. Page preview generation
- The spec uses pdf2image at 150 DPI to generate per-page JPEG previews cached in a temp folder.
- Assess: for a 50-page PDF, what is the approximate generation time and disk space on a
  typical macOS machine? Is lazy (on-demand per page) or eager (all pages upfront) generation
  more appropriate for the edit/sign/organize screens?
- Are there memory implications from holding 50 150-DPI JPEG images in Electron's renderer
  process simultaneously?

### 6. Signature canvas → PNG handoff
- The spec describes: HTML5 canvas → PNG data URL → Electron IPC → temp file → Python
  Pillow background removal → cleaned PNG back to UI.
- Assess: is there a practical file size / memory limit on the canvas data URL for IPC transfer?
- Pillow's background removal by thresholding white pixels is noted. Assess: will this work
  reliably for signatures drawn in black on a white canvas, and what happens with grey
  anti-aliased edges?

### 7. Lock / Unlock PDF
- The spec uses pypdf's encrypt() for locking. Assess: does pypdf v3+ support AES-128
  encryption natively, or does it require pycryptodome as an additional dependency?
  If so, flag the additional PyInstaller bundling requirement.

### 8. UI ↔ spec consistency
- Read the UI mockup HTML files and the spec side by side.
- List any features present in the spec that have no corresponding screen or control in
  the UI mockup.
- List any screens or controls visible in the UI that are not described or are ambiguous
  in the spec.
- Pay particular attention to: the join/separate output toggle, the erase vs. redact
  dual-mode screen, the coordinate-aware edit/sign placement flow, and the images→PDF
  conversion path.

### 9. Accessibility vs. implementation
- The spec mandates: minimum 48×48px click targets, WCAG AA contrast, every icon
  accompanied by a text label, text size setting (Normal / Grande / Muy grande).
- Assess: is the text size setting feasible to implement globally in an Electron/React app
  without rebuilding layout (i.e. CSS custom properties approach), or does it require
  component-level changes throughout?

### 10. Windows parity risks
- Given the macOS-first approach, flag any features whose implementation will be
  meaningfully different or harder on Windows:
  - Poppler binary bundling (different binary set for Windows)
  - "Show in Finder" equivalent via Electron shell.showItemInFolder() — is this cross-platform?
  - PyInstaller one-file vs one-folder mode on Windows (antivirus false positive risk)
  - Code-signing requirement for Windows SmartScreen

---

## Output format

Produce a structured report with the following sections:

### ✅ Confirmed viable — no changes needed
List spec decisions that are straightforward and low-risk with the chosen stack.

### ⚠️ Viable with caveats — spec needs a note or small adjustment
For each item: state the issue, the specific adjustment needed, and the effort level (low/medium).

### 🔴 Gaps or contradictions — spec and reality do not align
For each item: state the gap clearly, explain why it is a problem, and suggest the
minimum change to the spec to resolve it. Do not suggest changing the stack.

### 🚩 Implementation flags to add to the spec
Any new flags (beyond the three already documented in section 3.5 of the spec) that
should be added before development begins.

### 📋 Summary table
A single table: Feature | Viability | Risk level | Action required

---

## Constraints
- Do not generate any application source code.
- Do not suggest alternative stacks or libraries unless a spec'd library is genuinely
  broken or unavailable.
- If you are uncertain about a specific library version behavior, say so explicitly
  rather than assuming.
- Reference specific section numbers from the spec (e.g. "Section 3.3", "Flag 2")
  when flagging issues.
