[CmdletBinding()]
param(
    [string]$RepoRoot = (Get-Location).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-Sha256 {
    param([Parameter(Mandatory)][string]$Path)

    return (
        Get-FileHash `
            -LiteralPath $Path `
            -Algorithm SHA256
    ).Hash.ToLowerInvariant()
}

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
Set-Location -LiteralPath $RepoRoot

if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot ".git"))) {
    throw "Run from the ai-bible-app repository root."
}

$reportParent = Join-Path $RepoRoot ".private\reports\P05.12"

$completedRun = @(
    Get-ChildItem `
        -LiteralPath $reportParent `
        -Directory `
        -ErrorAction Stop |
        Where-Object {
            $_.Name -like "*-kjv-visible-edition-lock"
        } |
        Sort-Object LastWriteTimeUtc -Descending |
        Where-Object {
            Test-Path `
                -LiteralPath (
                    Join-Path `
                        $_.FullName `
                        "decision\kjv-visible-edition-policy.json"
                ) `
                -PathType Leaf
        } |
        Select-Object -First 1
)

if (-not $completedRun) {
    throw "No completed P05.12Z output directory was found."
}

$outputRoot = $completedRun.FullName
$policyPath = Join-Path `
    $outputRoot `
    "decision\kjv-visible-edition-policy.json"
$reconciliationPath = Join-Path `
    $outputRoot `
    "reconciliation\reconciliation-summary.json"
$summaryPath = Join-Path `
    $outputRoot `
    "p0512z-summary.json"

foreach ($required in @(
    $policyPath,
    $reconciliationPath,
    $summaryPath
)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
        throw "Required completed P05.12Z artifact is missing: $required"
    }
}

$policy = Get-Content -LiteralPath $policyPath -Raw |
    ConvertFrom-Json
$reconciliation = Get-Content `
    -LiteralPath $reconciliationPath `
    -Raw |
    ConvertFrom-Json
$summary = Get-Content -LiteralPath $summaryPath -Raw |
    ConvertFrom-Json

if ($policy.milestone -ne "P05.12Z") {
    throw "Unexpected policy milestone."
}

if ($policy.status -ne "kjv-visible-edition-locked") {
    throw "KJV visible-edition policy was not locked."
}

if ($policy.selectedVisibleEdition.id -ne "eng-kjv2006") {
    throw "Unexpected visible KJV edition."
}

if ([int]$policy.candidate.verses -ne 31102) {
    throw "KJV candidate verse count drift."
}

if (
    $policy.candidate.sha256 -ne
    "3e96334ec81f7132d0774c4fb52c17cbecfc1397fcf2c7c1653a4c3560652829"
) {
    throw "KJV candidate hash drift."
}

if ($policy.gates.safeToStageKjvCanonicalMigration -ne $true) {
    throw "KJV canonical migration was not authorized."
}

if ($policy.gates.safeToPromoteProductionKjv -ne $false) {
    throw "Production KJV promotion must remain blocked."
}

if (
    $reconciliation.status -ne
    "kjv-three-way-reconciliation-preview-complete"
) {
    throw "Three-way reconciliation did not complete."
}

if ([int]$reconciliation.stagedCandidate.audit.exact -ne 31102) {
    throw "KJV candidate is not exact to all 31,102 KJV2006 verses."
}

if (
    [int]$reconciliation.stagedCandidate.audit.substantiveDifferences `
        -ne 0
) {
    throw "KJV candidate has substantive differences from KJV2006."
}

