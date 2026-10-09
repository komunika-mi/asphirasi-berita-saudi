// Pengaman untuk jalur regulasi: sumbernya berbahasa Indonesia (siaran pers
// Kemenhaj, berita E-Media DPR), jadi angka dan superlatif dibaca dengan aturan
// Indonesia. Jalur Saudi (sumber Inggris) diuji di pengaman.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { angkaTanpaDasar, nilaiSumberID, periksaNaskah } from '../src/pengaman.mjs';
import { kunciSumber } from '../src/util.mjs';

const SUMBER = `Jakarta (Kemenhaj) — Pemerintah dan Komisi VIII DPR RI menyepakati BPIH 1448 H/2027 M
sebesar Rp98,46 Juta dalam rapat kerja, Rabu (7/10/2026). Biaya yang ditanggung jemaah turun Rp3,4 juta.
Masa pelunasan dibagi dua tahap dan berlangsung lima bulan. Sebanyak 3.220 tenaga kesehatan mengikuti
seleksi. Kuota haji khusus tetap 8 persen. Dua puluh lima kantor wilayah sudah siap, dan rapat lanjutan
digelar sepekan lagi pukul 14.30 WIB. "Pemerintah harus hadir bagi jemaah," kata Ketua Komisi VIII.`;

test('angka sumber Indonesia dikenali: format ribuan, desimal koma, satuan kata', () => {
  const naskah = 'BPIH 1448 H/2027 M Rp98,46 juta, turun Rp3,4 juta, 7 Oktober 2026, 3.220 tenaga kesehatan, kuota 8 persen, pukul 14.30 WIB.';
  assert.deepEqual(angkaTanpaDasar(naskah, SUMBER, 'id'), []);
});

test('bilangan yang ditulis dengan huruf di sumber boleh ditulis dengan digit di naskah', () => {
  assert.deepEqual(angkaTanpaDasar('Pelunasan 2 tahap selama 5 bulan, 25 kantor wilayah, rapat 1 pekan lagi.', SUMBER, 'id'), []);
  assert.ok(nilaiSumberID('dua belas embarkasi dan tiga ratus petugas').includes(12));
  assert.ok(nilaiSumberID('dua belas embarkasi dan tiga ratus petugas').includes(300));
  assert.ok(nilaiSumberID('anggaran lima miliar rupiah').includes(5e9));
});

test('angka karangan tetap ditolak walau digitnya muncul di sumber', () => {
  assert.deepEqual(angkaTanpaDasar('BPIH Rp98,5 juta.', SUMBER, 'id'), ['98,5 juta']);
  assert.deepEqual(angkaTanpaDasar('Turun Rp3 juta.', SUMBER, 'id'), ['3 juta']);
  assert.deepEqual(angkaTanpaDasar('Sebanyak 3.200 tenaga kesehatan.', SUMBER, 'id'), ['3.200']);
  assert.deepEqual(angkaTanpaDasar('Pelunasan selama 6 bulan.', SUMBER, 'id'), ['6']);
  // Format Indonesia tidak boleh dibaca dengan aturan Inggris: 3.220 bukan 3,22.
  assert.deepEqual(angkaTanpaDasar('Hanya 3,22 persen.', SUMBER, 'id'), ['3,22']);
});

function naskahRegulasi(ubah = {}) {
  const p = (x) => ({ t: 'p', x });
  const isi = 'Menurut siaran pers Kementerian Haji dan Umrah, pemerintah dan Komisi VIII DPR RI menyepakati besaran biaya penyelenggaraan ibadah haji setelah rapat kerja di Jakarta dan menjelaskan rincian yang perlu dipahami jemaah. ';
  const panjang = isi.repeat(3);
  return {
    judul: 'BPIH 2027 Disepakati Rp98,46 Juta, Biaya Jemaah Turun Rp3,4 Juta',
    ringkasan: 'Pemerintah dan Komisi VIII DPR menyepakati BPIH 2027 sebesar Rp98,46 juta. Biaya yang ditanggung jemaah turun Rp3,4 juta.',
    tag: ['BPIH 2027', 'Biaya Haji', 'Komisi VIII DPR'],
    objek_foto: 'an empty meeting room with a long table and microphones',
    body: [
      p(panjang), p(panjang),
      { t: 'h2', x: 'Biaya yang ditanggung jemaah turun Rp3,4 juta' }, p(panjang), p(panjang),
      { t: 'h2', x: 'Apa artinya bagi travel dan jemaah?' }, p(panjang),
      { t: 'li', x: 'siapkan dana pelunasan sesuai jadwal resmi' },
      { t: 'h2', x: 'Catatan ASPHIRASI' }, p(panjang), p(panjang), p(panjang),
    ],
    ...ubah,
  };
}

test('naskah regulasi yang benar lolos', () => {
  const h = periksaNaskah(naskahRegulasi(), SUMBER, { bahasa: 'id' });
  assert.equal(h.lolos, true, h.alasan.join('; '));
});

test('kutipan narasumber yang bersikap lolos, sikap naskah sendiri ditolak', () => {
  const p = (x) => ({ t: 'p', x });
  const dasar = naskahRegulasi();
  const kutipan = { ...dasar, body: [p('“Pemerintah harus hadir bagi jemaah,” kata Ketua Komisi VIII dalam rapat kerja tersebut.'), ...dasar.body] };
  assert.equal(periksaNaskah(kutipan, SUMBER, { bahasa: 'id' }).lolos, true);
  const sikap = { ...dasar, body: [p('Pemerintah harus segera menurunkan biaya haji lebih jauh lagi.'), ...dasar.body] };
  const h = periksaNaskah(sikap, SUMBER, { bahasa: 'id' });
  assert.equal(h.lolos, false);
  assert.match(h.alasan.join(' '), /mengambil sikap/);
  // Jalur Saudi tetap ketat seperti sebelumnya, kutipan pun diperiksa.
  assert.equal(periksaNaskah(kutipan, SUMBER).lolos, false);
});

test('superlatif hanya lolos bila kata yang sama ada di sumber Indonesia', () => {
  const p = (x) => ({ t: 'p', x });
  const dasar = naskahRegulasi();
  const tanpaDasar = { ...dasar, body: [p('Ini penurunan terbesar dalam sejarah penyelenggaraan haji.'), ...dasar.body] };
  assert.match(periksaNaskah(tanpaDasar, SUMBER, { bahasa: 'id' }).alasan.join(' '), /klaim peringkat tanpa dasar/);
  const berdasar = periksaNaskah(tanpaDasar, `${SUMBER} Ini penurunan terbesar, kata menteri.`, { bahasa: 'id' });
  assert.equal(berdasar.lolos, true, berdasar.alasan.join('; '));
});

test('judul atau ringkasan pasif tanpa pihak tetap ditolak', () => {
  const h = periksaNaskah(naskahRegulasi({ judul: 'PPIU Diwajibkan Lapor Keberangkatan Jemaah Umrah Mulai 2027' }), SUMBER, { bahasa: 'id' });
  assert.match(h.alasan.join(' '), /diwajibkan/i);
});

test('siaran pers Kemenhaj dikenali dari nomor di ujung alamatnya', () => {
  const a = 'https://haji.go.id/berita/pemerintah-dpr-sepakati-bpih-2027-1791355969000';
  assert.equal(kunciSumber(a), 'haji.go.id#1791355969000');
  assert.notEqual(
    kunciSumber('https://emedia.dpr.go.id/news/2026/10/08/bpih-2027-rp9846-juta'),
    kunciSumber('https://emedia.dpr.go.id/news/2026/10/08/pelunasan-biaya-haji-reguler-2027'),
  );
});
