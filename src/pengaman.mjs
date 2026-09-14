// Pengaman naskah. Ada DI KODE, bukan hanya di prompt, supaya tidak bergantung
// pada kepatuhan model pada putaran itu (pelajaran publish.py, Agu 2026).
import { jumlahKata } from './util.mjs';

// ---------------------------------------------------------------------------
// Angka. Sumber berbahasa Inggris dan naskah berbahasa Indonesia, jadi yang
// dibandingkan NILAINYA ("1,5 juta" = "1.5 million"), bukan bentuk tulisannya.
// JANGAN dilonggarkan menjadi "digitnya ada di sumber": versi publish.py yang
// begitu meloloskan "Rp2 miliar" karena digit 2 ada di teks mana pun.
// ---------------------------------------------------------------------------
const SKALA_ID = { ribu: 1e3, juta: 1e6, miliar: 1e9, triliun: 1e12 };
const SKALA_EN = { thousand: 1e3, million: 1e6, mn: 1e6, billion: 1e9, bn: 1e9, trillion: 1e12 };
const KATA_EN = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100, dozen: 12,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  half: 0.5, quarter: 0.25, double: 2, twice: 2, triple: 3,
};

function sama(a, b) {
  return Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 1e-9;
}

export function angkaIndonesia(teks) {
  const hasil = [];
  const pola = /(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)(?:\s*(ribu|juta|miliar|triliun))?/gi;
  for (const m of teks.matchAll(pola)) {
    const nilai = Number(m[1].replace(/\./g, '').replace(',', '.'));
    if (Number.isNaN(nilai)) continue;
    hasil.push({ bentuk: m[0].trim(), nilai: nilai * (m[2] ? SKALA_ID[m[2].toLowerCase()] : 1) });
  }
  return hasil;
}

export function nilaiSumber(teks) {
  const nilai = [];
  const pola = /(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*(thousand|million|mn|billion|bn|trillion)\b)?/gi;
  for (const m of teks.matchAll(pola)) {
    const dasar = Number(m[1].replace(/,/g, ''));
    if (Number.isNaN(dasar)) continue;
    nilai.push(dasar);
    if (m[2]) nilai.push(dasar * SKALA_EN[m[2].toLowerCase()]);
  }
  for (const m of teks.matchAll(/\b([a-z]+)(?:\s+(thousand|million|billion|trillion))?\b/gi)) {
    const dasar = KATA_EN[m[1].toLowerCase()];
    if (dasar === undefined) continue;
    nilai.push(dasar);
    if (m[2]) nilai.push(dasar * SKALA_EN[m[2].toLowerCase()]);
  }
  // Sumber TIDAK ikut diurai dengan format Indonesia: "86,000" akan terbaca
  // 86 dan meloloskan naskah yang menulis "86" padahal sumbernya 86 ribu.
  return nilai;
}

export function angkaTanpaDasar(naskahTeks, sumberTeks) {
  const pool = nilaiSumber(sumberTeks);
  return [...new Set(
    angkaIndonesia(naskahTeks)
      .filter((a) => !pool.some((v) => sama(v, a.nilai)))
      .map((a) => a.bentuk),
  )];
}

// ---------------------------------------------------------------------------
// Klaim peringkat kuantitatif. Superlatif Indonesia hanya lolos bila sumber
// Inggrisnya memuat padanan klaim yang sama. Daftar eksplisit, bukan ter\w+,
// supaya "terutama", "terbaru", "terakhir", "terkait" tidak ikut tertangkap.
// ---------------------------------------------------------------------------
const PERINGKAT = [
  [/\b(?:terbesar|paling besar)\b/i, /\b(?:largest|biggest|greatest)\b/i],
  [/\b(?:tertinggi|paling tinggi)\b/i, /\b(?:highest|record|peak|tallest)\b/i],
  [/\b(?:terendah|paling rendah)\b/i, /\b(?:lowest|record low)\b/i],
  [/\b(?:terbanyak|paling banyak|mayoritas|kebanyakan|sebagian besar)\b/i, /\b(?:most|majority|largest number|highest number)\b/i],
  [/\b(?:terkecil|paling kecil)\b/i, /\b(?:smallest|least|fewest)\b/i],
  [/\b(?:tersering|paling sering|paling kerap)\b/i, /\b(?:most frequent|most common|most often)\b/i],
  [/\b(?:terjarang|paling jarang)\b/i, /\b(?:rarest|least common)\b/i],
  [/\b(?:terparah|paling parah)\b/i, /\b(?:worst|most severe)\b/i],
  [/\b(?:paling umum|pada umumnya)\b/i, /\b(?:most common|commonly|generally)\b/i],
  [/\b(?:paling utama|paling dominan)\b/i, /\b(?:main|dominant|leading|primary)\b/i],
  [/\b(?:rata-rata)\b/i, /\b(?:average|mean)\b/i],
];

// Opsi a yang dipilih pemilik (14 Sep 2026): analisis menjelaskan dampak dan
// langkah praktis, TANPA bersikap atas nama asosiasi.
const SIKAP = [
  /\b(?:ASPHIRASI|asosiasi|kami|redaksi)\s+(?:juga\s+|pun\s+)?(?:mendesak|menuntut|menolak|mengecam|menyerukan|meminta|memprotes|mendukung|menyambut baik|mengapresiasi|menyayangkan|menyesalkan|mengkritik|menilai|memandang|berpendapat)\b/i,
  /\b(?:pemerintah|Kemenhaj|Kementerian Haji(?: dan Umrah)?|Kemenag|Arab Saudi|Saudi|otoritas|regulator)\s+(?:harus|wajib|semestinya|seharusnya|perlu segera)\b/i,
  /\b(?:patut|layak)\s+(?:diapresiasi|dikritik|dipertanyakan|disesalkan)\b/i,
  /\bkebijakan\s+(?:yang\s+)?(?:keliru|salah|tepat|bijak|gegabah)\b/i,
];

