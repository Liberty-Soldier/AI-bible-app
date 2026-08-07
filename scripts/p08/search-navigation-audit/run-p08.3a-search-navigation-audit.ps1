param(
    [string]$RepositoryRoot = (Get-Location).Path
)

$ErrorActionPreference = "Stop"

$repo = [IO.Path]::GetFullPath($RepositoryRoot)
$packageJson = Join-Path $repo "package.json"

if (-not (Test-Path -LiteralPath $packageJson -PathType Leaf)) {
    throw "The EMETSEES repository was not found at: $repo"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$phaseRoot = Join-Path $repo ".private\reports\P08.3A-AUDIT"
$reportRoot = Join-Path $phaseRoot "$stamp-search-navigation-audit"
$successZip = Join-Path $phaseRoot "EMETSEES-P08.3A-SEARCH-NAVIGATION-AUDIT-$stamp.zip"
$failureZip = Join-Path $phaseRoot "EMETSEES-P08.3A-SEARCH-NAVIGATION-AUDIT-FAILURE-$stamp.zip"
$nodeScript = Join-Path $PSScriptRoot "audit-p08.3a-search-navigation.cjs"

[IO.Directory]::CreateDirectory($phaseRoot) | Out-Null
[IO.Directory]::CreateDirectory($reportRoot) | Out-Null

function New-ReportZip {
    param(
        [Parameter(Mandatory = $true)][string]$SourceDirectory,
        [Parameter(Mandatory = $true)][string]$DestinationZip
    )

    Add-Type -AssemblyName System.IO.Compression.FileSystem

    if (Test-Path -LiteralPath $DestinationZip) {
        Remove-Item -LiteralPath $DestinationZip -Force
    }

    [System.IO.Compression.ZipFile]::CreateFromDirectory(
        $SourceDirectory,
        $DestinationZip,
        [System.IO.Compression.CompressionLevel]::Optimal,
        $false
    )
}

try {
    if (-not (Test-Path -LiteralPath $nodeScript -PathType Leaf)) {
        throw "The P08.3A audit script is missing: $nodeScript"
    }

    $nodeCheckOutput = & node --check $nodeScript 2>&1
    $nodeCheckExit = $LASTEXITCODE

    if ($nodeCheckExit -ne 0) {
        $nodeCheckOutput | Set-Content -LiteralPath (Join-Path $reportRoot "node-check-error.txt") -Encoding UTF8
        throw "The P08.3A Node audit script failed syntax validation."
    }

    $auditOutput = & node $nodeScript $repo $reportRoot 2>&1
    $auditExit = $LASTEXITCODE
    $auditOutput | Set-Content -LiteralPath (Join-Path $reportRoot "runner-output.txt") -Encoding UTF8
    $auditOutput | ForEach-Object { Write-Host $_ }

    if ($auditExit -ne 0) {
        throw "The P08.3A Search and navigation audit failed with exit code $auditExit."
    }

    New-ReportZip -SourceDirectory $reportRoot -DestinationZip $successZip

    Write-Host ""
    Write-Host "P08.3A Search and navigation audit completed." -ForegroundColor Green
    Write-Host "ZIP: $successZip" -ForegroundColor Cyan
    Write-Host "SHA256: $((Get-FileHash -LiteralPath $successZip -Algorithm SHA256).Hash.ToLowerInvariant())"
}
catch {
    $failureText = @(
        "P08.3A Search and navigation audit failure",
        "Timestamp: $(Get-Date -Format o)",
        "Repository: $repo",
        "Error: $($_.Exception.Message)",
        "",
        $_.ScriptStackTrace
    ) -join [Environment]::NewLine

    [IO.File]::WriteAllText(
        (Join-Path $reportRoot "POWERSHELL-FAILURE.txt"),
        $failureText,
        (New-Object System.Text.UTF8Encoding($false))
    )

    try {
        New-ReportZip -SourceDirectory $reportRoot -DestinationZip $failureZip
        Write-Host ""
        Write-Host "P08.3A audit failed. Failure ZIP:" -ForegroundColor Yellow
        Write-Host $failureZip -ForegroundColor Cyan
        Write-Host "SHA256: $((Get-FileHash -LiteralPath $failureZip -Algorithm SHA256).Hash.ToLowerInvariant())"
    }
    catch {
        Write-Host "The failure report could not be zipped: $($_.Exception.Message)" -ForegroundColor Red
    }

    throw
}
