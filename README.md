# Berita Saudi untuk MEDIA ASPHIRASI

Pipeline yang memantau portal berita Arab Saudi, memilih isu yang berdampak bagi
travel haji-umrah dan jemaah Indonesia, lalu menulis **draft** berita-analisis
berbahasa Indonesia ke CMS (Sanity) [mediaasphirasi.org](https://mediaasphirasi.org).
Tidak ada yang tayang otomatis: editor meninjau di Studio, lalu Publish atau Delete.

## Alur satu putaran

1. **Sumber.** Al Jazeera (RSS), Saudi Press Agency (data halaman), dan Saudi Updates (RSS)
   dibaca isinya penuh. Arab News dan Al Arabiya memasang tantangan bot, jadi judulnya
   hanya dipantau lewat Google News sebagai penanda isu yang ramai.
2. **Seleksi.** Claude memberi skor dampak dan potensi viral sesuai fokus redaksi.
3. **Tulis.** Berita-analisis 450-800 kata dengan subjudul "Apa artinya bagi ..." dan
   penutup "Catatan ASPHIRASI" (3 paragraf). Analisis menjelaskan dampak dan langkah
   praktis, tanpa mengambil sikap atas nama asosiasi.
4. **Pengaman** (`src/pengaman.mjs`, diuji `npm run uji`): angka wajib ada di sumber
   (dibandingkan nilainya), superlatif wajib berdasar, tanpa sikap, tanpa em-dash,
   struktur wajib, subjek foto terlarang ditolak.
5. **Sampul.** z_image dulu (3 percobaan), nano_banana sebagai cadangan. Tiap gambar
   diperiksa visual: tanpa tulisan, manusia, tempat ibadah/landmark, logo.
6. **Draft** `drafts.saudi.<slug>` di kategori Saudi Update, lengkap dengan sumber dan tautannya.

## Menjalankan

```bash
npm ci
npm run uji
node src/jalankan.mjs --kering --maks 1   # tanpa menulis ke Sanity, hasil di keluaran/
node src/jalankan.mjs                     # putaran sungguhan
```

Rahasia yang dibutuhkan: `CLAUDE_CODE_OAUTH_TOKEN`, `SANITY_API_WRITE_TOKEN`.
Batas: `MAKS_PER_PUTARAN` (bawaan 3), `MAKS_PER_HARI` (bawaan 20), `MENIT` (bawaan 14).
