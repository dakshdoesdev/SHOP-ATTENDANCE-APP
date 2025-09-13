[CmdletBinding()]
param(
  [int]$Port = 5000,
  [string]$ShortcutName = 'shop attendance.lnk'
)

set-strictmode -version latest
$ErrorActionPreference = 'Stop'

function Get-PowerShellExePath {
  $candidates = @(
    (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'),
    'powershell.exe'
  )
  foreach ($p in $candidates) { if (Test-Path -LiteralPath $p) { return $p } }
  return 'powershell.exe'
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$scriptPath  = Join-Path $projectRoot 'scripts\start-dev.ps1'
if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "Cannot find start-dev.ps1 at $scriptPath"
}

$psExe    = Get-PowerShellExePath
$desktop  = [Environment]::GetFolderPath('Desktop')
$lnkPath  = Join-Path $desktop $ShortcutName

$wsh = New-Object -ComObject WScript.Shell
$sc  = $wsh.CreateShortcut($lnkPath)
$sc.TargetPath = $psExe
$sc.Arguments  = ('-NoProfile -ExecutionPolicy Bypass -File "{0}" -Port {1}' -f $scriptPath, $Port)
$sc.WorkingDirectory = $projectRoot
$sc.IconLocation = $psExe + ',0'
$sc.WindowStyle = 1
$sc.Description = 'Start dev server with ngrok and auto-update env files'
$sc.Save()

Write-Host "Created Desktop shortcut: $lnkPath" -ForegroundColor Green

