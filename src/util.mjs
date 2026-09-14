import fs from 'node:fs';

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

export class Diblokir extends Error {}

export function log(...a) {
  console.log(new Date().toISOString().slice(11, 19), ...a);
}

export function ringkasanLangkah(teks) {
  const tujuan = process.env.GITHUB_STEP_SUMMARY;
  if (tujuan) fs.appendFileSync(tujuan, teks + '\n');
}

// Situs yang menantang bot (Cloudflare "Just a moment...") dilaporkan sebagai
// Diblokir, bukan dicoba diakali. Pemanggil memutuskan jalur cadangannya.
export async function ambil(url, { batasMs = 25000, percobaan = 2 } = {}) {
  let galat;
  for (let i = 0; i < percobaan; i++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), batasMs);
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml,*/*' },
        redirect: 'follow',
        signal: ctl.signal,
      });
      const teks = await r.text();
      if (r.headers.get('cf-mitigated') || /<title>Just a moment\.\.\.<\/title>/i.test(teks)) {
        throw new Diblokir(`${new URL(url).hostname} menantang bot`);
      }
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      return teks;
    } catch (e) {
      if (e instanceof Diblokir) throw e;
      galat = e;
      await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
    } finally {
      clearTimeout(t);
    }
  }
  throw galat;
}

const ENTITAS = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…' };

export function dekodeEntitas(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITAS[n.toLowerCase()] ?? m);
}

export function tanpaTag(html) {
  return dekodeEntitas(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function jumlahKata(s) {
  return (s.match(/\S+/g) || []).length;
}

// Awal hari WIB dalam ISO UTC, untuk menghitung jatah draft harian.
export function awalHariWIB(sekarang = new Date()) {
  const wib = new Date(sekarang.getTime() + 7 * 3600e3);
  wib.setUTCHours(0, 0, 0, 0);
  return new Date(wib.getTime() - 7 * 3600e3).toISOString();
}

export function slugify(s, maks = 70) {
  let t = s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (t.length > maks) t = t.slice(0, maks).replace(/-[^-]*$/, '');
  return t;
}
