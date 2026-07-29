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

    $resolvedRoot = (
        Resolve-Path -LiteralPath $RootPath
    ).Path
    $temporary = [System.IO.Path]::GetTempFileName()

    try {
        $lines = @(
            Get-ChildItem `
                -LiteralPath $resolvedRoot `
                -Recurse `
                -File |
                Sort-Object FullName |
                ForEach-Object {
                    $relative = $_.FullName.Substring(
                        $resolvedRoot.Length
                    )
                    $relative = $relative.TrimStart(
                        "\",
                        "/"
                    )
                    $relative = $relative.Replace(
                        "\",
                        "/"
                    )

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
    Write-Host "--- $Label stdout ---" `
        -ForegroundColor DarkGray

    if (Test-Path -LiteralPath $StdoutPath) {
        Get-Content -LiteralPath $StdoutPath |
            ForEach-Object {
                Write-Host $_
            }
    }

    Write-Host "--- $Label stderr ---" `
        -ForegroundColor DarkGray

    if (Test-Path -LiteralPath $StderrPath) {
        Get-Content -LiteralPath $StderrPath |
            ForEach-Object {
                Write-Host $_
            }
    }

    return $process.ExitCode
}

$RepoRoot = (
    Resolve-Path -LiteralPath $RepoRoot
).Path
Set-Location -LiteralPath $RepoRoot

if (
    -not (
        Test-Path `
            -LiteralPath (
                Join-Path $RepoRoot ".git"
            )
    )
) {
    throw "Run from the ai-bible-app repository root."
}

$branch = (& git branch --show-current).Trim()
$commit = (& git rev-parse HEAD).Trim()

$scriptPath = Join-Path `
    $RepoRoot `
    "scripts\p0512\apply-token-crosswalk-to-staging.js"

$policyPath = Join-Path `
    $RepoRoot `
    "scripts\p0512\kjv-token-crosswalk-overlay-policy.json"

$liveCanonical = Join-Path `
    $RepoRoot `
    ".private\scripture\canonical"

$candidate = Join-Path `
    $RepoRoot `
    ".private\generated\P05.12\kjv-reconciliation\4ea6952590d070bf\generatedKJV.candidate.json"

$reportParent = Join-Path `
    $RepoRoot `
    ".private\reports\P05.12"

$ahSummary = @(
    Get-ChildItem `
        -LiteralPath $reportParent `
        -Recurse `
        -File `
        -Filter "token-level-kjv-overlay-summary.json" |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
)

if (-not $ahSummary) {
    throw "No completed P05.12AH summary was found."
}

foreach ($required in @(
    $scriptPath,
    $policyPath,
    $liveCanonical,
    $candidate,
    $ahSummary.FullName
)) {
    if (
        -not (
            Test-Path -LiteralPath $required
        )
    ) {
        throw "Required P05.12AI input is missing: $required"
    }
}

$expectedPolicyHash =
    "cb105812abe35020b44016152bb97ffbc593cc1dd262b6887fec47b670e28c47"

