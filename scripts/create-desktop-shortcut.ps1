<#!
Creates two Desktop shortcuts for one‑click start:
  - "Attendance Prod (ngrok, fast).lnk"     → runs prod-auto.ps1 without rebuild
  - "Attendance Prod (ngrok, rebuild).lnk"  → runs prod-auto.ps1 with -RebuildClient

Usage:
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\create-desktop-shortcut.ps1 -ProjectRoot "C:\\path\\to\\SHOP-ATTENDANCE-APP" [-Port 5000] [-Tunnel ngrok]
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$ProjectRoot,

  [int]$Port = 5000,

  [ValidateSet('ngrok')]
  [string]$Tunnel = 'ngrok'
)

set-strictmode -version latest
$ErrorActionPreference = 'Stop'

function Get-PowerShellExePath {
  $candidates = @(
    Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'),
    'powershell.exe'
  foreach ($p in $candidates) { if (Test-Path -LiteralPath $p) { return $p } }
  return 'powershell.exe'
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$scriptPath = Join-Path $ProjectRoot 'scripts\prod-auto.ps1'
if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "Cannot find prod-auto.ps1 at $scriptPath"
}

$psExe = Get-PowerShellExePath
$desktop = [Environment]::GetFolderPath('Desktop')
$workingDir = $ProjectRoot

function New-DesktopShortcut {
  param(
    [Parameter(Mandatory=$true)][string]$Name,
    [Parameter(Mandatory=$true)][bool]$Rebuild
  )
  $wsh = New-Object -ComObject WScript.Shell
  $lnkPath = Join-Path $desktop $Name
  $sc = $wsh.CreateShortcut($lnkPath)
  $sc.TargetPath = $psExe
  $args = @(
    '-NoProfile','-ExecutionPolicy','Bypass','-File', '"' + $scriptPath + '"',
    '-ProjectRoot','"' + $ProjectRoot + '"',
    '-Port', $Port.ToString(),
    '-Tunnel', $Tunnel
  )
  if ($Rebuild) { $args += '-RebuildClient' }
  $sc.Arguments = ($args -join ' ')
  $sc.WorkingDirectory = $workingDir
  $sc.IconLocation = $psExe + ',0'
  $sc.WindowStyle = 1
  $sc.Description = 'Start attendance backend via ngrok and update env files'
  $sc.Save()
  Write-Host "Created: $lnkPath" -ForegroundColor Green
}

New-DesktopShortcut -Name 'Attendance Prod (ngrok, fast).lnk' -Rebuild:$false
New-DesktopShortcut -Name 'Attendance Prod (ngrok, rebuild).lnk' -Rebuild:$true

Write-Host "Shortcuts created on Desktop. Double-click to start." -ForegroundColor Cyan

