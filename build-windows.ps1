$ErrorActionPreference = "Stop"

param(
    [switch]$SkipPy
)

if ($env:OS -ne "Windows_NT") {
    throw "build-windows.ps1 must run on Windows."
}

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonDir = Join-Path $RepoRoot "python"
$ElectronDir = Join-Path $RepoRoot "electron"
$PythonExe = Join-Path $PythonDir ".venv\Scripts\python.exe"

if (-not (Test-Path $PythonExe)) {
    throw "Python venv not found at $PythonExe. Create it first with: py -3.13 -m venv python\.venv"
}

if (-not $SkipPy) {
    Write-Host "==> Building Python worker..."
    Push-Location $PythonDir
    & $PythonExe "scripts/build_worker.py"
    Pop-Location
    Write-Host "==> Python worker built: python\dist\pavidffeliz-worker\"
}

Write-Host "==> Building Electron app..."
Push-Location $ElectronDir
npm run build:renderer
npx electron-builder --win --x64
Pop-Location

Write-Host "==> Electron app built: electron\dist-electron\"
