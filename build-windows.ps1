$ErrorActionPreference = "Stop"

param(
    [switch]$SkipPy,
    [switch]$Release
)

if ($env:OS -ne "Windows_NT") {
    throw "build-windows.ps1 must run on Windows."
}

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonDir = Join-Path $RepoRoot "python"
$ElectronDir = Join-Path $RepoRoot "electron"
$PythonExe = Join-Path $PythonDir ".venv\Scripts\python.exe"
$ElectronPackageJson = Join-Path $ElectronDir "package.json"

function Get-ConfigValue {
    param(
        [Parameter(Mandatory = $true)]
        $Object,
        [Parameter(Mandatory = $true)]
        [string]$PropertyName
    )

    if ($Object -and ($Object.PSObject.Properties.Name -contains $PropertyName)) {
        return $Object.$PropertyName
    }

    return $null
}

function Get-SigningConfig {
    $packageJson = Get-Content $ElectronPackageJson -Raw | ConvertFrom-Json
    $buildConfig = $packageJson.build
    $winConfig = $buildConfig.win

    $cscLink = $null
    $cscKeyPassword = $null
    $subjectName = $null
    $sha1 = $null
    $azureSign = $false

    if ($buildConfig) {
        $cscLink = Get-ConfigValue -Object $buildConfig -PropertyName "cscLink"
        $cscKeyPassword = Get-ConfigValue -Object $buildConfig -PropertyName "cscKeyPassword"
    }

    if ($winConfig) {
        $winCscLink = Get-ConfigValue -Object $winConfig -PropertyName "cscLink"
        $winCscKeyPassword = Get-ConfigValue -Object $winConfig -PropertyName "cscKeyPassword"

        if ($null -ne $winCscLink) {
            $cscLink = $winCscLink
        }

        if ($null -ne $winCscKeyPassword) {
            $cscKeyPassword = $winCscKeyPassword
        }
    }

    if ($winConfig -and $winConfig.signtoolOptions) {
        $subjectName = $winConfig.signtoolOptions.certificateSubjectName
        $sha1 = $winConfig.signtoolOptions.certificateSha1
    }

    if (-not $subjectName -and $winConfig) {
        $subjectName = $winConfig.certificateSubjectName
    }

    if (-not $sha1 -and $winConfig) {
        $sha1 = $winConfig.certificateSha1
    }

    if ($winConfig -and $winConfig.azureSignOptions) {
        $azureSign = $true
    }

    return @{
        CscLink = $cscLink
        CscKeyPassword = $cscKeyPassword
        SubjectName = $subjectName
        Sha1 = $sha1
        AzureSign = $azureSign
    }
}

function Test-CertificateStoreMatch {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$SigningConfig
    )

    $certificates = @(Get-ChildItem -Path Cert:\CurrentUser\My, Cert:\LocalMachine\My -ErrorAction SilentlyContinue)
    $matches = $certificates | Where-Object {
        $subjectMatches = (-not $SigningConfig.SubjectName) -or $_.Subject.Contains($SigningConfig.SubjectName)
        $shaMatches = (-not $SigningConfig.Sha1) -or $_.Thumbprint.ToUpper() -eq $SigningConfig.Sha1.ToUpper()
        $subjectMatches -and $shaMatches
    }

    if (-not $matches) {
        throw "Could not find a Windows certificate matching the configured certificateSubjectName/certificateSha1 in CurrentUser or LocalMachine certificate stores."
    }
}

function Test-AzureTrustedSigningEnv {
    if (-not $env:AZURE_TENANT_ID) {
        throw "AZURE_TENANT_ID is required for win.azureSignOptions."
    }

    if (-not $env:AZURE_CLIENT_ID) {
        throw "AZURE_CLIENT_ID is required for win.azureSignOptions."
    }

    if ($env:AZURE_CLIENT_SECRET) {
        return
    }

    if ($env:AZURE_CLIENT_CERTIFICATE_PATH) {
        return
    }

    if ($env:AZURE_USERNAME -and $env:AZURE_PASSWORD) {
        return
    }

    throw "win.azureSignOptions is configured, but no supported Azure credential set was found. Provide AZURE_CLIENT_SECRET, or AZURE_CLIENT_CERTIFICATE_PATH, or AZURE_USERNAME + AZURE_PASSWORD."
}

