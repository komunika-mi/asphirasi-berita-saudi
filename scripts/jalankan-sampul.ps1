# Pengerja sampul z_image untuk draft berita Saudi ASPHIRASI.
# Didaftarkan di Task Scheduler sebagai "ASPHIRASI - Sampul berita Saudi".

# JANGAN 'Stop': PowerShell 5.1 menganggap stderr program native sebagai error
# fatal walau programnya sukses (pelajaran jalankan-idx.ps1 The Signal).
$ErrorActionPreference = 'Continue'
$proyek = 'D:\projects\asphirasi-berita-saudi'
$logDir = Join-Path $proyek 'keluaran\log'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir ('sampul-' + (Get-Date -Format 'yyyy-MM-dd') + '.log')

function Catat($pesan) {
  Add-Content -Path $log -Value ((Get-Date -Format 'HH:mm:ss') + '  ' + $pesan) -Encoding utf8
}

# Proses yang dinyalakan Windows tidak mewarisi login Claude dari aplikasi
# Desktop (paket MSIX), jadi token dibaca dari berkas hasil `claude setup-token`.
$berkasToken = Join-Path $env:USERPROFILE '.claude\claude-oauth-token.txt'
$cocok = [regex]::Match((Get-Content -Raw $berkasToken), 'sk-ant-oat01-[A-Za-z0-9_-]+')
if (-not $cocok.Success) { Catat 'GAGAL: token Claude tidak ditemukan di claude-oauth-token.txt'; exit 1 }
$env:CLAUDE_CODE_OAUTH_TOKEN = $cocok.Value

$baris = Get-Content 'D:\projects\asphirasi-app\.env.local' | Where-Object { $_ -match '^SANITY_API_WRITE_TOKEN=' } | Select-Object -First 1
if (-not $baris) { Catat 'GAGAL: SANITY_API_WRITE_TOKEN tidak ditemukan di .env.local asphirasi-app'; exit 1 }
$env:SANITY_API_WRITE_TOKEN = ($baris -replace '^SANITY_API_WRITE_TOKEN=', '').Trim().Trim('"')
$env:HIGGSFIELD_BIN = Join-Path $env:USERPROFILE '.higgsfield\bin\higgsfield.exe'

Set-Location $proyek
Catat 'mulai'
# Keluaran node langsung DITAMBAHKAN ke berkas log baris demi baris lewat cmd.
# Dulu ditampung lalu ditulis di akhir, sehingga putaran 15 Sep 2026 10.13 yang
# terhenti di tengah jalan tidak meninggalkan jejak apa pun. Lewat cmd juga
# supaya stderr node tetap teks biasa (2>&1 di PowerShell 5.1 membungkusnya
# jadi ErrorRecord palsu).
cmd /c "node src\sampul-laptop.mjs >> $log 2>&1"
$kode = $LASTEXITCODE
Catat "selesai, kode keluar $kode"
exit $kode
