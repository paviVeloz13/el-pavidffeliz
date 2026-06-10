# Bundled Fonts

Place `DancingScript.ttf` here before implementing typed signatures or building
the PyInstaller bundle.

The backend resolves this file through `get_font_path()` so development and
frozen PyInstaller paths use the same layout:

```text
assets/fonts/DancingScript.ttf
```
