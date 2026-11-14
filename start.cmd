@echo off
rem MoneyFlow: double-click to start. Close this window (or press Ctrl+C) to stop.
cd /d "%~dp0"

if not exist "backend\MoneyFlow.Api\wwwroot\index.html" (
  echo Building the web app for the first time...
  pushd frontend
  if not exist node_modules call npm install
  call npm run build:api || (popd & pause & exit /b 1)
  popd
)

echo.
echo MoneyFlow is starting...
echo   Laptop: http://localhost:5080
echo   Phone (same Wi-Fi): http://YOUR-LAPTOP-IP:5080   (run "ipconfig" to see the IP)
echo.
rem Open the browser a few seconds later, once the server is listening.
start "" /min cmd /c "timeout /t 6 /nobreak >nul & start http://localhost:5080"
dotnet run --project backend\MoneyFlow.Api
pause
