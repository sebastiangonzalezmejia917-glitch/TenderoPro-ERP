@echo off
setlocal
cd /d "%~dp0"

set PORT=8000
for /f %%i in ('powershell -NoProfile -Command "$ip=(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.*'} | Select-Object -First 1 -ExpandProperty IPAddress); if($ip){$ip}else{'127.0.0.1'}"') do set "IP=%%i"

echo Iniciando servidor de la web...
echo Abre desde tu celular: http://%IP%:%PORT%
echo O desde este mismo equipo: http://localhost:%PORT%
start "" http://%IP%:%PORT%

where py >nul 2>&1
if not errorlevel 1 (
  py -3 -m http.server %PORT% --bind 0.0.0.0
) else (
  where python >nul 2>&1
  if not errorlevel 1 (
    python -m http.server %PORT% --bind 0.0.0.0
  ) else (
    echo No se pudo iniciar el servidor con Python. Instala Python y vuelve a intentarlo.
    pause
  )
)
