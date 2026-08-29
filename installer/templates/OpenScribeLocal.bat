@echo off
setlocal
set "PORT=3000"
if exist "%~dp0service\port.txt" (
  for /f "usebackq delims=" %%p in ("%~dp0service\port.txt") do set "PORT=%%p"
)
start http://localhost:%PORT%
