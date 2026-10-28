@echo off
title Smart Factory - Local Web Dashboard Server
echo =========================================================================
echo   Opening Smart Factory Digital Twin Web Dashboard
echo =========================================================================
start http://localhost:8080/index.html
python -m http.server 8080
pause
