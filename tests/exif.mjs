// Fabrique de vraies photos JPEG avec date et position GPS dans les données EXIF (comme un téléphone),
// pour tester l'import sans fichier binaire dans le dépôt.

/** Bloc EXIF (APP1) : date de prise de vue (et son fuseau, OffsetTimeOriginal), et position si lat/lon sont donnés.
 * @param {{date?:string, offset?:string, lat?:number, lon?:number}} o date au format '2026:06:01 10:00:00', offset '+09:00' */
export function exifSegment({ date, offset, lat, lon }) {
  const gps = typeof lat === 'number' && typeof lon === 'number';
  const ifd = entries => 2 + entries * 12 + 4;
  // disposition : en-tête TIFF (8) | IFD0 | IFD Exif | IFD GPS | données (date, rationnels)
  const n0 = (date ? 1 : 0) + (gps ? 1 : 0);
  const nE = date ? (offset ? 2 : 1) : 0;
  const o0 = 8, oE = o0 + ifd(n0), oG = oE + (nE ? ifd(nE) : 0), oD = oG + (gps ? ifd(4) : 0);
  const size = oD + 20 + 8 + 48;
  const b = Buffer.alloc(size);
  b.write('II', 0, 'ascii'); b.writeUInt16LE(42, 2); b.writeUInt32LE(o0, 4);
  let p;
  const entry = (tag, type, count, value) => { b.writeUInt16LE(tag, p); b.writeUInt16LE(type, p + 2); b.writeUInt32LE(count, p + 4); if (typeof value === 'string') b.write(value, p + 8, 'ascii'); else b.writeUInt32LE(value, p + 8); p += 12; };
  p = o0; b.writeUInt16LE(n0, p); p += 2;
  if (date) entry(0x8769, 4, 1, oE);
  if (gps) entry(0x8825, 4, 1, oG);
  b.writeUInt32LE(0, p);
  let data = oD;
  if (date) {
    p = oE; b.writeUInt16LE(nE, p); p += 2;
    entry(0x9003, 2, 20, data); b.write(date + '\0', data, 'ascii'); data += 20;
    if (offset) { entry(0x9011, 2, 7, data); b.write(offset.slice(0, 6) + '\0', data, 'ascii'); data += 8; }
    b.writeUInt32LE(0, p);
  }
  if (gps) {
    const dms = v => { v = Math.abs(v); const d = Math.floor(v), m = Math.floor((v - d) * 60), s = Math.round(((v - d) * 60 - m) * 60 * 1000); return [[d, 1], [m, 1], [s, 1000]]; };
    const rat = (vals, at) => vals.forEach(([n, dn], i) => { b.writeUInt32LE(n, at + i * 8); b.writeUInt32LE(dn, at + i * 8 + 4); });
    p = oG; b.writeUInt16LE(4, p); p += 2;
    entry(1, 2, 2, lat >= 0 ? 'N' : 'S'); entry(2, 5, 3, data); rat(dms(lat), data); data += 24;
    entry(3, 2, 2, lon >= 0 ? 'E' : 'W'); entry(4, 5, 3, data); rat(dms(lon), data); data += 24;
    b.writeUInt32LE(0, p);
  }
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), b.subarray(0, data)]);
  const head = Buffer.alloc(4); head.writeUInt16BE(0xFFE1, 0); head.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([head, body]);
}

/** Ajoute le bloc EXIF juste après le début d'un JPEG. @param {Buffer} jpeg */
export function withExif(jpeg, o) {
  if (jpeg[0] !== 0xFF || jpeg[1] !== 0xD8) throw new Error('pas un JPEG');
  return Buffer.concat([jpeg.subarray(0, 2), exifSegment(o), jpeg.subarray(2)]);
}
