// Satu putaran: kumpulkan kandidat -> seleksi -> tulis -> periksa -> sampul -> draft.
//
//   node src/jalankan.mjs               putaran sungguhan (menulis draft ke Sanity)
//   node src/jalankan.mjs --kering      tanpa menulis apa pun ke Sanity; hasil ke keluaran/
//   node src/jalankan.mjs --tanpa-foto  lewati pembuatan sampul (hanya bersama --kering)
//   node src/jalankan.mjs --maks 1      batasi jumlah artikel putaran ini
import fs from 'node:fs';
import path from 'node:path';
import { kumpulkanKandidat, isiArtikel } from './sumber.mjs';
import { seleksi, tulis } from './tulis.mjs';
import { periksaNaskah } from './pengaman.mjs';
import { buatSampul } from './foto.mjs';
import { keBlok } from './portable.mjs';
import * as cms from './sanity.mjs';
import { MODEL } from './claude.mjs';
import { log, ringkasanLangkah, awalHariWIB, slugify, jumlahKata } from './util.mjs';

const arg = process.argv.slice(2);
const KERING = arg.includes('--kering');
const TANPA_FOTO = arg.includes('--tanpa-foto');
const iMaks = arg.indexOf('--maks');
const MAKS_PUTARAN = Number(iMaks >= 0 ? arg[iMaks + 1] : process.env.MAKS_PER_PUTARAN || 3);
const MAKS_HARI = Number(process.env.MAKS_PER_HARI || 20);
const BATAS_MS = Number(process.env.MENIT || 14) * 60e3;
const MULAI = Date.now();

if (TANPA_FOTO && !KERING) {
  console.error('--tanpa-foto hanya boleh bersama --kering: draft tanpa sampul tidak bisa di-Publish editor.');
  process.exit(1);
}

