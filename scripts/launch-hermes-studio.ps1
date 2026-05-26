$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ExePath = Join-Path $Root "dist-electron\win-unpacked\Hermes YouTube Studio.exe"
$WorkingDirectory = Split-Path -Parent $ExePath

if (-not (Test-Path -LiteralPath $ExePath)) {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show("Hermes YouTube Studio.exe not found: $ExePath", "Hermes Launcher") | Out-Null
  exit 1
}

$targetFullName = (Get-Item -LiteralPath $ExePath).FullName
$oldProcesses = Get-Process -ErrorAction SilentlyContinue |
  Where-Object {
    $_.ProcessName -eq "Hermes YouTube Studio" -and
    $_.Path -and
    ([System.IO.Path]::GetFullPath($_.Path) -eq $targetFullName)
  }

foreach ($process in $oldProcesses) {
  try {
    Stop-Process -Id $process.Id -Force -ErrorAction Stop
  } catch {
    Write-Error "Failed to stop Hermes process $($process.Id): $($_.Exception.Message)"
  }
}

if ($oldProcesses.Count -gt 0) {
  Start-Sleep -Milliseconds 700
}

Start-Process -FilePath $ExePath -WorkingDirectory $WorkingDirectory
