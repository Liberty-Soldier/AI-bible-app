[CmdletBinding()]
param(
    [string]$RepoRoot = (Get-Location).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
Set-Location -LiteralPath $RepoRoot

if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot ".git"))) {
    throw "Run from the ai-bible-app repository root."
}

$nodeScript = Join-Path $RepoRoot "scripts\p0512\preview-tvtms-greek-crosswalk-parser.js"

if (-not (Test-Path -LiteralPath $nodeScript -PathType Leaf)) {
    throw "Missing P05.12K Node script: $nodeScript"
}

$sourceManifests = @(
    Get-ChildItem `
        -LiteralPath (Join-Path $RepoRoot ".private\sources\versification\stepbible-tvtms") `
        -Recurse `
        -File `
        -Filter "source-manifest.json" `
        -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending
)

$sourceManifestPath = $null
$sourceManifest = $null

foreach ($manifestFile in $sourceManifests) {
    try {
        $value = Get-Content -LiteralPath $manifestFile.FullName -Raw | ConvertFrom-Json

        if ($value.milestone -eq "P05.12J-V4") {
            $sourceManifestPath = $manifestFile.FullName
            $sourceManifest = $value
            break
        }
    }
    catch {
        continue
    }
}

if (-not $sourceManifestPath) {
    throw "No completed P05.12J V4 source-manifest.json was found."
}

$sourceRoot = Split-Path -Parent $sourceManifestPath

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$reportParent = Join-Path $RepoRoot ".private\reports\P05.12"
$outputRoot = Join-Path $reportParent "$stamp-tvtms-greek-crosswalk-parser-preview"
$zipPath = Join-Path $reportParent "EMETSEES-P0512K-TVTMS-GREEK-CROSSWALK-PARSER-PREVIEW-$stamp.zip"
$failureZip = Join-Path $reportParent "EMETSEES-P0512K-FAILURE-$stamp.zip"

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

Write-Step "Parsing the pinned TVTMS expanded versification records"
Write-Host "Pinned commit: $($sourceManifest.commit)"
Write-Host "Source root: $sourceRoot"
Write-Host ""
Write-Host "This is a preview. TVTMS Tests and competing Greek traditions will be retained rather than assumed." -ForegroundColor Yellow

& node --max-old-space-size=12288 `
    $nodeScript `
    --output $outputRoot `
    --source-manifest $sourceManifestPath `
    --source-root $sourceRoot

if ($LASTEXITCODE -ne 0) {
    if (Test-Path -LiteralPath $failureZip) {
        Remove-Item -LiteralPath $failureZip -Force
    }

    Compress-Archive `
        -Path (Join-Path $outputRoot "*") `
        -DestinationPath $failureZip `
        -CompressionLevel Optimal `
        -Force

    throw "P05.12K failed. Upload: $failureZip"
}

Write-Step "Packaging P05.12K report"

if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive `
    -Path (Join-Path $outputRoot "*") `
    -DestinationPath $zipPath `
    -CompressionLevel Optimal

Write-Host ""
Write-Host "P05.12K completed." -ForegroundColor Green
Write-Host "- TVTMS expanded parser completed: YES"
Write-Host "- Production Brenton modified: NO"
Write-Host "- Greek LXX canonical data modified: NO"
Write-Host "- Alignments modified: NO"
Write-Host "- WEB modified: NO"
Write-Host "- KJV modified: NO"
Write-Host "- Report ZIP: $zipPath"
Write-Host ""
Write-Host "Upload the ZIP before evaluating TVTMS Tests or creating a Brenton candidate." -ForegroundColor Cyan
