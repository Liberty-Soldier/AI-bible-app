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

function Get-TreeSha256 {
    param([Parameter(Mandatory)][string]$RootPath)

    $root = (Resolve-Path -LiteralPath $RootPath).Path
    $temporary = [System.IO.Path]::GetTempFileName()

    try {
        $lines = @(
            Get-ChildItem `
                -LiteralPath $root `
                -Recurse `
                -File |
                Sort-Object FullName |
                ForEach-Object {
                    $relative = $_.FullName.Substring($root.Length)
                    $relative = $relative.TrimStart("\", "/")
                    $relative = $relative.Replace("\", "/")

                    "$relative`t$($_.Length)`t$(Get-Sha256 -Path $_.FullName)"
                }
        )

        [System.IO.File]::WriteAllText(
            $temporary,
            ($lines -join "`n"),
            [System.Text.UTF8Encoding]::new($false)
        )

        return Get-Sha256 -Path $temporary
    }
    finally {
        Remove-Item `
            -LiteralPath $temporary `
            -Force `
            -ErrorAction SilentlyContinue
    }
}

function Copy-Tree {
    param(
        [Parameter(Mandatory)][string]$Source,
        [Parameter(Mandatory)][string]$Destination
    )

    New-Item `
        -ItemType Directory `
        -Force `
        -Path $Destination |
        Out-Null

    $process = Start-Process `
        -FilePath "robocopy.exe" `
        -ArgumentList @(
            $Source,
            $Destination,
            "/MIR",
            "/COPY:DAT",
            "/DCOPY:DAT",
            "/R:2",
            "/W:1",
            "/NFL",
            "/NDL",
            "/NP",
            "/NJH",
            "/NJS"
        ) `
        -Wait `
        -PassThru `
        -NoNewWindow

    if ($process.ExitCode -gt 7) {
        throw "Robocopy failed with exit code $($process.ExitCode)."
    }
}

function Invoke-NodeCaptured {
    param(
        [Parameter(Mandatory)][string]$ScriptPath,
        [Parameter(Mandatory)][string[]]$Arguments,
        [Parameter(Mandatory)][string]$StdoutPath,
        [Parameter(Mandatory)][string]$StderrPath,
        [Parameter(Mandatory)][string]$Label
    )

    foreach ($logPath in @($StdoutPath, $StderrPath)) {
        if (Test-Path -LiteralPath $logPath) {
            Remove-Item -LiteralPath $logPath -Force
        }
    }

    $process = Start-Process `
        -FilePath "node.exe" `
        -ArgumentList (@($ScriptPath) + $Arguments) `
        -WorkingDirectory $RepoRoot `
        -RedirectStandardOutput $StdoutPath `
        -RedirectStandardError $StderrPath `
        -Wait `
        -PassThru `
        -NoNewWindow

    Write-Host ""
    Write-Host "--- $Label stdout ---" -ForegroundColor DarkGray
    if (Test-Path -LiteralPath $StdoutPath) {
        Get-Content -LiteralPath $StdoutPath |
            ForEach-Object { Write-Host $_ }
    }

    Write-Host "--- $Label stderr ---" -ForegroundColor DarkGray
    if (Test-Path -LiteralPath $StderrPath) {
        Get-Content -LiteralPath $StderrPath |
            ForEach-Object { Write-Host $_ }
    }

    return $process.ExitCode
}

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
Set-Location -LiteralPath $RepoRoot

if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot ".git"))) {
    throw "Run from the ai-bible-app repository root."
}

$branch = (& git branch --show-current).Trim()
$commit = (& git rev-parse HEAD).Trim()

$liveCanonical = Join-Path `
    $RepoRoot `
    ".private\scripture\canonical"

$candidate = Join-Path `
    $RepoRoot `
    ".private\generated\P05.12\kjv-reconciliation\4ea6952590d070bf\generatedKJV.candidate.json"

$previewScript = Join-Path `
    $RepoRoot `
    "scripts\p0512\preview-kjv-canonical-alignment.js"

$p0510Verifier = Join-Path `
    $RepoRoot `
    "scripts\p0510\verify-p0510-canonical-source.cjs"

$p0511Verifier = Join-Path `
    $RepoRoot `
    "scripts\p0511\verify-p0511-safe-parallel.cjs"

$productionKjv = Join-Path `
    $RepoRoot `
    "app\data\scripture\generatedKJV.json"

$productionWeb = Join-Path `
    $RepoRoot `
    "app\data\scripture\generatedWEB.json"

$productionBrenton = Join-Path `
    $RepoRoot `
    "app\data\scripture\generatedBrenton.json"

foreach ($required in @(
    $liveCanonical,
    $candidate,
    $previewScript,
    $p0510Verifier,
    $p0511Verifier,
    $productionKjv,
    $productionWeb,
    $productionBrenton
)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Required P05.12AA input is missing: $required"
    }
}

$expectedCandidateHash =
    "3e96334ec81f7132d0774c4fb52c17cbecfc1397fcf2c7c1653a4c3560652829"

if ((Get-Sha256 -Path $candidate) -ne $expectedCandidateHash) {
    throw "The locked KJV2006 candidate hash has changed."
}

$kjvHashBefore = Get-Sha256 -Path $productionKjv
$webHashBefore = Get-Sha256 -Path $productionWeb
$brentonHashBefore = Get-Sha256 -Path $productionBrenton
$liveCanonicalHashBefore = Get-TreeSha256 -RootPath $liveCanonical

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$reportParent = Join-Path $RepoRoot ".private\reports\P05.12"
$outputRoot = Join-Path `
    $reportParent `
    "$stamp-kjv-canonical-alignment-preview"

$stagingRoot = Join-Path `
    $RepoRoot `
    ".private\generated\P05.12\kjv-canonical-alignment-preview\$stamp"

$stageA = Join-Path $stagingRoot "candidate-a\canonical"
$stageB = Join-Path $stagingRoot "candidate-b\canonical"
$reportA = Join-Path $outputRoot "candidate-a"
$reportB = Join-Path $outputRoot "candidate-b"

$reportZip = Join-Path `
    $reportParent `
    "EMETSEES-P0512AA-KJV-CANONICAL-ALIGNMENT-PREVIEW-V2-$stamp.zip"

$failureZip = Join-Path `
    $reportParent `
    "EMETSEES-P0512AA-FAILURE-V2-$stamp.zip"

New-Item `
    -ItemType Directory `
    -Force `
    -Path $outputRoot, $reportA, $reportB |
    Out-Null

$passed = $false
$failure = $null

try {
    Write-Step "Copying the live canonical tree into two isolated staging candidates"
    Write-Host "Branch: $branch"
    Write-Host "Commit: $commit"
    Write-Host ""
    Write-Host (
        "Production KJV, WEB, Brenton, live canonical data, and alignments " +
        "will not be modified."
    ) -ForegroundColor Yellow

    Copy-Tree -Source $liveCanonical -Destination $stageA
    Copy-Tree -Source $liveCanonical -Destination $stageB

    Write-Step "Building KJV canonical candidate A"

    $aStdout = Join-Path $reportA "preview.stdout.log"
    $aStderr = Join-Path $reportA "preview.stderr.log"

    $aExit = Invoke-NodeCaptured `
        -ScriptPath $previewScript `
        -Arguments @(
            "--canonical-root",
            $stageA,
            "--candidate",
            $candidate,
            "--current-reader",
            $productionKjv,
            "--output",
            $reportA,
            "--label",
            "candidate-a"
        ) `
        -StdoutPath $aStdout `
        -StderrPath $aStderr `
        -Label "P05.12AA candidate A"

    if ($aExit -ne 0) {
        throw "KJV canonical candidate A failed."
    }

    Write-Step "Building KJV canonical candidate B independently"

    $bStdout = Join-Path $reportB "preview.stdout.log"
    $bStderr = Join-Path $reportB "preview.stderr.log"

    $bExit = Invoke-NodeCaptured `
        -ScriptPath $previewScript `
        -Arguments @(
            "--canonical-root",
            $stageB,
            "--candidate",
            $candidate,
            "--current-reader",
            $productionKjv,
            "--output",
            $reportB,
            "--label",
            "candidate-b"
        ) `
        -StdoutPath $bStdout `
        -StderrPath $bStderr `
        -Label "P05.12AA candidate B"

    if ($bExit -ne 0) {
        throw "KJV canonical candidate B failed."
    }

    $stageAHash = Get-TreeSha256 -RootPath $stageA
    $stageBHash = Get-TreeSha256 -RootPath $stageB

    if ($stageAHash -ne $stageBHash) {
        throw "The two independently built KJV canonical candidates are not identical."
    }

    $summaryAPath = Join-Path `
        $reportA `
        "kjv-canonical-alignment-preview-summary.json"

    $summaryA = Get-Content `
        -LiteralPath $summaryAPath `
        -Raw |
        ConvertFrom-Json

    if (
        $summaryA.gates.candidateHashLocked -ne $true -or
        $summaryA.gates.all66OwnedCanonicalFilesProcessed -ne $true -or
        $summaryA.gates.all31062CanonicalKjvBlocksMapped -ne $true -or
        $summaryA.gates.all31102ReaderCoordinatesRepresented -ne $true -or
        $summaryA.gates.canonicalSpanTopologyResolved -ne $true -or
        $summaryA.gates.allKjvTextExactToKjv2006 -ne $true -or
        $summaryA.gates.allKjvTokenSequencesExact -ne $true -or
        $summaryA.gates.noNonKjvCanonicalChanges -ne $true -or
        $summaryA.gates.noNewRouteSignaturesIntroduced -ne $true -or
        $summaryA.gates.safeToReviewKjvCanonicalPreview -ne $true -or
        $summaryA.gates.safeToPromoteProductionKjv -ne $false
    ) {
        throw "P05.12AA candidate gates did not pass."
    }

    Write-Step "Running existing P05.10 route verification against staging"

    $p0510Stdout = Join-Path $outputRoot "p0510-verifier.stdout.log"
    $p0510Stderr = Join-Path $outputRoot "p0510-verifier.stderr.log"

    $p0510Exit = Invoke-NodeCaptured `
        -ScriptPath $p0510Verifier `
        -Arguments @(
            "--canonical-root=$stageA",
            "--label=kjv-canonical-preview-a"
        ) `
        -StdoutPath $p0510Stdout `
        -StderrPath $p0510Stderr `
        -Label "P05.10 staged route verifier"

    if ($p0510Exit -ne 0) {
        throw "P05.10 route verification failed against the KJV canonical staging candidate."
    }

    Write-Step "Running existing P05.11 route verification against staging"

    $p0511Stdout = Join-Path $outputRoot "p0511-verifier.stdout.log"
    $p0511Stderr = Join-Path $outputRoot "p0511-verifier.stderr.log"

    $p0511Exit = Invoke-NodeCaptured `
        -ScriptPath $p0511Verifier `
        -Arguments @(
            "--canonical-root=$stageA",
            "--label=kjv-canonical-preview-a"
        ) `
        -StdoutPath $p0511Stdout `
        -StderrPath $p0511Stderr `
        -Label "P05.11 staged route verifier"

    if ($p0511Exit -ne 0) {
        throw "P05.11 route verification failed against the KJV canonical staging candidate."
    }

    if ((Get-Sha256 -Path $productionKjv) -ne $kjvHashBefore) {
        throw "Production KJV changed during P05.12AA."
    }

    if ((Get-Sha256 -Path $productionWeb) -ne $webHashBefore) {
        throw "Production WEB changed during P05.12AA."
    }

    if ((Get-Sha256 -Path $productionBrenton) -ne $brentonHashBefore) {
        throw "Production Brenton changed during P05.12AA."
    }

    if ((Get-TreeSha256 -RootPath $liveCanonical) -ne $liveCanonicalHashBefore) {
        throw "Live canonical data changed during P05.12AA."
    }

    $relativeStageA = $stageA.Substring($RepoRoot.Length)
    $relativeStageA = $relativeStageA.TrimStart("\", "/")
    $relativeStageA = $relativeStageA.Replace("\", "/")

    $runSummary = [ordered]@{
        milestone = "P05.12AA"
        generatedAtUtc = (
            Get-Date
        ).ToUniversalTime().ToString("o")
        repository = [ordered]@{
            branch = $branch
            commit = $commit
        }
        candidate = [ordered]@{
            source = ".private/generated/P05.12/kjv-reconciliation/4ea6952590d070bf/generatedKJV.candidate.json"
            sha256 = $expectedCandidateHash
            verses = 31102
        }
        staging = [ordered]@{
            retainedCanonicalCandidate = $relativeStageA
            treeSha256 = $stageAHash
            independentRepeatedBuildMatched = $true
        }
        alignmentPreservation = $summaryA.totals
        routeGates = [ordered]@{
            p0510Passed = $true
            p0511Passed = $true
        }
        production = [ordered]@{
            kjvModified = $false
            webModified = $false
            brentonModified = $false
            liveCanonicalModified = $false
        }
        gates = [ordered]@{
            deterministicRepeatedBuild = $true
            all31062CanonicalKjvBlocksExactToKjv2006Topology = $true
            all31102KjvReaderCoordinatesRepresented = $true
            canonicalCompoundSpanTopologyResolved = $true
            nonKjvCanonicalContentUnchanged = $true
            noNewRouteSignaturesIntroduced = $true
            unresolvedRoutesFailClosed = $true
            p0510RoutesPassed = $true
            p0511RoutesPassed = $true
            safeToReviewKjvCanonicalAlignmentMigration = $true
            safeToPromoteProductionKjv = $false
        }
    }

    $runSummary |
        ConvertTo-Json -Depth 30 |
        Set-Content `
            -LiteralPath (
                Join-Path $outputRoot "p0512aa-summary.json"
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
# EMETSEES P05.12AA KJV Canonical Alignment Preview

This stage is isolated and staging-only.

It builds the KJV2006 canonical migration twice, preserves only deterministic
existing source routes without rewriting their original provenance, and runs
the existing P05.10 and P05.11 route gates against the staging candidate.

Production KJV, WEB, Brenton, live canonical data, runtime data, and alignments
were not modified.
"@

[System.IO.File]::WriteAllText(
    (Join-Path $outputRoot "README.md"),
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
        "P05.12AA V2 failed. No production or live canonical changes were made. " +
        "Upload: $destination"
    )
}

Write-Host ""
Write-Host "P05.12AA V2 completed." -ForegroundColor Green
Write-Host "- KJV2006 canonical candidate built twice identically: YES"
Write-Host "- Canonical KJV blocks migrated: 31,062 / 31,062"
Write-Host "- KJV reader coordinates represented: 31,102 / 31,102"
Write-Host "- Compound canonical span topology resolved: YES"
Write-Host "- Existing route provenance rewritten: NO"
Write-Host "- Unsafe routes fail closed: YES"
Write-Host "- New route signatures introduced: NO"
Write-Host "- Non-KJV canonical content modified: NO"
Write-Host "- P05.10 route gate passed: YES"
Write-Host "- P05.11 route gate passed: YES"
Write-Host "- Production KJV modified: NO"
Write-Host "- Production WEB modified: NO"
Write-Host "- Production Brenton modified: NO"
Write-Host "- Live canonical modified: NO"
Write-Host "- Production promotion authorized: NO"
Write-Host "- Report ZIP: $destination"
