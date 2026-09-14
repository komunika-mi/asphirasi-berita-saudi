import crypto from 'node:crypto';

const kunci = () => crypto.randomBytes(6).toString('hex');

const GAYA = { p: 'normal', h2: 'h2', h3: 'h3', q: 'blockquote', li: 'normal', no: 'normal' };
const DAFTAR = { li: 'bullet', no: 'number' };

// Bentuk body sama dengan naskah publish.py: [{ t: 'p'|'h2'|'h3'|'li'|'no'|'q', x }].
export function keBlok(body) {
  return body.map((b) => {
    const blok = {
      _type: 'block',
      _key: kunci(),
      style: GAYA[b.t] || 'normal',
      markDefs: [],
      children: [{ _type: 'span', _key: kunci(), text: b.x.trim(), marks: [] }],
    };
    if (DAFTAR[b.t]) {
      blok.listItem = DAFTAR[b.t];
      blok.level = 1;
    }
    return blok;
  });
}
