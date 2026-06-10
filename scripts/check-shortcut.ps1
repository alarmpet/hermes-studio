$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "Hermes YouTube Studio.lnk"
$Launcher = Join-Path $Root "scripts\launch-hermes-studio.ps1"
$ExePath = Join-Path $Root "dist-electron\win-unpacked\Hermes YouTube Studio.exe"

if (-not (Test-Path -LiteralPath $ShortcutPath)) {
  throw "Shortcut not found: $ShortcutPath"
}

$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)

Write-Output "Target: $($Shortcut.TargetPath)"
Write-Output "Arguments: $($Shortcut.Arguments)"
Write-Output "WorkDir: $($Shortcut.WorkingDirectory)"
Write-Output "Icon: $($Shortcut.IconLocation)"

if ($Shortcut.TargetPath -notmatch "powershell\.exe$") {
  throw "Shortcut should target powershell.exe"
}

if ($Shortcut.Arguments -notlike "*$Launcher*") {
  throw "Shortcut should launch $Launcher"
}

if (-not (Test-Path -LiteralPath $ExePath)) {
  throw "EXE not found: $ExePath"
}

$FileInfo = Get-Item -LiteralPath $ExePath
Write-Output "EXE exists: $ExePath"
Write-Output "EXE LastModified: $($FileInfo.LastWriteTime)"
