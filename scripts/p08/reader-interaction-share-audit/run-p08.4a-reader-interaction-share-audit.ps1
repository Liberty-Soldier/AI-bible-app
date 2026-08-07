param([Parameter(Mandatory = $false)][string]$RepositoryRoot = "C:\Users\CreatorStudio\ai-bible-app")
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$repo = [IO.Path]::GetFullPath($RepositoryRoot)
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$phaseRoot = Join-Path $repo ".private\reports\P08.4A-AUDIT"
$reportRoot = Join-Path $phaseRoot "$stamp-reader-interaction-share-audit"
$successZip = Join-Path $phaseRoot "EMETSEES-P08.4A-READER-INTERACTION-SHARE-AUDIT-$stamp.zip"
$failureZip = Join-Path $phaseRoot "EMETSEES-P08.4A-READER-INTERACTION-SHARE-AUDIT-FAILURE-$stamp.zip"
$nodeAudit = Join-Path $PSScriptRoot "audit-p08.4a-reader-interaction-share.cjs"
function Ensure-Directory { param([Parameter(Mandatory = $true)][string]$Path) if (-not [IO.Directory]::Exists($Path)) { [IO.Directory]::CreateDirectory($Path) | Out-Null } }
function Write-Utf8NoBom { param([Parameter(Mandatory = $true)][string]$Path,[Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text) Ensure-Directory (Split-Path -Parent $Path); $encoding = New-Object System.Text.UTF8Encoding($false); [IO.File]::WriteAllText($Path,$Text,$encoding) }
function Create-Zip { param([Parameter(Mandatory = $true)][string]$SourceDirectory,[Parameter(Mandatory = $true)][string]$Destination) if ([IO.File]::Exists($Destination)) { [IO.File]::Delete($Destination) }; Compress-Archive -Path (Join-Path $SourceDirectory "*") -DestinationPath $Destination -CompressionLevel Optimal }
Ensure-Directory $phaseRoot
Ensure-Directory $reportRoot
try {
  if (-not [IO.File]::Exists((Join-Path $repo "package.json"))) { throw "The EMETSEES repository was not found at: $repo" }
  if (-not [IO.File]::Exists($nodeAudit)) { throw "The P08.4A Node audit script is missing: $nodeAudit" }
  Write-Host ""; Write-Host "EMETSEES P08.4A Reader Interaction and Share Audit"; Write-Host "Mode: read-only source audit"; Write-Host "Application source changes: none"; Write-Host "Dependencies: unchanged"; Write-Host "Production build: not run"; Write-Host "P07 and P01-P04 content: excluded"; Write-Host ""
  $psi = New-Object System.Diagnostics.ProcessStartInfo; $psi.FileName = "node"; $psi.Arguments = '"' + $nodeAudit + '" "' + $repo + '" "' + $reportRoot + '"'; $psi.WorkingDirectory = $repo; $psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true; $psi.CreateNoWindow = $true
  $process = New-Object System.Diagnostics.Process; $process.StartInfo = $psi
  if (-not $process.Start()) { throw "Failed to start the P08.4A Node audit." }
  $stdout = $process.StandardOutput.ReadToEnd(); $stderr = $process.StandardError.ReadToEnd(); $process.WaitForExit()
  Write-Utf8NoBom (Join-Path $reportRoot "audit.stdout.txt") $stdout; Write-Utf8NoBom (Join-Path $reportRoot "audit.stderr.txt") $stderr
  if ($process.ExitCode -ne 0) { throw "P08.4A Node audit failed with exit code $($process.ExitCode)." }
  Create-Zip $reportRoot $successZip
  Write-Host "P08.4A audit succeeded." -ForegroundColor Green; Write-Host "ZIP: $successZip" -ForegroundColor Cyan; Write-Host "SHA256: $((Get-FileHash -LiteralPath $successZip -Algorithm SHA256).Hash.ToLowerInvariant())"
} catch {
  $errorRecord = $_
  try { Write-Utf8NoBom (Join-Path $reportRoot "RUNNER-ERROR.txt") ($errorRecord | Out-String); Create-Zip $reportRoot $failureZip; Write-Host "P08.4A audit failed." -ForegroundColor Red; Write-Host "Failure ZIP: $failureZip" -ForegroundColor Yellow } catch { Write-Host "Failure packaging also failed: $($_ | Out-String)" -ForegroundColor Red }
  throw $errorRecord
}