if (
    [int]$reconciliation.stagedCandidate.audit.confirmedMissingWordOccurrences `
        -ne 0
) {
    throw "KJV candidate has missing word occurrences."
}

if ($summary.gates.reconciliationReproduced -ne $true) {
    throw "P05.12Z summary did not record reconciliation success."
}

if ($summary.gates.kjv2006VisibleEditionLocked -ne $true) {
    throw "P05.12Z summary did not lock KJV2006."
}

if ($summary.gates.productionKjvModified -ne $false) {
    throw "P05.12Z summary indicates production KJV changed."
}

if ($summary.gates.productionWebModified -ne $false) {
    throw "P05.12Z summary indicates production WEB changed."
}

if ($summary.gates.productionBrentonModified -ne $false) {
    throw "P05.12Z summary indicates production Brenton changed."
}

if ($summary.gates.alignmentsModified -ne $false) {
    throw "P05.12Z summary indicates alignments changed."
}

$kjvPath = Join-Path `
    $RepoRoot `
    "app\data\scripture\generatedKJV.json"
$webPath = Join-Path `
    $RepoRoot `
    "app\data\scripture\generatedWEB.json"
$brentonPath = Join-Path `
    $RepoRoot `
    "app\data\scripture\generatedBrenton.json"

if (
    (Get-Sha256 -Path $kjvPath) -ne
    [string]$summary.hashes.productionKjvAfter
) {
    throw "Current production KJV changed after the successful P05.12Z run."
}

if (
    (Get-Sha256 -Path $webPath) -ne
    [string]$summary.hashes.productionWebAfter
) {
    throw "Current production WEB changed after the successful P05.12Z run."
}

if (
    (Get-Sha256 -Path $brentonPath) -ne
    [string]$summary.hashes.productionBrentonAfter
) {
    throw "Current production Brenton changed after the successful P05.12Z run."
}

$resumeSummary = [ordered]@{
    milestone = "P05.12Z"
    stage = "resume-v2"
    generatedAtUtc = (
        Get-Date
    ).ToUniversalTime().ToString("o")
    reusedOutput = $outputRoot
        .Substring($RepoRoot.Length)
        .TrimStart("\", "/")
        .Replace("\", "/")
    repository = [ordered]@{
        branch = (& git branch --show-current).Trim()
        commit = (& git rev-parse HEAD).Trim()
    }
    decision = [ordered]@{
        visibleEdition = "eng-kjv2006"
        candidateVerses = 31102
        candidateSha256 = [string]$policy.candidate.sha256
        candidateExactToKjv2006 = $true
        exceptionalReferencesReviewed = @(
            "Joshua 19:2",
            "1 Corinthians 4:15"
        )
    }
    gates = [ordered]@{
        successfulReconciliationOutputReused = $true
        visibleEditionPolicyVerified = $true
        candidateExactToAll31102Kjv2006Verses = $true
        productionKjvStillUnchanged = $true
        productionWebStillUnchanged = $true
        productionBrentonStillUnchanged = $true
        alignmentsStillUnchanged = $true
        safeToStageKjvCanonicalMigration = $true
        safeToPromoteProductionKjv = $false
    }
}

$resumeSummary |
    ConvertTo-Json -Depth 20 |
    Set-Content `
        -LiteralPath (
            Join-Path $outputRoot "p0512z-resume-v2-summary.json"
        ) `
        -Encoding UTF8

$readmePath = Join-Path $outputRoot "README-RESUME-V2.md"
$readme = @"
# P05.12Z Resume V2

The original P05.12Z run completed the three-way reconciliation and locked
eBible KJV2006 as the visible edition. It failed only while building the final
checksum list because PowerShell interpreted a line-leading `.Substring()` as
a command.

Resume V2 reused the successful reconciliation and decision output, rechecked
all production hashes, and packaged the report without rerunning the KJV
reconciliation.

Production KJV, WEB, Brenton, canonical data, and alignments remain unchanged.
"@

[System.IO.File]::WriteAllText(
    $readmePath,
    ($readme + "`n"),
    [System.Text.UTF8Encoding]::new($false)
)

$checksumPath = Join-Path $outputRoot "checksums.sha256"

$checksumLines = @(
    Get-ChildItem `
        -LiteralPath $outputRoot `
        -Recurse `
        -File |
        Where-Object {
            $_.FullName -ne $checksumPath
        } |
        Sort-Object FullName |
        ForEach-Object {
            $relative = $_.FullName.Substring($outputRoot.Length)
            $relative = $relative.TrimStart("\", "/")
            $relative = $relative.Replace("\", "/")

            "$(Get-Sha256 -Path $_.FullName)  $relative"
        }
)

$checksumLines |
    Set-Content `
        -LiteralPath $checksumPath `
        -Encoding ASCII

$stamp = (
    Get-Date
).ToUniversalTime().ToString("yyyyMMdd-HHmmss")

$reportZip = Join-Path `
    $reportParent `
    "EMETSEES-P0512Z-KJV-VISIBLE-EDITION-LOCK-RESUME-V2-$stamp.zip"

if (Test-Path -LiteralPath $reportZip) {
    Remove-Item -LiteralPath $reportZip -Force
}

Compress-Archive `
    -Path (Join-Path $outputRoot "*") `
    -DestinationPath $reportZip `
    -CompressionLevel Optimal

Write-Host ""
Write-Host "P05.12Z Resume V2 completed." -ForegroundColor Green
Write-Host "- Successful three-way reconciliation reused: YES"
Write-Host "- Visible KJV edition locked: eBible KJV2006 standardized 1769"
Write-Host "- Candidate exact to KJV2006: 31,102 / 31,102"
Write-Host "- Production KJV modified: NO"
Write-Host "- Production WEB modified: NO"
Write-Host "- Production Brenton modified: NO"
Write-Host "- Alignments modified: NO"
Write-Host "- Safe to stage KJV canonical migration: YES"
Write-Host "- Production promotion authorized: NO"
Write-Host "- Report ZIP: $reportZip"
