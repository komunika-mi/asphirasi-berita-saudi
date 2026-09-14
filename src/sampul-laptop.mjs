// Pengerja pesanan sampul di laptop (opsi b, dipilih pemilik 14 Sep 2026).
// Dijalankan Task Scheduler tiap jam lewat scripts/jalankan-sampul.ps1.
//
// z_image hanya tersedia lewat CLI Higgsfield yang login di laptop ini: API
// Higgsfield Cloud tidak memuat z_image dan saldonya terpisah dari paket Pro.
import fs from 'node:fs';
import path from 'node:path';
import * as cms from './sanity.mjs';
import { buatSampul } from './foto.mjs';
import { log } from './util.mjs';

const MAKS = Number(process.env.MAKS_SAMPUL || 10);
const BATAS_MS = Number(process.env.MENIT_SAMPUL || 45) * 60e3;
// Pesanan yang gagal di 3 putaran berhenti dicoba; editor memasang foto sendiri.
const MAKS_PERCOBAAN = 3;
const FOLDER = path.join('keluaran', 'sampul');
const SIMPAN_HARI = 7;
const MULAI = Date.now();

function bersihkanBerkasLama() {
  if (!fs.existsSync(FOLDER)) return;
  const batas = Date.now() - SIMPAN_HARI * 86400e3;
  for (const f of fs.readdirSync(FOLDER)) {
    const p = path.join(FOLDER, f);
    if (fs.statSync(p).mtimeMs < batas) fs.unlinkSync(p);
  }
}

async function tutup(p, alasan) {
  log(`  ${p.slug}: ${alasan}, pesanan ditutup`);
  await cms.selesaikanPesanan(p._id);
}

async function main() {
  bersihkanBerkasLama();
  const semua = await cms.daftarPesananSampul();
  const antre = semua.filter((p) => (p.percobaan || 0) < MAKS_PERCOBAAN);
  log(`pesanan sampul: ${semua.length}, dikerjakan: ${Math.min(antre.length, MAKS)}, sudah menyerah: ${semua.length - antre.length}`);
  if (!antre.length) return 0;

  const sidik = await cms.bacaSidikLaptop();
  let berhasil = 0;
  let gagal = 0;
  for (const p of antre.slice(0, MAKS)) {
    if (Date.now() - MULAI > BATAS_MS) {
      log('batas waktu tercapai, sisa pesanan menunggu putaran berikutnya');
      break;
    }
    const awal = await cms.keadaanDraft(p.draftId);
    if (!awal.draft) { await tutup(p, awal.tayang ? 'draft sudah di-Publish' : 'draft sudah dihapus editor'); continue; }
    if (awal.draft.adaSampul) { await tutup(p, 'editor sudah memasang foto'); continue; }

    log(`  ${p.slug}: membuat sampul "${p.objek}"`);
    const hasil = await buatSampul(p.objek, { folder: FOLDER, nama: p.slug, sidikLama: sidik });
    if (!hasil.buffer) {
      gagal++;
      log(`  ${p.slug}: GAGAL ${hasil.laporan.join('; ')}`);
      await cms.catatGagalSampul(p, hasil.laporan.join('; ')).catch(() => {});
      continue;
    }

    const aset = await cms.unggahGambar(hasil.buffer, `${p.slug}.jpg`);
    // Pembuatan sampul bisa makan beberapa menit; editor mungkin bertindak di sela itu.
    const akhir = await cms.keadaanDraft(p.draftId);
    if (akhir.draft && !akhir.draft.adaSampul) {
      await cms.pasangSampul(p.draftId, aset, p.judul);
      berhasil++;
      log(`  ${p.slug}: sampul ${hasil.model} terpasang (${hasil.laporan.join('; ')})`);
    } else {
      log(`  ${p.slug}: draft berubah selama sampul dibuat, sampul tidak dipasang`);
    }
    await cms.selesaikanPesanan(p._id);
    sidik.push(hasil.sidik);
    await cms.simpanSidikLaptop(sidik);
  }
  log(`selesai: ${berhasil} terpasang, ${gagal} gagal`);
  return gagal && !berhasil ? 2 : 0;
}

main().then((kode) => process.exit(kode)).catch((e) => {
  console.error(e);
  process.exit(1);
});
