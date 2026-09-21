$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Install Node.js 22.13 or newer, then run this file again.'
}
if (-not (Test-Path -LiteralPath 'node_modules/vinext')) {
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
Write-Host 'BrandCurrent opens at http://localhost:3000 with no app login or signup.'
Write-Host 'Keep this terminal open. Press Ctrl+C to stop the local server.'
& npm.cmd run local
exit $LASTEXITCODE
