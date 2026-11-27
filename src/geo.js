// @ts-check
/** Géographie : projection, distances, ville la plus proche. Sans DOM. */
import { etat } from './state.js';

/* ---------- geography ---------- */
export const proj = d3.geoMercator().scale(1000 / (2 * Math.PI)).translate([500, 500]);
const R = 6371;
const rad = d => d * Math.PI / 180;
export function km(a, b) {
  const dLa = rad(b.lat - a.lat), dLo = rad(b.lon - a.lon);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function nearest(lat, lon) {
  let best = null, bd = 1e9;
  const cl = Math.cos(rad(lat));
  for (const c of etat.CITIES) {
    const dx = (c[2] - lon) * cl, dy = c[1] - lat;
    let d = dx * dx + dy * dy;
    if (c[4] < 50000) d *= 1.6;
    if (d < bd) { bd = d; best = c; }
  }
  if (!best) return {name: lat.toFixed(2) + '°, ' + lon.toFixed(2) + '°', iso: ''};
  const d = km({lat, lon}, {lat: best[1], lon: best[2]});
  if (d < 15) return {name: best[0], iso: best[3]};
  if (d < 80) return {name: 'Près de ' + best[0], iso: best[3]};
  if (d < 250 && best[3]) return {name: etat.regionName(best[3]), iso: best[3]};
  return {name: Math.abs(lat).toFixed(1) + '°' + (lat >= 0 ? 'N' : 'S') + ' ' + Math.abs(lon).toFixed(1) + '°' + (lon >= 0 ? 'E' : 'O'), iso: ''};
}
