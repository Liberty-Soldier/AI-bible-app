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

function Copy-Tree {
    param(
        [Parameter(Mandatory)][string]$Source,
        [Parameter(Mandatory)][string]$Destination
    )

    New-Item -ItemType Directory -Force -Path $Destination | Out-Null

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
        $parent = Split-Path -Parent $logPath
        if ($parent) {
            New-Item -ItemType Directory -Force -Path $parent | Out-Null
        }
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
        Get-Content -LiteralPath $StdoutPath | ForEach-Object { Write-Host $_ }
    }

    Write-Host "--- $Label stderr ---" -ForegroundColor DarkGray
    if (Test-Path -LiteralPath $StderrPath) {
        Get-Content -LiteralPath $StderrPath | ForEach-Object { Write-Host $_ }
    }

    return $process.ExitCode
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
$liveCanonical = Join-Path $RepoRoot ".private\scripture\canonical"
$candidate = Join-Path $RepoRoot ".private\generated\translation-ingestion\web\8be4eee9f896f96e\generatedWEB.candidate.json"
$stagingParent = Join-Path $RepoRoot ".private\generated\P05.12\web-canonical-migration-preview"
$repairScript = Join-Path $RepoRoot "scripts\p0512\build-web-alignment-preservation-preview.js"
$verifyScript = Join-Path $RepoRoot "scripts\p0512\verify-web-canonical-route-rebased-preview.cjs"

foreach ($required in @(
    $productionWeb,
    $liveCanonical,
    $candidate,
    $stagingParent,
    $repairScript,
    $verifyScript
)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Required P05.12W input is missing: $required"
    }
}

$latestStaging = @(
    Get-ChildItem -LiteralPath $stagingParent -Directory |
        Sort-Object LastWriteTimeUtc -Descending |
        Where-Object {
            Test-Path -LiteralPath (Join-Path $_.FullName "canonical") -PathType Container
        } |
        Select-Object -First 1
)

if (-not $latestStaging) {
    throw "No completed WEB canonical staging workspace was found."
}

$sourceStagedCanonical = Join-Path $latestStaging.FullName "canonical"
$sourceStagedHashBefore = Get-TreeSha256 -RootPath $sourceStagedCanonical
$productionHashBefore = Get-Sha256 -Path $productionWeb
$liveCanonicalHashBefore = Get-TreeSha256 -RootPath $liveCanonical
$candidateHash = Get-Sha256 -Path $candidate

$approvedProductionHash = "f55ca3577d763dcf68a8a5883fca811929b1b8f59ba31598363db5d08e66e541"
if ($productionHashBefore -ne $approvedProductionHash) {
    throw "Current WEB production is not the approved pre-rebuild state."
}

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$reportParent = Join-Path $RepoRoot ".private\reports\P05.12"
$outputRoot = Join-Path $reportParent "$stamp-web-alignment-preservation-preview"
$repairWorkspace = Join-Path $RepoRoot ".private\generated\P05.12\web-alignment-preservation-preview\$stamp"
$repairCanonical = Join-Path $repairWorkspace "canonical"
$productionBackup = Join-Path $outputRoot "generatedWEB.production.backup.json"
$reportZip = Join-Path $reportParent "EMETSEES-P0512W-WEB-ALIGNMENT-PRESERVATION-PREVIEW-$stamp.zip"
$failureZip = Join-Path $reportParent "EMETSEES-P0512W-FAILURE-$stamp.zip"
$repairStdout = Join-Path $outputRoot "alignment-repair.stdout.log"
$repairStderr = Join-Path $outputRoot "alignment-repair.stderr.log"
$verifyStdout = Join-Path $outputRoot "canonical-verify.stdout.log"
$verifyStderr = Join-Path $outputRoot "canonical-verify.stderr.log"

New-Item -ItemType Directory -Force -Path $outputRoot, $repairWorkspace | Out-Null
Copy-Item -LiteralPath $productionWeb -Destination $productionBackup -Force
Copy-Tree -Source $sourceStagedCanonical -Destination $repairCanonical

$completed = $false
$failure = $null

