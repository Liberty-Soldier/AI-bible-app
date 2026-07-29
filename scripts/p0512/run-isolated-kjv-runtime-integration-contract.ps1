[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
function Step([string]$Message){ Write-Host ""; Write-Host "==> $Message" -ForegroundColor Cyan }
function Run-NodeLogged {
 param([string]$Script,[string[]]$Arguments,[string]$Stdout,[string]$Stderr)
 & node --max-old-space-size=8192 $Script @Arguments 1> $Stdout 2> $Stderr
 return $LASTEXITCODE
}
$repoRoot = (& git rev-parse --show-toplevel).Trim()
if(-not $repoRoot){ throw "P05.12AK must run inside the EMETSEES Git repository." }
Set-Location $repoRoot
$branch=(& git branch --show-current).Trim(); $commit=(& git rev-parse HEAD).Trim()
if($branch -ne "main"){ throw "P05.12AK must run on main. Current branch: $branch" }
$stamp=Get-Date -Format "yyyyMMdd-HHmmss"
$reportRoot=Join-Path $repoRoot ".private\reports\P05.12"
$reportDir=Join-Path $reportRoot "$stamp-isolated-kjv-runtime-integration-contract"
$a=Join-Path $reportDir "candidate-a"; $b=Join-Path $reportDir "candidate-b"
New-Item -ItemType Directory -Force -Path $a,$b | Out-Null
$scriptRoot=Join-Path $repoRoot "scripts\p0512"
$build=Join-Path $scriptRoot "build-isolated-kjv-runtime-integration-contract.js"
$verify=Join-Path $scriptRoot "verify-isolated-kjv-runtime-integration-contract.js"
$lib=Join-Path $scriptRoot "p0512ak-lib.js"
foreach($required in @($build,$verify,$lib)){ if(-not(Test-Path -LiteralPath $required)){ throw "Missing P05.12AK script: $required" } }
Step "Starting P05.12AK isolated KJV runtime-integration contract"
Write-Host "Branch: $branch"; Write-Host "Commit: $commit"
Write-Host "This stage is read-only outside .private\reports\P05.12. It does not promote Scripture."
$failures=New-Object System.Collections.Generic.List[string]
Step "Building independent contract candidate A"
$exit=Run-NodeLogged -Script $build -Arguments @("--repo-root",$repoRoot,"--output-dir",$a) -Stdout (Join-Path $a "build.stdout.log") -Stderr (Join-Path $a "build.stderr.log")
if($exit -ne 0){$failures.Add("candidate-a")}
Step "Building independent contract candidate B"
$exit=Run-NodeLogged -Script $build -Arguments @("--repo-root",$repoRoot,"--output-dir",$b) -Stdout (Join-Path $b "build.stdout.log") -Stderr (Join-Path $b "build.stderr.log")
if($exit -ne 0){$failures.Add("candidate-b")}
if((Test-Path (Join-Path $a "build-summary.json")) -and (Test-Path (Join-Path $b "build-summary.json"))){
 Step "Comparing repeated builds and rechecking protected production state"
 $exit=Run-NodeLogged -Script $verify -Arguments @("--repo-root",$repoRoot,"--candidate-a",$a,"--candidate-b",$b,"--report-dir",$reportDir) -Stdout (Join-Path $reportDir "verification.stdout.log") -Stderr (Join-Path $reportDir "verification.stderr.log")
 if($exit -ne 0){$failures.Add("verification")}
}else{$failures.Add("verification-not-run")}
@"
# EMETSEES P05.12AK — Isolated KJV Runtime-Integration Contract

This targeted stage verifies the passing P05.12AJ output and identifies the exact current runtime consumers and data contracts that must receive the KJV2006 reader text, corrected source routes, and migrated KJV translation blocks.

It does not rebuild broad alignment evidence, invent mappings, modify production Scripture, or authorize promotion.
"@ | Set-Content -LiteralPath (Join-Path $reportDir "README.md") -Encoding UTF8
Step "Writing report checksums"
$checksumPath=Join-Path $reportDir "checksums.sha256"
$lines=Get-ChildItem -LiteralPath $reportDir -Recurse -File | Where-Object {$_.FullName -ne $checksumPath} | Sort-Object FullName | ForEach-Object {
 $hash=(Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant(); $relative=$_.FullName.Substring($reportDir.Length+1).Replace("\","/"); "$hash  $relative"
}
$lines | Set-Content -LiteralPath $checksumPath -Encoding UTF8
Step "Packaging P05.12AK report"
$zip=Join-Path $reportRoot "EMETSEES-P0512AK-ISOLATED-KJV-RUNTIME-INTEGRATION-CONTRACT-$stamp.zip"
if(Test-Path $zip){Remove-Item $zip -Force}
Compress-Archive -Path (Join-Path $reportDir "*") -DestinationPath $zip -CompressionLevel Optimal
Write-Host ""; Write-Host "P05.12AK report package created:" -ForegroundColor Green; Write-Host $zip
Write-Host "OUTPUT_DIR=$reportDir"; Write-Host "OUTPUT_ZIP=$zip"; Write-Host "Production promotion performed: NO"
if($failures.Count -gt 0){ throw "P05.12AK completed with failed stages: $($failures -join ', '). Upload the report ZIP; do not promote production KJV." }
Write-Host "P05.12AK passed. Upload the report ZIP for the isolated application-preview package." -ForegroundColor Green
