# macOS Release Packaging

Public macOS releases must be **Developer ID signed** and **notarized**. If we upload an ad hoc or unsigned DMG to GitHub, macOS Gatekeeper can show the app as **damaged** after download.

## What caused the current failure

The current arm64 build was released with:

- no valid `Developer ID Application` certificate in the build keychain
- no notarization credentials available to `electron-builder`
- no release-time verification before upload

That lets Electron produce a local prototype DMG, but it is not suitable for public GitHub distribution.

## Prerequisites

Before building a public release on macOS:

1. Import a `Developer ID Application` certificate into the current keychain.
2. Provide one notarization credential set:
   - Recommended: `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`
   - Fallback: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
   - Alternative: `APPLE_KEYCHAIN`, `APPLE_KEYCHAIN_PROFILE`

## Build command

For the current releaseable scope, build Apple Silicon only:

```bash
./build.sh --release --arm64
```

`--release` now does three things:

- requires a `Developer ID Application` identity
- requires notarization credentials
- enables `forceCodeSigning=true` so the build fails instead of silently producing an ad hoc app

If you omit `--arm64`, release mode defaults to `arm64` for now.

## Verification steps

The release build script now runs:

```bash
codesign --verify --deep --strict --verbose=2 "electron/dist-electron/mac-arm64/El PaviDFeliz.app"
xcrun stapler validate "electron/dist-electron/mac-arm64/El PaviDFeliz.app"
spctl -a -vvv -t exec "electron/dist-electron/mac-arm64/El PaviDFeliz.app"
```

Do not upload the DMG unless all three pass.

## Publishing guidance

- Upload only the arm64 DMG for now.
- Do not publish the x64 DMG until the Intel Python worker and Intel Poppler bundle are confirmed self-contained.
- Replace the current broken GitHub asset once a signed and notarized arm64 build is ready.

## Temporary tester workaround

For a private test copy that was already downloaded, Gatekeeper quarantine can be removed manually:

```bash
xattr -dr com.apple.quarantine "/Applications/El PaviDFeliz.app"
```

This is only a tester workaround. It is not the right fix for a public release.
