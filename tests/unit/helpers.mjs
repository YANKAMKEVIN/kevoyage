// Outils communs : d3 (chargé comme dans la page), villes réelles, voyage construit avec le vrai modèle (src/trip.js).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
vm.runInThisContext(readFileSync(new URL('d3.min.js', root), 'utf8'));
export const { etat } = await import('../../src/state.js');
export const trip = await import('../../src/trip.js');
export const geo = await import('../../src/geo.js');
etat.CITIES = JSON.parse(readFileSync(new URL('cities.json', root), 'utf8'));

const IMG = 'data:image/jpeg;base64,/9j/AA==';
const DAY = 864e5, base = new Date(2026, 4, 2, 9, 0).getTime();
/** Photo : jour, heure, lieu (lat/lon, ou null pour une photo sans lieu). */
let id = 0;
export function photo(day, hour, lat, lon, extra = {}) {
  const est = lat === null;
  return { id: ++id, t: base + day * DAY + hour * 36e5, lat: est ? 0 : lat, lon: est ? 0 : lon, est, src: IMG, cap: '', place: '', ...extra };
}
/** Voyage Paris -> Tokyo -> Kyoto -> Nara (avec une photo sans lieu à Kyoto). */
export function japan() {
  return [
    photo(0, 9, 49.009, 2.548), photo(1, 18, 35.659, 139.700), photo(2, 8, 35.715, 139.797), photo(2, 21, 35.694, 139.703),
    photo(5, 17, 34.995, 135.785), photo(5, 18, null, null), photo(6, 11, 34.967, 135.773), photo(7, 10, 34.685, 135.843),
  ];
}
/** Charge des photos dans le modèle et construit le voyage. */
export function load(photos, names = {}) {
  etat.photos = photos; etat.names = names; etat.W = 1280; etat.H = 800;
  trip.estimate(); trip.build();
  return etat;
}
export function memDb(init = {}) {
  const m = new Map(Object.entries(init));
  return { get: async k => structuredClone(m.get(k)), set: async (k, v) => { m.set(k, structuredClone(v)); }, del: async k => { m.delete(k); }, m };
}
export { IMG };
