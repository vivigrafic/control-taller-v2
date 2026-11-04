@echo off
rem Doble clic en la segunda PC (la de respaldo) para que también arme las vistas previas de los archivos pesados.
rem Necesita Google Drive para escritorio abierto con la cuenta del taller.
echo Instalando las vistas previas de la fila (PC de respaldo)...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar_vistas_previas.ps1" -Respaldo
echo.
pause
