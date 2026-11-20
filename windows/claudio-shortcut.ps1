# Creates the Claudio desktop shortcut.
# All-ASCII content to avoid GBK/UTF-8 encoding issues on any machine.
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs = Join-Path $scriptDir 'claudio.vbs'

if (-not (Test-Path $vbs)) {
    Write-Host "[ERROR] claudio.vbs not found at: $vbs" -ForegroundColor Red
    Start-Sleep -Seconds 5
    exit 1
}

$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'Claudio.lnk'

$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($lnkPath)
$sc.TargetPath = "$env:WINDIR\System32\wscript.exe"
$sc.Arguments = "`"$vbs`""
$sc.WorkingDirectory = $scriptDir
$sc.Description = 'Claudio personal DJ'
$ico = Join-Path $scriptDir 'claudio.ico'
if (Test-Path $ico) { $sc.IconLocation = $ico }
$sc.Save()

Write-Host "[OK] Desktop shortcut created:" -ForegroundColor Green
Write-Host "      $lnkPath" -ForegroundColor Gray
Write-Host "      -> wscript $vbs" -ForegroundColor Gray
Start-Sleep -Seconds 3
