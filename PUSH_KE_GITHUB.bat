@echo off
setlocal
chcp 65001 >nul
title RPA 9 SAUDARA - PUSH KE GITHUB

echo ========================================================
echo       RPA 9 SAUDARA - SINKRONISASI KE GITHUB
echo ========================================================
echo.

set "GIT_CMD=C:\Users\Karyana\AppData\Local\Programs\MinGit\cmd\git.exe"

if not exist "%GIT_CMD%" (
    echo [ERROR] Git tidak ditemukan di %GIT_CMD%
    pause
    exit /b 1
)

:: Cek remote origin
"%GIT_CMD%" remote get-url origin >nul 2>&1
if %errorlevel% neq 0 (
    echo Repository belum terhubung ke GitHub!
    echo.
    echo Silakan buat repository baru di https://github.com/new
    echo Lalu copy link repository Anda (contoh: https://github.com/username/rpa-9-saudara.git)
    echo.
    set /p "REPO_URL=Masukkan Link Repository GitHub: "
    if "%REPO_URL%"=="" (
        echo Link tidak boleh kosong. Dibatalkan.
        pause
        exit /b 1
    )
    "%GIT_CMD%" remote add origin "%REPO_URL%"
    echo.
    echo Remote origin berhasil ditambahkan!
)

echo Menyimpan semua perubahan terbaru...
"%GIT_CMD%" add .

set "COMMIT_MSG=Update: %date% %time%"
set /p "USER_MSG=Ketik pesan update (Tekan ENTER untuk default): "
if not "%USER_MSG%"=="" set "COMMIT_MSG=%USER_MSG%"

"%GIT_CMD%" commit -m "%COMMIT_MSG%"

echo.
echo Mengirim kode ke GitHub (branch main)...
"%GIT_CMD%" push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo ========================================================
    echo  BERHASIL! Kode terbaru telah terupload ke GitHub.
    echo ========================================================
) else (
    echo.
    echo [CATATAN] Jika diminta login, masukkan Username & Personal Access Token GitHub Anda.
)

echo.
pause
