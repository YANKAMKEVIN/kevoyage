// @ts-check
/** Le voyage sans DOM : étapes, trajets, séquence animée, résumé, titre automatique. Testé sous Node. */
import { DAY, fmtMonth, nf } from './fmt.js';
import { etat } from './state.js';
import { km, nearest, proj } from './geo.js';

export function build() {
  etat.photos.sort((a, b) => a.t - b.t);
  etat.stops = [];
  for (const p of etat.photos) {
    const s = etat.stops[etat.stops.length - 1];
    if (s && km(s, p) < 15) {
      s.photos.push(p); s.t1 = p.t;
      if (!p.est) { s.n++; s.lat += (p.lat - s.lat) / s.n; s.lon += (p.lon - s.lon) / s.n; }
    } else etat.stops.push(/** @type {any} */ ({lat: p.lat, lon: p.lon, n: p.est ? 0 : 1, t0: p.t, t1: p.t, photos: [p]}));
  }
  let px = null;
  etat.stops.forEach((s, i) => {
    s.i = i; s.key = s.photos[0].id;
    const nc = nearest(s.lat, s.lon);
    s.auto = nc.name; s.iso = nc.iso;
    s.name = etat.names[s.key] || s.photos.find(p => p.place)?.place || nc.name;
    let [x, y] = proj([s.lon, s.lat]);
    if (px !== null) { while (x - px > 500) x -= 1000; while (px - x > 500) x += 1000; }
    s.x = x; s.y = y; px = x;
  });
  etat.legs = [];
  for (let i = 0; i + 1 < etat.stops.length; i++) {
    const a = etat.stops[i], b = etat.stops[i + 1], d = km(a, b), fly = d > 250;
    const pts = [];
    const N = fly ? 64 : 2;
    const gi = d3.geoInterpolate([a.lon, a.lat], [b.lon, b.lat]);
    let lx = a.x;
    for (let j = 0; j <= N; j++) {
      const f = j / N;
      let x, y;
      if (fly) { [x, y] = proj(gi(f)); while (x - lx > 500) x -= 1000; while (lx - x > 500) x += 1000; lx = x; }
      else { x = a.x + (b.x - a.x) * f; y = a.y + (b.y - a.y) * f; }
      pts.push([x, y]);
    }
    if (fly) {
      const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
      pts.forEach((p, j) => { const f = j / N, o = Math.sin(Math.PI * f) * L * 0.12; p[0] += -dy / L * o; p[1] += dx / L * o; });
    }
    const cum = [0];
    for (let j = 1; j < pts.length; j++) cum.push(cum[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
    etat.legs.push({a, b, km: d, fly, pts, cum, len: cum[cum.length - 1]});
  }
  etat.stops.forEach((s, i) => {
    const ds = [];
    if (etat.legs[i - 1]) ds.push(Math.hypot(s.x - etat.stops[i - 1].x, s.y - etat.stops[i - 1].y));
    if (etat.legs[i]) ds.push(Math.hypot(s.x - etat.stops[i + 1].x, s.y - etat.stops[i + 1].y));
    const d = ds.length ? Math.min(...ds) : 3;
    s.view = [s.x, s.y, Math.max(7, Math.min(80, d * 2))]; // en dessous, le trait de côte de la carte du monde devient anguleux
    const k = Math.min(5, s.photos.length);
    s.show = Array.from({length: k}, (_, j) => s.photos[Math.round(j * (s.photos.length - 1) / Math.max(1, k - 1))]);
  });
  // sequence
  etat.seq = []; let t = 0;
  const all = overview();
  const push = (o) => { o.t0 = t; t += o.dur; etat.seq.push(o); };
  if (etat.stops.length) {
    push({kind: 'intro', dur: 2.6, from: all, to: etat.stops[0].view});
    etat.stops.forEach((s, i) => {
      push({kind: 'stay', dur: 0.6 + 1.6 * s.show.length, s});
      if (etat.legs[i]) { const L = etat.legs[i]; push({kind: 'leg', dur: Math.max(1.8, Math.min(5.2, 1.2 + 0.5 * Math.log(1 + L.km / 8))), L, i}); }
    });
    push({kind: 'outro', dur: 2.8, from: etat.stops[etat.stops.length - 1].view, to: all});
  }
  etat.T = Math.max(t, 0.01);
  etat.seq.forEach(o => { if (o.kind === 'intro' || o.kind === 'outro') o.z = d3.interpolateZoom(o.from, o.to); if (o.kind === 'leg') o.z = d3.interpolateZoom(o.L.a.view, o.L.b.view); });
  etat.hash = null;
}
export function overview() {
  if (!etat.stops.length) return [500, 420, 900];
  const xs = etat.stops.map(s => s.x), ys = etat.stops.map(s => s.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const asp = etat.W / Math.max(1, etat.H);
  const span = Math.max(x1 - x0, (y1 - y0) * Math.min(asp, 1.6), 2);
  return [(x0 + x1) / 2, (y0 + y1) / 2, Math.min(900, span * 1.45)];
}
const ease = d3.easeCubicInOut;
export function stateAt(t) {
  let o = etat.seq[0];
  for (const s of etat.seq) { if (t >= s.t0) o = s; else break; }
  if (!o) return null;
  const f = Math.max(0, Math.min(1, (t - o.t0) / o.dur)), e = ease(f);
  const st = {o, f, e};
  if (o.kind === 'intro') { st.view = o.z(e); st.done = 0; st.part = 0; st.cur = -1; }
  else if (o.kind === 'stay') { st.view = o.s.view; st.done = o.s.i; st.part = 0; st.cur = o.s.i; st.ph = Math.min(o.s.show.length - 1, Math.max(0, Math.floor((t - o.t0 - 0.3) / 1.6))); }
  else if (o.kind === 'leg') { st.view = o.z(e); st.done = o.i; st.cur = o.i; const A = o.L.a, B = o.L.b, dx = B.x - A.x, dy = B.y - A.y; st.part = Math.max(0.001, Math.min(1, ((st.view[0] - A.x) * dx + (st.view[1] - A.y) * dy) / ((dx * dx + dy * dy) || 1))); }
  else { st.view = o.z(e); st.done = etat.legs.length; st.part = 0; st.cur = etat.stops.length - 1; st.end = true; }
  return st;
}
export function legPoint(L, f) {
  const target = L.len * f;
  let j = 1;
  while (j < L.cum.length - 1 && L.cum[j] < target) j++;
  const a = L.pts[j - 1], b = L.pts[j], seg = (L.cum[j] - L.cum[j - 1]) || 1, g = Math.max(0, Math.min(1, (target - L.cum[j - 1]) / seg));
  return [a[0] + (b[0] - a[0]) * g, a[1] + (b[1] - a[1]) * g, j];
}
export function dayNo(tm) { return Math.floor((midnight(tm) - midnight(etat.stops[0].t0)) / DAY) + 1; }
export function midnight(tm) { const d = new Date(tm); d.setHours(0, 0, 0, 0); return d.getTime(); }
export function summary() {
  const kmT = etat.legs.reduce((a, L) => a + L.km, 0);
  const isos = [...new Set(etat.stops.map(s => s.iso).filter(Boolean))];
  const days = etat.stops.length ? Math.floor((midnight(etat.stops[etat.stops.length - 1].t1) - midnight(etat.stops[0].t0)) / DAY) + 1 : 0;
  return {km: nf.format(Math.round(kmT)), isos, days};
}
export function autoTitle() {
  const isos = [];
  for (const s of etat.stops) if (s.iso && !isos.includes(s.iso)) isos.push(s.iso);
  const main = isos.length > 1 && etat.stops[0].iso === isos[0] && etat.stops.filter(s => s.iso === isos[0]).length === 1 ? isos.slice(1) : isos;
  const m = etat.stops.length ? fmtMonth.format(etat.stops[0].t0) : '';
  return (main.slice(0, 3).map(etat.regionName).join(', ') || 'Mon voyage') + ', ' + m;
}
export function estimate() {
  etat.photos.sort((a, b) => a.t - b.t);
  const L = etat.photos.filter(p => !p.est);
  for (const p of etat.photos) {
    if (!p.est) continue;
    let a = null, b = null;
    for (const q of L) { if (q.t <= p.t) a = q; else { b = q; break; } }
    const q = a && b ? (p.t - a.t <= b.t - p.t ? a : b) : (a || b);
    if (!q) continue;
    p.lat = q.lat; p.lon = q.lon;
  }
}
