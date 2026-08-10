[CmdletBinding()]
param(
    [string]$RepositoryRoot = "C:\Users\CreatorStudio\ai-bible-app"
)

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $RepositoryRoot

node `
    --max-old-space-size=8192 `
    ".\scripts\p08\p07-final-runtime-integration\run-p08-p07-final-runtime-integration.cjs" `
    --repository-root $RepositoryRoot `
    --package-root ".\scripts\p08\p07-final-runtime-integration" `
    --accept-integration

exit $LASTEXITCODE
