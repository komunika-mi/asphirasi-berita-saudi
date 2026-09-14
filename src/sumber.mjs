// Lima portal yang diminta Ketum ASPHIRASI (rapat 9 Sep 2026).
//
// Tiga bisa dibaca isinya penuh (Al Jazeera, SPA, Saudi Updates). Arab News
// dan Al Arabiya memasang tantangan bot Cloudflare: Al Arabiya selalu (403),
// Arab News kadang terbuka kadang tidak (terbukti 14 Sep 2026, dua jam
// berselang). Keduanya TIDAK diakali. Judulnya diambil lewat Google News
// sebagai "radar": menandai isu yang ramai diliput, bukan bahan tulisan.
import { ambil, Diblokir, dekodeEntitas, tanpaTag, jumlahKata } from './util.mjs';

const JENDELA_JAM = 36;

function itemRSS(xml) {
  const hasil = [];
  for (const [, blok] of xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/g)) {
    const bagian = (tag) => {
      const m = blok.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
      return m ? m[1].trim() : '';
    };
    hasil.push({
      judul: dekodeEntitas(tanpaTag(bagian('title'))),
      url: dekodeEntitas(bagian('link')),
      waktu: bagian('pubDate') ? new Date(bagian('pubDate')).toISOString() : null,
      ringkas: tanpaTag(bagian('description')).slice(0, 400),
      isiHtml: bagian('content:encoded'),
    });
  }
  return hasil;
}

function segar(k) {
  if (!k.waktu) return true;
  return Date.now() - new Date(k.waktu).getTime() < JENDELA_JAM * 3600e3;
}

function dataNext(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('__NEXT_DATA__ tidak ada');
  return JSON.parse(m[1]);
}

async function radarGoogleNews(situs, namaSumber) {
  const xml = await ambil(
    `https://news.google.com/rss/search?q=site:${situs}+when:2d&hl=en-US&gl=US&ceid=US:en`,
  );
  return itemRSS(xml).map((i) => ({
    sumber: namaSumber,
    judul: i.judul.replace(/\s+-\s+[^-]+$/, ''),
    url: i.url,
    waktu: i.waktu,
    ringkas: '',
    radar: true,
  }));
}

const PENGAMBIL = {
  async 'Al Jazeera'() {
    const xml = await ambil('https://www.aljazeera.com/xml/rss/all.xml');
    return itemRSS(xml).map((i) => ({
      sumber: 'Al Jazeera',
      judul: i.judul,
      url: i.url.replace(/\?.*$/, ''),
      waktu: i.waktu,
      ringkas: i.ringkas,
      // Halaman video/galeri/siaran langsung tidak punya teks untuk ditulis
      // (terbukti 14 Sep 2026: "Heavy rain falls over the Kaaba" = video),
      // tapi tetap berguna sebagai penanda isu yang ramai.
      radar: /aljazeera\.com\/(?:video|program|gallery|podcasts?|liveblog)\//.test(i.url),
    }));
  },

  async 'Saudi Press Agency (SPA)'() {
    const d = dataNext(await ambil('https://www.spa.gov.sa/en'));
    return (d.props?.pageProps?.mainNews || []).map((n) => ({
      sumber: 'Saudi Press Agency (SPA)',
      judul: n.title,
      url: `https://www.spa.gov.sa/en/${n.uuid}`,
      waktu: n.published_at ? new Date(n.published_at * 1000).toISOString() : null,
      ringkas: n.main_tag?.name ? `Rubrik: ${n.main_tag.name}` : '',
    }));
  },

  async 'Saudi Updates'() {
    const xml = await ambil('https://saudiupdates.com/feed/');
    return itemRSS(xml).map((i) => ({
      sumber: 'Saudi Updates',
      judul: i.judul,
      url: i.url,
      waktu: i.waktu,
      ringkas: i.ringkas,
      teksRSS: tanpaTag(i.isiHtml.replace(/<p>The post [\s\S]*$/i, '')),
    }));
  },

  async 'Arab News'() {
    try {
      const xml = await ambil('https://www.arabnews.com/rss.xml');
      const langsung = itemRSS(xml).map((i) => ({
        sumber: 'Arab News',
        judul: i.judul,
        url: i.url,
        waktu: i.waktu,
        ringkas: i.ringkas,
      }));
      if (langsung.length) return langsung;
    } catch (e) {
      if (!(e instanceof Diblokir)) throw e;
    }
    return radarGoogleNews('arabnews.com', 'Arab News');
  },

  async 'Al Arabiya'() {
    return radarGoogleNews('english.alarabiya.net', 'Al Arabiya');
  },
};

