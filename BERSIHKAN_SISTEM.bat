@echo off
title BERSIHKAN SISTEM & MEMORI - RPA 9 SAUDARA
color 0E

echo =======================================================================
echo          PEMBERSIHAN PROSES LATAR BELAKANG & MEMORI LAPTOP
echo =======================================================================
echo.
echo [1/2] Menutup proses Node.js yang tertinggal di memori...
taskkill /f /im node.exe >nul 2>&1

echo [2/2] Membersihkan port 3001 dan 5173...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING') do taskkill /f /t /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do taskkill /f /t /pid %%a >nul 2>&1

echo.
echo =======================================================================
echo [SELESAI] Semua proses gantung berhasil dibersihkan!
echo Laptop Anda sekarang kembali adem dan enteng.
echo =======================================================================
echo.
echo Tekan sembarang tombol untuk menutup jendela ini...
pause >nul
