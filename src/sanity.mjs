import crypto from 'node:crypto';

const PROJECT = process.env.SANITY_PROJECT_ID || 'lvopp36h';
const DATASET = process.env.SANITY_DATASET || 'production';
const VERSI = 'v2024-10-01';
const TOKEN = process.env.SANITY_API_WRITE_TOKEN;

// Semua draft buatan pipeline ini ber-_id "drafts.saudi.<slug>". Saat editor
// menekan Publish di Studio, _id-nya menjadi "saudi.<slug>".
export const AWALAN_ID = 'saudi.';
const ID_STATUS = 'pipeline.berita-saudi';
const MAKS_RIWAYAT = 800;

function wajibToken() {
  if (!TOKEN) throw new Error('SANITY_API_WRITE_TOKEN belum diisi');
}

async function panggil(url, init = {}) {
  wajibToken();
  const r = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(init.headers || {}) },
  });
  const teks = await r.text();
  if (!r.ok) throw new Error(`Sanity ${r.status}: ${teks.slice(0, 300)}`);
  return teks ? JSON.parse(teks) : {};
}

export async function kueri(groq, params = {}) {
  const u = new URL(`https://${PROJECT}.api.sanity.io/${VERSI}/data/query/${DATASET}`);
  u.searchParams.set('query', groq);
  u.searchParams.set('perspective', 'raw');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(`$${k}`, JSON.stringify(v));
  return (await panggil(u)).result;
}

export async function mutasi(mutations) {
  return panggil(`https://${PROJECT}.api.sanity.io/${VERSI}/data/mutate/${DATASET}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mutations }),
  });
}

// Tulisan beberapa hari terakhir, termasuk draft dan tulisan editor sendiri,
// untuk mencegah artikel sumber yang sama maupun peristiwa yang sama ditulis ulang.
export async function tulisanTerbaru(isoAwal) {
  return kueri(
    '*[_type=="post" && _createdAt >= $awal && (defined(sourceUrl) || category._ref == "cat.saudi")]{title, sourceUrl, _createdAt}',
    { awal: isoAwal },
  );
}

export async function jumlahSejak(isoAwal) {
  return kueri(
    'count(*[_type=="post" && (_id in path($draft) || _id in path($tayang)) && _createdAt >= $awal])',
    { draft: `drafts.${AWALAN_ID}**`, tayang: `${AWALAN_ID}**`, awal: isoAwal },
  );
}

export async function slugBebas(slug) {
  const dipakai = new Set(
    await kueri('*[_type=="post" && string::startsWith(slug.current, $s)].slug.current', { s: slug }),
  );
  if (!dipakai.has(slug)) return slug;
  for (let i = 2; i < 50; i++) if (!dipakai.has(`${slug}-${i}`)) return `${slug}-${i}`;
  return `${slug}-${crypto.randomBytes(3).toString('hex')}`;
}

export async function unggahGambar(buffer, namaBerkas) {
  const u = `https://${PROJECT}.api.sanity.io/${VERSI}/assets/images/${DATASET}?filename=${encodeURIComponent(namaBerkas)}`;
  const hasil = await panggil(u, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: buffer });
  return hasil.document._id;
}

// Riwayat kandidat yang sudah dinilai, supaya berita yang ditolak seleksi
// tidak dikirim ulang ke Claude tiap jam. Disimpan sebagai dokumen di luar
// skema Studio, jadi tidak muncul di daftar konten editor.
export async function bacaStatus() {
  const d = await kueri('*[_id == $id][0]', { id: ID_STATUS });
  return { riwayat: d?.riwayat || [], sidikFoto: d?.sidikFoto || [] };
}

export async function simpanStatus({ riwayat, sidikFoto }) {
  await mutasi([
    {
      createOrReplace: {
        _id: ID_STATUS,
        _type: 'pipelineStatus',
        riwayat: riwayat.slice(-MAKS_RIWAYAT),
        sidikFoto: sidikFoto.slice(-MAKS_RIWAYAT),
        diperbarui: new Date().toISOString(),
      },
    },
  ]);
}

