# Claudio hidden launcher
# Starts NCM API + backend with no console windows, opens the UI in a
# dedicated Edge app window, then shuts the servers down when that window closes.
$ErrorActionPreference = 'SilentlyContinue'

# Resolve paths relative to THIS script, so the launcher works on any machine
# regardless of username or install location.
$root       = Split-Path -Parent $MyInvocation.MyCommand.Path
$ncmDir     = Join-Path $root 'ncm'
$backendDir = Join-Path $root 'backend'
$url        = 'http://localhost:8080'
$profileDir = Join-Path $root '.edge-profile'   # persistent (TEMP gets wiped, losing the saved geolocation grant)

$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edge)) { $edge = 'C:\Program Files\Microsoft\Edge\Application\msedge.exe' }

# 1) Start the two servers hidden (no terminal windows)
$ncm = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/c', "cd /d `"$ncmDir`" && set PORT=3030 && npx NeteaseCloudMusicApi" `
    -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 2

$backend = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/c', "cd /d `"$backendDir`" && node --env-file=.env services/keepalive.js" `
    -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 3

# 2) Open the UI as a standalone Edge app window (own profile = own process,
#    keeps it out of the user's default Chrome and lets us detect its close)
Start-Process -FilePath $edge -ArgumentList @(
    "--app=$url",
    "--user-data-dir=$profileDir",
    "--no-first-run",
    "--no-default-browser-check"
)
Start-Sleep -Seconds 3

# 3) Wait until that Edge app window is gone (any msedge using our profile)
while ($true) {
    $alive = Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" |
             Where-Object { $_.CommandLine -like "*$profileDir*" }
    if (-not $alive) { break }
    Start-Sleep -Seconds 2
}

# 4) Window closed -> kill both servers and their child node processes
if ($ncm)     { taskkill /PID $ncm.Id     /T /F 2>$null | Out-Null }
if ($backend) { taskkill /PID $backend.Id /T /F 2>$null | Out-Null }
