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

$scriptPath = Join-Path $RepoRoot "scripts\p0512\preview-deterministic-web-importer.js"
if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
    throw "Missing P05.12E script: $scriptPath"
}

$requiredFiles = @(
    "app\data\scripture\generatedWEB.json"
)

foreach ($relativePath in $requiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot $relativePath) -PathType Leaf)) {
        throw "Missing required file: $relativePath"
    }
}

$nodeVersion = (& node --version)
if ($LASTEXITCODE -ne 0) {
    throw "Node.js is unavailable."
}

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$reportParent = Join-Path $RepoRoot ".private\reports\P05.12"
$outputRoot = Join-Path $reportParent "$stamp-web-importer-preview-v2"
$zipPath = Join-Path $reportParent "EMETSEES-P0512E-DETERMINISTIC-WEB-IMPORTER-PREVIEW-V2-$stamp.zip"

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

Write-Step "Building deterministic WEB importer preview V2"
Write-Host "Branch: $((& git branch --show-current).Trim())"
Write-Host "Commit: $((& git rev-parse HEAD).Trim())"
Write-Host "Node: $nodeVersion"
Write-Host ""
Write-Host "This is a staging-only build. Production Bible data and alignments will not be changed." -ForegroundColor Yellow

& node --max-old-space-size=12288 $scriptPath --output $outputRoot

if ($LASTEXITCODE -ne 0) {
    throw "P05.12E failed. Do not modify generatedWEB.json or resume alignment work."
}

Write-Step "Packaging WEB importer preview report"

if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive `
    -Path (Join-Path $outputRoot "*") `
    -DestinationPath $zipPath `
    -CompressionLevel Optimal

Write-Host ""
Write-Host "P05.12E preview completed." -ForegroundColor Green
Write-Host "- Production generatedWEB.json modified: NO"
Write-Host "- Display tokens modified: NO"
Write-Host "- Alignments modified: NO"
Write-Host "- Report ZIP: $zipPath"
Write-Host ""
Write-Host "Upload the report ZIP before creating an apply step." -ForegroundColor Cyan
