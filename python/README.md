# El PaviDFeliz Python Backend

This directory contains the Python processing backend for the El PaviDFeliz
desktop app. Milestone 1 is intentionally small: it establishes the backend
package layout, the NDJSON worker protocol, runtime path probes, dependency
guards, and coordinate mapping tests before any full conversion features are
implemented.

## Source Of Truth

- Primary spec: `../ilovepavidf_Spec_v0.2.docx`
- Agent rules: `../AGENTS.md`
- v0.2 constraints honored here:
  - PyInstaller `--onedir`, never `--onefile`
  - bundled Poppler path injection for every future `pdf2image` call
  - pinned `pypdf==4.3.1`
  - bundled `pycryptodome` / `Crypto` modules for AES
  - redaction flattening constant `FLATTEN_DPI = 200`
  - no Electron or React scaffold in this milestone

## Worker Protocol

The backend is designed to run as one persistent worker process. Electron will
send one JSON command per line over stdin and read one JSON event per line from
stdout.

Example command:

```json
{"id":"health-1","action":"health","params":{}}
```

Example response:

```json
{"id":"health-1","status":"ok","result":{"app":"El PaviDFeliz"}}
```

Run the worker manually from the repository root:

```bash
PYTHONPATH=python/src python3 -m pavidffeliz_backend
```

Create the reproducible local development environment:

```bash
python3.13 -m venv python/.venv
python/.venv/bin/python -m pip install -r python/requirements.txt
```

Run tests from the repository root:

```bash
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=python/src python/.venv/bin/python -B -m unittest discover -s python/tests
```

Milestone 2 implements operations that do not require Poppler: JPEG to PNG, PNG
to JPEG, images to PDF, PDF merge/split/reorder/delete, and AES-128 lock/unlock.

Milestone 3 adds the Poppler/pdf2image-dependent operation layer: PDF to JPEG,
PDF to PNG, single-page preview rendering, and flatten-to-image PDF. These
operations deliberately fail with `POPPLER_MISSING` until platform-specific
Poppler binaries are present under `python/vendor/poppler/<platform>/`; they do
not fall back to system `PATH`.