function Test-WindowsSigningConfig {
    $winCscLink = $env:WIN_CSC_LINK
    $cscLink = $env:CSC_LINK
    $signingConfig = Get-SigningConfig
    $effectiveCscLink = $null
    $effectiveCscPassword = $null

    if ($null -ne $winCscLink -and $winCscLink -ne "") {
        $effectiveCscLink = $winCscLink
        $effectiveCscPassword = [System.Environment]::GetEnvironmentVariable("WIN_CSC_KEY_PASSWORD")
    } elseif ($null -ne $cscLink -and $cscLink -ne "") {
        $effectiveCscLink = $cscLink
        $effectiveCscPassword = [System.Environment]::GetEnvironmentVariable("CSC_KEY_PASSWORD")
    } elseif ($signingConfig.CscLink) {
        $effectiveCscLink = $signingConfig.CscLink
        $effectiveCscPassword = $signingConfig.CscKeyPassword
    }

    if ($effectiveCscLink) {
        if ($null -eq $effectiveCscPassword) {
            throw "A Windows PFX signing link is configured, but no matching certificate password was provided."
        }
        return
    }

    if ($signingConfig.AzureSign) {
        Test-AzureTrustedSigningEnv
        return
    }

    if ($signingConfig.SubjectName -or $signingConfig.Sha1) {
        Test-CertificateStoreMatch -SigningConfig $signingConfig
        return
    }

    throw @"
No Windows code-signing configuration is available for a public release.

Provide one of these before running -Release:
  1. WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD
  2. CSC_LINK + CSC_KEY_PASSWORD
  3. build.cscLink or win.cscLink plus a matching cscKeyPassword in electron/package.json
  4. win.signtoolOptions.certificateSubjectName or certificateSha1 in electron/package.json
  5. win.azureSignOptions in electron/package.json plus Azure signing credentials
"@
}

function Verify-AuthenticodeSignature {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $signature = Get-AuthenticodeSignature -FilePath $Path
    if ($signature.Status -ne "Valid") {
        throw "Authenticode verification failed for $Path. Status: $($signature.Status)"
    }

    Write-Host "==> Verified signature:" $Path
    if ($signature.SignerCertificate) {
        Write-Host "    Subject:" $signature.SignerCertificate.Subject
        Write-Host "    Thumbprint:" $signature.SignerCertificate.Thumbprint
    }
}

function Verify-ReleaseArtifacts {
    $distDir = Join-Path $ElectronDir "dist-electron"
    $installer = Get-ChildItem -Path $distDir -Filter "*.exe" -File |
        Where-Object { $_.Name -notlike "*unpacked*" } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if (-not $installer) {
        throw "Could not find a Windows installer .exe under $distDir."
    }

    Verify-AuthenticodeSignature -Path $installer.FullName

    $unpackedDir = Join-Path $distDir "win-unpacked"
    $appExe = Get-ChildItem -Path $unpackedDir -Filter "*.exe" -File |
        Where-Object { $_.Name -notlike "*Helper*" } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if (-not $appExe) {
        throw "Could not find the unpacked app .exe under $unpackedDir."
    }

    Verify-AuthenticodeSignature -Path $appExe.FullName
}

if (-not (Test-Path $PythonExe)) {
    throw "Python venv not found at $PythonExe. Create it first with: py -3.13 -m venv python\.venv"
}

if ($Release) {
    Test-WindowsSigningConfig
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
if ($Release) {
    npx electron-builder --win --x64 -c.forceCodeSigning=true
} else {
    npx electron-builder --win --x64
}
Pop-Location

Write-Host "==> Electron app built: electron\dist-electron\"

if ($Release) {
    Verify-ReleaseArtifacts
}
