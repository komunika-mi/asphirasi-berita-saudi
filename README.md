# Berita Saudi untuk MEDIA ASPHIRASI

Pipeline yang memantau portal berita Arab Saudi dan sumber regulasi resmi Indonesia,
memilih isu yang berdampak bagi travel haji-umrah dan jemaah Indonesia, lalu menulis
**draft** berita-analisis berbahasa Indonesia ke CMS (Sanity) [mediaasphirasi.org](https://mediaasphirasi.org).
Tidak ada yang tayang otomatis: editor meninjau di Studio, lalu Publish atau Delete.

| Jalur | Sumber | Kategori | Jatah |
|---|---|---|---|
| `saudi` | Al Jazeera, SPA, Saudi Updates, Arab News (+ radar Al Arabiya) | Saudi Update, `drafts.saudi.<slug>` | 5 per putaran, 20 per hari |
| `regulasi` (sejak 9 Okt 2026) | siaran pers Kemenhaj (`haji.go.id/api/news`), E-Media DPR RI (`rss.xml`, disaring kata haji/umrah) | Regulasi, `drafts.regulasi.<slug>` | 2 per putaran, 4 per hari |

Jalur regulasi dikerjakan lebih dulu tiap putaran. Seleksinya hanya memilih berita yang
memuat aturan atau kebijakan, satu per peristiwa, dan menolak peristiwa yang sudah ditulis
editor (semua tulisan 72 jam terakhir dibandingkan). Pengamannya membaca angka sumber
dengan format Indonesia, dan kutipan narasumber yang bersikap tetap boleh.

## Dua bagian

| Bagian | Jalan di | Jadwal | Tugas |
|---|---|---|---|
| `src/jalankan.mjs` | GitHub Actions | tiap jam 06.23-22.23 WIB | tulis draft tanpa sampul + pesanan sampul |
| `src/sampul-laptop.mjs` | Task Scheduler laptop, "ASPHIRASI - Sampul berita Saudi" | tiap jam menit 45, menyusul bila terlewat | buat sampul z_image, periksa, pasang ke draft |

Sampul dibuat di laptop karena z_image hanya tersedia lewat CLI Higgsfield yang login
di laptop (API Higgsfield Cloud tidak memuat z_image dan saldonya terpisah dari paket
Pro). Saat laptop mati, draft tetap ada tetapi belum bisa di-Publish sampai sampulnya
terpasang, kecuali editor memasang foto sendiri.

## Alur satu putaran cloud

1. **Sumber.** Al Jazeera (RSS), Saudi Press Agency (data halaman), dan Saudi Updates (RSS)
   dibaca isinya penuh. Arab News dibaca penuh bila situsnya tidak sedang menantang bot;
   Al Arabiya selalu menantang, jadi judulnya hanya dipantau lewat Google News.
2. **Seleksi.** Claude memberi skor dampak dan potensi viral sesuai fokus redaksi, plus cadangan.
3. **Tulis.** Berita-analisis 450-800 kata dengan subjudul "Apa artinya bagi ..." dan
   penutup "Catatan ASPHIRASI" (3 paragraf). Analisis menjelaskan dampak dan langkah
   praktis, tanpa mengambil sikap atas nama asosiasi.
4. **Pengaman** (`src/pengaman.mjs`, diuji `npm run uji`): angka wajib ada di sumber
   (dibandingkan nilainya), superlatif wajib berdasar, tanpa sikap, tanpa em-dash,
   struktur wajib, subjek foto terlarang ditolak.
5. **Draft** `drafts.saudi.<slug>` (Saudi Update) atau `drafts.regulasi.<slug>` (Regulasi)
   + dokumen pesanan `pipeline.sampul.<slug>`, dalam satu transaksi.

Sampul: z_image dulu (3 percobaan), nano_banana cadangan. Tiap gambar diperiksa visual:
tanpa tulisan, manusia, tempat ibadah/landmark, logo.

## Menjalankan manual

```bash
npm ci
npm run uji
node src/jalankan.mjs --kering --maks 1          # tanpa menulis ke Sanity, hasil di keluaran/
node src/jalankan.mjs --kering --jalur regulasi  # hanya jalur regulasi
SAMPUL=laptop node src/jalankan.mjs --maks 1     # seperti putaran cloud
node src/sampul-laptop.mjs                       # kerjakan pesanan sampul
```

Rahasia GitHub: `CLAUDE_CODE_OAUTH_TOKEN`, `SANITY_API_WRITE_TOKEN`.
Batas: `MAKS_PER_PUTARAN` (3), `MAKS_PER_HARI` (20), `MAKS_REGULASI_PER_PUTARAN` (2),
`MAKS_REGULASI_PER_HARI` (4), `JALUR` (regulasi,saudi), `MENIT` (14), `MAKS_SAMPUL` (10).
Jalur putaran terjadwal diatur `JALUR_TERJADWAL` di workflow; uji kering lewat Actions
(Run workflow) menyimpan naskahnya sebagai artefak `naskah-uji-kering`.
Log laptop: `keluaran/log/sampul-YYYY-MM-DD.log`.
