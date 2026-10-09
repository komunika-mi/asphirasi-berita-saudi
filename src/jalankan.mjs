// Satu putaran: kumpulkan kandidat -> seleksi -> tulis -> periksa -> sampul -> draft.
// Dua jalur dikerjakan bergantian dalam putaran yang sama, masing-masing dengan
// jatahnya sendiri: "regulasi" (siaran pers Kemenhaj dan berita E-Media DPR,
// kategori Regulasi) dan "saudi" (portal berita Saudi, kategori Saudi Update).
//
//   node src/jalankan.mjs                  putaran sungguhan (menulis draft ke Sanity)
//   node src/jalankan.mjs --kering         tanpa menulis apa pun ke Sanity; hasil ke keluaran/
//   node src/jalankan.mjs --tanpa-foto     lewati pembuatan sampul (hanya bersama --kering)
//   node src/jalankan.mjs --maks 1         batasi jumlah artikel per jalur putaran ini
//   node src/jalankan.mjs --jalur regulasi hanya satu jalur (bawaan: regulasi,saudi)
import fs from 'node:fs';
import path from 'node:path';
import { kumpulkanKandidat, isiArtikel } from './sumber.mjs';
import { seleksi, tulis, seleksiRegulasi, tulisRegulasi } from './tulis.mjs';
import { periksaNaskah } from './pengaman.mjs';
import { buatSampul } from './foto.mjs';
import { keBlok } from './portable.mjs';
import * as cms from './sanity.mjs';
import { MODEL } from './claude.mjs';
import { log, akhiri, ringkasanLangkah, awalHariWIB, slugify, jumlahKata, kunciSumber } from './util.mjs';

const arg = process.argv.slice(2);
const KERING = arg.includes('--kering');
const TANPA_FOTO = arg.includes('--tanpa-foto');
const iMaks = arg.indexOf('--maks');
const iJalur = arg.indexOf('--jalur');
const MAKS_PUTARAN = Number(iMaks >= 0 ? arg[iMaks + 1] : process.env.MAKS_PER_PUTARAN || 3);
const MAKS_HARI = Number(process.env.MAKS_PER_HARI || 20);
// Jatah regulasi sengaja kecil: tiap draft harus ditinjau editor, dan editor
// sendiri sudah menulis sekitar 2 artikel sehari dari sumber yang sama.
const MAKS_REGULASI_PUTARAN = Number(iMaks >= 0 ? arg[iMaks + 1] : process.env.MAKS_REGULASI_PER_PUTARAN || 2);
const MAKS_REGULASI_HARI = Number(process.env.MAKS_REGULASI_PER_HARI || 4);
const BATAS_MS = Number(process.env.MENIT || 14) * 60e3;
const MULAI = Date.now();
// langsung: sampul dibuat di putaran ini (butuh CLI Higgsfield yang login).
// laptop: draft ditulis tanpa sampul + pesanan; sampul-laptop.mjs yang membuatnya.
const SAMPUL = process.env.SAMPUL || 'langsung';

// Regulasi lebih dulu: jatahnya kecil dan itu yang diminta klien dipercepat.
// Jalur Saudi memakai sisa waktu putaran, seperti sebelumnya.
const JALUR = {
  regulasi: {
    label: 'Regulasi', awalan: cms.AWALAN_REGULASI, kategori: 'cat.regulasi',
    maksPutaran: MAKS_REGULASI_PUTARAN, maksHari: MAKS_REGULASI_HARI,
    seleksi: seleksiRegulasi, tulis: tulisRegulasi, bahasa: 'id', jamSudahDitulis: 72,
  },
  saudi: {
    label: 'Saudi', awalan: cms.AWALAN_ID, kategori: 'cat.saudi',
    maksPutaran: MAKS_PUTARAN, maksHari: MAKS_HARI,
    seleksi, tulis, bahasa: 'en', jamSudahDitulis: 48,
  },
};
const PILIH_JALUR = (iJalur >= 0 ? arg[iJalur + 1] : process.env.JALUR || 'regulasi,saudi')
  .split(',').map((s) => s.trim()).filter(Boolean);

