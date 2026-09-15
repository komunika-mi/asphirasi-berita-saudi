import test from 'node:test';
import assert from 'node:assert/strict';
import { kunciSumber } from '../src/util.mjs';

test('artikel Arab News yang slug-nya berubah dikenali sebagai artikel yang sama (kasus 3001734)', () => {
  const lama = 'https://www.arabnews.com/saudi-arabia/13-civilians-injured-after-houthi-attacks-on-saudi-cities-3001734';
  const baru = 'https://www.arabnews.com/saudi-arabia/13-civilians-in-saudi-arabia-injured-after-houthi-attacks-alerts-for-several-cities-across-kingdom-3001734';
  assert.equal(kunciSumber(lama), kunciSumber(baru));
  assert.notEqual(kunciSumber(lama), kunciSumber('https://www.arabnews.com/energy/oil-prices-jump-3001617'));
});

test('kode berita SPA dan path situs lain', () => {
  assert.equal(kunciSumber('https://www.spa.gov.sa/en/N2675169'), 'spa.gov.sa#N2675169');
  assert.equal(kunciSumber('https://spa.gov.sa/en/N2675169/'), 'spa.gov.sa#N2675169');
  assert.equal(
    kunciSumber('https://www.aljazeera.com/news/2026/9/14/yemen-govt-forces-advance-in-taiz'),
    'aljazeera.com/news/2026/9/14/yemen-govt-forces-advance-in-taiz',
  );
  // Tahun di URL Al Jazeera tidak boleh dianggap nomor artikel.
  assert.notEqual(
    kunciSumber('https://www.aljazeera.com/news/2026/9/14/a'),
    kunciSumber('https://www.aljazeera.com/news/2026/9/14/b'),
  );
});
