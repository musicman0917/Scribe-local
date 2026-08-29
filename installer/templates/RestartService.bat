@echo off
echo Restarting the Scribe Local service (picks up service\port.txt changes)...
"%~dp0runtime\node.exe" "%~dp0service\restart-service.js"
echo.
pause