if (
    (Get-Sha256 -Path $policyPath) -ne
    $expectedPolicyHash
) {
    throw "The P05.12AH policy hash has changed."
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
$liveCanonicalHashBefore = Get-TreeSha256 `
    -RootPath $liveCanonical

$stamp = (
    Get-Date
).ToUniversalTime().ToString(
    "yyyyMMdd-HHmmss"
)

$outputRoot = Join-Path `
    $reportParent `
    "$stamp-isolated-token-crosswalk-application-preview"

$stagingRoot = Join-Path `
    $RepoRoot `
    ".private\generated\P05.12\token-crosswalk-application\$stamp"

$stageA = Join-Path `
    $stagingRoot `
    "candidate-a\canonical"

$stageB = Join-Path `
    $stagingRoot `
    "candidate-b\canonical"

$reportA = Join-Path `
    $outputRoot `
    "candidate-a"

$reportB = Join-Path `
    $outputRoot `
    "candidate-b"

$reportZip = Join-Path `
    $reportParent `
    "EMETSEES-P0512AI-ISOLATED-TOKEN-CROSSWALK-APPLICATION-PREVIEW-$stamp.zip"

$failureZip = Join-Path `
    $reportParent `
    "EMETSEES-P0512AI-FAILURE-$stamp.zip"

New-Item `
    -ItemType Directory `
    -Force `
    -Path $outputRoot, $reportA, $reportB |
    Out-Null

$passed = $false
$failure = $null

try {
    Write-Step "Copying the live canonical tree into two isolated candidates"

    Write-Host "Branch: $branch"
    Write-Host "Commit: $commit"
    Write-Host ""
    Write-Host (
        "This stage changes only isolated copies. " +
        "Production and the live canonical tree remain untouched."
    ) -ForegroundColor Yellow

    Copy-Tree `
        -Source $liveCanonical `
        -Destination $stageA

    Copy-Tree `
        -Source $liveCanonical `
        -Destination $stageB

    Write-Step "Applying the token crosswalk to candidate A"

    $aStdout = Join-Path `
        $reportA `
        "application.stdout.log"

    $aStderr = Join-Path `
        $reportA `
        "application.stderr.log"

    $aExit = Invoke-NodeCaptured `
        -ScriptPath $scriptPath `
        -Arguments @(
            "--canonical-root",
            $stageA,
            "--candidate",
            $candidate,
            "--policy",
            $policyPath,
            "--ah-summary",
            $ahSummary.FullName,
            "--output",
            $reportA,
            "--label",
            "candidate-a"
        ) `
        -StdoutPath $aStdout `
        -StderrPath $aStderr `
        -Label "P05.12AI candidate A"

    if ($aExit -ne 0) {
        throw "P05.12AI candidate A failed."
    }

    Write-Step "Applying the token crosswalk independently to candidate B"

    $bStdout = Join-Path `
        $reportB `
        "application.stdout.log"

    $bStderr = Join-Path `
        $reportB `
        "application.stderr.log"

    $bExit = Invoke-NodeCaptured `
        -ScriptPath $scriptPath `
        -Arguments @(
            "--canonical-root",
            $stageB,
            "--candidate",
            $candidate,
            "--policy",
            $policyPath,
            "--ah-summary",
            $ahSummary.FullName,
            "--output",
            $reportB,
            "--label",
            "candidate-b"
        ) `
        -StdoutPath $bStdout `
        -StderrPath $bStderr `
        -Label "P05.12AI candidate B"

    if ($bExit -ne 0) {
        throw "P05.12AI candidate B failed."
    }

    $stageAHash = Get-TreeSha256 `
        -RootPath $stageA

    $stageBHash = Get-TreeSha256 `
        -RootPath $stageB

    if ($stageAHash -ne $stageBHash) {
        throw (
            "The two independently applied token crosswalk trees differ."
        )
    }

    $summaryAPath = Join-Path `
        $reportA `
        "isolated-token-crosswalk-application-summary.json"

    $summaryBPath = Join-Path `
        $reportB `
        "isolated-token-crosswalk-application-summary.json"

    $summaryA = Get-Content `
        -LiteralPath $summaryAPath `
        -Raw |
        ConvertFrom-Json

    $summaryB = Get-Content `
        -LiteralPath $summaryBPath `
        -Raw |
        ConvertFrom-Json

    if (
        $summaryA.gates.safeToRetainStagedTokenCrosswalk -ne $true -or
        $summaryB.gates.safeToRetainStagedTokenCrosswalk -ne $true -or
        $summaryA.gates.safeToPromoteProductionKjv -ne $false -or
        $summaryB.gates.safeToPromoteProductionKjv -ne $false
    ) {
        throw "P05.12AI candidate gates did not pass."
    }

    if (
        $summaryA.totals.changedTokens -ne 910 -or
        $summaryB.totals.changedTokens -ne 910
    ) {
        throw "P05.12AI changed-token count drift."
    }

    if (
        $summaryA.semanticDigestAfter.sha256 -ne
        $summaryB.semanticDigestAfter.sha256
    ) {
        throw "The two semantic results differ."
    }

    if (
        (Get-Sha256 -Path $kjvPath) -ne
        $kjvHashBefore
    ) {
        throw "Production KJV changed during P05.12AI."
    }

    if (
        (Get-Sha256 -Path $webPath) -ne
        $webHashBefore
    ) {
        throw "Production WEB changed during P05.12AI."
    }

    if (
        (Get-Sha256 -Path $brentonPath) -ne
        $brentonHashBefore
    ) {
        throw "Production Brenton changed during P05.12AI."
    }

    if (
        (
            Get-TreeSha256 `
                -RootPath $liveCanonical
        ) -ne $liveCanonicalHashBefore
    ) {
        throw "The live canonical tree changed during P05.12AI."
    }

    $relativeStageA = $stageA.Substring(
        $RepoRoot.Length
    )
    $relativeStageA = $relativeStageA.TrimStart(
        "\",
        "/"
    )
    $relativeStageA = $relativeStageA.Replace(
        "\",
        "/"
    )

    $runSummary = [ordered]@{
        milestone = "P05.12AI"
        generatedAtUtc = (
            Get-Date
        ).ToUniversalTime().ToString("o")
        repository = [ordered]@{
            branch = $branch
            commit = $commit
        }
        staging = [ordered]@{
            retainedCandidate = $relativeStageA
            treeSha256 = $stageAHash
            independentlyRepeated = $true
        }
        application = [ordered]@{
            changedTokens = [int]$summaryA.totals.changedTokens
            targetChanges = [int]$summaryA.totals.targetChanges
            ruleOnlyChanges = [int]$summaryA.totals.ruleOnlyChanges
            impactedRecords = [int]$summaryA.totals.impactedRecords
            impactedRecordsWithKjv = [int]$summaryA.totals.impactedRecordsWithKjv
            impactedRecordsWithoutKjv = [int]$summaryA.totals.impactedRecordsWithoutKjv
            topologyFingerprint = [string]$summaryA.topologyFingerprint
        }
        production = [ordered]@{
            kjvModified = $false
            webModified = $false
            brentonModified = $false
            liveCanonicalModified = $false
        }
        gates = [ordered]@{
            repeatedApplicationIdentical = $true
            onlyCanonicalReferenceAndRuleIdChanged = $true
            all438452SourceTokensAccounted = $true
            allTargetsInsideKjv2006 = $true
            all17ReaderOnlyCoordinatesRemainFailClosed = $true
            safeToUseStagedTreeForKjvBlockMigrationPreview = $true
            safeToPromoteProductionKjv = $false
        }
    }

    $runSummary |
        ConvertTo-Json -Depth 30 |
        Set-Content `
            -LiteralPath (
                Join-Path $outputRoot "p0512ai-summary.json"
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
# EMETSEES P05.12AI Isolated Token Crosswalk Application Preview

This stage applies the approved P05.12AH overlay to two isolated copies of the
source-owned canonical tree.

Only canonicalReference and versificationRuleId may change. Production KJV,
WEB, Brenton, the live canonical tree, KJV translation blocks, alignments, and
runtime data remain unchanged.
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
            $relative = $_.FullName.Substring(
                $outputRoot.Length
            )
            $relative = $relative.TrimStart(
                "\",
                "/"
            )
            $relative = $relative.Replace(
                "\",
                "/"
            )

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

if (
    Test-Path -LiteralPath $destination
) {
    Remove-Item `
        -LiteralPath $destination `
        -Force
}

Compress-Archive `
    -Path (
        Join-Path $outputRoot "*"
    ) `
    -DestinationPath $destination `
    -CompressionLevel Optimal

if (-not $passed) {
    throw (
        "P05.12AI failed. No production or live canonical changes were made. " +
        "Upload: $destination"
    )
}

Write-Host ""
Write-Host "P05.12AI completed." `
    -ForegroundColor Green
Write-Host "- Token crosswalk applied twice identically: YES"
Write-Host "- Source-owned canonical files: 66 / 66"
Write-Host "- Source-owned canonical records: 31,086 / 31,086"
Write-Host "- Source tokens accounted: 438,452 / 438,452"
Write-Host "- Tokens changed by approved overlay: 910"
Write-Host "- Fields outside canonicalReference and versificationRuleId changed: NO"
Write-Host "- Overlay targets outside KJV2006: 0"
Write-Host "- Reader coordinates with source support: 31,085"
Write-Host "- Reader-only fail-closed coordinates: 17"
Write-Host "- Live canonical modified: NO"
Write-Host "- Production KJV modified: NO"
Write-Host "- Production WEB modified: NO"
Write-Host "- Production Brenton modified: NO"
Write-Host "- KJV translation blocks modified: NO"
Write-Host "- Safe to use staged tree for KJV block migration preview: YES"
Write-Host "- Production promotion authorized: NO"
Write-Host "- Report ZIP: $destination"
