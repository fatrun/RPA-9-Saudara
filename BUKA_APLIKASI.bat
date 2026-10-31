@echo off
title RPA 9 SAUDARA - Sistem Manajemen & Pembukuan
color 0A

echo =======================================================================
echo          RPA 9 SAUDARA - RUMAH POTONG AYAM ^& SUPPLIER KARKAS
echo                 Fresh Higienis - Halal - Barokah
echo =======================================================================
echo.
echo [1/3] Memeriksa ^& membersihkan proses zombie ^& port sistem (3001 ^& 5173)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING') do taskkill /f /t /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do taskkill /f /t /pid %%a >nul 2>&1

echo [2/3] Menyiapkan server lokal backend API ^& database PGlite...
echo [3/3] Menyiapkan antarmuka web interaktif...
echo.
echo JANGAN TUTUP JENDELA INI SELAMA MENGGUNAKAN APLIKASI.
echo =======================================================================
echo.

cd /d "%~dp0"

:: Buka browser hanya setelah Backend API (3001) DAN Web Frontend (5173) benar-benar siap dan merespons HTTP 200
start "" powershell -WindowStyle Hidden -Command "$ready = $false; for ($i = 0; $i -lt 60; $i++) { try { $resApi = Invoke-WebRequest -Uri 'http://localhost:3001/api/health' -UseBasicParsing -TimeoutSec 1; $resWeb = Invoke-WebRequest -Uri 'http://localhost:5173' -UseBasicParsing -TimeoutSec 1; if ($resApi.StatusCode -eq 200 -and $resWeb.StatusCode -eq 200) { $ready = $true; break } } catch {}; Start-Sleep -Milliseconds 500 }; Start-Process 'http://localhost:5173'"

:: Jalankan server backend dan web frontend
npm run dev

pause
