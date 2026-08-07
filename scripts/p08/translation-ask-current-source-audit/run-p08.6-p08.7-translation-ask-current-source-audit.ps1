param(
  [Parameter(Mandatory = $false)]
  [string]$RepositoryRoot = "C:\Users\CreatorStudio\ai-bible-app"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repo = [IO.Path]::GetFullPath($RepositoryRoot)
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$phaseRoot = Join-Path $repo ".private\reports\P08.6-P08.7-AUDIT"
$reportRoot = Join-Path $phaseRoot "$stamp-translation-ask-current-source"
$successZip = Join-Path $phaseRoot "EMETSEES-P08.6-P08.7-TRANSLATION-ASK-CURRENT-SOURCE-AUDIT-$stamp.zip"
$failureZip = Join-Path $phaseRoot "EMETSEES-P08.6-P08.7-TRANSLATION-ASK-CURRENT-SOURCE-AUDIT-FAILURE-$stamp.zip"

$explicit = @(
  "app\ask\page.tsx",
  "app\read\page.tsx",
  "app\search\page.tsx",
  "app\settings\page.tsx",
  "app\lib\translationPreference.ts",
  "app\components\MobileBottomNav.tsx",
  "app\components\branding\EmetseesWordmark.tsx"
)

$componentPatterns = @(
  "*Translation*.tsx",
  "*translation*.tsx",
  "*Ask*.tsx",
  "*ask*.tsx"
)

function Ensure-Directory {
  param([string]$Path)
  if (-not [IO.Directory]::Exists($Path)) {
    [IO.Directory]::CreateDirectory($Path) | Out-Null
  }
}

function Write-Utf8NoBom {
  param([string]$Path,[AllowEmptyString()][string]$Text)
  Ensure-Directory (Split-Path -Parent $Path)
  $enc = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($Path,$Text,$enc)
}

function Copy-AuditFile {
  param([string]$Relative)
  $full = Join-Path $repo $Relative
  if (-not [IO.File]::Exists($full)) { return $null }

  $dest = Join-Path $reportRoot (Join-Path "source" $Relative)
  Ensure-Directory (Split-Path -Parent $dest)
  [IO.File]::Copy($full,$dest,$true)

  return [PSCustomObject]@{
    Path = $Relative.Replace("\","/")
    Bytes = (Get-Item -LiteralPath $full).Length
    Sha256 = (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLowerInvariant()
  }
}

function Create-Zip {
  param([string]$SourceDirectory,[string]$Destination)
  if ([IO.File]::Exists($Destination)) { [IO.File]::Delete($Destination) }
  Compress-Archive -Path (Join-Path $SourceDirectory "*") -DestinationPath $Destination -CompressionLevel Optimal
}

Ensure-Directory $phaseRoot
Ensure-Directory $reportRoot

try {
  if (-not [IO.File]::Exists((Join-Path $repo "package.json"))) {
    throw "Repository not found: $repo"
  }

  $rows = @()

  foreach ($relative in $explicit) {
    $row = Copy-AuditFile $relative
    if ($null -ne $row) { $rows += $row }
  }

  $componentRoot = Join-Path $repo "app\components"
  if ([IO.Directory]::Exists($componentRoot)) {
    foreach ($pattern in $componentPatterns) {
      Get-ChildItem -Path (Join-Path $componentRoot $pattern) -File -Recurse -ErrorAction SilentlyContinue |
        ForEach-Object {
          $relative = $_.FullName.Substring($repo.Length).TrimStart("\","/")
          if (-not ($rows.Path -contains $relative.Replace("\","/"))) {
            $row = Copy-AuditFile $relative
            if ($null -ne $row) { $rows += $row }
          }
        }
    }
  }

  $rows | Sort-Object Path |
    Export-Csv -LiteralPath (Join-Path $reportRoot "source-hashes.csv") -NoTypeInformation -Encoding UTF8

  $analysis = [ordered]@{
    verdict = "P08_6_P08_7_TRANSLATION_ASK_CURRENT_SOURCE_AUDIT_COMPLETE"
    sourceFilesCopied = @($rows).Count
    applicationSourceWrites = 0
    dependenciesChanged = $false
    productionBuildRun = $false
    gitMutationOperations = 0
    activeP07Touched = $false
    p01ToP04Touched = $false
  }

  Write-Utf8NoBom (Join-Path $reportRoot "verdict.json") ($analysis | ConvertTo-Json -Depth 5)
  Write-Utf8NoBom (Join-Path $reportRoot "REPORT.md") @"
# EMETSEES P08.6 / P08.7 Current Source Audit

Read-only capture of current translation-selector ownership, translation
preference logic, Ask EMET surface, settings, and bottom-navigation ownership.

No application source, dependencies, build, Git, P07, or P01-P04 changes.
"@

  Create-Zip $reportRoot $successZip

  Write-Host ""
  Write-Host "P08.6/P08.7 current-source audit succeeded." -ForegroundColor Green
  Write-Host "ZIP: $successZip" -ForegroundColor Cyan
  Write-Host "SHA256: $((Get-FileHash -LiteralPath $successZip -Algorithm SHA256).Hash.ToLowerInvariant())"
} catch {
  try {
    Write-Utf8NoBom (Join-Path $reportRoot "ERROR.txt") ($_ | Out-String)
    Create-Zip $reportRoot $failureZip
    Write-Host "Failure ZIP: $failureZip" -ForegroundColor Yellow
  } catch {}
  throw
}