const MUTLAK = /\b(?:selalu|tidak pernah|satu-satunya|mustahil)\b/i;
const ANGKA_KATA =
  /(?<![\d.,]\s)\b(?:dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|\w+\s+belas|\w+\s+puluh|seratus|\w+\s+ratus|seribu)\s+(?:persen|jam|menit|hari|pekan|minggu|bulan|tahun|orang|jemaah|riyal|penerbangan|hotel|kilometer|km)\b/i;

const LARANGAN_FOTO =
  /\b(?:passport|visa|document|paper|papers|newspaper|letter|sign|signage|banner|poster|billboard|screen showing|text|words?|money|banknotes?|coins?|currency|cash|riyals?|flags?|logos?|person|persons|people|man|men|woman|women|child|children|pilgrims?|crowds?|faces?|hands?|worshippers?|kaaba|ka'bah|mecca|makkah|medina|madinah|grand mosque|prophet'?s mosque|mosques?|masjid|minarets?|nabawi|haram)\b/i;

export function periksaObjekFoto(objek) {
  if (!objek || typeof objek !== 'string') return 'objek_foto kosong';
  if (jumlahKata(objek) > 30) return 'objek_foto terlalu panjang';
  const m = objek.match(LARANGAN_FOTO);
  return m ? `objek_foto memuat subjek terlarang: "${m[0]}"` : null;
}

export function teksNaskah(n) {
  return [n.judul, n.ringkasan, ...(n.body || []).map((b) => b.x)].filter(Boolean).join('\n');
}

export function periksaNaskah(n, sumberTeks) {
  const alasan = [];
  const peringatan = [];
  const JENIS = new Set(['p', 'h2', 'h3', 'li', 'no', 'q']);

  if (!n || typeof n !== 'object') return { lolos: false, alasan: ['naskah bukan objek JSON'], peringatan };
  if (!n.judul || n.judul.length < 20 || n.judul.length > 110) alasan.push('judul kosong atau panjangnya di luar 20-110 karakter');
  if (!n.ringkasan || n.ringkasan.length < 60 || n.ringkasan.length > 230) alasan.push('ringkasan di luar 60-230 karakter');
  if (!Array.isArray(n.tag) || n.tag.length < 2 || n.tag.length > 6) alasan.push('tag harus 2-6 buah');
  if (!Array.isArray(n.body) || n.body.length < 6) {
    alasan.push('body kosong atau terlalu pendek');
    return { lolos: false, alasan, peringatan };
  }
  if (n.body.some((b) => !JENIS.has(b.t) || typeof b.x !== 'string' || !b.x.trim())) {
    alasan.push('ada blok body dengan jenis tak dikenal atau teks kosong');
  }
  if (n.body[0]?.t !== 'p') alasan.push('body harus dibuka dengan paragraf');

  const iCatatan = n.body.findIndex((b) => b.t === 'h2' && b.x.trim() === 'Catatan ASPHIRASI');
  if (iCatatan < 0) {
    alasan.push('tidak ada subjudul "Catatan ASPHIRASI"');
  } else {
    const ekor = n.body.slice(iCatatan + 1);
    if (ekor.length !== 3 || ekor.some((b) => b.t !== 'p')) {
      alasan.push(`"Catatan ASPHIRASI" harus diikuti tepat 3 paragraf lalu selesai (ini ${ekor.length} blok)`);
    }
  }
  if (!n.body.some((b) => b.t === 'h2' && /^Apa artinya/i.test(b.x.trim()))) {
    alasan.push('tidak ada subjudul "Apa artinya bagi ..."');
  }

  const kata = jumlahKata(n.body.map((b) => b.x).join(' '));
  if (kata < 400 || kata > 1000) alasan.push(`panjang body ${kata} kata, harus 400-1000`);

  const semua = teksNaskah(n);
  if (/[—–]/.test(semua)) alasan.push('memakai em-dash atau en-dash');
  if (/https?:\/\/|<[a-z/!]/i.test(semua)) alasan.push('memuat tautan atau tag HTML');
  if (/(?<!Presiden\s)\bPrabowo\b/.test(semua)) alasan.push('menyebut "Prabowo" tanpa "Presiden"');

  const tanpaDasar = angkaTanpaDasar(semua, sumberTeks);
  if (tanpaDasar.length) alasan.push(`angka tidak ada di sumber: ${tanpaDasar.join(', ')}`);

  for (const [pola, bukti] of PERINGKAT) {
    const m = semua.match(pola);
    if (m && !bukti.test(sumberTeks)) alasan.push(`klaim peringkat tanpa dasar di sumber: "${m[0]}"`);
  }
  for (const pola of SIKAP) {
    const m = semua.match(pola);
    if (m) alasan.push(`mengambil sikap, bertentangan dengan opsi a: "${m[0]}"`);
  }

  const foto = periksaObjekFoto(n.objek_foto);
  if (foto) alasan.push(foto);

  const mutlak = semua.match(MUTLAK);
  if (mutlak) peringatan.push(`klaim mutlak "${mutlak[0]}", periksa saat review`);
  const angkaKata = semua.match(ANGKA_KATA);
  if (angkaKata) peringatan.push(`bilangan ditulis dengan huruf ("${angkaKata[0]}"), luput dari pengaman angka`);

  return { lolos: alasan.length === 0, alasan, peringatan, kata };
}
