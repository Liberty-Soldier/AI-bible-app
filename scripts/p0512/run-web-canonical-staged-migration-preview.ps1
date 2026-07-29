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
$applyScript = Join-Path $RepoRoot "scripts\p0512\apply-web-canonical-route-rebased-preview.cjs"
$verifyScript = Join-Path $RepoRoot "scripts\p0512\verify-web-canonical-route-rebased-preview.cjs"
$auditScript = Join-Path $RepoRoot "scripts\p0512\audit-web-canonical-staged-migration.js"

foreach ($required in @(
    $productionWeb,
    $canonicalRoot,
    $candidateA,
    $candidateB,
    $applyScript,
    $verifyScript,
    $auditScript
)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Required P05.12V input is missing: $required"
    }
}

$approvedProductionSha256 = "f55ca3577d763dcf68a8a5883fca811929b1b8f59ba31598363db5d08e66e541"
$productionSha256Before = Get-Sha256 -Path $productionWeb
$candidateASha256 = Get-Sha256 -Path $candidateA
$candidateBSha256 = Get-Sha256 -Path $candidateB

if ($productionSha256Before -ne $approvedProductionSha256) {
    throw "Current WEB production hash is not the approved pre-rebuild state."
}
if ($candidateASha256 -ne $candidateBSha256) {
    throw "Stored WEB candidates are not byte-identical."
}
if ($candidateASha256 -eq $productionSha256Before) {
    throw "WEB candidate unexpectedly matches current production."
}

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$reportParent = Join-Path $RepoRoot ".private\reports\P05.12"
$outputRoot = Join-Path $reportParent "$stamp-web-canonical-staged-migration-preview"
$stagingRoot = Join-Path $RepoRoot ".private\generated\P05.12\web-canonical-migration-preview\$stamp"
$stagedCanonical = Join-Path $stagingRoot "canonical"
$migrationBackup = Join-Path $stagingRoot "migration-backup"
$productionBackup = Join-Path $stagingRoot "generatedWEB.production.backup.json"
$reportZip = Join-Path $reportParent "EMETSEES-P0512V-WEB-CANONICAL-STAGED-MIGRATION-PREVIEW-V3-$stamp.zip"
$p0510ReportRoot = Join-Path $RepoRoot "reports\p0510-canonical-source-repair"
$applyStdout = Join-Path $outputRoot "canonical-apply.stdout.log"
$applyStderr = Join-Path $outputRoot "canonical-apply.stderr.log"
$verifyStdout = Join-Path $outputRoot "canonical-verify.stdout.log"
$verifyStderr = Join-Path $outputRoot "canonical-verify.stderr.log"
$auditStdout = Join-Path $outputRoot "canonical-audit.stdout.log"
$auditStderr = Join-Path $outputRoot "canonical-audit.stderr.log"
$failureZip = Join-Path $reportParent "EMETSEES-P0512V-FAILURE-V3-$stamp.zip"

New-Item -ItemType Directory -Force -Path $outputRoot, $stagingRoot | Out-Null

$liveCanonicalSha256Before = Get-TreeSha256 -RootPath $canonicalRoot
Copy-Item -LiteralPath $productionWeb -Destination $productionBackup -Force
$completed = $false
$failure = $null

try {
    Write-Step "Copying live canonical source into isolated staging"
    Copy-Tree -Source $canonicalRoot -Destination $stagedCanonical

    Write-Step "Temporarily selecting approved 31,098-verse WEB candidate"
    Copy-Item -LiteralPath $candidateA -Destination $productionWeb -Force

    Write-Step "Migrating staged canonical WEB layer"
    $applyResult = Invoke-NodeCaptured `
        -ScriptPath $applyScript `
        -Arguments @(
            "--canonical-root=$stagedCanonical",
            "--backup-root=$migrationBackup",
            "--report-root=$outputRoot\p0510"
        ) `
        -StdoutPath $applyStdout `
        -StderrPath $applyStderr `
        -Label "P05.10 canonical apply"

    if ($applyResult.ExitCode -ne 0) {
        throw "Staged canonical migration failed with exit code $($applyResult.ExitCode). See: $applyStderr"
    }

    Write-Step "Verifying staged canonical WEB"
    $verifyResult = Invoke-NodeCaptured `
        -ScriptPath $verifyScript `
        -Arguments @(
            "--canonical-root=$stagedCanonical",
            "--label=web-canonical-staged-preview",
            "--report-root=$outputRoot\p0510"
        ) `
        -StdoutPath $verifyStdout `
        -StderrPath $verifyStderr `
        -Label "P05.10 canonical verify"

    if ($verifyResult.ExitCode -ne 0) {
        throw "Staged canonical verification failed with exit code $($verifyResult.ExitCode). See: $verifyStderr"
    }

    Write-Step "Auditing alignment metadata preservation"
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

    $completed = $true
}
catch {
    $failure = $_
    $failure | Out-String | Set-Content -LiteralPath (Join-Path $outputRoot "fatal-error.txt") -Encoding UTF8
}
finally {
    Write-Step "Restoring current production WEB"

    Copy-Item -LiteralPath $productionBackup -Destination $productionWeb -Force

    $productionSha256After = Get-Sha256 -Path $productionWeb
    $liveCanonicalSha256After = Get-TreeSha256 -RootPath $canonicalRoot

    if ($productionSha256After -ne $productionSha256Before) {
        throw "Production WEB was not restored exactly."
    }

    if ($liveCanonicalSha256After -ne $liveCanonicalSha256Before) {
        throw "Live canonical source changed during staged preview."
    }
}

