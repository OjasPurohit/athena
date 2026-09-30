@echo off
title Project Athena -- One-Click SOC Launcher
cd /d "C:\Work\SY\athena\athena"

echo ============================================================
echo   PROJECT ATHENA -- Autonomous Honeypot SOC Launcher
echo ============================================================
echo.

echo [1/3] Starting Docker Containers (Cowrie, Elasticsearch, Kibana, Filebeat)...
docker compose up -d
echo.

echo [2/3] Launching FastAPI Backend + Auto-ML Engine (Port 8000)...
start "Athena FastAPI + ML Engine" cmd /k "cd /d C:\Work\SY\athena\athena && python -m uvicorn api.main:app --host 0.0.0.0 --port 8000"

echo [3/3] Launching React SOC Dashboard (Port 5173)...
start "Athena React Dashboard" cmd /k "cd /d C:\Work\SY\athena\athena\dashboard && npm run dev"

timeout /t 4 /nobreak >nul
start http://localhost:5173
echo.
echo [OK] Project Athena is live at http://localhost:5173
echo      You can trigger Brute-Force, Credential Spray, and Benign Admin
echo      simulations directly using the buttons in the top-right header!
pause
