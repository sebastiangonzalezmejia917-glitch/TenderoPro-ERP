@echo off
setlocal
cd /d "%~dp0"

echo Iniciando servidor de la web en http://localhost:8000...
start "" http://localhost:8000

where py >nul 2>&1
if not errorlevel 1 (
  py -3 -m http.server 8000
) else (
  where python >nul 2>&1
  if not errorlevel 1 (
    python -m http.server 8000
  ) else (
    echo No se pudo iniciar el servidor con Python. Instala Python y vuelve a intentarlo.
    pause
  )
)
