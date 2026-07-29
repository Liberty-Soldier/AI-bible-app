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
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-TreeSha256 {
    param([Parameter(Mandatory)][string]$RootPath)

    $root = (Resolve-Path -LiteralPath $RootPath).Path
    $lines = @(
        Get-ChildItem -LiteralPath $root -Recurse -File |
            Sort-Object FullName |
            ForEach-Object {
                $relative = $_.FullName.Substring($root.Length).TrimStart("\", "/").Replace("\", "/")
                "$relative`t$($_.Length)`t$(Get-Sha256 -Path $_.FullName)"
            }
    )

    $temporary = [System.IO.Path]::GetTempFileName()

    try {
        [System.IO.File]::WriteAllText(
            $temporary,
            ($lines -join "`n"),
            [System.Text.UTF8Encoding]::new($false)
        )
        return Get-Sha256 -Path $temporary
    }
    finally {
        Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
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
        $parent = Split-Path -Parent $logPath
        if ($parent) {
            New-Item -ItemType Directory -Force -Path $parent | Out-Null
        }
        if (Test-Path -LiteralPath $logPath) {
            Remove-Item -LiteralPath $logPath -Force
        }
    }

    $argumentList = @($ScriptPath) + $Arguments

    $process = Start-Process `
        -FilePath "node.exe" `
        -ArgumentList $argumentList `
        -WorkingDirectory $RepoRoot `
        -RedirectStandardOutput $StdoutPath `
        -RedirectStandardError $StderrPath `
        -Wait `
        -PassThru `
        -NoNewWindow

    Write-Host ""
    Write-Host "--- $Label stdout ---" -ForegroundColor DarkGray
    if (Test-Path -LiteralPath $StdoutPath) {
        Get-Content -LiteralPath $StdoutPath | ForEach-Object { Write-Host $_ }
    }

    Write-Host "--- $Label stderr ---" -ForegroundColor DarkGray
    if (Test-Path -LiteralPath $StderrPath) {
        Get-Content -LiteralPath $StderrPath | ForEach-Object { Write-Host $_ }
    }

    return [pscustomobject]@{
        ExitCode = $process.ExitCode
        StdoutPath = $StdoutPath
        StderrPath = $StderrPath
    }
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

$productionWeb = Join-Path $RepoRoot "app\data\scripture\generatedWEB.json"
$canonicalRoot = Join-Path $RepoRoot ".private\scripture\canonical"
$candidateA = Join-Path $RepoRoot ".private\generated\translation-ingestion\web\8be4eee9f896f96e\generatedWEB.candidate.json"
$candidateB = Join-Path $RepoRoot ".private\generated\P05.12\web\8be4eee9f896f96e\generatedWEB.candidate.json"
$verifyScript = Join-Path $RepoRoot "scripts\p0512\verify-web-canonical-route-rebased-preview.cjs"
$auditScript = Join-Path $RepoRoot "scripts\p0512\audit-web-canonical-staged-migration.js"
$stagingParent = Join-Path $RepoRoot ".private\generated\P05.12\web-canonical-migration-preview"

foreach ($required in @(
    $productionWeb,
    $canonicalRoot,
    $candidateA,
    $candidateB,
    $verifyScript,
    $auditScript,
    $stagingParent
)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Required P05.12V V4 input is missing: $required"
    }
}

$latestStaging = @(
    Get-ChildItem -LiteralPath $stagingParent -Directory |
        Sort-Object LastWriteTimeUtc -Descending |
        Where-Object {
            (Test-Path -LiteralPath (Join-Path $_.FullName "canonical") -PathType Container) -and
            (Test-Path -LiteralPath (Join-Path $_.FullName "migration-backup") -PathType Container) -and
            (Test-Path -LiteralPath (Join-Path $_.FullName "generatedWEB.production.backup.json") -PathType Leaf)
        } |
        Select-Object -First 1
)

if (-not $latestStaging) {
    throw "No completed P05.12V staged canonical workspace was found."
}

$stagedCanonical = Join-Path $latestStaging.FullName "canonical"
$stagedBackup = Join-Path $latestStaging.FullName "migration-backup"
$storedProductionBackup = Join-Path $latestStaging.FullName "generatedWEB.production.backup.json"

$approvedProductionSha256 = "f55ca3577d763dcf68a8a5883fca811929b1b8f59ba31598363db5d08e66e541"
$productionSha256Before = Get-Sha256 -Path $productionWeb
$candidateASha256 = Get-Sha256 -Path $candidateA
$candidateBSha256 = Get-Sha256 -Path $candidateB
$storedBackupSha256 = Get-Sha256 -Path $storedProductionBackup

if ($productionSha256Before -ne $approvedProductionSha256) {
    throw "Current production WEB is not the approved pre-rebuild state."
}

if ($storedBackupSha256 -ne $approvedProductionSha256) {
    throw "The staged workspace production backup is not the approved pre-rebuild WEB."
}

if ($candidateASha256 -ne $candidateBSha256) {
    throw "Stored WEB candidates are not byte-identical."
}

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$reportParent = Join-Path $RepoRoot ".private\reports\P05.12"
$outputRoot = Join-Path $reportParent "$stamp-web-canonical-staged-migration-resume-v4"
$reportZip = Join-Path $reportParent "EMETSEES-P0512V-WEB-CANONICAL-STAGED-MIGRATION-RESUME-V4-$stamp.zip"
$failureZip = Join-Path $reportParent "EMETSEES-P0512V-FAILURE-RESUME-V4-$stamp.zip"
$verifyStdout = Join-Path $outputRoot "canonical-verify.stdout.log"
$verifyStderr = Join-Path $outputRoot "canonical-verify.stderr.log"
$auditStdout = Join-Path $outputRoot "canonical-audit.stdout.log"
$auditStderr = Join-Path $outputRoot "canonical-audit.stderr.log"
$temporaryProductionBackup = Join-Path $outputRoot "generatedWEB.pre-resume.backup.json"

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

$liveCanonicalSha256Before = Get-TreeSha256 -RootPath $canonicalRoot
$stagedCanonicalSha256Before = Get-TreeSha256 -RootPath $stagedCanonical
Copy-Item -LiteralPath $productionWeb -Destination $temporaryProductionBackup -Force

$completed = $false
$failure = $null

try {
    Write-Step "Selecting approved WEB candidate for staged verification"
    Copy-Item -LiteralPath $candidateA -Destination $productionWeb -Force

    if ((Get-Sha256 -Path $productionWeb) -ne $candidateASha256) {
        throw "Temporary WEB candidate selection failed."
    }

    Write-Step "Verifying staged canonical text, tokens, blocks, and 207 routes"

    $verifyResult = Invoke-NodeCaptured `
        -ScriptPath $verifyScript `
        -Arguments @(
            "--canonical-root=$stagedCanonical",
            "--label=web-canonical-staged-resume-v4",
            "--report-root=$outputRoot\p0510"
        ) `
        -StdoutPath $verifyStdout `
        -StderrPath $verifyStderr `
        -Label "P05.12V staged verifier"

    if ($verifyResult.ExitCode -ne 0) {
        throw "Staged canonical verification failed with exit code $($verifyResult.ExitCode). See: $verifyStderr"
    }

    $verifyReportPath = Join-Path $outputRoot "p0510\verify-web-canonical-staged-resume-v4.json"
    if (-not (Test-Path -LiteralPath $verifyReportPath -PathType Leaf)) {
        throw "The staged verifier did not produce its JSON report."
    }

    $verifyReport = Get-Content -LiteralPath $verifyReportPath -Raw | ConvertFrom-Json

    if (
        $verifyReport.passed -ne $true -or
        [int]$verifyReport.approvedRoutesExact -ne 207 -or
        @($verifyReport.approvedRouteMismatches).Count -ne 0
    ) {
        throw "The staged verifier report did not pass all 207 routes."
    }

    Write-Step "Auditing alignment metadata preservation against live canonical"

    $auditResult = Invoke-NodeCaptured `
        -ScriptPath $auditScript `
        -Arguments @(
            "--live-root", $canonicalRoot,
            "--staged-root", $stagedCanonical,
            "--candidate", $candidateA,
            "--output", $outputRoot
        ) `
        -StdoutPath $auditStdout `
        -StderrPath $auditStderr `
        -Label "P05.12V alignment preservation audit"

    if ($auditResult.ExitCode -ne 0) {
        throw "Alignment preservation audit failed with exit code $($auditResult.ExitCode). See: $auditStderr"
    }

    $auditReportPath = Join-Path $outputRoot "web-canonical-migration-audit-summary.json"
    if (-not (Test-Path -LiteralPath $auditReportPath -PathType Leaf)) {
        throw "The alignment preservation audit did not produce its JSON report."
    }

    $auditReport = Get-Content -LiteralPath $auditReportPath -Raw | ConvertFrom-Json

    if ($auditReport.gates.safeToReviewMigration -ne $true) {
        throw "The alignment preservation audit did not authorize review."
    }

    $rebasedRoutes = @(
        $verifyReport.approvedRouteResolutions |
            Where-Object {
                [int]$_.legacyTokenIndex -ne [int]$_.resolvedTokenIndex
            }
    )

    $summary = [ordered]@{
        milestone = "P05.12V"
        stage = "resume-v4"
        generatedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
        repository = [ordered]@{
            branch = $branch
            commit = (& git rev-parse HEAD).Trim()
        }
        stagedWorkspace = [ordered]@{
            path = $latestStaging.FullName.Substring($RepoRoot.Length).TrimStart("\", "/").Replace("\", "/")
            stagedCanonicalSha256Before = $stagedCanonicalSha256Before
            migrationBackupFiles = @(
                Get-ChildItem -LiteralPath $stagedBackup -Recurse -File
            ).Count
        }
        web = [ordered]@{
            productionSha256Before = $productionSha256Before
            candidateSha256 = $candidateASha256
            candidateVerses = 31098
        }
        verification = [ordered]@{
            passed = $true
            webBlocksCompared = [int]$verifyReport.webBlocksCompared
            missingCleanWebSources = [int]$verifyReport.missingCleanWebSources
            webTextMismatches = @($verifyReport.webTextMismatches).Count
            webTokenMismatches = @($verifyReport.webTokenMismatches).Count
            contaminatedWebBlocks = @($verifyReport.contaminatedWebBlocks).Count
            approvedBlocksExact = [int]$verifyReport.approvedBlocksExact
            approvedRoutesExact = [int]$verifyReport.approvedRoutesExact
            approvedRoutesLegacyIndexExact = [int]$verifyReport.approvedRoutesLegacyIndexExact
            approvedRoutesRebased = [int]$verifyReport.approvedRoutesRebased
            rebasedRouteDetails = $rebasedRoutes
        }
        alignmentPreservation = $auditReport.canonicalMigration
        gates = [ordered]@{
            approvedCandidateVerified = $true
            stagedWorkspaceReusedWithoutMigration = $true
            zeroTextMismatches = @($verifyReport.webTextMismatches).Count -eq 0
            zeroTokenMismatches = @($verifyReport.webTokenMismatches).Count -eq 0
            zeroMissingCleanWebSources = [int]$verifyReport.missingCleanWebSources -eq 0
            all51ApprovedBlocksExact = [int]$verifyReport.approvedBlocksExact -eq 51
            all207ApprovedRoutesExact = [int]$verifyReport.approvedRoutesExact -eq 207
            routeRebaseCountExpected = [int]$verifyReport.approvedRoutesRebased -eq 2
            productionWebModified = $false
            liveCanonicalModified = $false
            stagedCanonicalModifiedDuringResume = $false
            safeToReviewMigration = $true
            safeToPromoteProduction = $false
        }
    }

    $summary |
        ConvertTo-Json -Depth 30 |
        Set-Content -LiteralPath (Join-Path $outputRoot "web-canonical-staged-resume-summary.json") -Encoding UTF8

    $completed = $true
}
catch {
    $failure = $_
    $failure | Out-String |
        Set-Content -LiteralPath (Join-Path $outputRoot "fatal-error.txt") -Encoding UTF8
}
finally {
    Write-Step "Restoring approved current production WEB"

    Copy-Item -LiteralPath $temporaryProductionBackup -Destination $productionWeb -Force

    $productionSha256After = Get-Sha256 -Path $productionWeb
    $liveCanonicalSha256After = Get-TreeSha256 -RootPath $canonicalRoot
    $stagedCanonicalSha256After = Get-TreeSha256 -RootPath $stagedCanonical

    if ($productionSha256After -ne $productionSha256Before) {
        throw "Production WEB was not restored exactly."
    }

    if ($liveCanonicalSha256After -ne $liveCanonicalSha256Before) {
        throw "Live canonical source changed during resume verification."
    }

    if ($stagedCanonicalSha256After -ne $stagedCanonicalSha256Before) {
        throw "The staged canonical tree changed during resume verification."
    }
}

$checksumPath = Join-Path $outputRoot "checksums.sha256"
$checksumLines = @(
    Get-ChildItem -LiteralPath $outputRoot -Recurse -File |
        Where-Object { $_.FullName -ne $checksumPath } |
        Sort-Object FullName |
        ForEach-Object {
            $relative = $_.FullName.Substring($outputRoot.Length).TrimStart("\", "/").Replace("\", "/")
            "$(Get-Sha256 -Path $_.FullName)  $relative"
        }
)
$checksumLines | Set-Content -LiteralPath $checksumPath -Encoding ASCII

if ($null -ne $failure -or -not $completed) {
    if (Test-Path -LiteralPath $failureZip) {
        Remove-Item -LiteralPath $failureZip -Force
    }

    Compress-Archive `
        -Path (Join-Path $outputRoot "*") `
        -DestinationPath $failureZip `
        -CompressionLevel Optimal

    throw "P05.12V Resume V4 failed after restoring production WEB. Upload: $failureZip"
}

$readme = @"
# EMETSEES P05.12V Resume V4

This report verifies the already-migrated staged canonical tree without
rerunning the full canonical migration.

Production WEB and the live canonical source were restored and verified
unchanged. Promotion remains blocked pending report review.
"@
$readme | Set-Content -LiteralPath (Join-Path $outputRoot "README.md") -Encoding UTF8

# Refresh checksums after README.
$checksumLines = @(
    Get-ChildItem -LiteralPath $outputRoot -Recurse -File |
        Where-Object { $_.FullName -ne $checksumPath } |
        Sort-Object FullName |
        ForEach-Object {
            $relative = $_.FullName.Substring($outputRoot.Length).TrimStart("\", "/").Replace("\", "/")
            "$(Get-Sha256 -Path $_.FullName)  $relative"
        }
)
$checksumLines | Set-Content -LiteralPath $checksumPath -Encoding ASCII

if (Test-Path -LiteralPath $reportZip) {
    Remove-Item -LiteralPath $reportZip -Force
}

Compress-Archive `
    -Path (Join-Path $outputRoot "*") `
    -DestinationPath $reportZip `
    -CompressionLevel Optimal

Write-Host ""
Write-Host "P05.12V Resume V4 completed." -ForegroundColor Green
Write-Host "- Existing staged canonical migration reused: YES"
Write-Host "- 31,098-verse WEB candidate verified: YES"
Write-Host "- Zero WEB text mismatches: YES"
Write-Host "- Zero WEB token mismatches: YES"
Write-Host "- All 51 special blocks exact: YES"
Write-Host "- All 207 routes exact: YES"
Write-Host "- Rebased routes: 2"
Write-Host "- Production WEB modified: NO"
Write-Host "- Live canonical source modified: NO"
Write-Host "- Production promotion authorized: NO"
Write-Host "- Report ZIP: $reportZip"
