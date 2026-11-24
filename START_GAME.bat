@echo off
cd /d "%~dp0"
start "Krovotkinskaya server" /min cmd /c "py -m http.server 8000"
timeout /t 2 /nobreak >nul
start "" http://localhost:8000
