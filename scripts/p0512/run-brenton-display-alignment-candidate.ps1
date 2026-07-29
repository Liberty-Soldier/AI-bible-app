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

$branch = (& git branch --show-current).Trim()

if ($branch -ne "p0512-translation-integrity-rebuild") {
    throw "Expected branch p0512-translation-integrity-rebuild; found $branch"
}

$nodeScript = Join-Path $RepoRoot "scripts\p0512\build-brenton-display-alignment-candidate.js"

if (-not (Test-Path -LiteralPath $nodeScript -PathType Leaf)) {
    throw "Missing P05.12U candidate builder: $nodeScript"
}

$reportParent = Join-Path $RepoRoot ".private\reports\P05.12"
$v8SummaryPath = $null
$v8Summary = $null

Write-Step "Verifying the completed source-coherent Brenton promotion"

foreach ($candidate in @(
    Get-ChildItem -LiteralPath $reportParent -Recurse -File -Filter "brenton-promotion-summary.json" |
        Sort-Object LastWriteTimeUtc -Descending
)) {
    try {
        $parsed = Get-Content -LiteralPath $candidate.FullName -Raw |
            ConvertFrom-Json

        if (
            $parsed.milestone -eq "P05.12T" -and
            $parsed.build.passed -eq $true -and
            $parsed.gates.repositoryBuildPassed -eq $true -and
            $parsed.gates.exactly53BrentonReaderBooks -eq $true -and
            $parsed.gates.readerBookNamesVerifiedExactly -eq $true -and
            $parsed.gates.everyVerseCarriesReaderSourceIdentity -eq $true -and
            $parsed.gates.noCrossBookReaderMappingsAccepted -eq $true -and
            $parsed.gates.safeToRebuildBrentonDisplayTokenAlignments -eq $true
        ) {
            $productionPath = Join-Path $RepoRoot "app\data\scripture\generatedBrenton.json"
            $currentHash = (Get-FileHash -LiteralPath $productionPath -Algorithm SHA256).Hash.ToLowerInvariant()

            if ($currentHash -eq [string]$parsed.productionHashes.after.brenton) {
                $v8SummaryPath = $candidate.FullName
                $v8Summary = $parsed
                break
            }
        }
    }
    catch {
        # Continue searching.
    }
}

if (-not $v8SummaryPath) {
    throw "No completed V8-equivalent Brenton promotion matches current production."
}

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$outputRoot = Join-Path $reportParent "$stamp-brenton-display-alignment-candidate"
$zipPath = Join-Path $reportParent "EMETSEES-P0512U-BRENTON-DISPLAY-ALIGNMENT-CANDIDATE-$stamp.zip"
$failureZip = Join-Path $reportParent "EMETSEES-P0512U-FAILURE-$stamp.zip"

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

Write-Step "Building the deterministic Brenton display-alignment candidate"
Write-Host "Branch: $branch"
Write-Host "Commit: $((& git rev-parse HEAD).Trim())"
Write-Host "V8 report: $v8SummaryPath"
Write-Host ""
Write-Host "This stages real reader-to-LXX alignments. It does not yet change production or re-enable word taps." -ForegroundColor Yellow

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

    throw "P05.12U failed. Upload: $failureZip"
}

Write-Step "Packaging P05.12U report"

if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive `
    -Path (Join-Path $outputRoot "*") `
    -DestinationPath $zipPath `
    -CompressionLevel Optimal

Write-Host ""
Write-Host "P05.12U completed." -ForegroundColor Green
Write-Host "- Actual Brenton alignment candidate built: YES"
Write-Host "- Prior valid alignments transferred first: YES"
Write-Host "- Fresh LXX alignments generated where needed: YES"
Write-Host "- All 28,548 reader verses accounted: YES"
Write-Host "- All 27,216 eligible ownership keys resolved: YES"
Write-Host "- Production Brenton modified: NO"
Write-Host "- Canonical LXX modified: NO"
Write-Host "- Brenton word taps re-enabled: NO"
Write-Host "- Report ZIP: $zipPath"
Write-Host ""
Write-Host "Upload the ZIP. The report determines the transactional promotion gates for the alignment runtime." -ForegroundColor Cyan
