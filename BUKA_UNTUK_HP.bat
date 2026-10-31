@echo off
setlocal
chcp 65001 >nul
title RPA 9 SAUDARA - JALUR ONLINE UNTUK HP

echo =======================================================================
echo          RPA 9 SAUDARA - RUMAH POTONG AYAM ^& SUPPLIER KARKAS
echo                 MODE ONLINE HP (CLOUDFLARE TUNNEL RESMI)
echo =======================================================================
echo.
echo [1/3] Membersihkan port sistem (3001 ^& 5173)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING') do taskkill /f /t /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do taskkill /f /t /pid %%a >nul 2>&1
taskkill /f /im cloudflared.exe >nul 2>&1

echo [2/3] Menyalakan server lokal RPA 9 Saudara...
start "RPA 9 SAUDARA - SERVER ENGINE" /min cmd /c "npm run dev"

echo [3/3] Menghubungkan jalur aman HTTPS Cloudflare untuk HP...
echo       Mohon tunggu sekitar 5-10 detik...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$cfExe = 'C:\Users\Karyana\AppData\Local\Programs\cloudflared\cloudflared.exe'; " ^
  "$logFile = '$env:TEMP\cf_hp_tunnel.log'; " ^
  "if (Test-Path $logFile) { Remove-Item $logFile -Force }; " ^
  "$proc = Start-Process -FilePath $cfExe -ArgumentList 'tunnel --url http://localhost:5173' -RedirectStandardError $logFile -PassThru -WindowStyle Hidden; " ^
  "$url = $null; " ^
  "for ($i = 0; $i -lt 30; $i++) { " ^
  "    Start-Sleep -Seconds 1; " ^
  "    if (Test-Path $logFile) { " ^
  "        $match = Select-String -Path $logFile -Pattern 'https://[a-zA-Z0-9-]+\.trycloudflare\.com'; " ^
  "        if ($match) { " ^
  "            $url = $match.Matches[0].Value; " ^
  "            break; " ^
  "        } " ^
  "    } " ^
  "}; " ^
  "if ($url) { " ^
  "    Clear-Host; " ^
  "    Write-Host '===============================================================================' -ForegroundColor Green; " ^
  "    Write-Host '          RPA 9 SAUDARA - APLIKASI AKTIF & SIAP DIBUKA DI HP' -ForegroundColor Yellow; " ^
  "    Write-Host '===============================================================================' -ForegroundColor Green; " ^
  "    Write-Host ''; " ^
  "    Write-Host ' 👉 Buka link HTTPS resmi ini di browser HP Anda (Bisa pakai Kuota 4G/WiFi):' -ForegroundColor Cyan; " ^
  "    Write-Host ''; " ^
  "    Write-Host ('    ' + $url) -ForegroundColor Yellow; " ^
  "    Write-Host ''; " ^
  "    Write-Host '===============================================================================' -ForegroundColor Green; " ^
  "    Write-Host ' CARA PASANG DI HP AGAR JADI APLIKASI:' -ForegroundColor White; " ^
  "    Write-Host ' 1. Ketik/buka link kuning di atas di Google Chrome HP Anda.' -ForegroundColor Gray; " ^
  "    Write-Host ' 2. Di pojok kanan atas Chrome HP, tekan Titik Tiga (⋮).' -ForegroundColor Gray; " ^
  "    Write-Host ' 3. Pilih \"Tambahkan ke Layar Utama\" (Install Aplikasi).' -ForegroundColor Gray; " ^
  "    Write-Host ' 4. Ikon RPA 9 Saudara akan terpasang di layar utama HP Anda!' -ForegroundColor Gray; " ^
  "    Write-Host '===============================================================================' -ForegroundColor Green; " ^
  "    Write-Host ' JANGAN TUTUP JENDELA INI SELAMA MENGGUNAKAN APLIKASI DI HP.' -ForegroundColor Red; " ^
  "    Write-Host ''; " ^
  "    Start-Process $url; " ^
  "    Wait-Process -Id $proc.Id; " ^
  "} else { " ^
  "    Write-Host 'Gagal mendapatkan link Cloudflare. Pastikan koneksi internet aktif.' -ForegroundColor Red; " ^
  "}"

pause
