# Bundled Poppler Binaries

Poppler binaries are required by `pdf2image`. The app must never rely on
Homebrew, system Poppler, or ambient `PATH`.

Expected platform layout:

- `macos-arm64/bin/`: `pdftoppm`, `pdftocairo`, `pdfinfo`
- `macos-arm64/lib/`: required dylib dependencies
- `macos-x64/bin/`: `pdftoppm`, `pdftocairo`, `pdfinfo`
- `macos-x64/lib/`: required dylib dependencies
- `windows/`: `pdftoppm.exe`, `pdftocairo.exe`, `pdfinfo.exe`, and required DLL dependencies

Windows packaging must be built on Windows so the final installer contains a Windows PyInstaller worker alongside the Windows Poppler bundle.

For local macOS vendoring from Homebrew:

```bash
python/.venv/bin/python python/scripts/vendor_poppler_macos.py \
  --poppler-prefix "$(brew --prefix poppler)" \
  --output-root python/vendor/poppler/macos-arm64
```

All future `pdf2image` calls must pass:

```python
poppler_path=get_poppler_path()
```
