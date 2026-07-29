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
    throw "RepoRoot is not a Git repository: $RepoRoot"
}

$scriptPath = Join-Path $RepoRoot "scripts\translations\rebuild-web-from-usfm.js"
if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
    throw "Missing permanent WEB rebuild script: $scriptPath"
}

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$reportParent = Join-Path $RepoRoot ".private\reports\P05.12"
$outputRoot = Join-Path $reportParent "$stamp-web-production-rebuild"
$zipPath = Join-Path $reportParent "EMETSEES-P0512F-TRANSACTIONAL-WEB-PRODUCTION-REBUILD-V2-$stamp.zip"

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

Write-Step "Running transactional WEB production rebuild V2"
Write-Host "Branch: $((& git branch --show-current).Trim())"
Write-Host "Commit: $((& git rev-parse HEAD).Trim())"
Write-Host ""
Write-Host "The tool will rebuild from immutable USFM, verify the approved candidate, back up the current reader, replace it atomically, run npm build, and roll back automatically if a gate fails." -ForegroundColor Yellow

& node --max-old-space-size=12288 $scriptPath --output $outputRoot --apply

if ($LASTEXITCODE -ne 0) {
    throw "P05.12F failed. The transaction attempts automatic rollback. Inspect the terminal output before doing anything else."
}

Write-Step "Packaging P05.12F report"

if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive `
    -Path (Join-Path $outputRoot "*") `
    -DestinationPath $zipPath `
    -CompressionLevel Optimal

Write-Host ""
Write-Host "P05.12F V2 completed." -ForegroundColor Green
Write-Host "- WEB source text rebuilt: YES"
Write-Host "- Repository build passed: YES"
Write-Host "- Display tokens rebuilt: NO"
Write-Host "- Alignments rebuilt: NO"
Write-Host "- Safe to deploy: NO"
Write-Host "- Report ZIP: $zipPath"
Write-Host ""
Write-Host "Upload the ZIP before rebuilding display tokens or alignments." -ForegroundColor Cyan