if (!['langsung', 'laptop'].includes(SAMPUL)) {
  console.error(`SAMPUL harus "langsung" atau "laptop", bukan "${SAMPUL}"`);
  process.exit(1);
}
if (TANPA_FOTO && !KERING) {
  console.error('--tanpa-foto hanya boleh bersama --kering: draft tanpa sampul tidak bisa di-Publish editor.');
  process.exit(1);
}
if (!PILIH_JALUR.length || PILIH_JALUR.some((n) => !JALUR[n])) {
  console.error(`--jalur harus berisi "regulasi" dan/atau "saudi", bukan "${PILIH_JALUR.join(',')}"`);
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

// Kegagalan karena ISI (sumber tipis, naskah ditolak pemeriksa) adalah kerja
// normal pengaman, bukan kerusakan. Hanya kerusakan yang boleh memerahkan run.
class GagalKonten extends Error {}

async function main() {
  log(`mulai ${KERING ? '(KERING, tanpa menulis ke Sanity)' : ''} model=${MODEL} jalur=${PILIH_JALUR.join(',')}`);
  const baris = [`## Putaran berita ${KERING ? '(kering)' : ''}`, ''];

  const jatah = {};
  for (const nama of PILIH_JALUR) {
    const j = JALUR[nama];
    const sudah = await cms.jumlahSejak(awalHariWIB(), j.awalan);
    jatah[nama] = Math.max(0, Math.min(j.maksPutaran, j.maksHari - sudah));
    log(`${j.label}: draft hari ini ${sudah}/${j.maksHari}, jatah putaran ini ${jatah[nama]}`);
    baris.push(`${j.label}: draft hari ini sebelum putaran ${sudah} dari ${j.maksHari}.`);
  }
  if (!PILIH_JALUR.some((n) => jatah[n] > 0)) {
    baris.push('Jatah harian sudah penuh, putaran berhenti.');
    ringkasanLangkah(baris.join('\n'));
    return 0;
  }

  const status = await cms.bacaStatus();
  const { kandidat, laporan } = await kumpulkanKandidat();
  baris.push('', '| Sumber | Status | Jumlah |', '|---|---|---|');
  for (const l of laporan) baris.push(`| ${l.sumber} | ${l.status} | ${l.jumlah ?? l.catatan} |`);
  log('sumber:', laporan.map((l) => `${l.sumber}=${l.status}${l.jumlah !== undefined ? `(${l.jumlah})` : ''}`).join(', '));

  // Semua pembanding memakai kunciSumber, bukan URL persis: Arab News mengganti
  // slug saat judulnya diperbarui, dan artikel 3001734 sempat ditulis dua kali
  // (15 Sep 2026) karena URL lama dan barunya berbeda.
  const pernah = new Map();
  for (const r of status.riwayat) {
    const kr = kunciSumber(r.url);
    pernah.set(kr, [...(pernah.get(kr) || []), r.putusan]);
  }
  const seminggu = new Date(Date.now() - 7 * 86400e3).toISOString();
  const terbaruSaudi = PILIH_JALUR.includes('saudi') ? await cms.tulisanTerbaru(seminggu) : [];
  const terbaruSemua = PILIH_JALUR.includes('regulasi') ? await cms.semuaTulisanTerbaru(seminggu) : [];

  const catat = (k, p, alasan) => status.riwayat.push({ url: k.url, judul: k.judul.slice(0, 160), putusan: p, alasan: String(alasan || '').slice(0, 200), waktu: new Date().toISOString() });
  const hasil = [];
  let adaPilihan = false;

  for (const nama of PILIH_JALUR) {
    const j = JALUR[nama];
    if (jatah[nama] <= 0) {
      baris.push('', `${j.label}: jatah harian sudah penuh.`);
      continue;
    }
    const terbaru = nama === 'regulasi' ? terbaruSemua : terbaruSaudi;
    const diDraft = new Set(terbaru.filter((t) => t.sourceUrl).map((t) => kunciSumber(t.sourceUrl)));
    const judulTerbaru = terbaru
      .filter((t) => Date.now() - new Date(t._createdAt).getTime() < j.jamSudahDitulis * 3600e3)
      .map((t) => t.title);

    const lihat = new Set();
    const penuh = [];
    const radar = [];
    for (const k of kandidat) {
      if ((k.jalur || 'saudi') !== nama) continue;
      const kunci = normalJudul(k.judul);
      const ks = kunciSumber(k.url);
      if (lihat.has(kunci) || lihat.has(ks)) continue;
      lihat.add(kunci);
      lihat.add(ks);
      if (k.radar) { radar.push(k); continue; }
      const riwayat = pernah.get(ks) || [];
      if (diDraft.has(ks) || riwayat.includes('ditolak') || riwayat.includes('dibuat')) continue;
      if (riwayat.filter((p) => p === 'gagal').length >= 2) continue;
      penuh.push({ ...k, tanggalTeks: tanggalTeks(k.waktu) });
    }
    log(`${j.label}: kandidat baru ${penuh.length} (radar ${radar.length})`);
    if (!penuh.length) {
      baris.push('', `${j.label}: tidak ada kandidat baru.`);
      continue;
    }
    if (sisaWaktu() < 4 * 60e3) {
      log(`${j.label}: waktu putaran hampir habis, jalur ini ditunda ke putaran berikutnya`);
      continue;
    }

    // Seleksi diminta menyiapkan cadangan: artikel yang ternyata isinya tipis
    // atau gagal pemeriksa tidak boleh menghabiskan jatah putaran.
    const putusan = await j.seleksi(penuh, radar, jatah[nama] + 3, judulTerbaru);
    for (const t of putusan.tolak || []) if (penuh[t.id]) catat(penuh[t.id], 'ditolak', t.alasan);
    const pilihan = (putusan.pilih || [])
      .filter((p) => penuh[p.id] && p.dampak >= 3)
      .sort((a, b) => b.dampak + b.viral - (a.dampak + a.viral));
    log(`${j.label}: dipilih ${pilihan.length} (jatah ${jatah[nama]}, sisanya cadangan), ditolak ${(putusan.tolak || []).length}`);
    if (pilihan.length) adaPilihan = true;

    let berhasilJalur = 0;
    for (const p of pilihan) {
      if (berhasilJalur >= jatah[nama]) break;
      const k = penuh[p.id];
      if (sisaWaktu() < 4 * 60e3) {
        log('waktu hampir habis, sisa pilihan ditunda ke putaran berikutnya');
        break;
      }
      log(`menulis: [${k.sumber}] ${k.judul}`);
      try {
        const isi = await isiArtikel(k);
        if (isi.kata < 150) throw new GagalKonten(`isi sumber terlalu tipis (${isi.kata} kata)`);
        const sumberTeks = `${k.judul}\nPublished ${k.tanggalTeks}\n${isi.teks}`;

        let naskah = await j.tulis(k, isi, p.sudut);
        let cek = periksaNaskah(naskah, sumberTeks, { bahasa: j.bahasa });
        if (!cek.lolos) {
          log(`  ditolak pemeriksa, ditulis ulang: ${cek.alasan.join(' | ')}`);
          naskah = await j.tulis(k, isi, p.sudut, cek.alasan);
          cek = periksaNaskah(naskah, sumberTeks, { bahasa: j.bahasa });
        }
        if (!cek.lolos) throw new GagalKonten(`naskah gagal pemeriksa: ${cek.alasan.join(' | ')}`);

        const slug = await cms.slugBebas(slugify(naskah.judul));
        fs.mkdirSync(FOLDER, { recursive: true });
        fs.writeFileSync(path.join(FOLDER, `${slug}.json`), JSON.stringify({ jalur: nama, kandidat: k, sudut: p.sudut, naskah, cek }, null, 2));

        let sampul = { buffer: null, laporan: ['dilewati (--tanpa-foto)'] };
        if (SAMPUL === 'laptop') {
          sampul = { buffer: null, laporan: ['dipesan ke laptop'], model: 'menunggu laptop' };
        } else if (!TANPA_FOTO) {
          sampul = await buatSampul(naskah.objek_foto, { folder: FOLDER, nama: slug, sidikLama: status.sidikFoto });
          if (!sampul.buffer) throw new Error(`semua percobaan sampul gagal: ${sampul.laporan.join('; ')}`);
          status.sidikFoto.push(sampul.sidik);
        }

        if (!KERING) {
          const draftId = `drafts.${j.awalan}${slug}`;
          const aset = sampul.buffer ? await cms.unggahGambar(sampul.buffer, `${slug}.jpg`) : null;
          const kata = jumlahKata(naskah.body.map((b) => b.x).join(' '));
          const pesanan = SAMPUL === 'laptop'
            ? [cms.mutasiPesanSampul({ draftId, slug, judul: naskah.judul, objek: naskah.objek_foto })]
            : [];
          await cms.buatDraft({
            _id: draftId,
            _type: 'post',
            title: naskah.judul,
            slug: { _type: 'slug', current: slug },
            kind: 'berita',
            category: { _type: 'reference', _ref: j.kategori },
            ...(aset ? { coverImage: { _type: 'image', asset: { _type: 'reference', _ref: aset }, alt: naskah.judul } } : {}),
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
          }, pesanan);
          catat(k, 'dibuat', slug);
        }
        berhasilJalur++;
        hasil.push({ jalur: j.label, k, slug, naskah, cek, sampul });
        log(`  ${KERING ? 'siap (kering)' : 'draft dibuat'}: ${slug} | ${cek.kata} kata | sampul ${sampul.model || '-'}`);
      } catch (e) {
        log(`  GAGAL: ${e.message}`);
        catat(k, 'gagal', e.message);
        hasil.push({ jalur: j.label, k, galat: e.message, konten: e instanceof GagalKonten });
      }
    }
  }

  if (!KERING) await cms.simpanStatus(status);

  if (hasil.length) baris.push('', '| Hasil | Jalur | Sumber | Judul | Catatan |', '|---|---|---|---|---|');
  for (const h of hasil) {
    if (h.galat) baris.push(`| gagal | ${h.jalur} | ${h.k.sumber} | ${h.k.judul} | ${h.galat.slice(0, 160)} |`);
    else baris.push(`| ${KERING ? 'siap' : 'draft'} | ${h.jalur} | ${h.k.sumber} | ${h.naskah.judul} | ${h.cek.kata} kata, sampul ${h.sampul.model || '-'}${h.cek.peringatan.length ? `, peringatan: ${h.cek.peringatan.join('; ')}` : ''} |`);
  }
  ringkasanLangkah(baris.join('\n'));
  if (KERING) {
    fs.mkdirSync(FOLDER, { recursive: true });
    fs.writeFileSync(path.join(FOLDER, 'ringkasan.md'), baris.join('\n'));
  }

  const berhasil = hasil.filter((h) => !h.galat).length;
  log(`selesai: ${berhasil} berhasil, ${hasil.length - berhasil} gagal`);
  // Merah bila ada pilihan, tak satu pun berhasil, dan setidaknya satu gagal
  // karena kerusakan (Claude, Sanity, jaringan), supaya kerusakan terlihat di
  // GitHub, bukan senyap, tanpa memerahkan penolakan pengaman yang wajar.
  const rusak = hasil.some((h) => h.galat && !h.konten);
  return adaPilihan && !berhasil && rusak ? 2 : 0;
}

main().then(akhiri).catch((e) => {
  console.error(e);
  akhiri(1);
});
