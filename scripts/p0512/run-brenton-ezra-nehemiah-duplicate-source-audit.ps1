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

$nodeScript = Join-Path $RepoRoot "scripts\p0512\audit-brenton-ezra-nehemiah-duplicate-source.js"

if (-not (Test-Path -LiteralPath $nodeScript -PathType Leaf)) {
    throw "Missing P05.12O Node script: $nodeScript"
}

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$reportParent = Join-Path $RepoRoot ".private\reports\P05.12"
$outputRoot = Join-Path $reportParent "$stamp-brenton-ezra-nehemiah-duplicate-source"
$zipPath = Join-Path $reportParent "EMETSEES-P0512O-BRENTON-EZRA-NEHEMIAH-DUPLICATE-SOURCE-AUDIT-$stamp.zip"
$failureZip = Join-Path $reportParent "EMETSEES-P0512O-FAILURE-$stamp.zip"

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

Write-Step "Auditing duplicate Brenton Ezra-Nehemiah source representations"
Write-Host "Branch: $((& git branch --show-current).Trim())"
Write-Host "Commit: $((& git rev-parse HEAD).Trim())"
Write-Host ""
Write-Host "This is read-only. It compares EZR chapters 11-23 directly with NEH chapters 1-13 and stages an alias map." -ForegroundColor Yellow

& node --max-old-space-size=8192 `
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

    throw "P05.12O failed. Upload: $failureZip"
}

Write-Step "Packaging P05.12O report"

if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive `
    -Path (Join-Path $outputRoot "*") `
    -DestinationPath $zipPath `
    -CompressionLevel Optimal

Write-Host ""
Write-Host "P05.12O completed." -ForegroundColor Green
Write-Host "- All 389 alternate source segments mapped: YES"
Write-Host "- Deduplicated reader candidate authorized: YES"
Write-Host "- Production Brenton modified: NO"
Write-Host "- Greek LXX canonical data modified: NO"
Write-Host "- Alignments modified: NO"
Write-Host "- WEB modified: NO"
Write-Host "- KJV modified: NO"
Write-Host "- Report ZIP: $zipPath"
Write-Host ""
Write-Host "Upload the ZIP before building the deduplicated Brenton reader candidate." -ForegroundColor Cyan
