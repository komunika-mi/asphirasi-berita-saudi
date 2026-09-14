import test from 'node:test';
import assert from 'node:assert/strict';
import { angkaTanpaDasar, periksaNaskah, periksaObjekFoto } from '../src/pengaman.mjs';

const SUMBER = `Riyadh, September 13, 2026, SPA -- The Ministry of Hajj and Umrah said 1.5 million
pilgrims performed Umrah in August, the highest monthly figure on record. Waiting time for mobility
services fell from two hours to 9 minutes. Nearly 86,000 people were displaced, and fees rose 41%.
The largest share came from Indonesia. Average stay was 12 days.`;

test('angka yang padanannya ada di sumber lolos', () => {
  const naskah = 'Sebanyak 1,5 juta jemaah umrah pada Agustus, waktu tunggu turun dari 2 jam ke 9 menit, hampir 86 ribu orang, biaya naik 41 persen, 13 September 2026, rata-rata 12 hari.';
  assert.deepEqual(angkaTanpaDasar(naskah, SUMBER), []);
});

test('angka karangan ditolak walau digitnya muncul di sumber', () => {
  // Kasus yang melumpuhkan publish.py versi pertama: digit 2 ada di sumber.
  assert.deepEqual(angkaTanpaDasar('Biaya Rp2 miliar per kloter.', SUMBER), ['2 miliar']);
  assert.deepEqual(angkaTanpaDasar('Sekitar 1,6 juta jemaah.', SUMBER), ['1,6 juta']);
  assert.deepEqual(angkaTanpaDasar('Hampir 86 orang terdampak.', SUMBER), ['86']);
});

test('konversi kurs karangan ditolak', () => {
  assert.deepEqual(angkaTanpaDasar('Setara Rp4.350 per riyal.', SUMBER), ['4.350']);
});

test('objek foto terlarang tertangkap', () => {
  assert.match(periksaObjekFoto('an open passport with a visa stamp'), /passport/);
  assert.match(periksaObjekFoto('the Grand Mosque courtyard at dusk'), /grand mosque/i);
  assert.match(periksaObjekFoto('stack of banknotes beside a calculator'), /banknotes/);
  assert.match(periksaObjekFoto('pilgrims walking to Mina'), /pilgrims/);
  assert.equal(periksaObjekFoto('rolling suitcases lined up in an elegant hotel lobby'), null);
  assert.equal(periksaObjekFoto('dark storm clouds over an empty desert highway'), null);
});

function naskahDasar(ubah = {}) {
  const p = (x) => ({ t: 'p', x });
  const isi = 'Kementerian Haji dan Umrah Arab Saudi menyampaikan perkembangan layanan umrah terbaru yang berkaitan langsung dengan perjalanan jemaah dan kesiapan penyelenggara perjalanan ibadah umrah di Indonesia. ';
  const panjang = isi.repeat(3);
  return {
    judul: 'Saudi Catat 1,5 Juta Jemaah Umrah pada Agustus 2026',
    ringkasan: 'Kementerian Haji dan Umrah Arab Saudi mencatat 1,5 juta jemaah umrah pada Agustus. Ini dampaknya bagi travel dan jemaah Indonesia.',
    tag: ['Umrah', 'Arab Saudi', 'Jemaah'],
    objek_foto: 'rolling suitcases lined up in an elegant hotel lobby',
    body: [
      p(panjang), p(panjang),
      { t: 'h2', x: 'Waktu tunggu layanan mobilitas turun menjadi 9 menit' }, p(panjang), p(panjang),
      { t: 'h2', x: 'Apa artinya bagi travel dan jemaah Indonesia?' }, p(panjang),
      { t: 'li', x: 'periksa jadwal transportasi jemaah' },
      { t: 'h2', x: 'Catatan ASPHIRASI' }, p(panjang), p(panjang), p(panjang),
    ],
    ...ubah,
  };
}

test('naskah yang benar lolos', () => {
  const h = periksaNaskah(naskahDasar(), SUMBER);
  assert.equal(h.lolos, true, h.alasan.join('; '));
});

test('sikap atas nama asosiasi ditolak (opsi a)', () => {
  const n = naskahDasar();
  n.body[9] = { t: 'p', x: n.body[9].x + ' ASPHIRASI mendesak pemerintah meninjau ulang aturan ini.' };
  const h = periksaNaskah(n, SUMBER);
  assert.equal(h.lolos, false);
  assert.ok(h.alasan.some((a) => a.includes('mengambil sikap')));
  const n2 = naskahDasar();
  n2.body[10] = { t: 'p', x: n2.body[10].x + ' Pemerintah harus segera bertindak.' };
  assert.ok(periksaNaskah(n2, SUMBER).alasan.some((a) => a.includes('mengambil sikap')));
});

test('struktur Catatan ASPHIRASI wajib tepat 3 paragraf', () => {
  const n = naskahDasar();
  n.body.push({ t: 'p', x: 'paragraf keempat yang tidak boleh ada di sini sama sekali.' });
  assert.ok(periksaNaskah(n, SUMBER).alasan.some((a) => a.includes('tepat 3 paragraf')));
});

