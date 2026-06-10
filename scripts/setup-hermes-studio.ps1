$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

function Assert-Command($Name, $InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is required. $InstallHint"
  }
}

Assert-Command "node" "Install Node.js LTS from https://nodejs.org/"
Assert-Command "npm" "Install Node.js LTS from https://nodejs.org/"
Assert-Command "git" "Install Git for Windows from https://git-scm.com/download/win"

$NodeVersion = (& node --version)
$NpmVersion = (& npm --version)
Write-Output "Node: $NodeVersion"
Write-Output "npm: $NpmVersion"

if ($NodeVersion -notmatch "^v(20|22|24)\.") {
  throw "Node.js 20, 22, or 24 is required. Current: $NodeVersion"
}

if (Test-Path -LiteralPath "package-lock.json") {
  npm.cmd ci
} else {
  npm.cmd install
}

npx.cmd playwright install chromium

npm.cmd run check:clone-ready
npm.cmd run check:studio-inputs
npm.cmd run check:flow-output-mode
npm.cmd run check:final-output-qa
npm.cmd run electron:pack
npm.cmd run shortcut:create
powershell -ExecutionPolicy Bypass -File scripts\check-shortcut.ps1

Write-Output "Hermes YouTube Studio setup complete."
Write-Output "Launch from the Desktop shortcut or run: powershell -ExecutionPolicy Bypass -File scripts\launch-hermes-studio.ps1"
