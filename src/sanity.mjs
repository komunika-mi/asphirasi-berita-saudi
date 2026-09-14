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

export async function urlSudahAda(urls) {
  if (!urls.length) return new Set();
  const ada = await kueri('*[_type=="post" && sourceUrl in $urls].sourceUrl', { urls });
  return new Set(ada);
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

export async function buatDraft(doc) {
  return mutasi([{ createIfNotExists: doc }]);
}