test('em-dash, tautan, dan Prabowo tanpa Presiden ditolak', () => {
  const n = naskahDasar({ ringkasan: 'Kementerian Haji dan Umrah Arab Saudi mencatat 1,5 juta jemaah — ini dampaknya bagi travel dan jemaah Indonesia.' });
  assert.ok(periksaNaskah(n, SUMBER).alasan.some((a) => a.includes('em-dash')));
  const n2 = naskahDasar();
  n2.body[0] = { t: 'p', x: n2.body[0].x + ' Kunjungi https://contoh.com. Prabowo hadir.' };
  const al = periksaNaskah(n2, SUMBER).alasan;
  assert.ok(al.some((a) => a.includes('tautan')));
  assert.ok(al.some((a) => a.includes('Prabowo')));
});

test('superlatif lolos hanya bila sumber memuat padanannya', () => {
  const n = naskahDasar();
  n.body[0] = { t: 'p', x: n.body[0].x + ' Jumlah itu tertinggi, dan porsi terbesar dari Indonesia.' };
  assert.equal(periksaNaskah(n, SUMBER).lolos, true);
  const tanpa = SUMBER.replace(/highest|record|largest|Average/gi, 'x');
  const al = periksaNaskah(n, tanpa).alasan;
  assert.ok(al.some((a) => a.includes('tertinggi')));
  assert.ok(al.some((a) => a.includes('terbesar')));
});

test('"high" di sumber menjadi dasar sah untuk "tertinggi" (kasus harga minyak 14 Sep)', () => {
  const minyak = 'Crude oil continues to extend its gains toward the $119.48 high, rising above $100.';
  const n = naskahDasar();
  n.body[0] = { t: 'p', x: n.body[0].x + ' Harga mendekati level tertinggi US$119,48.' };
  const al = periksaNaskah(n, SUMBER.replace(/highest|record|largest|Average/gi, 'x') + ' ' + minyak).alasan;
  assert.ok(!al.some((a) => a.includes('tertinggi')), al.join('; '));
});

test('desimal bertitik ditolak dengan pesan jelas, jam pukul 14.30 tidak', () => {
  const sumber = SUMBER + ' Brent rose to $119.48 at 14.30 GMT.';
  const n = naskahDasar();
  n.body[0] = { t: 'p', x: n.body[0].x + ' Brent naik ke US$119.48 pada pukul 14.30 waktu setempat.' };
  const al = periksaNaskah(n, sumber).alasan;
  assert.ok(al.some((a) => a.includes('119.48 -> 119,48')), al.join('; '));
  assert.ok(!al.some((a) => a.includes('14.30') || a.includes('angka tidak ada')), al.join('; '));
});

test('harga bertitik di sumber tidak menyumbang angka jam palsu', () => {
  // "$2.23" tidak boleh membuat "23" dianggap punya dasar.
  assert.deepEqual(angkaTanpaDasar('Harga naik 23 persen.', 'Brent rose $2.23 to $90.'), ['23']);
  assert.deepEqual(angkaTanpaDasar('Pukul 14.30 kapal tiba.', 'The ship arrived at 2:30 pm.'), []);
});

test('jam gaya Reuters "2313 GMT" dikenali', () => {
  assert.deepEqual(angkaTanpaDasar('Brent naik pada pukul 23.13 GMT.', 'Brent rose to $107.51 per barrel as of 2313 GMT.'), []);
});

test('"diminta" di ringkasan ditolak, "disarankan" di isi tidak', () => {
  const n = naskahDasar({ ringkasan: 'Kementerian Haji dan Umrah Arab Saudi mencatat 1,5 juta jemaah umrah, travel umrah diminta cermati dampaknya bagi jemaah.' });
  assert.ok(periksaNaskah(n, SUMBER).alasan.some((a) => a.includes('"diminta"')));
  const n2 = naskahDasar();
  n2.body[9] = { t: 'p', x: n2.body[9].x + ' Penyelenggara disarankan memantau informasi resmi.' };
  assert.equal(periksaNaskah(n2, SUMBER).lolos, true);
});

test('pesan angka tanpa dasar menyertakan potongan kalimat', () => {
  const n = naskahDasar();
  n.body[0] = { t: 'p', x: n.body[0].x + ' Harga naik 23 persen dalam sepekan.' };
  const al = periksaNaskah(n, SUMBER).alasan;
  assert.ok(al.some((a) => a.includes('23 persen') || a.includes('naik 23')), al.join('; '));
});

test('kata "terutama", "terbaru", "terkait" tidak dianggap superlatif', () => {
  const n = naskahDasar();
  n.body[0] = { t: 'p', x: n.body[0].x + ' Terutama aturan terbaru yang terkait jemaah, terakhir diperbarui.' };
  assert.equal(periksaNaskah(n, SUMBER.replace(/highest|record|largest|Average/gi, 'x')).lolos, true);
});