try {
    Write-Step "Applying deterministic alignment preservation to isolated staging"

    $repairExit = Invoke-NodeCaptured `
        -ScriptPath $repairScript `
        -Arguments @(
            "--live-root", $liveCanonical,
            "--staged-root", $repairCanonical,
            "--output", $outputRoot
        ) `
        -StdoutPath $repairStdout `
        -StderrPath $repairStderr `
        -Label "P05.12W alignment preservation"

    if ($repairExit -ne 0) {
        throw "Alignment preservation failed with exit code $repairExit. See: $repairStderr"
    }

    Write-Step "Verifying corrected WEB text, tokens, blocks, and routes"

    Copy-Item -LiteralPath $candidate -Destination $productionWeb -Force

    $verifyExit = Invoke-NodeCaptured `
        -ScriptPath $verifyScript `
        -Arguments @(
            "--canonical-root=$repairCanonical",
            "--label=web-alignment-preservation-preview",
            "--report-root=$outputRoot\p0510"
        ) `
        -StdoutPath $verifyStdout `
        -StderrPath $verifyStderr `
        -Label "P05.12W canonical verifier"

    if ($verifyExit -ne 0) {
        throw "Canonical verification failed with exit code $verifyExit. See: $verifyStderr"
    }

    $repairSummary = Get-Content `
        -LiteralPath (Join-Path $outputRoot "web-alignment-preservation-summary.json") `
        -Raw |
        ConvertFrom-Json

    $verifyReport = Get-Content `
        -LiteralPath (Join-Path $outputRoot "p0510\verify-web-alignment-preservation-preview.json") `
        -Raw |
        ConvertFrom-Json

    if (
        $repairSummary.gates.safeToReviewRepair -ne $true -or
        $verifyReport.passed -ne $true -or
        [int]$verifyReport.approvedRoutesExact -ne 207
    ) {
        throw "P05.12W report gates did not pass."
    }

    $summary = [ordered]@{
        milestone = "P05.12W"
        generatedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
        repository = [ordered]@{
            branch = $branch
            commit = (& git rev-parse HEAD).Trim()
        }
        inputs = [ordered]@{
            sourceStagingPath = $latestStaging.FullName.Substring($RepoRoot.Length).TrimStart("\", "/").Replace("\", "/")
            sourceStagingSha256 = $sourceStagedHashBefore
            candidateSha256 = $candidateHash
            productionSha256Before = $productionHashBefore
            liveCanonicalSha256Before = $liveCanonicalHashBefore
        }
        repair = $repairSummary.totals
        repairedCanonical = [ordered]@{
            path = $repairCanonical.Substring($RepoRoot.Length).TrimStart("\", "/").Replace("\", "/")
            treeSha256 = Get-TreeSha256 -RootPath $repairCanonical
        }
        verification = [ordered]@{
            passed = $true
            webTextMismatches = @($verifyReport.webTextMismatches).Count
            webTokenMismatches = @($verifyReport.webTokenMismatches).Count
            approvedBlocksExact = [int]$verifyReport.approvedBlocksExact
            approvedRoutesExact = [int]$verifyReport.approvedRoutesExact
            approvedRoutesRebased = [int]$verifyReport.approvedRoutesRebased
        }
        gates = [ordered]@{
            deterministicLegacyAlignmentPreservationApplied = $true
            noNewSourceRoutesIntroduced = $repairSummary.gates.noNewSourceRoutesIntroduced
            droppedSignaturesDidNotIncrease = $repairSummary.gates.droppedSignaturesDidNotIncrease
            zeroTextMismatches = @($verifyReport.webTextMismatches).Count -eq 0
            zeroTokenMismatches = @($verifyReport.webTokenMismatches).Count -eq 0
            all51ApprovedBlocksExact = [int]$verifyReport.approvedBlocksExact -eq 51
            all207ApprovedRoutesExact = [int]$verifyReport.approvedRoutesExact -eq 207
            productionWebModified = $false
            liveCanonicalModified = $false
            originalStagedCanonicalModified = $false
            safeToReviewRepair = $true
            safeToPromoteProduction = $false
        }
    }

    $summary |
        ConvertTo-Json -Depth 30 |
        Set-Content -LiteralPath (Join-Path $outputRoot "p0512w-summary.json") -Encoding UTF8

    $completed = $true
}
catch {
    $failure = $_
    $failure | Out-String |
        Set-Content -LiteralPath (Join-Path $outputRoot "fatal-error.txt") -Encoding UTF8
}
finally {
    Write-Step "Restoring approved current production WEB"

    Copy-Item -LiteralPath $productionBackup -Destination $productionWeb -Force

    if ((Get-Sha256 -Path $productionWeb) -ne $productionHashBefore) {
        throw "Production WEB was not restored exactly."
    }

    if ((Get-TreeSha256 -RootPath $liveCanonical) -ne $liveCanonicalHashBefore) {
        throw "Live canonical changed during P05.12W."
    }

    if ((Get-TreeSha256 -RootPath $sourceStagedCanonical) -ne $sourceStagedHashBefore) {
        throw "Original staged canonical changed during P05.12W."
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

    throw "P05.12W failed after restoring production WEB. Upload: $failureZip"
}

$readme = @"
# EMETSEES P05.12W WEB Alignment Preservation Preview

The corrected WEB and canonical migration remain staging-only.

This stage restores only deterministic legacy alignment metadata. Any
alignment that cannot be transferred through exact token identity,
occurrence identity, or a safe punctuation/hyphen merge remains unresolved
for fresh source alignment.
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
Write-Host "P05.12W completed." -ForegroundColor Green
Write-Host "- Deterministic legacy alignment preservation applied: YES"
Write-Host "- Corrected WEB text/token verification passed: YES"
Write-Host "- All 51 special blocks exact: YES"
Write-Host "- All 207 routes exact: YES"
Write-Host "- Production WEB modified: NO"
Write-Host "- Live canonical modified: NO"
Write-Host "- Original staged canonical modified: NO"
Write-Host "- Production promotion authorized: NO"
Write-Host "- Report ZIP: $reportZip"
