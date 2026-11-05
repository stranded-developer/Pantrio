@echo off
REM Windows laptop stand-in for the STB. Settings in .env next to this file.
REM Set Power ^& sleep to "Never" while it runs. Stop with Ctrl+C.
cd /d "%~dp0"
if not exist .env (echo Missing .env - copy .env.example to .env and fill it in. & pause & exit /b 1)
node --env-file=.env index.mjs
pause
