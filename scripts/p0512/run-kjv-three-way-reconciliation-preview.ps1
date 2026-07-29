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

$scriptPath = Join-Path $RepoRoot "scripts\p0512\preview-kjv-three-way-reconciliation.js"
if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
    throw "Missing P05.12H script: $scriptPath"
}

$rollbackPath = Join-Path $RepoRoot "app\data\scripture\generatedWEB.json.p0512.rollback"
$candidatePath = Join-Path $RepoRoot "app\data\scripture\generatedWEB.json.p0512.candidate"

if (Test-Path -LiteralPath $rollbackPath) {
    throw "WEB transaction rollback residue exists: $rollbackPath"
}
if (Test-Path -LiteralPath $candidatePath) {
    throw "WEB transaction candidate residue exists: $candidatePath"
}

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$reportParent = Join-Path $RepoRoot ".private\reports\P05.12"
$outputRoot = Join-Path $reportParent "$stamp-kjv-three-way-reconciliation"
$zipPath = Join-Path $reportParent "EMETSEES-P0512H-KJV-THREE-WAY-RECONCILIATION-PREVIEW-$stamp.zip"

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

Write-Step "Running KJV three-way reconciliation preview"
Write-Host "Branch: $((& git branch --show-current).Trim())"
Write-Host "Commit: $((& git rev-parse HEAD).Trim())"
Write-Host ""
Write-Host "This is read-only for production Scripture. It stages a candidate and compares current KJV, KJV2006, and CrossWire." -ForegroundColor Yellow

& node --max-old-space-size=12288 $scriptPath --output $outputRoot

if ($LASTEXITCODE -ne 0) {
    throw "P05.12H failed. No KJV apply step is authorized."
}

Write-Step "Packaging P05.12H report"

if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive `
    -Path (Join-Path $outputRoot "*") `
    -DestinationPath $zipPath `
    -CompressionLevel Optimal

Write-Host ""
Write-Host "P05.12H completed." -ForegroundColor Green
Write-Host "- Production KJV modified: NO"
Write-Host "- WEB modified: NO"
Write-Host "- Brenton modified: NO"
Write-Host "- Display tokens rebuilt: NO"
Write-Host "- Alignments rebuilt: NO"
Write-Host "- Report ZIP: $zipPath"
Write-Host ""
Write-Host "Upload the ZIP before approving any KJV edition changes." -ForegroundColor Cyan
