$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Launcher = Join-Path $Root "scripts\launch-hermes-studio.ps1"
$ExePath = Join-Path $Root "dist-electron\win-unpacked\Hermes YouTube Studio.exe"
$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "Hermes YouTube Studio.lnk"

if (-not (Test-Path -LiteralPath $Launcher)) {
  throw "Launcher script not found: $Launcher"
}

if (-not (Test-Path -LiteralPath $ExePath)) {
  throw "Packaged app not found. Run npm run electron:pack first. Missing: $ExePath"
}

$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$Shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Launcher`""
$Shortcut.WorkingDirectory = $Root
$Shortcut.IconLocation = "$ExePath,0"
$Shortcut.Save()

Write-Output "Created shortcut: $ShortcutPath"
Write-Output "Target: $($Shortcut.TargetPath)"
Write-Output "Arguments: $($Shortcut.Arguments)"
Write-Output "WorkDir: $($Shortcut.WorkingDirectory)"
Write-Output "Icon: $($Shortcut.IconLocation)"
