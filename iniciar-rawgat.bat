@echo off
cd /d "%~dp0"
set PORT=9002
echo Iniciando RAWGAT en http://localhost:9002/ ...
node server\index.js
pause
