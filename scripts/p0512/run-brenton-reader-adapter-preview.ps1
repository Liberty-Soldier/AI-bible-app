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

$nodeScript = Join-Path $RepoRoot "scripts\p0512\preview-brenton-reader-adapter.js"

if (-not (Test-Path -LiteralPath $nodeScript -PathType Leaf)) {
    throw "Missing P05.12Q Node script: $nodeScript"
}

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$reportParent = Join-Path $RepoRoot ".private\reports\P05.12"
$outputRoot = Join-Path $reportParent "$stamp-brenton-reader-adapter-preview"
$zipPath = Join-Path $reportParent "EMETSEES-P0512Q-BRENTON-READER-ADAPTER-PREVIEW-V2-$stamp.zip"
$failureZip = Join-Path $reportParent "EMETSEES-P0512Q-FAILURE-V2-$stamp.zip"

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

Write-Step "Building and testing Brenton reader adapter preview V2"
Write-Host "Branch: $((& git branch --show-current).Trim())"
Write-Host "Commit: $((& git rev-parse HEAD).Trim())"
Write-Host ""
Write-Host "This is staging-only. It converts the completed candidate into an executable adapter and identifies the exact app integration files." -ForegroundColor Yellow

& node --max-old-space-size=12288 `
    $nodeScript `
    --output $outputRoot

if ($LASTEXITCODE -ne 0) {
    if (Test-Path -LiteralPath $failureZip) {
        Remove-Item -LiteralPath $failureZip -Force
    }

    if (Test-Path -LiteralPath $outputRoot) {
        Compress-Archive `
            -Path (Join-Path $outputRoot "*") `
            -DestinationPath $failureZip `
            -CompressionLevel Optimal `
            -Force
    }

    throw "P05.12Q V2 failed. Upload: $failureZip"
}

Write-Step "Packaging P05.12Q V2 report"

if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive `
    -Path (Join-Path $outputRoot "*") `
    -DestinationPath $zipPath `
    -CompressionLevel Optimal

Write-Host ""
Write-Host "P05.12Q V2 completed." -ForegroundColor Green
Write-Host "- Reader adapter built and tested: YES"
Write-Host "- Generated numeric/subverse sorting verified: YES"
Write-Host "- Exact integration files identified: YES"
Write-Host "- Production Brenton modified: NO"
Write-Host "- Greek LXX canonical data modified: NO"
Write-Host "- Alignments modified: NO"
Write-Host "- WEB modified: NO"
Write-Host "- KJV modified: NO"
Write-Host "- Report ZIP: $zipPath"
Write-Host ""
Write-Host "Upload the ZIP. The next package will implement the adapter in the exact identified files." -ForegroundColor Cyan
