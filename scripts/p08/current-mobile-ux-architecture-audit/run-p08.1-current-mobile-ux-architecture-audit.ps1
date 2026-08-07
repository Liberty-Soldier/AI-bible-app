[CmdletBinding()]
param(
  [string]$RepositoryRoot = (Get-Location).Path,
  [int64]$MaxFileBytes = 2097152
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$Phase = "P08.1"
$AuditName = "current-mobile-ux-architecture-audit"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$RepositoryRoot = [IO.Path]::GetFullPath($RepositoryRoot)
$PhaseReportRoot = Join-Path $RepositoryRoot ".private\reports\$Phase"
$ReportRoot = Join-Path $PhaseReportRoot "$Stamp-$AuditName"
$SuccessZip = Join-Path $PhaseReportRoot "EMETSEES-P08.1-CURRENT-MOBILE-UX-ARCHITECTURE-AUDIT-$Stamp.zip"
$FailureZip = Join-Path $PhaseReportRoot "EMETSEES-P08.1-CURRENT-MOBILE-UX-ARCHITECTURE-AUDIT-FAILURE-$Stamp.zip"
$EvidenceRoot = Join-Path $ReportRoot "evidence"
$CopiedFilesRoot = Join-Path $EvidenceRoot "files"
$GeneratedRoot = Join-Path $ReportRoot "generated"

function Ensure-Directory([string]$Path) {
  if (-not [IO.Directory]::Exists($Path)) {
    [void][IO.Directory]::CreateDirectory($Path)
  }
}

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  Ensure-Directory (Split-Path -Parent $Path)
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Get-RelativePathCompat {
  param(
    [Parameter(Mandatory = $true)][string]$BasePath,
    [Parameter(Mandatory = $true)][string]$TargetPath
  )

  $baseFull = [IO.Path]::GetFullPath($BasePath).TrimEnd("\", "/")
  $targetFull = [IO.Path]::GetFullPath($TargetPath)

  if ($targetFull.StartsWith($baseFull, [StringComparison]::OrdinalIgnoreCase)) {
    return $targetFull.Substring($baseFull.Length).TrimStart("\", "/")
  }

  $baseUri = New-Object System.Uri(($baseFull + [IO.Path]::DirectorySeparatorChar))
  $targetUri = New-Object System.Uri($targetFull)
  return [Uri]::UnescapeDataString($baseUri.MakeRelativeUri($targetUri).ToString()).Replace("/", "\")
}

function Normalize-Path([string]$Path) {
  return $Path.Replace("/", "\")
}

$ProtectedPaths = @(
  "scripts\p07\full-cache-generation",
  ".private\staging\P07-FULL-CACHE-GENERATION",
  ".private\reports\P07-FULL-CACHE-GENERATION",
  ".private\entity\build\P01",
  ".private\entity\build\P02",
  ".private\entity\build\P03",
  ".private\entity\build\P04",
  ".private\entity\build\P04.2"
)

$ExcludedFragments = @(
  "\node_modules\",
  "\.next\",
  "\.git\",
  "\.private\",
  "\coverage\",
  "\dist\",
  "\build\",
  "\public\data\",
  "\scripts\p01\",
  "\scripts\p02\",
  "\scripts\p03\",
  "\scripts\p04\",
  "\scripts\p07\",
  "\app\data\bibleiq\canonical\",
  "\app\data\scripture\generated"
)

$AllowedExtensions = @(
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".css", ".scss", ".json", ".svg", ".md", ".txt"
)

function Test-IsExcluded([string]$FullPath) {
  $normalized = Normalize-Path $FullPath
  foreach ($fragment in $ExcludedFragments) {
    if ($normalized.IndexOf($fragment, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
      return $true
    }
  }
  return $false
}

function Get-AuditableFiles {
  $roots = @(
    "app",
    "components",
    "lib",
    "hooks",
    "contexts",
    "providers",
    "styles",
    "types"
  )

  $files = New-Object System.Collections.ArrayList
  foreach ($relativeRoot in $roots) {
    $root = Join-Path $RepositoryRoot $relativeRoot
    if (-not (Test-Path $root -PathType Container)) { continue }

    Get-ChildItem $root -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
      if (Test-IsExcluded $_.FullName) { return }
      if ($_.Length -gt $MaxFileBytes) { return }
      if (-not ($AllowedExtensions -contains $_.Extension.ToLowerInvariant())) { return }
      if ($_.Name -match '(?i)(generated|runtime|cache).+\.json$') { return }
      [void]$files.Add($_)
    }
  }

  $supportingScriptRoots = @(
    "scripts\p05",
    "scripts\p06",
    "scripts"
  )
  $supportingScriptNamePattern = '(?i)(reader|word|study|mobile|ui|ux|nav|note|bookmark|highlight|translation|search|ask|premium|theme|manifest|verify)'
  foreach ($relativeRoot in $supportingScriptRoots) {
    $root = Join-Path $RepositoryRoot $relativeRoot
    if (-not (Test-Path $root -PathType Container)) { continue }
    Get-ChildItem $root -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
      if (Test-IsExcluded $_.FullName) { return }
      if ($_.Length -gt $MaxFileBytes) { return }
      if (-not ($AllowedExtensions -contains $_.Extension.ToLowerInvariant())) { return }
      $relative = Get-RelativePathCompat -BasePath $RepositoryRoot -TargetPath $_.FullName
      if ($relative -notmatch $supportingScriptNamePattern -and $_.Name -notmatch $supportingScriptNamePattern) { return }
      [void]$files.Add($_)
    }
  }

  $explicit = @(
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "next.config.js",
    "next.config.mjs",
    "tsconfig.json",
    "middleware.ts",
    "app\layout.tsx",
    "app\page.tsx",
    "app\globals.css",
    "app\manifest.ts",
    "public\manifest.json",
    "public\site.webmanifest"
  )

  foreach ($relative in $explicit) {
    $full = Join-Path $RepositoryRoot $relative
    if (Test-Path -LiteralPath $full -PathType Leaf) {
      $item = Get-Item -LiteralPath $full
      if ($item.Length -le $MaxFileBytes -and -not (Test-IsExcluded $item.FullName)) {
        if (-not ($files.FullName -contains $item.FullName)) {
          [void]$files.Add($item)
        }
      }
    }
  }

  return @($files | Sort-Object FullName -Unique)
}

function Get-SourceSnapshot([System.IO.FileInfo[]]$Files) {
  $snapshot = New-Object System.Collections.ArrayList
  foreach ($file in $Files) {
    [void]$snapshot.Add([PSCustomObject]@{
      Path = (Get-RelativePathCompat -BasePath $RepositoryRoot -TargetPath $file.FullName).Replace("\", "/")
      Bytes = [int64]$file.Length
      LastWriteTimeUtc = $file.LastWriteTimeUtc.ToString("o")
      Sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    })
  }
  return @($snapshot)
}

function Copy-AuditFile([System.IO.FileInfo]$File) {
  $relative = Get-RelativePathCompat -BasePath $RepositoryRoot -TargetPath $File.FullName
  $destination = Join-Path $CopiedFilesRoot $relative
  Ensure-Directory (Split-Path -Parent $destination)
  Copy-Item -LiteralPath $File.FullName -Destination $destination -Force
}

function Get-RoutePath([string]$RelativePath) {
  $normalized = $RelativePath.Replace("\", "/")
  $directory = [IO.Path]::GetDirectoryName($normalized).Replace("\", "/")
  if ($directory -eq "app") { return "/" }
  if ($directory.StartsWith("app/")) {
    $route = $directory.Substring(4)
    $route = ($route -split "/" | Where-Object { $_ -notmatch '^\(.+\)$' }) -join "/"
    return "/" + $route
  }
  return ""
}

function Add-Match {
  param(
    [System.Collections.ArrayList]$Target,
    [string]$Path,
    [int]$Line,
    [string]$Category,
    [string]$Pattern,
    [string]$Text
  )
  [void]$Target.Add([PSCustomObject]@{
    Path = $Path
    Line = $Line
    Category = $Category
    Pattern = $Pattern
    Text = $Text.Trim()
  })
}

function New-Zip([string]$SourceDirectory, [string]$DestinationZip) {
  if (Test-Path -LiteralPath $DestinationZip) { Remove-Item -LiteralPath $DestinationZip -Force }
  Compress-Archive -Path (Join-Path $SourceDirectory "*") -DestinationPath $DestinationZip -CompressionLevel Optimal -Force
}

function Write-Manifest([string]$Root) {
  $entries = New-Object System.Collections.ArrayList
  Get-ChildItem $Root -Recurse -File | Sort-Object FullName | ForEach-Object {
    $relative = (Get-RelativePathCompat -BasePath $Root -TargetPath $_.FullName).Replace("\", "/")
    [void]$entries.Add("$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant())  $relative")
  }
  Write-Utf8NoBom (Join-Path $Root "MANIFEST.sha256") (($entries -join "`n") + "`n")
}

function New-FailurePackage([System.Management.Automation.ErrorRecord]$Failure) {
  try {
    Ensure-Directory $ReportRoot
    Ensure-Directory $GeneratedRoot
    $details = @(
      "EMETSEES P08.1 audit failed.",
      "",
      "Timestamp: $((Get-Date).ToString('o'))",
      "Repository: $RepositoryRoot",
      "Exception: $($Failure.Exception.Message)",
      "Category: $($Failure.CategoryInfo)",
      "Target: $($Failure.TargetObject)",
      "Script stack:",
      $Failure.ScriptStackTrace,
      "",
      "Invocation:",
      ($Failure.InvocationInfo | Format-List * | Out-String)
    ) -join "`n"
    Write-Utf8NoBom (Join-Path $ReportRoot "FAILURE.txt") $details
    Write-Utf8NoBom (Join-Path $ReportRoot "SAFETY-NOTICE.txt") ((@(
      "No Git branch switch, reset, clean, dependency upgrade, npm install, build, or source edit was performed.",
      "The audit excludes scripts/p07 and all .private content except its own P08.1 report folder.",
      "Protected P07/P01-P04 paths were not enumerated, copied, modified, deleted, or hashed."
    ) -join "`n") + "`n")
    Write-Manifest $ReportRoot
    New-Zip -SourceDirectory $ReportRoot -DestinationZip $FailureZip
    Write-Host "FAILURE ZIP: $FailureZip" -ForegroundColor Yellow
  } catch {
    Write-Host "Unable to create failure ZIP: $($_.Exception.Message)" -ForegroundColor Red
  }
}

try {
  if (-not (Test-Path $RepositoryRoot -PathType Container)) {
    throw "Repository does not exist: $RepositoryRoot"
  }
  if (-not (Test-Path (Join-Path $RepositoryRoot "package.json") -PathType Leaf)) {
    throw "Run from the EMETSEES repository root or pass -RepositoryRoot. package.json was not found."
  }
  if (-not (Test-Path (Join-Path $RepositoryRoot "app") -PathType Container)) {
    throw "The repository does not contain an app directory."
  }

  Ensure-Directory $PhaseReportRoot
  Ensure-Directory $ReportRoot
  Ensure-Directory $EvidenceRoot
  Ensure-Directory $CopiedFilesRoot
  Ensure-Directory $GeneratedRoot

  Write-Host ""
  Write-Host "EMETSEES P08.1 current mobile UX and architecture audit" -ForegroundColor Cyan
  Write-Host "Mode: read-only source inspection"
  Write-Host "P07 cache paths: excluded"
  Write-Host "Dependency install/build: disabled"
  Write-Host ""

  $safetyContract = [ordered]@{
    phase = $Phase
    mode = "read-only-audit"
    repository = $RepositoryRoot
    generatedAt = (Get-Date).ToString("o")
    forbiddenOperations = @(
      "git switch", "git checkout branch", "git reset", "git clean",
      "dependency install", "dependency upgrade", "npm build", "UI source modification",
      "P07 process stop", "P07 file modification", "P01-P04 modification"
    )
    protectedPaths = $ProtectedPaths
    scanExcludesAllPrivateContentExceptOwnReport = $true
    scanExcludesScriptsP07 = $true
  }
  Write-Utf8NoBom (Join-Path $ReportRoot "SAFETY-CONTRACT.json") (($safetyContract | ConvertTo-Json -Depth 8) + "`n")

  $files = @(Get-AuditableFiles)
  if ($files.Count -eq 0) {
    throw "No auditable UI/source files were found."
  }

  $before = @(Get-SourceSnapshot -Files $files)
  $before | Export-Csv -Path (Join-Path $GeneratedRoot "source-snapshot-before.csv") -NoTypeInformation -Encoding UTF8

  foreach ($file in $files) { Copy-AuditFile $file }

  $routes = New-Object System.Collections.ArrayList
  $architectureMatches = New-Object System.Collections.ArrayList
  $storageKeys = New-Object System.Collections.ArrayList
  $packageScripts = New-Object System.Collections.ArrayList

  if ($architectureMatches.GetType().FullName -ne 'System.Collections.ArrayList') {
    throw 'Architecture match collection initialization failed.'
  }

  $categoryPatterns = [ordered]@{
    "navigation" = @(
      'MobileBottomNav', 'AppNav', 'bottom.?nav', 'navigation', 'router\.push', 'router\.replace', 'usePathname'
    )
    "notes" = @(
      '\bnotes?\b', 'editNote', 'deleteNote', 'updateNote', 'saveNote', 'createdAt', 'updatedAt', 'confirm\('
    )
    "bookmarks-highlights" = @(
      '\bbookmark', '\bhighlight', 'saved studies', 'recent activity'
    )
    "translation-persistence" = @(
      'translation', 'selectedTranslation', 'activeTranslation', 'currentTranslation', 'Brenton', '\bWEB\b', 'localStorage', 'sessionStorage'
    )
    "scripture-search" = @(
      'Scripture Search', 'searchParams', 'query=', 'phrase', 'verse reference', 'chapter reference', 'search state'
    )
    "ask-emet" = @(
      'Ask EMET', '/ask', 'AskView', 'question'
    )
    "word-overview" = @(
      'WordStudy', 'Word Overview', 'transliteration', 'pronunciation', 'occurrence', 'common forms', 'common English', 'Refers to in this verse', 'gloss'
    )
    "reader-state" = @(
      'studyMode', 'readMode', 'scroll', 'scrollIntoView', 'sessionStorage', 'history\.state', 'selectedVerse', 'verse.*highlight', 'continue reading'
    )
    "home" = @(
      'Go To Scripture', 'Continue Reading', 'Library', 'Recent', 'Home'
    )
    "theme" = @(
      'dark', 'light', 'theme', 'prefers-color-scheme'
    )
  }

  foreach ($file in $files) {
    $relative = (Get-RelativePathCompat -BasePath $RepositoryRoot -TargetPath $file.FullName).Replace("\", "/")
    $name = $file.Name.ToLowerInvariant()

    if ($name -in @("page.tsx", "page.ts", "page.jsx", "page.js", "route.ts", "route.js", "layout.tsx", "layout.ts")) {
      [void]$routes.Add([PSCustomObject]@{
        Route = Get-RoutePath $relative
        Kind = [IO.Path]::GetFileNameWithoutExtension($file.Name)
        Path = $relative
      })
    }

    $lineNumber = 0
    try {
      Get-Content -LiteralPath $file.FullName -ErrorAction Stop | ForEach-Object {
        $lineNumber += 1
        $line = [string]$_

        foreach ($entry in $categoryPatterns.GetEnumerator()) {
          foreach ($pattern in $entry.Value) {
            if ($line -match $pattern) {
              Add-Match -Target $architectureMatches -Path $relative -Line $lineNumber -Category $entry.Key -Pattern $pattern -Text $line
              break
            }
          }
        }

        $storageRegex = '(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(\s*["'']([^"'']+)["'']'
        if ($line -match $storageRegex) {
          $capturedStorageKey = [string]$Matches[1]
          $storageKind = if (
            $line.IndexOf('sessionStorage', [StringComparison]::Ordinal) -ge 0
          ) {
            'sessionStorage'
          } else {
            'localStorage'
          }

          [void]$storageKeys.Add([PSCustomObject]@{
            Path = $relative
            Line = $lineNumber
            Storage = $storageKind
            Key = $capturedStorageKey
            Text = $line.Trim()
          })
        }
      }
    } catch {
      Add-Match -Target $architectureMatches -Path $relative -Line 0 -Category "decode-warning" -Pattern "read-error" -Text $_.Exception.Message
    }
  }

  $packageJsonPath = Join-Path $RepositoryRoot "package.json"
  try {
    $packageJson = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
    if ($packageJson.scripts) {
      foreach ($property in $packageJson.scripts.PSObject.Properties) {
        [void]$packageScripts.Add([PSCustomObject]@{
          Name = $property.Name
          Command = [string]$property.Value
        })
      }
    }
  } catch {
    Add-Match -Target $architectureMatches -Path "package.json" -Line 0 -Category "package-warning" -Pattern "json-parse" -Text $_.Exception.Message
  }

  @($routes | Sort-Object Route, Kind, Path -Unique) | Export-Csv -Path (Join-Path $GeneratedRoot "route-inventory.csv") -NoTypeInformation -Encoding UTF8
  @($architectureMatches | Sort-Object Category, Path, Line) | Export-Csv -Path (Join-Path $GeneratedRoot "architecture-search-matches.csv") -NoTypeInformation -Encoding UTF8
  @($storageKeys | Sort-Object Storage, Key, Path, Line -Unique) | Export-Csv -Path (Join-Path $GeneratedRoot "storage-key-inventory.csv") -NoTypeInformation -Encoding UTF8
  @($packageScripts | Sort-Object Name) | Export-Csv -Path (Join-Path $GeneratedRoot "package-scripts.csv") -NoTypeInformation -Encoding UTF8

  $routeList = @($routes | Sort-Object Route, Kind, Path -Unique)
  $matchList = @($architectureMatches)
  $storageList = @($storageKeys | Sort-Object Storage, Key, Path, Line -Unique)

  $categorySummary = @{}
  foreach ($category in $categoryPatterns.Keys) {
    $categoryMatches = @($matchList | Where-Object { $_.Category -eq $category })
    $categorySummary[$category] = [ordered]@{
      matchCount = $categoryMatches.Count
      files = @($categoryMatches.Path | Sort-Object -Unique)
    }
  }

  $routePaths = @($routeList.Route | Where-Object { $_ } | Sort-Object -Unique)
  $hasSearchRoute = @($routePaths | Where-Object { $_ -eq "/search" -or $_ -like "/search/*" }).Count -gt 0
  $hasAskRoute = @($routePaths | Where-Object { $_ -eq "/ask" -or $_ -like "/ask/*" }).Count -gt 0
  $brentonDefaultSignals = @($matchList | Where-Object {
    $_.Category -eq "translation-persistence" -and $_.Text -match '(?i)(default|fallback|initial|\?\?|\|\|).{0,80}brenton|brenton.{0,80}(default|fallback|initial)'
  })
  $webDefaultSignals = @($matchList | Where-Object {
    $_.Category -eq "translation-persistence" -and $_.Text -match '(?i)(default|fallback|initial|\?\?|\|\|).{0,80}\bWEB\b|\bWEB\b.{0,80}(default|fallback|initial)'
  })
  $noteEditSignals = @($matchList | Where-Object { $_.Category -eq "notes" -and $_.Text -match '(?i)(editNote|updateNote|editing|save changes)' })
  $noteDeleteSignals = @($matchList | Where-Object { $_.Category -eq "notes" -and $_.Text -match '(?i)(deleteNote|removeNote|confirm\()' })

  $implementationMap = [ordered]@{
    phase = $Phase
    generatedAt = (Get-Date).ToString("o")
    repository = $RepositoryRoot
    auditedFileCount = $files.Count
    routeCount = $routeList.Count
    routes = $routeList
    packageScripts = @($packageScripts | Sort-Object Name)
    storageKeys = $storageList
    supportingAuditAndVerificationScripts = @($files | ForEach-Object {
      (Get-RelativePathCompat -BasePath $RepositoryRoot -TargetPath $_.FullName).Replace("\", "/")
    } | Where-Object { $_ -like "scripts/*" } | Sort-Object -Unique)
    categorySummary = $categorySummary
    automatedSignals = [ordered]@{
      dedicatedSearchRouteFound = $hasSearchRoute
      askEmetRouteFound = $hasAskRoute
      searchAndAskAreSeparateRoutes = ($hasSearchRoute -and $hasAskRoute)
      brentonDefaultSignalCount = $brentonDefaultSignals.Count
      webDefaultSignalCount = $webDefaultSignals.Count
      noteEditSignalCount = $noteEditSignals.Count
      noteDeleteOrConfirmationSignalCount = $noteDeleteSignals.Count
    }
    limitations = @(
      "This is a static source audit; it does not click through the application or mutate browser storage.",
      "No production build was run because P07 full-cache generation is active.",
      "Large generated Scripture/cache artifacts were deliberately excluded.",
      "Candidate files and automated signals require targeted human review before implementation."
    )
  }
  Write-Utf8NoBom (Join-Path $GeneratedRoot "implementation-map.json") (($implementationMap | ConvertTo-Json -Depth 20) + "`n")

  $gitBranch = ""
  $gitHead = ""
  $gitStatus = @()
  $gitError = ""
  try {
    Push-Location $RepositoryRoot
    $gitBranch = (git branch --show-current 2>$null | Out-String).Trim()
    $gitHead = (git rev-parse HEAD 2>$null | Out-String).Trim()
    $gitStatus = @(git status --short --untracked-files=no 2>$null | ForEach-Object { [string]$_ })
  } catch {
    $gitError = $_.Exception.Message
  } finally {
    Pop-Location
  }

  Write-Utf8NoBom (Join-Path $GeneratedRoot "git-metadata.json") (([ordered]@{
    branch = $gitBranch
    head = $gitHead
    trackedStatus = $gitStatus
    error = $gitError
    note = "Read-only Git metadata only. No branch switch, reset, clean, checkout, add, commit, pull, or push was run."
  } | ConvertTo-Json -Depth 8) + "`n")

  $afterFiles = @(Get-AuditableFiles)
  $after = @(Get-SourceSnapshot -Files $afterFiles)
  $after | Export-Csv -Path (Join-Path $GeneratedRoot "source-snapshot-after.csv") -NoTypeInformation -Encoding UTF8

  $beforeMap = @{}
  foreach ($entry in $before) { $beforeMap[$entry.Path] = $entry.Sha256 }
  $afterMap = @{}
  foreach ($entry in $after) { $afterMap[$entry.Path] = $entry.Sha256 }
  $changes = New-Object System.Collections.ArrayList
  foreach ($path in @($beforeMap.Keys + $afterMap.Keys | Sort-Object -Unique)) {
    $b = if ($beforeMap.ContainsKey($path)) { $beforeMap[$path] } else { "" }
    $a = if ($afterMap.ContainsKey($path)) { $afterMap[$path] } else { "" }
    if ($a -ne $b) {
      [void]$changes.Add([PSCustomObject]@{ Path = $path; BeforeSha256 = $b; AfterSha256 = $a })
    }
  }
  @($changes) | Export-Csv -Path (Join-Path $GeneratedRoot "source-changes-during-audit.csv") -NoTypeInformation -Encoding UTF8
  if ($changes.Count -gt 0) {
    throw "Audited source files changed while the audit was running. See source-changes-during-audit.csv. No source changes were made by this script."
  }

  $routeLines = @()
  foreach ($route in $routeList) {
    $routeLines += "| $($route.Route) | $($route.Kind) | ``$($route.Path)`` |"
  }
  if ($routeLines.Count -eq 0) { $routeLines = @("| _None detected_ | | |") }

  $storageLines = @()
  foreach ($key in $storageList) {
    $storageLines += "| $($key.Storage) | ``$($key.Key)`` | ``$($key.Path):$($key.Line)`` |"
  }
  if ($storageLines.Count -eq 0) { $storageLines = @("| _None detected_ | | |") }

  $candidateSection = New-Object System.Collections.ArrayList
  foreach ($category in $categoryPatterns.Keys) {
    $filesForCategory = @($categorySummary[$category].files)
    [void]$candidateSection.Add("### $category")
    [void]$candidateSection.Add("")
    [void]$candidateSection.Add("Matches: $($categorySummary[$category].matchCount)")
    [void]$candidateSection.Add("")
    if ($filesForCategory.Count -eq 0) {
      [void]$candidateSection.Add("- No candidate source files detected.")
    } else {
      foreach ($candidate in ($filesForCategory | Select-Object -First 20)) {
        [void]$candidateSection.Add("- ``$candidate``")
      }
      if ($filesForCategory.Count -gt 20) {
        [void]$candidateSection.Add("- ...and $($filesForCategory.Count - 20) more; see architecture-search-matches.csv.")
      }
    }
    [void]$candidateSection.Add("")
  }

  $report = @(
    "# EMETSEES P08.1 - Current Mobile UX and Architecture Audit",
    "",
    "## Verdict",
    "",
    "The read-only P08.1 evidence package completed successfully. No application source file changed during the audit.",
    "",
    "This package is the implementation-inspection handoff. It does **not** apply UI changes, install dependencies, run a production build, or touch active P07 cache-generation files.",
    "",
    "## Safety boundaries verified",
    "",
    "- Git branch switches, reset, clean, checkout, pull, merge, commit, and push: not run",
    "- npm/pnpm/yarn install or dependency upgrade: not run",
    "- production build or dev server: not run",
    "- ``scripts/p07``: excluded from enumeration and copying",
    "- all existing ``.private`` content: excluded except this new ``.private/reports/P08.1`` report",
    "- P01-P04 and retained P04.2 candidate: not read, hashed, copied, or modified",
    "- active P07 staging/report paths: not read, hashed, copied, or modified",
    "",
    "## Repository identity",
    "",
    "- Branch: ``$gitBranch``",
    "- HEAD: ``$gitHead``",
    "- Audited source files: $($files.Count)",
    "- Routes/components/API entries detected: $($routeList.Count)",
    "- Storage keys detected: $($storageList.Count)",
    "- Static architecture matches: $($matchList.Count)",
    "",
    "## Automated high-level signals",
    "",
    "- Dedicated Search route found: **$hasSearchRoute**",
    "- Ask EMET route found: **$hasAskRoute**",
    "- Search and Ask EMET exist as separate routes: **$($hasSearchRoute -and $hasAskRoute)**",
    "- Possible Brenton default/fallback signals: **$($brentonDefaultSignals.Count)**",
    "- Possible WEB default/fallback signals: **$($webDefaultSignals.Count)**",
    "- Note edit/update signals: **$($noteEditSignals.Count)**",
    "- Note delete/confirmation signals: **$($noteDeleteSignals.Count)**",
    "",
    "> These are static-source signals, not final conclusions. Review the copied source and exact line matches before changing code.",
    "",
    "## Route inventory",
    "",
    "| Route | Kind | Source |",
    "|---|---|---|"
  ) + $routeLines + @(
    "",
    "## Browser storage key inventory",
    "",
    "| Storage | Key | Source |",
    "|---|---|---|"
  ) + $storageLines + @(
    "",
    "## Candidate implementation files by concern",
    ""
  ) + @($candidateSection) + @(
    "## Ordered correction plan after P08.1 review",
    "",
    "1. **P08.2A - Notes lifecycle:** reuse the existing note store and verse-action system; add open/edit/save/delete-confirmation behavior without replacing working storage.",
    "2. **P08.2B - Global translation preference:** identify the authoritative existing translation state, consolidate fallbacks, migrate stored keys safely, and make WEB the first-ever default only.",
    "3. **P08.3 - Scripture Search and navigation:** preserve Ask EMET as a distinct intent, reuse current reader routing, and add state-preserving Search behavior plus the approved five-tab mobile navigation.",
    "4. **P08.4 - Word Overview:** reshape the existing Word Study/Overview presentation around plain-English meaning and Scripture evidence without rebuilding the evidence/runtime engine.",
    "5. **P08.5 - Reader, Home, and navigation polish:** make targeted spacing/state/back-behavior changes only after the preceding functional corrections are verified.",
    "6. **P08.6 - Translation selector future-proofing:** adapt the current selector architecture without crowding the mobile surface.",
    "7. **P08.7 - Global Ask EMET evaluation:** deliver a recommendation and only an obviously safe micro-improvement, not a redesign.",
    "8. **P08.8 - Pre-demo regression and premium QA:** run mobile behavior checks and the production build after active P07 cache generation is complete or when it is otherwise safe to do so.",
    "",
    "## Required next review inputs",
    "",
    "- ``generated/implementation-map.json``",
    "- ``generated/route-inventory.csv``",
    "- ``generated/storage-key-inventory.csv``",
    "- ``generated/architecture-search-matches.csv``",
    "- copied source under ``evidence/files``",
    "- ``generated/git-metadata.json``",
    "",
    "## Audit limitations",
    "",
    "- Static inspection cannot prove mobile rendering, browser restart persistence, scroll restoration, or back-stack behavior.",
    "- No dev server or production build was started during P08.1 because the active P07 generation must remain undisturbed.",
    "- Large generated Scripture and cache files were intentionally excluded because P08.1 is an architecture/UI audit, not a corpus audit.",
    ""
  )
  Write-Utf8NoBom (Join-Path $ReportRoot "REPORT.md") (($report -join "`n") + "`n")

  $verdict = [ordered]@{
    verdict = "P08_1_READ_ONLY_AUDIT_COMPLETE"
    sourceModifiedByAudit = $false
    sourceChangedDuringAudit = $false
    p07PathsTouched = $false
    dependenciesChanged = $false
    buildRun = $false
    auditedFileCount = $files.Count
    routeCount = $routeList.Count
    storageKeyCount = $storageList.Count
    searchAndAskSeparateRoutes = ($hasSearchRoute -and $hasAskRoute)
    reportRoot = $ReportRoot
    nextStep = "Upload the success ZIP for source-level P08.1 findings and the exact P08.2 implementation package."
  }
  Write-Utf8NoBom (Join-Path $ReportRoot "verdict.json") (($verdict | ConvertTo-Json -Depth 8) + "`n")

  Write-Manifest $ReportRoot
  New-Zip -SourceDirectory $ReportRoot -DestinationZip $SuccessZip

  Write-Host ""
  Write-Host "P08.1 audit completed successfully." -ForegroundColor Green
  Write-Host "Report: $ReportRoot"
  Write-Host "Upload ZIP: $SuccessZip" -ForegroundColor Cyan
  Write-Host "SHA256: $((Get-FileHash -LiteralPath $SuccessZip -Algorithm SHA256).Hash.ToLowerInvariant())"
  Write-Host ""
  Write-Host "No application source files were modified."
  Write-Host "No P07/P01-P04 paths were accessed by the audit scan."
} catch {
  New-FailurePackage -Failure $_
  throw
}
