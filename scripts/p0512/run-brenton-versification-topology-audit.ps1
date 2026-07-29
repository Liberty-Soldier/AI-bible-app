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

$scriptPath = Join-Path $RepoRoot "scripts\p0512\audit-brenton-versification-topology.js"
if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
    throw "Missing P05.12I script: $scriptPath"
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
$outputRoot = Join-Path $reportParent "$stamp-brenton-versification-topology"
$zipPath = Join-Path $reportParent "EMETSEES-P0512I-BRENTON-VERSIFICATION-TOPOLOGY-AUDIT-V2-$stamp.zip"

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

Write-Step "Running Brenton versification topology audit V2"
Write-Host "Branch: $((& git branch --show-current).Trim())"
Write-Host "Commit: $((& git rev-parse HEAD).Trim())"
Write-Host ""
Write-Host "This is read-only. It maps Brenton source labels to current reader verses and audits Greek LXX ownership." -ForegroundColor Yellow

& node --max-old-space-size=12288 $scriptPath --output $outputRoot

if ($LASTEXITCODE -ne 0) {
    $failureZip = Join-Path $reportParent "EMETSEES-P0512I-FAILURE-V2-$stamp.zip"

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

    throw "P05.12I V2 failed. Detailed Node error files were written to the report folder and packaged at: $failureZip"
}

Write-Step "Packaging P05.12I V2 report"

if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive `
    -Path (Join-Path $outputRoot "*") `
    -DestinationPath $zipPath `
    -CompressionLevel Optimal

Write-Host ""
Write-Host "P05.12I V2 completed." -ForegroundColor Green
Write-Host "- Production Brenton modified: NO"
Write-Host "- Greek LXX canonical data modified: NO"
Write-Host "- Alignments modified: NO"
Write-Host "- WEB modified: NO"
Write-Host "- KJV modified: NO"
Write-Host "- Report ZIP: $zipPath"
Write-Host ""
Write-Host "Upload the ZIP before generating a Brenton production candidate." -ForegroundColor Cyan
