$ErrorActionPreference = 'Stop'
if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'Este instalador atende Windows x64.' }
$nodeVersion = 'v24.22.2'
$archiveName = 'node-v24.22.2-win-x64.zip'
$runtimeRoot = Join-Path $env:LOCALAPPDATA 'EmpreGatos\runtime'
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
$archivePath = Join-Path $runtimeRoot $archiveName
Invoke-WebRequest -Uri "https://nodejs.org/dist/$nodeVersion/$archiveName" -OutFile $archivePath
$checksums = (Invoke-WebRequest -Uri "https://nodejs.org/dist/$nodeVersion/SHASUMS256.txt").Content
$checksumLine = $checksums -split "`n" | Where-Object { $_ -match "\s+$([regex]::Escape($archiveName))\s*$" }
if (-not $checksumLine) { throw 'Checksum oficial não encontrado.' }
$expectedHash = $checksumLine.Trim().Split(' ')[0]
$actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($expectedHash -ne $actualHash) { throw 'O checksum do Node não corresponde ao publicado pelo fornecedor.' }
Expand-Archive -LiteralPath $archivePath -DestinationPath $runtimeRoot -Force
$runtimeNode = Join-Path $runtimeRoot 'node-v24.22.2-win-x64\node.exe'
& $runtimeNode --version
