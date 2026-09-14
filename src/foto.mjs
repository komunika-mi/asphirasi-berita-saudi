// Sampul draft. Urutan diputuskan pemilik (14 Sep 2026): z_image DULU,
// nano_banana hanya bila z_image tidak lolos pemeriksaan.
//
// Uji 14 Sep 2026 (9 gambar, gaya sama dengan situs): z_image bersih untuk
// benda dan suasana, tetapi mengarang tulisan pada paspor dan uang, memunculkan
// wajah, dan salah menggambar Masjidil Haram. Karena itu ada dua pagar: subjek
// terlarang ditolak sebelum membuat gambar (pengaman.mjs), dan tiap gambar
// diperiksa visual oleh Claude sebelum diunggah.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import sharp from 'sharp';
import { lihatGambar, ambilJSON } from './claude.mjs';
import { log } from './util.mjs';

const NEGATIF = 'no text, no lettering, no numbers, no logos, no watermark, no faces, no people';
const GAYA = (objek) =>
  `Editorial magazine photograph, ${objek}, deep maroon and gold accent tones, soft natural daylight, ` +
  `shallow depth of field, professional editorial photography, minimal composition, ${NEGATIF}`;
const VARIASI = ['', ', wider composition, different camera angle', ', simple uncluttered background, calm mood'];
const URUTAN = [
  ['z_image', 0],
  ['z_image', 1],
  ['z_image', 2],
  ['nano_banana', 0],
];

function jalankan(bin, args, batasMs) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: batasMs, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, keluaran: `${stdout || ''}${stderr || ''}`, galat: err?.message });
    });
  });
}

async function hasilkanHiggsfield(model, prompt) {
  const bin = process.env.HIGGSFIELD_BIN || 'higgsfield';
  const r = await jalankan(bin, ['generate', 'create', model, '--prompt', prompt, '--aspect_ratio', '16:9', '--wait', '--json'], 600000);
  const k = r.keluaran;
  const awal = k.indexOf('[');
  if (awal < 0) throw new Error(`${model}: ${(r.galat || k).slice(0, 200)}`);
  const jobs = JSON.parse(k.slice(awal, k.lastIndexOf(']') + 1));
  const url = jobs.map((j) => j.result_url).find(Boolean);
  if (!url) throw new Error(`${model}: job tanpa result_url`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${model}: unduh HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const SISTEM_PERIKSA = [
  'Kamu pemeriksa foto sampul berita yang ketat. Buka berkas gambar dengan tool Read, lalu nilai.',
  'tulisan: true bila ada huruf, angka, aksara apa pun (termasuk aksara Arab palsu atau huruf acak) yang terlihat di mana saja,',
  'misalnya di badan pesawat, papan, layar, dokumen, kemasan. Tulisan sangat kecil yang tetap terbaca sebagai huruf juga true.',
  'manusia: true bila ada orang, wajah, siluet orang, atau bagian tubuh.',
  'tempat_ibadah: true bila ada masjid, menara masjid, Ka\'bah, atau bangunan yang meniru tempat suci atau landmark nyata.',
  'logo_bendera: true bila ada logo, lambang, emblem, atau bendera.',
  'sesuai: true bila gambar jelas menampilkan objek yang diminta.',
  'gelap: true bila gambar terlalu gelap untuk sampul.',
  'Balas HANYA JSON: {"tulisan":false,"manusia":false,"tempat_ibadah":false,"logo_bendera":false,"sesuai":true,"gelap":false,"catatan":"singkat"}',
].join('\n');

async function periksaVisual(berkas, objek) {
  const v = ambilJSON(await lihatGambar(berkas, SISTEM_PERIKSA, `Objek yang diminta: ${objek}`));
  const masalah = [];
  if (v.tulisan) masalah.push('ada tulisan');
  if (v.manusia) masalah.push('ada manusia');
  if (v.tempat_ibadah) masalah.push('ada tempat ibadah/landmark');
  if (v.logo_bendera) masalah.push('ada logo/bendera');
  if (!v.sesuai) masalah.push('tidak sesuai objek');
  if (v.gelap) masalah.push('terlalu gelap');
  return { lolos: masalah.length === 0, masalah, catatan: v.catatan || '' };
}

export async function buatSampul(objek, { folder, nama, sidikLama = [] }) {
  fs.mkdirSync(folder, { recursive: true });
  const laporan = [];
  for (const [model, v] of URUTAN) {
    const label = `${model}#${v + 1}`;
    try {
      const mentah = await hasilkanHiggsfield(model, GAYA(objek) + VARIASI[v]);
      const jpg = await sharp(mentah).resize(1600, 900, { fit: 'cover' }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
      const sidik = crypto.createHash('sha256').update(jpg).digest('hex');
      if (sidikLama.includes(sidik)) {
        laporan.push(`${label}: kembar dengan sampul lama`);
        continue;
      }
      const berkas = path.join(folder, `${nama}-${model}-${v + 1}.jpg`);
      fs.writeFileSync(berkas, jpg);
      const cek = await periksaVisual(berkas, objek);
      if (!cek.lolos) {
        laporan.push(`${label}: ditolak (${cek.masalah.join(', ')})`);
        log(`  foto ${label} ditolak: ${cek.masalah.join(', ')}`);
        continue;
      }
      laporan.push(`${label}: lolos`);
      return { buffer: jpg, berkas, model, sidik, laporan };
    } catch (e) {
      laporan.push(`${label}: gagal (${String(e.message).slice(0, 120)})`);
      log(`  foto ${label} gagal: ${e.message}`);
    }
  }
  return { buffer: null, laporan };
}
