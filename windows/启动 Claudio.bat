@echo off
title Claudio

start "NCM API" cmd /k "cd /d %~dp0ncm && set PORT=3030 && npx NeteaseCloudMusicApi"

timeout /t 2 /nobreak >nul

start "Claudio Backend" cmd /k "cd /d %~dp0backend && npm start"

timeout /t 3 /nobreak >nul

start http://localhost:8080
