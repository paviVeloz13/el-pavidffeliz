# Windows Handoff

Use the Windows machine for the Windows-specific phase. Do not publish a Windows installer built from macOS.

## What Stays On macOS

- Shared React and Electron UI work
- Cross-platform Python behavior
- Non-packaging feature work and tests

## What Must Be Done On Windows

- Build the Windows PyInstaller worker
- Build the Windows NSIS installer
- Validate bundled Poppler EXE and DLL files at runtime
- Run clean-machine smoke tests on Windows 10 and Windows 11

## Prerequisites

- Windows 10 or Windows 11 x64
- Git
- Node.js 20+
- Python 3.13 x64
- This repo checked out on the `dev` branch

## Repo Setup

From PowerShell at the repo root:

```powershell
py -3.13 -m venv python\.venv
python\.venv\Scripts\python.exe -m pip install -r python\requirements.txt
python\.venv\Scripts\python.exe -m pip install -r python\requirements-dev.txt
cd electron
npm install
cd ..
```

## Windows Asset Check

Confirm these files exist under `python\vendor\poppler\windows\poppler-26.02.0\Library\bin\`:

- `pdftoppm.exe`
- `pdftocairo.exe`
- `pdfinfo.exe`

If those files are missing, stop and vendor the Windows Poppler bundle before building.

## Build The Windows Worker

```powershell
cd python
.\.venv\Scripts\python.exe .\scripts\build_worker.py --no-clean
cd ..
```

## Run Backend Tests

```powershell
cd python
$env:PYTHONPATH = "src"
.\.venv\Scripts\python.exe -m pytest -q
cd ..
```

## Run The App In Dev Mode

Terminal 1:

```powershell
cd electron
npm run dev:renderer
```

Terminal 2:

```powershell
cd electron
npm start
```

## Build The Self-Contained Windows Installer

From PowerShell at the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\build-windows.ps1
```

Output goes to `electron\dist-electron\`.

## Build A Public Windows Release

For a publishable installer, use release mode instead of the plain build:

```powershell
powershell -ExecutionPolicy Bypass -File .\build-windows.ps1 -Release
```

`-Release` adds fail-fast guardrails:

- requires Windows signing configuration before building
- enables `forceCodeSigning=true` so Electron cannot silently skip signing
- verifies the generated NSIS installer with `Get-AuthenticodeSignature`
- verifies the unpacked app `.exe` with `Get-AuthenticodeSignature`

Release mode accepts any of these signing paths:

1. `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD`
2. `CSC_LINK` + `CSC_KEY_PASSWORD`
3. `build.cscLink` or `win.cscLink` plus a matching `cscKeyPassword` in `electron\package.json`
4. `win.signtoolOptions.certificateSubjectName` or `certificateSha1` in `electron\package.json`
5. `win.azureSignOptions` in `electron\package.json` plus Azure signing credentials

Do not publish a Windows installer unless `-Release` completes successfully.

## Windows-Only Validation Checklist

- Install the NSIS `.exe` on a clean Windows 10 machine
- Install the NSIS `.exe` on a clean Windows 11 machine
- Launch the app without system Python or system Poppler installed
- Verify PDF to PNG/JPEG
- Verify JPEG, PNG, and WEBP conversions
- Verify images to PDF ordering
- Verify lock and unlock
- Verify render-preview-dependent tools: organize, sign, edit, and redact
- Verify output folder writes in normal user directories such as `Documents` and `Downloads`
- Verify uninstall

## Current Release Caveat

The current macOS host can prepare shared code and docs, but Windows packaging is only releaseable after a Windows-built worker and Windows smoke-test pass.