const FOLDER = path.join('keluaran', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
const sisaWaktu = () => BATAS_MS - (Date.now() - MULAI);

function tanggalTeks(iso) {
  if (!iso) return 'tidak diketahui';
  const d = new Date(iso);
  const wib = new Date(d.getTime() + 7 * 3600e3);
  const bulanEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const t = wib.getUTCDate(), b = wib.getUTCMonth(), y = wib.getUTCFullYear();
  return `${bulanEn[b]} ${t}, ${y} (${t}/${b + 1}/${y})`;
}

const normalJudul = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function main() {
  log(`mulai ${KERING ? '(KERING, tanpa menulis ke Sanity)' : ''} model=${MODEL}`);
  const baris = [`## Putaran berita Saudi ${KERING ? '(kering)' : ''}`, ''];

  const sudahHariIni = await cms.jumlahSejak(awalHariWIB());
  const jatah = Math.min(MAKS_PUTARAN, MAKS_HARI - sudahHariIni);
  log(`draft hari ini: ${sudahHariIni}/${MAKS_HARI}, jatah putaran ini: ${jatah}`);
  baris.push(`Draft hari ini sebelum putaran: ${sudahHariIni} dari ${MAKS_HARI}.`);
  if (jatah <= 0) {
    baris.push('Jatah harian sudah penuh, putaran berhenti.');
    ringkasanLangkah(baris.join('\n'));
    return 0;
  }

  const status = await cms.bacaStatus();
  const { kandidat, laporan } = await kumpulkanKandidat();
  baris.push('', '| Sumber | Status | Jumlah |', '|---|---|---|');
  for (const l of laporan) baris.push(`| ${l.sumber} | ${l.status} | ${l.jumlah ?? l.catatan} |`);
  log('sumber:', laporan.map((l) => `${l.sumber}=${l.status}${l.jumlah !== undefined ? `(${l.jumlah})` : ''}`).join(', '));

  const pernah = new Map();
  for (const r of status.riwayat) pernah.set(r.url, [...(pernah.get(r.url) || []), r.putusan]);
  const diDraft = await cms.urlSudahAda(kandidat.map((k) => k.url));

  const lihat = new Set();
  const penuh = [];
  const radar = [];
  for (const k of kandidat) {
    const kunci = normalJudul(k.judul);
    if (lihat.has(kunci)) continue;
    lihat.add(kunci);
    if (k.radar) { radar.push(k); continue; }
    const riwayat = pernah.get(k.url) || [];
    if (diDraft.has(k.url) || riwayat.includes('ditolak') || riwayat.includes('dibuat')) continue;
    if (riwayat.filter((p) => p === 'gagal').length >= 2) continue;
    penuh.push({ ...k, tanggalTeks: tanggalTeks(k.waktu) });
  }
  log(`kandidat baru: ${penuh.length} (radar ${radar.length})`);
  if (!penuh.length) {
    baris.push('', 'Tidak ada kandidat baru.');
    ringkasanLangkah(baris.join('\n'));
    return 0;
  }

  // Seleksi diminta menyiapkan cadangan: artikel yang ternyata isinya tipis
  // atau gagal pemeriksa tidak boleh menghabiskan jatah putaran.
  const putusan = await seleksi(penuh, radar, jatah + 3);
  const catat = (k, p, alasan) => status.riwayat.push({ url: k.url, judul: k.judul.slice(0, 160), putusan: p, alasan: String(alasan || '').slice(0, 200), waktu: new Date().toISOString() });
  for (const t of putusan.tolak || []) if (penuh[t.id]) catat(penuh[t.id], 'ditolak', t.alasan);
  const pilihan = (putusan.pilih || [])
    .filter((p) => penuh[p.id] && p.dampak >= 3)
    .sort((a, b) => b.dampak + b.viral - (a.dampak + a.viral));
  log(`dipilih: ${pilihan.length} (jatah ${jatah}, sisanya cadangan), ditolak: ${(putusan.tolak || []).length}`);

  const hasil = [];
  for (const p of pilihan) {
    if (hasil.filter((h) => !h.galat).length >= jatah) break;
    const k = penuh[p.id];
    if (sisaWaktu() < 4 * 60e3) {
      log('waktu hampir habis, sisa pilihan ditunda ke putaran berikutnya');
      break;
    }
    log(`menulis: [${k.sumber}] ${k.judul}`);
    try {
      const isi = await isiArtikel(k);
      if (isi.kata < 150) throw new Error(`isi sumber terlalu tipis (${isi.kata} kata)`);
      const sumberTeks = `${k.judul}\nPublished ${k.tanggalTeks}\n${isi.teks}`;

      let naskah = await tulis(k, isi, p.sudut);
      let cek = periksaNaskah(naskah, sumberTeks);
      if (!cek.lolos) {
        log(`  ditolak pemeriksa, ditulis ulang: ${cek.alasan.join(' | ')}`);
        naskah = await tulis(k, isi, p.sudut, cek.alasan);
        cek = periksaNaskah(naskah, sumberTeks);
      }
      if (!cek.lolos) throw new Error(`naskah gagal pemeriksa: ${cek.alasan.join(' | ')}`);

      const slug = await cms.slugBebas(slugify(naskah.judul));
      fs.mkdirSync(FOLDER, { recursive: true });
      fs.writeFileSync(path.join(FOLDER, `${slug}.json`), JSON.stringify({ kandidat: k, sudut: p.sudut, naskah, cek }, null, 2));

      let sampul = { buffer: null, laporan: ['dilewati (--tanpa-foto)'] };
      if (!TANPA_FOTO) {
        sampul = await buatSampul(naskah.objek_foto, { folder: FOLDER, nama: slug, sidikLama: status.sidikFoto });
        if (!sampul.buffer) throw new Error(`semua percobaan sampul gagal: ${sampul.laporan.join('; ')}`);
        status.sidikFoto.push(sampul.sidik);
      }

      if (!KERING) {
        const aset = await cms.unggahGambar(sampul.buffer, `${slug}.jpg`);
        const kata = jumlahKata(naskah.body.map((b) => b.x).join(' '));
        await cms.buatDraft({
          _id: `drafts.${cms.AWALAN_ID}${slug}`,
          _type: 'post',
          title: naskah.judul,
          slug: { _type: 'slug', current: slug },
          kind: 'berita',
          category: { _type: 'reference', _ref: 'cat.saudi' },
          coverImage: { _type: 'image', asset: { _type: 'reference', _ref: aset }, alt: naskah.judul },
          excerpt: naskah.ringkasan,
          body: keBlok(naskah.body),
          author: { _type: 'reference', _ref: 'author.redaksi' },
          source: k.sumber,
          sourceUrl: k.url,
          publishedAt: new Date().toISOString(),
          readTime: Math.max(2, Math.round(kata / 200)),
          tags: naskah.tag,
          featured: false,
          mostRead: false,
          views: 0,
        });
        catat(k, 'dibuat', slug);
      }
      hasil.push({ k, slug, naskah, cek, sampul });
      log(`  ${KERING ? 'siap (kering)' : 'draft dibuat'}: ${slug} | ${cek.kata} kata | sampul ${sampul.model || '-'}`);
    } catch (e) {
      log(`  GAGAL: ${e.message}`);
      catat(k, 'gagal', e.message);
      hasil.push({ k, galat: e.message });
    }
  }

  if (!KERING) await cms.simpanStatus(status);

  baris.push('', '| Hasil | Sumber | Judul | Catatan |', '|---|---|---|---|');
  for (const h of hasil) {
    if (h.galat) baris.push(`| gagal | ${h.k.sumber} | ${h.k.judul} | ${h.galat.slice(0, 160)} |`);
    else baris.push(`| ${KERING ? 'siap' : 'draft'} | ${h.k.sumber} | ${h.naskah.judul} | ${h.cek.kata} kata, sampul ${h.sampul.model || '-'}${h.cek.peringatan.length ? `, peringatan: ${h.cek.peringatan.join('; ')}` : ''} |`);
  }
  ringkasanLangkah(baris.join('\n'));
  if (KERING) {
    fs.mkdirSync(FOLDER, { recursive: true });
    fs.writeFileSync(path.join(FOLDER, 'ringkasan.md'), baris.join('\n'));
  }

  const berhasil = hasil.filter((h) => !h.galat).length;
  log(`selesai: ${berhasil} berhasil, ${hasil.length - berhasil} gagal`);
  // Merah hanya bila ada pilihan tapi SEMUANYA gagal, supaya kerusakan
  // (misalnya login gambar kedaluwarsa) terlihat di GitHub, bukan senyap.
  return pilihan.length && !berhasil ? 2 : 0;
}

main().then((kode) => process.exit(kode)).catch((e) => {
  console.error(e);
  process.exit(1);
});
