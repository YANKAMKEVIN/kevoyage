// @ts-check
/** Carte sur canvas : fond du monde, trajets, étapes, photos rondes. */
import { $, KEV } from './dom.js';
import { proj } from './geo.js';
import { etat } from './state.js';
import { legPoint, overview, stateAt } from './trip.js';
import { hud } from './hud.js';

export async function loadGeo() {
  if (KEV) { etat.WORLD_TXT = KEV.world; etat.CITIES = KEV.cities; }
  else {
    const [w, c] = await Promise.all([fetch('world.json').then(r => r.text()), fetch('cities.json').then(r => r.json())]);
    etat.WORLD_TXT = w; etat.CITIES = c;
  }
  const world = JSON.parse(etat.WORLD_TXT);
  const path = d3.geoPath(proj);
  etat.landP = new Path2D(path(topojson.feature(world, world.objects.countries)));
  etat.bordP = new Path2D(path(topojson.mesh(world, world.objects.countries, (a, b) => a !== b)));
  etat.gratP = new Path2D(path(d3.geoGraticule().step([10, 10])()));
  etat.CXY = etat.CITIES.map(c => proj([c[2], c[1]]));
}
/* ---------- canvas ---------- */
export const cv = $('map'), ctx = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
export const probe = document.createElement('span');
probe.style.display = 'none';
export function readColors() {
  const get = v => { probe.style.color = 'var(' + v + ')'; return getComputedStyle(probe).color; };
  etat.C = {sea: get('--sea'), land: get('--land'), coast: get('--coast'), border: get('--border'), grat: get('--grat'), route: get('--route'), sun: get('--sun'), bg: get('--bg'), label: get('--label')};
}
export function resize() {
  const r = cv.getBoundingClientRect();
  etat.DPR = Math.min(2, window.devicePixelRatio || 1);
  etat.W = Math.max(1, r.width); etat.H = Math.max(1, r.height);
  cv.width = Math.round(etat.W * etat.DPR); cv.height = Math.round(etat.H * etat.DPR);
  etat.seq.forEach(o => { if (o.kind === 'outro') { o.to = overview(); o.z = d3.interpolateZoom(o.from, o.to); } if (o.kind === 'intro') { o.from = overview(); o.z = d3.interpolateZoom(o.from, o.to); } });
  draw();
}
function strokeLeg(L, f, k) {
  ctx.beginPath();
  ctx.moveTo(L.pts[0][0], L.pts[0][1]);
  if (f >= 1) { for (let j = 1; j < L.pts.length; j++) ctx.lineTo(L.pts[j][0], L.pts[j][1]); }
  else { const [x, y, j] = legPoint(L, f); for (let i = 1; i < j; i++) ctx.lineTo(L.pts[i][0], L.pts[i][1]); ctx.lineTo(x, y); }
  ctx.setLineDash(L.fly ? [7 / k, 6 / k] : []);
  ctx.stroke();
}
function roundThumb(p, x, y, r, ring) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y + 2, r + 3, 0, 7); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r + 3, 0, 7); ctx.fillStyle = ring; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.clip();
  if (p.thumb) ctx.drawImage(p.thumb, x - r, y - r, r * 2, r * 2); else { ctx.fillStyle = etat.C.coast; ctx.fill(); }
  ctx.restore();
}
export function draw() {
  if (!etat.landP || !etat.gratP || !etat.bordP) return;
  const landP = etat.landP, gratP = etat.gratP, bordP = etat.bordP;
  const st = etat.stops.length ? stateAt(etat.t) : null;
  const v = st ? st.view : [500, 420, 900];
  const k = Math.min(etat.W, etat.H) / v[2];
  const ox = etat.W / 2 - v[0] * k, oy = etat.H / 2 - v[1] * k;
  const S = (x, y) => [ox + x * k, oy + y * k];
  ctx.setTransform(etat.DPR, 0, 0, etat.DPR, 0, 0);
  ctx.fillStyle = etat.C.sea; ctx.fillRect(0, 0, etat.W, etat.H);
  const wx0 = -ox / k, wx1 = (etat.W - ox) / k;
  for (let off = Math.floor(wx0 / 1000) * 1000; off < wx1; off += 1000) {
    ctx.setTransform(etat.DPR * k, 0, 0, etat.DPR * k, etat.DPR * (ox + off * k), etat.DPR * oy);
    ctx.lineWidth = 1 / k; ctx.strokeStyle = etat.C.grat; ctx.globalAlpha = .55; ctx.stroke(gratP); ctx.globalAlpha = 1;
    ctx.fillStyle = etat.C.land; ctx.fill(landP);
    ctx.lineWidth = 1.2 / k; ctx.strokeStyle = etat.C.coast; ctx.stroke(landP);
    ctx.lineWidth = 1 / k; ctx.strokeStyle = etat.C.border; ctx.stroke(bordP);
  }
  // city labels
  ctx.setTransform(etat.DPR, 0, 0, etat.DPR, 0, 0);
  ctx.font = '500 13px Inter, system-ui, sans-serif'; ctx.textBaseline = 'middle';
  const placed = [];
  const busy = (r) => placed.some(q => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);
  for (const s of etat.stops) { const [x, y] = S(s.x, s.y); placed.push([x - 24, y - 24, x + 24, y + 24]); }
  let n = 0;
  const maxN = etat.W < 520 ? 7 : 14;
  for (let i = 0; i < etat.CITIES.length && n < maxN; i++) {
    const c = etat.CXY[i];
    for (let off = Math.floor(wx0 / 1000) * 1000; off < wx1 && n < maxN; off += 1000) {
      const x = ox + (c[0] + off) * k, y = oy + c[1] * k;
      if (x < 8 || x > etat.W - 8 || y < 8 || y > etat.H - 80) continue;
      const tw = ctx.measureText(etat.CITIES[i][0]).width;
      const r = [x - 4, y - 9, x + tw + 10, y + 9];
      if (r[2] > etat.W - 4 || busy(r)) continue;
      placed.push(r); n++;
      ctx.fillStyle = etat.C.label; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 7); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = etat.C.land; ctx.strokeText(etat.CITIES[i][0], x + 7, y);
      ctx.fillText(etat.CITIES[i][0], x + 7, y);
    }
  }
  if (!st) return;
  // route
  ctx.setTransform(etat.DPR * k, 0, 0, etat.DPR * k, etat.DPR * ox, etat.DPR * oy);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = .45; ctx.strokeStyle = etat.C.route; ctx.lineWidth = 1.5 / k;
  etat.legs.forEach((L, i) => { if (i > st.done || (i === st.done && st.part === 0)) strokeLeg(L, 1, k); });
  ctx.globalAlpha = 1;
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass ? etat.C.route : etat.C.land; ctx.lineWidth = (pass ? 3.2 : 7) / k;
    etat.legs.forEach((L, i) => { if (i < st.done) strokeLeg(L, 1, k); else if (i === st.done && st.part > 0) strokeLeg(L, st.part, k); });
  }
  ctx.setLineDash([]);
  ctx.setTransform(etat.DPR, 0, 0, etat.DPR, 0, 0);
  // stops
  const big = etat.W < 520 ? 17 : 22;
  etat.stops.forEach((s, i) => {
    const [x, y] = S(s.x, s.y);
    const reached = i < st.done || (i === st.done && st.o.kind !== 'intro') || st.end;
    if (!reached) { ctx.fillStyle = etat.C.land; ctx.strokeStyle = etat.C.route; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 7); ctx.fill(); ctx.stroke(); return; }
    if (i === st.cur && st.o.kind === 'stay') return;
    roundThumb(s.show[0], x, y, etat.W < 520 ? 10 : 13, '#fff');
  });
  if (st.o.kind === 'stay') {
    const s = st.o.s, [x, y] = S(s.x, s.y);
    const pulse = (performance.now() / 1400) % 1;
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) { ctx.beginPath(); ctx.arc(x, y, big + 6 + pulse * 22, 0, 7); ctx.strokeStyle = etat.C.sun; ctx.globalAlpha = 1 - pulse; ctx.lineWidth = 3; ctx.stroke(); ctx.globalAlpha = 1; }
    roundThumb(s.show[st.ph], x, y, big, etat.C.sun);
  }
  if (st.o.kind === 'leg') {
    const [wx, wy] = legPoint(st.o.L, st.part), [x, y] = S(wx, wy);
    ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fillStyle = etat.C.route; ctx.fill();
  }
  hud(st);
}
