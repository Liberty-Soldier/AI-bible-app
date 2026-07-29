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

$nodeScript = Join-Path $RepoRoot "scripts\p0512\build-deduplicated-brenton-reader-candidate.js"

if (-not (Test-Path -LiteralPath $nodeScript -PathType Leaf)) {
    throw "Missing P05.12P Node script: $nodeScript"
}

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$reportParent = Join-Path $RepoRoot ".private\reports\P05.12"
$outputRoot = Join-Path $reportParent "$stamp-deduplicated-brenton-reader-candidate"
$zipPath = Join-Path $reportParent "EMETSEES-P0512P-DEDUPLICATED-BRENTON-READER-CANDIDATE-V2-$stamp.zip"
$failureZip = Join-Path $reportParent "EMETSEES-P0512P-FAILURE-V2-$stamp.zip"

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

Write-Step "Building deduplicated Brenton reader candidate V2 with footnote reconciliation"
Write-Host "Branch: $((& git branch --show-current).Trim())"
Write-Host "Commit: $((& git rev-parse HEAD).Trim())"
Write-Host ""
Write-Host "This is staging-only. It rebuilds from immutable USFM and preserves text, titles, aliases, notes, references, and structure separately." -ForegroundColor Yellow

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

    throw "P05.12P V2 failed. Upload: $failureZip"
}

Write-Step "Packaging P05.12P V2 report"

if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive `
    -Path (Join-Path $outputRoot "*") `
    -DestinationPath $zipPath `
    -CompressionLevel Optimal

Write-Host ""
Write-Host "P05.12P V2 completed." -ForegroundColor Green
Write-Host "- Immutable Brenton source rebuilt: YES"
Write-Host "- Deduplicated reader candidate staged: YES"
Write-Host "- All source text and metadata preserved: YES
Write-Host "- Footnote inventories reconciled: YES""
Write-Host "- Production Brenton modified: NO"
Write-Host "- Greek LXX canonical data modified: NO"
Write-Host "- Alignments modified: NO"
Write-Host "- WEB modified: NO"
Write-Host "- KJV modified: NO"
Write-Host "- Report ZIP: $zipPath"
Write-Host ""
Write-Host "Upload the ZIP before building the reader-schema adapter." -ForegroundColor Cyan
