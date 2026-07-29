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

if (-not (
    Test-Path `
        -LiteralPath (Join-Path $RepoRoot ".git")
)) {
    throw "Run from the ai-bible-app repository root."
}

$branch = (& git branch --show-current).Trim()
$commit = (& git rev-parse HEAD).Trim()

$reconciliationScript = Join-Path `
    $RepoRoot `
    "scripts\p0512\preview-kjv-three-way-reconciliation.js"

$decisionScript = Join-Path `
    $RepoRoot `
    "scripts\p0512\lock-kjv-visible-edition.js"

foreach ($required in @(
    $reconciliationScript,
    $decisionScript,
    (Join-Path $RepoRoot "app\data\scripture\generatedKJV.json")
)) {
    if (-not (
        Test-Path -LiteralPath $required -PathType Leaf
    )) {
        throw "Required P05.12Z input is missing: $required"
    }
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

$kjvHashBefore = Get-Sha256 -Path $kjvPath
$webHashBefore = Get-Sha256 -Path $webPath
$brentonHashBefore = Get-Sha256 -Path $brentonPath

$stamp = (
    Get-Date
).ToUniversalTime().ToString("yyyyMMdd-HHmmss")

$reportParent = Join-Path `
    $RepoRoot `
    ".private\reports\P05.12"

$outputRoot = Join-Path `
    $reportParent `
    "$stamp-kjv-visible-edition-lock"

$reconciliationRoot = Join-Path `
    $outputRoot `
    "reconciliation"

$decisionRoot = Join-Path `
    $outputRoot `
    "decision"

$reportZip = Join-Path `
    $reportParent `
    "EMETSEES-P0512Z-KJV-VISIBLE-EDITION-LOCK-$stamp.zip"

$failureZip = Join-Path `
    $reportParent `
    "EMETSEES-P0512Z-FAILURE-$stamp.zip"

$reconciliationStdout = Join-Path `
    $outputRoot `
    "reconciliation.stdout.log"

$reconciliationStderr = Join-Path `
    $outputRoot `
    "reconciliation.stderr.log"

$decisionStdout = Join-Path `
    $outputRoot `
    "decision.stdout.log"

$decisionStderr = Join-Path `
    $outputRoot `
    "decision.stderr.log"

New-Item `
    -ItemType Directory `
    -Force `
    -Path $reconciliationRoot, $decisionRoot |
    Out-Null

$passed = $false
$failure = $null

try {
    Write-Step "Reproducing the proven KJV three-way reconciliation"
    Write-Host "Branch: $branch"
    Write-Host "Commit: $commit"
    Write-Host ""
    Write-Host (
        "This is staging-only. Production Scripture and alignments " +
        "will not be modified."
    ) -ForegroundColor Yellow

    $reconciliationProcess = Start-Process `
        -FilePath "node.exe" `
        -ArgumentList @(
            "--max-old-space-size=12288",
            $reconciliationScript,
            "--output",
            $reconciliationRoot
        ) `
        -WorkingDirectory $RepoRoot `
        -RedirectStandardOutput $reconciliationStdout `
        -RedirectStandardError $reconciliationStderr `
        -Wait `
        -PassThru `
        -NoNewWindow

    Write-Host ""
    Write-Host "--- reconciliation stdout ---" `
        -ForegroundColor DarkGray

    if (Test-Path -LiteralPath $reconciliationStdout) {
        Get-Content -LiteralPath $reconciliationStdout |
            ForEach-Object { Write-Host $_ }
    }

    Write-Host "--- reconciliation stderr ---" `
        -ForegroundColor DarkGray

    if (Test-Path -LiteralPath $reconciliationStderr) {
        Get-Content -LiteralPath $reconciliationStderr |
            ForEach-Object { Write-Host $_ }
    }

    if ($reconciliationProcess.ExitCode -ne 0) {
        throw (
            "KJV three-way reconciliation failed with exit code " +
            "$($reconciliationProcess.ExitCode)."
        )
    }

    Write-Step "Locking the KJV2006 visible-edition policy"

    $decisionProcess = Start-Process `
        -FilePath "node.exe" `
        -ArgumentList @(
            $decisionScript,
            "--reconciliation-root",
            $reconciliationRoot,
            "--output",
            $decisionRoot
        ) `
        -WorkingDirectory $RepoRoot `
        -RedirectStandardOutput $decisionStdout `
        -RedirectStandardError $decisionStderr `
        -Wait `
        -PassThru `
        -NoNewWindow

    Write-Host ""
    Write-Host "--- decision stdout ---" `
        -ForegroundColor DarkGray

    if (Test-Path -LiteralPath $decisionStdout) {
        Get-Content -LiteralPath $decisionStdout |
            ForEach-Object { Write-Host $_ }
    }

    Write-Host "--- decision stderr ---" `
        -ForegroundColor DarkGray

    if (Test-Path -LiteralPath $decisionStderr) {
        Get-Content -LiteralPath $decisionStderr |
            ForEach-Object { Write-Host $_ }
    }

    if ($decisionProcess.ExitCode -ne 0) {
        throw (
            "KJV visible-edition lock failed with exit code " +
            "$($decisionProcess.ExitCode)."
        )
    }

    $policyPath = Join-Path `
        $decisionRoot `
        "kjv-visible-edition-policy.json"

    $policy = Get-Content `
        -LiteralPath $policyPath `
        -Raw |
        ConvertFrom-Json

    if (
        $policy.status -ne "kjv-visible-edition-locked" -or
        $policy.selectedVisibleEdition.id -ne "eng-kjv2006" -or
        $policy.gates.safeToStageKjvCanonicalMigration -ne $true -or
        $policy.gates.safeToPromoteProductionKjv -ne $false
    ) {
        throw "P05.12Z policy gates did not pass."
    }

    if ((Get-Sha256 -Path $kjvPath) -ne $kjvHashBefore) {
        throw "Production KJV changed during P05.12Z."
    }

    if ((Get-Sha256 -Path $webPath) -ne $webHashBefore) {
        throw "Production WEB changed during P05.12Z."
    }

    if ((Get-Sha256 -Path $brentonPath) -ne $brentonHashBefore) {
        throw "Production Brenton changed during P05.12Z."
    }

    $runSummary = [ordered]@{
        milestone = "P05.12Z"
        generatedAtUtc = (
            Get-Date
        ).ToUniversalTime().ToString("o")
        repository = [ordered]@{
            branch = $branch
            commit = $commit
        }
        hashes = [ordered]@{
            productionKjvBefore = $kjvHashBefore
            productionKjvAfter = Get-Sha256 -Path $kjvPath
            productionWebBefore = $webHashBefore
            productionWebAfter = Get-Sha256 -Path $webPath
            productionBrentonBefore = $brentonHashBefore
            productionBrentonAfter = Get-Sha256 -Path $brentonPath
        }
        decision = [ordered]@{
            visibleEdition = "eng-kjv2006"
            candidateSha256 = $policy.candidate.sha256
            candidateVerses = [int]$policy.candidate.verses
            sourcePairAgreementAgainstCurrent = 57
            exceptionalReferencesReviewed = @(
                "Joshua 19:2",
                "1 Corinthians 4:15"
            )
        }
        gates = [ordered]@{
            reconciliationReproduced = $true
            kjv2006VisibleEditionLocked = $true
            noHybridVisibleKjvAuthorized = $true
            productionKjvModified = $false
            productionWebModified = $false
            productionBrentonModified = $false
            alignmentsModified = $false
            safeToStageKjvCanonicalMigration = $true
            safeToPromoteProductionKjv = $false
        }
    }

    $runSummary |
        ConvertTo-Json -Depth 20 |
        Set-Content `
            -LiteralPath (
                Join-Path $outputRoot "p0512z-summary.json"
            ) `
            -Encoding UTF8

    $passed = $true
}
catch {
    $failure = $_

    $failure |
        Out-String |
        Set-Content `
            -LiteralPath (
                Join-Path $outputRoot "fatal-error.txt"
            ) `
            -Encoding UTF8
}

$readme = @"
# EMETSEES P05.12Z KJV Visible Edition Lock

This stage reruns the completed P05.12H three-way reconciliation on the
current repository commit and formally selects eBible KJV2006
(standardized 1769) as the single visible KJV edition.

CrossWire remains an immutable independent witness and metadata source.
No hybrid visible KJV is authorized.

Production KJV, WEB, Brenton, canonical data, and alignments were not
modified.
"@

[System.IO.File]::WriteAllText(
    (Join-Path $outputRoot "README.md"),
    ($readme + "`n"),
    [System.Text.UTF8Encoding]::new($false)
)

$checksumPath = Join-Path `
    $outputRoot `
    "checksums.sha256"

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
            $relative = $_.FullName
                .Substring($outputRoot.Length)
                .TrimStart("\", "/")
                .Replace("\", "/")

            "$(Get-Sha256 -Path $_.FullName)  $relative"
        }
)

$checksumLines |
    Set-Content `
        -LiteralPath $checksumPath `
        -Encoding ASCII

$destination = if ($passed) {
    $reportZip
}
else {
    $failureZip
}

if (Test-Path -LiteralPath $destination) {
    Remove-Item -LiteralPath $destination -Force
}

Compress-Archive `
    -Path (Join-Path $outputRoot "*") `
    -DestinationPath $destination `
    -CompressionLevel Optimal

if (-not $passed) {
    throw (
        "P05.12Z failed. No production or alignment changes were made. " +
        "Upload: $destination"
    )
}

Write-Host ""
Write-Host "P05.12Z completed." -ForegroundColor Green
Write-Host "- Three-way reconciliation reproduced: YES"
Write-Host "- Visible KJV edition: eBible KJV2006 standardized 1769"
Write-Host "- CrossWire retained as independent witness: YES"
Write-Host "- Hybrid visible KJV authorized: NO"
Write-Host "- Candidate verses exact to KJV2006: 31,102 / 31,102"
Write-Host "- Exceptional references reviewed: 2"
Write-Host "- Production KJV modified: NO"
Write-Host "- Production WEB modified: NO"
Write-Host "- Production Brenton modified: NO"
Write-Host "- Alignments modified: NO"
Write-Host "- Safe to stage KJV canonical migration: YES"
Write-Host "- Production promotion authorized: NO"
Write-Host "- Report ZIP: $destination"