export async function kumpulkanKandidat() {
  const laporan = [];
  const semua = [];
  const hasil = await Promise.allSettled(
    Object.entries(PENGAMBIL).map(async ([nama, fn]) => [nama, await fn()]),
  );
  hasil.forEach((h, i) => {
    const nama = Object.keys(PENGAMBIL)[i];
    if (h.status === 'rejected') {
      laporan.push({ sumber: nama, status: 'gagal', catatan: String(h.reason?.message || h.reason) });
      return;
    }
    const items = h.value[1].filter(segar).filter((k) => k.judul && k.url);
    const radar = items.some((k) => k.radar);
    laporan.push({ sumber: nama, status: radar ? 'radar judul' : 'isi penuh', jumlah: items.length });
    semua.push(...items);
  });
  return { kandidat: semua, laporan };
}

const PERABOT = /(Show navigation|Sign up|whatsapp-stroke|Cookie|Advertisement|Add Al Jazeera on Google|Follow Al Jazeera|Click here to share|Subscribe to our)/i;

function paragrafHtml(html) {
  return [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
    .map((m) => tanpaTag(m[1]))
    .filter((p) => p.length >= 60 && !PERABOT.test(p));
}

// Penanda dicoba BERURUTAN, bukan diambil yang paling awal muncul: halaman
// Arab News memuat kartu <article> berita terkait SESUDAH isi utamanya, jadi
// memotong dari penanda terawal membuang seluruh isi (terjadi 14 Sep 2026).
const WADAH = [
  ['entry-article-body', /class="entry-shares-bottom|<\/main>/], // Arab News
  // Al Jazeera menyelipkan kotak "more on" di tengah isi, jadi batasnya </main>.
  ['wysiwyg--all-content', /<\/main>/],
  ['itemprop="articleBody"', /<\/main>/],
];

function wadahIsi(html) {
  for (const [awal, akhir] of WADAH) {
    const i = html.indexOf(awal);
    if (i < 0) continue;
    const sisa = html.slice(i);
    const j = sisa.search(akhir);
    return j > 0 ? sisa.slice(0, j) : sisa;
  }
  return html;
}

// Isi lengkap untuk bahan tulisan. Radar tidak pernah sampai sini karena
// seleksi hanya boleh memilih kandidat berisi penuh.
export async function isiArtikel(k) {
  let teks = '';
  if (k.sumber === 'Saudi Press Agency (SPA)') {
    const d = dataNext(await ambil(k.url));
    const n = d.props?.pageProps?.newsDetails || {};
    // SPA menutup tiap berita dengan kode angka seperti "0048".
    teks = String(n.content || '')
      .replace(/\r/g, '')
      .split(/\n+/)
      .map((s) => s.trim())
      .filter((s) => s && !/^[\d\s-]+$/.test(s))
      .join('\n\n');
  } else if (k.sumber === 'Saudi Updates' && k.teksRSS) {
    teks = k.teksRSS;
  } else {
    const html = await ambil(k.url);
    teks = paragrafHtml(wadahIsi(html)).join('\n\n');
  }
  return { teks, kata: jumlahKata(teks) };
}
