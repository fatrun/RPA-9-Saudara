@echo off
setlocal
chcp 65001 >nul
title RPA 9 SAUDARA - PUSH KE GITHUB (FATRUN)

set "GIT_DIR=C:\Users\Karyana\AppData\Local\Programs\MinGit\cmd"
set "GH_DIR=C:\Users\Karyana\AppData\Local\Programs\GitHubCLI"
set "PATH=%GIT_DIR%;%GH_DIR%;%PATH%"

echo ====================================================================
echo             RPA 9 SAUDARA - PUSH KE GITHUB
echo             Repository: https://github.com/fatrun/RPA-9-Saudara.git
echo ====================================================================
echo.

:: Cek status login GitHub
gh.exe auth status >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Laptop Anda belum terhubung ke akun GitHub fatrun.
    echo.
    echo Sistem akan membuka browser untuk otorisasi login 1-klik:
    echo 1. Browser Anda akan terbuka otomatis.
    echo 2. Masukkan kode 8 digit yang muncul di layar CMD ini ke browser.
    echo 3. Klik tombol "Authorize".
    echo.
    pause
    gh.exe auth login --web -h github.com
    gh.exe auth setup-git
)

echo.
echo [1/3] Menyiapkan remote repository...
git.exe remote remove origin >nul 2>&1
git.exe remote add origin https://github.com/fatrun/RPA-9-Saudara.git
git.exe branch -M main

echo.
echo [2/3] Menyimpan update perubahan file...
git.exe add .
git.exe commit -m "Update sistem RPA 9 Saudara" >nul 2>&1

echo.
echo [3/3] Mengirim (PUSH) kode ke GitHub repository fatrun...
git.exe push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo ====================================================================
    echo  SELAMAT! KODE BERHASIL TERUPLOAD KE GITHUB!
    echo  Link: https://github.com/fatrun/RPA-9-Saudara
    echo ====================================================================
) else (
    echo.
    echo [GAGAL] Terjadi kendala saat push. Pastikan akun GitHub Anda memiliki akses ke repo ini.
)

echo.
pause
