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

$scriptPath = Join-Path $RepoRoot "scripts\p0512\run-certified-translation-integrity-census.js"
if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
    throw "Missing census script: $scriptPath"
}

$requiredFiles = @(
    "app\data\scripture\generatedWEB.json",
    "app\data\scripture\generatedKJV.json",
    "app\data\scripture\generatedBrenton.json"
)
foreach ($relativePath in $requiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot $relativePath) -PathType Leaf)) {
        throw "Missing required current translation file: $relativePath"
    }
}

$profiles = Get-ChildItem -LiteralPath (Join-Path $RepoRoot ".private\reports\P05.12") `
    -Recurse -Filter "authoritative-source-profiles.json" -File |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
if (-not $profiles) {
    throw "No P05.12C authoritative-source-profiles.json was found."
}

$nodeVersion = (& node --version)
if ($LASTEXITCODE -ne 0) {
    throw "Node.js is unavailable."
}

$currentBranch = (& git branch --show-current).Trim()
$currentCommit = (& git rev-parse HEAD).Trim()
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$reportParent = Join-Path $RepoRoot ".private\reports\P05.12"
$outputRoot = Join-Path $reportParent "$stamp-certified-translation-census"
$zipPath = Join-Path $reportParent "EMETSEES-P0512D-CERTIFIED-TRANSLATION-CENSUS-$stamp.zip"
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

Write-Step "Running certified locked-profile census"
Write-Host "Branch: $currentBranch"
Write-Host "Commit: $currentCommit"
Write-Host "Node: $nodeVersion"
Write-Host "Profiles: $($profiles.FullName)"
Write-Host "Output: $outputRoot"
Write-Host ""
Write-Host "No Bible data, display tokens, or alignments will be modified." -ForegroundColor Yellow

& node --max-old-space-size=8192 $scriptPath `
    --output $outputRoot `
    --profiles $profiles.FullName

if ($LASTEXITCODE -ne 0) {
    throw "P05.12D census failed with exit code $LASTEXITCODE. Do not rebuild or modify Bible data."
}

Write-Step "Packaging certified census report"
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive `
    -Path (Join-Path $outputRoot "*") `
    -DestinationPath $zipPath `
    -CompressionLevel Optimal

Write-Host ""
Write-Host "P05.12D census completed." -ForegroundColor Green
Write-Host "- Bible data modified: NO"
Write-Host "- Alignments modified: NO"
Write-Host "- Report ZIP: $zipPath"
Write-Host ""
Write-Host "Upload the ZIP to ChatGPT before any importer or translation rebuild is created." -ForegroundColor Cyan
