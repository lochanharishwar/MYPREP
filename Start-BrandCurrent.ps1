$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Install Node.js 22.13 or newer, then run this file again.'
}
if (-not (Test-Path -LiteralPath 'node_modules/vinext')) {
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
Write-Host 'MARKY starts with no app login or signup. Open the Local URL printed below.'
Write-Host 'The preferred port is 3000. If it is busy, the server may choose another port.'
Write-Host 'Use the same browser and exact Local URL to return to your saved workspace.'
Write-Host 'Keep this terminal open. Press Ctrl+C to stop the local server.'
& npm.cmd run local
exit $LASTEXITCODE