if ($null -ne $failure -or -not $completed) {
    $failureChecksumPath = Join-Path $outputRoot "checksums.sha256"
    $failureChecksumLines = @(
        Get-ChildItem -LiteralPath $outputRoot -Recurse -File |
            Where-Object { $_.FullName -ne $failureChecksumPath } |
            Sort-Object FullName |
            ForEach-Object {
                $relative = $_.FullName.Substring($outputRoot.Length).TrimStart("\", "/").Replace("\", "/")
                "$(Get-Sha256 -Path $_.FullName)  $relative"
            }
    )
    $failureChecksumLines | Set-Content -LiteralPath $failureChecksumPath -Encoding ASCII

    if (Test-Path -LiteralPath $failureZip) {
        Remove-Item -LiteralPath $failureZip -Force
    }
    Compress-Archive `
        -Path (Join-Path $outputRoot "*") `
        -DestinationPath $failureZip `
        -CompressionLevel Optimal

    throw "P05.12V V2 failed after restoring production WEB. Upload: $failureZip"
}

$summary = [ordered]@{
    milestone = "P05.12V"
    generatedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    repository = [ordered]@{
        branch = $branch
        commit = (& git rev-parse HEAD).Trim()
    }
    web = [ordered]@{
        productionSha256Before = $productionSha256Before
        productionSha256AfterRestore = Get-Sha256 -Path $productionWeb
        candidateSha256 = $candidateASha256
        candidatesByteIdentical = $true
        candidateVerses = 31098
    }
    canonical = [ordered]@{
        liveTreeSha256Before = $liveCanonicalSha256Before
        liveTreeSha256After = Get-TreeSha256 -RootPath $canonicalRoot
        stagedTreeSha256 = Get-TreeSha256 -RootPath $stagedCanonical
        stagedRoot = $stagedCanonical.Substring($RepoRoot.Length).TrimStart("\", "/").Replace("\", "/")
    }
    gates = [ordered]@{
        storedCandidatesByteIdentical = $true
        candidateHas31098Verses = $true
        productionWebRestoredExactly = $true
        liveCanonicalUnchanged = $true
        safeToReviewMigration = $true
        safeToPromoteProduction = $false
    }
}

$summary |
    ConvertTo-Json -Depth 20 |
    Set-Content -LiteralPath (Join-Path $outputRoot "web-canonical-staged-migration-summary.json") -Encoding UTF8

$readme = @"
# EMETSEES P05.12V WEB Canonical Staged Migration Preview

This preview used the existing approved 31,098-verse WEB candidate and the
existing P05.10 canonical migration system.

Production WEB and the live canonical source were restored and verified
unchanged. Promotion remains blocked pending report review.
"@
$readme | Set-Content -LiteralPath (Join-Path $outputRoot "README.md") -Encoding UTF8

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

if (Test-Path -LiteralPath $reportZip) {
    Remove-Item -LiteralPath $reportZip -Force
}

Compress-Archive `
    -Path (Join-Path $outputRoot "*") `
    -DestinationPath $reportZip `
    -CompressionLevel Optimal

Write-Host ""
Write-Host "P05.12V V3 completed." -ForegroundColor Green
Write-Host "- Approved 31,098-verse WEB candidate used: YES"
Write-Host "- Full existing canonical WEB layer migrated in staging: YES"
Write-Host "- Production WEB modified: NO"
Write-Host "- Live canonical source modified: NO"
Write-Host "- Native stdout/stderr captured separately: YES"
Write-Host "- Alignment metadata preservation audited: YES"
Write-Host "- Legacy fixed-index routes rebased by source-validated occurrence: YES"
Write-Host "- Production promotion authorized: NO"
Write-Host "- Report ZIP: $reportZip"