// Mutasi tambahan (misalnya pesanan sampul) dikirim dalam SATU transaksi dengan
// draftnya, supaya tidak ada draft tanpa sampul yang pesanannya hilang.
export async function buatDraft(doc, tambahan = []) {
  return mutasi([{ createIfNotExists: doc }, ...tambahan]);
}

// ---------------------------------------------------------------------------
// Antrean sampul (opsi b, 14 Sep 2026): z_image hanya bisa jalan di laptop,
// jadi cloud menulis draft TANPA sampul lalu meninggalkan satu dokumen pesanan
// per draft. Laptop mengerjakan pesanan dan menghapusnya.
//
// Satu dokumen per pesanan, bukan larik di dokumen status: cloud dan laptop
// berjalan pada waktu yang bisa bersamaan, dan dokumen yang ditulis dua pihak
// dengan createOrReplace akan saling menimpa. Aturannya: tiap dokumen punya
// satu penulis saja.
// ---------------------------------------------------------------------------
const AWALAN_PESANAN = 'pipeline.sampul.';
const ID_SIDIK_LAPTOP = 'pipeline.sampul-sidik';

export function mutasiPesanSampul({ draftId, slug, judul, objek }) {
  return {
    createIfNotExists: {
      _id: `${AWALAN_PESANAN}${slug}`,
      _type: 'pipelineSampul',
      draftId,
      slug,
      judul,
      objek,
      dipesan: new Date().toISOString(),
      percobaan: 0,
    },
  };
}

export async function daftarPesananSampul() {
  return kueri('*[_type=="pipelineSampul"] | order(dipesan asc)');
}

// objekBaru dipakai putaran berikutnya: objek yang gagal berulang biasanya
// memang sulit digambar tanpa tulisan (terbukti "Diplomasi Selat Hormuz",
// 4 gambar ditolak pada 15 Sep 2026), jadi mengulang objek yang sama sia-sia.
export async function catatGagalSampul(pesanan, alasan, objekBaru) {
  const set = { alasanTerakhir: String(alasan).slice(0, 300) };
  if (objekBaru) Object.assign(set, { objek: objekBaru, objekDiganti: true });
  return mutasi([{ patch: { id: pesanan._id, inc: { percobaan: 1 }, set } }]);
}

export async function gantiObjekPesanan(idPesanan, objek) {
  return mutasi([{ patch: { id: idPesanan, set: { objek, objekDiganti: true } } }]);
}

export async function selesaikanPesanan(idPesanan) {
  return mutasi([{ delete: { id: idPesanan } }]);
}

export async function keadaanDraft(draftId) {
  const tayangId = draftId.replace(/^drafts\./, '');
  return kueri('{"draft": *[_id == $d][0]{_id, "adaSampul": defined(coverImage.asset), "judul": title, "ringkasan": excerpt}, "tayang": *[_id == $t][0]{_id}}', {
    d: draftId,
    t: tayangId,
  });
}

export async function pasangSampul(draftId, asetId, alt) {
  return mutasi([
    {
      patch: {
        id: draftId,
        set: { coverImage: { _type: 'image', asset: { _type: 'reference', _ref: asetId }, alt } },
      },
    },
  ]);
}

export async function bacaSidikLaptop() {
  return (await kueri('*[_id == $id][0].sidik', { id: ID_SIDIK_LAPTOP })) || [];
}

export async function simpanSidikLaptop(sidik) {
  return mutasi([
    {
      createOrReplace: {
        _id: ID_SIDIK_LAPTOP,
        _type: 'pipelineSidik',
        sidik: sidik.slice(-MAKS_RIWAYAT),
        diperbarui: new Date().toISOString(),
      },
    },
  ]);
}
