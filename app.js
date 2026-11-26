{
const $ = id => document.getElementById(id);
const KEV = window.KEV || null;
const VIEWER = !!KEV;
const SHELL = $('app').outerHTML;
const CSS = document.querySelector('style').textContent;
if (VIEWER) document.body.classList.add('viewer');

const DAY = 864e5;
const fmtDay = new Intl.DateTimeFormat('fr-FR', {weekday: 'short', day: 'numeric', month: 'long'});
const fmtHour = new Intl.DateTimeFormat('fr-FR', {hour: '2-digit', minute: '2-digit'});
const fmtMonth = new Intl.DateTimeFormat('fr-FR', {month: 'long', year: 'numeric'});
const fmtShort = new Intl.DateTimeFormat('fr-FR', {day: 'numeric', month: 'short'});
let regionName = iso => iso;
try { const dn = new Intl.DisplayNames(['fr'], {type: 'region'}); regionName = iso => { try { return dn.of(iso) || iso; } catch (e) { return iso; } }; } catch (e) {}
const nf = new Intl.NumberFormat('fr-FR');

/* ---------- geography ---------- */
const proj = d3.geoMercator().scale(1000 / (2 * Math.PI)).translate([500, 500]);
let WORLD_TXT = '', CITIES = [], CXY = [];
let landP = null, bordP = null, gratP = null;
const R = 6371;
const rad = d => d * Math.PI / 180;
function km(a, b) {
  const dLa = rad(b.lat - a.lat), dLo = rad(b.lon - a.lon);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function nearest(lat, lon) {
  let best = null, bd = 1e9;
  const cl = Math.cos(rad(lat));
  for (const c of CITIES) {
    const dx = (c[2] - lon) * cl, dy = c[1] - lat;
    let d = dx * dx + dy * dy;
    if (c[4] < 50000) d *= 1.6;
    if (d < bd) { bd = d; best = c; }
  }
  if (!best) return {name: lat.toFixed(2) + '°, ' + lon.toFixed(2) + '°', iso: ''};
  const d = km({lat, lon}, {lat: best[1], lon: best[2]});
  if (d < 15) return {name: best[0], iso: best[3]};
  if (d < 80) return {name: 'Près de ' + best[0], iso: best[3]};
  if (d < 250 && best[3]) return {name: regionName(best[3]), iso: best[3]};
  return {name: Math.abs(lat).toFixed(1) + '°' + (lat >= 0 ? 'N' : 'S') + ' ' + Math.abs(lon).toFixed(1) + '°' + (lon >= 0 ? 'E' : 'O'), iso: ''};
}
async function loadGeo() {
  if (KEV) { WORLD_TXT = KEV.world; CITIES = KEV.cities; }
  else {
    const [w, c] = await Promise.all([fetch('world.json').then(r => r.text()), fetch('cities.json').then(r => r.json())]);
    WORLD_TXT = w; CITIES = c;
  }
  const world = JSON.parse(WORLD_TXT);
  const path = d3.geoPath(proj);
  landP = new Path2D(path(topojson.feature(world, world.objects.countries)));
  bordP = new Path2D(path(topojson.mesh(world, world.objects.countries, (a, b) => a !== b)));
  gratP = new Path2D(path(d3.geoGraticule().step([10, 10])()));
  CXY = CITIES.map(c => proj([c[2], c[1]]));
}

/* ---------- trip model ---------- */
let photos = [], stops = [], legs = [], seq = [], T = 1;
let names = {};
let isDemo = true;
let pid = 0;

function build() {
  photos.sort((a, b) => a.t - b.t);
  stops = [];
  for (const p of photos) {
    const s = stops[stops.length - 1];
    if (s && km(s, p) < 15) {
      s.photos.push(p); s.t1 = p.t;
      if (!p.est) { s.n++; s.lat += (p.lat - s.lat) / s.n; s.lon += (p.lon - s.lon) / s.n; }
    } else stops.push({lat: p.lat, lon: p.lon, n: p.est ? 0 : 1, t0: p.t, t1: p.t, photos: [p]});
  }
  let px = null;
  stops.forEach((s, i) => {
    s.i = i; s.key = s.photos[0].id;
    const nc = nearest(s.lat, s.lon);
    s.auto = nc.name; s.iso = nc.iso;
    s.name = names[s.key] || s.photos.find(p => p.place)?.place || nc.name;
    let [x, y] = proj([s.lon, s.lat]);
    if (px !== null) { while (x - px > 500) x -= 1000; while (px - x > 500) x += 1000; }
    s.x = x; s.y = y; px = x;
  });
  legs = [];
  for (let i = 0; i + 1 < stops.length; i++) {
    const a = stops[i], b = stops[i + 1], d = km(a, b), fly = d > 250;
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
    legs.push({a, b, km: d, fly, pts, cum, len: cum[cum.length - 1]});
  }
  stops.forEach((s, i) => {
    const ds = [];
    if (legs[i - 1]) ds.push(Math.hypot(s.x - stops[i - 1].x, s.y - stops[i - 1].y));
    if (legs[i]) ds.push(Math.hypot(s.x - stops[i + 1].x, s.y - stops[i + 1].y));
    const d = ds.length ? Math.min(...ds) : 3;
    s.view = [s.x, s.y, Math.max(2.4, Math.min(80, d * 2))];
    const k = Math.min(5, s.photos.length);
    s.show = Array.from({length: k}, (_, j) => s.photos[Math.round(j * (s.photos.length - 1) / Math.max(1, k - 1))]);
  });
  // sequence
  seq = []; let t = 0;
  const all = overview();
  const push = (o) => { o.t0 = t; t += o.dur; seq.push(o); };
  if (stops.length) {
    push({kind: 'intro', dur: 2.6, from: all, to: stops[0].view});
    stops.forEach((s, i) => {
      push({kind: 'stay', dur: 0.6 + 1.6 * s.show.length, s});
      if (legs[i]) { const L = legs[i]; push({kind: 'leg', dur: Math.max(1.8, Math.min(5.2, 1.2 + 0.5 * Math.log(1 + L.km / 8))), L, i}); }
    });
    push({kind: 'outro', dur: 2.8, from: stops[stops.length - 1].view, to: all});
  }
  T = Math.max(t, 0.01);
  seq.forEach(o => { if (o.kind === 'intro' || o.kind === 'outro') o.z = d3.interpolateZoom(o.from, o.to); if (o.kind === 'leg') o.z = d3.interpolateZoom(o.L.a.view, o.L.b.view); });
  hash = null;
}
function overview() {
  if (!stops.length) return [500, 420, 900];
  const xs = stops.map(s => s.x), ys = stops.map(s => s.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const asp = W / Math.max(1, H);
  const span = Math.max(x1 - x0, (y1 - y0) * Math.min(asp, 1.6), 2);
  return [(x0 + x1) / 2, (y0 + y1) / 2, Math.min(900, span * 1.45)];
}

/* ---------- canvas ---------- */
const cv = $('map'), ctx = cv.getContext('2d');
let W = 800, H = 600, DPR = 1;
const probe = document.createElement('span');
probe.style.display = 'none'; document.body.appendChild(probe);
let C = {};
function readColors() {
  const get = v => { probe.style.color = 'var(' + v + ')'; return getComputedStyle(probe).color; };
  C = {sea: get('--sea'), land: get('--land'), coast: get('--coast'), border: get('--border'), grat: get('--grat'), route: get('--route'), sun: get('--sun'), bg: get('--bg'), label: get('--label')};
}
function resize() {
  const r = cv.getBoundingClientRect();
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = Math.max(1, r.width); H = Math.max(1, r.height);
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  seq.forEach(o => { if (o.kind === 'outro') { o.to = overview(); o.z = d3.interpolateZoom(o.from, o.to); } if (o.kind === 'intro') { o.from = overview(); o.z = d3.interpolateZoom(o.from, o.to); } });
  draw();
}

let t = 0, playing = false, speed = 1, last = 0;
const ease = d3.easeCubicInOut;
function stateAt(t) {
  let o = seq[0];
  for (const s of seq) { if (t >= s.t0) o = s; else break; }
  if (!o) return null;
  const f = Math.max(0, Math.min(1, (t - o.t0) / o.dur)), e = ease(f);
  const st = {o, f, e};
  if (o.kind === 'intro') { st.view = o.z(e); st.done = 0; st.part = 0; st.cur = -1; }
  else if (o.kind === 'stay') { st.view = o.s.view; st.done = o.s.i; st.part = 0; st.cur = o.s.i; st.ph = Math.min(o.s.show.length - 1, Math.max(0, Math.floor((t - o.t0 - 0.3) / 1.6))); }
  else if (o.kind === 'leg') { st.view = o.z(e); st.done = o.i; st.cur = o.i; const A = o.L.a, B = o.L.b, dx = B.x - A.x, dy = B.y - A.y; st.part = Math.max(0.001, Math.min(1, ((st.view[0] - A.x) * dx + (st.view[1] - A.y) * dy) / ((dx * dx + dy * dy) || 1))); }
  else { st.view = o.z(e); st.done = legs.length; st.part = 0; st.cur = stops.length - 1; st.end = true; }
  return st;
}
function legPoint(L, f) {
  const target = L.len * f;
  let j = 1;
  while (j < L.cum.length - 1 && L.cum[j] < target) j++;
  const a = L.pts[j - 1], b = L.pts[j], seg = (L.cum[j] - L.cum[j - 1]) || 1, g = Math.max(0, Math.min(1, (target - L.cum[j - 1]) / seg));
  return [a[0] + (b[0] - a[0]) * g, a[1] + (b[1] - a[1]) * g, j];
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
  if (p.thumb) ctx.drawImage(p.thumb, x - r, y - r, r * 2, r * 2); else { ctx.fillStyle = C.coast; ctx.fill(); }
  ctx.restore();
}
let hash = null;
function draw() {
  if (!landP) return;
  const st = stops.length ? stateAt(t) : null;
  const v = st ? st.view : [500, 420, 900];
  const k = Math.min(W, H) / v[2];
  const ox = W / 2 - v[0] * k, oy = H / 2 - v[1] * k;
  const S = (x, y) => [ox + x * k, oy + y * k];
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = C.sea; ctx.fillRect(0, 0, W, H);
  const wx0 = -ox / k, wx1 = (W - ox) / k;
  for (let off = Math.floor(wx0 / 1000) * 1000; off < wx1; off += 1000) {
    ctx.setTransform(DPR * k, 0, 0, DPR * k, DPR * (ox + off * k), DPR * oy);
    ctx.lineWidth = 1 / k; ctx.strokeStyle = C.grat; ctx.globalAlpha = .55; ctx.stroke(gratP); ctx.globalAlpha = 1;
    ctx.fillStyle = C.land; ctx.fill(landP);
    ctx.lineWidth = 1.2 / k; ctx.strokeStyle = C.coast; ctx.stroke(landP);
    ctx.lineWidth = 1 / k; ctx.strokeStyle = C.border; ctx.stroke(bordP);
  }
  // city labels
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.font = '500 13px Inter, system-ui, sans-serif'; ctx.textBaseline = 'middle';
  const placed = [];
  const busy = (r) => placed.some(q => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);
  for (const s of stops) { const [x, y] = S(s.x, s.y); placed.push([x - 24, y - 24, x + 24, y + 24]); }
  let n = 0;
  const maxN = W < 520 ? 7 : 14;
  for (let i = 0; i < CITIES.length && n < maxN; i++) {
    const c = CXY[i];
    for (let off = Math.floor(wx0 / 1000) * 1000; off < wx1 && n < maxN; off += 1000) {
      const x = ox + (c[0] + off) * k, y = oy + c[1] * k;
      if (x < 8 || x > W - 8 || y < 8 || y > H - 80) continue;
      const tw = ctx.measureText(CITIES[i][0]).width;
      const r = [x - 4, y - 9, x + tw + 10, y + 9];
      if (r[2] > W - 4 || busy(r)) continue;
      placed.push(r); n++;
      ctx.fillStyle = C.label; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 7); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = C.land; ctx.strokeText(CITIES[i][0], x + 7, y);
      ctx.fillText(CITIES[i][0], x + 7, y);
    }
  }
  if (!st) return;
  // route
  ctx.setTransform(DPR * k, 0, 0, DPR * k, DPR * ox, DPR * oy);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = .45; ctx.strokeStyle = C.route; ctx.lineWidth = 1.5 / k;
  legs.forEach((L, i) => { if (i > st.done || (i === st.done && st.part === 0)) strokeLeg(L, 1, k); });
  ctx.globalAlpha = 1;
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass ? C.route : C.land; ctx.lineWidth = (pass ? 3.2 : 7) / k;
    legs.forEach((L, i) => { if (i < st.done) strokeLeg(L, 1, k); else if (i === st.done && st.part > 0) strokeLeg(L, st.part, k); });
  }
  ctx.setLineDash([]);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // stops
  const big = W < 520 ? 17 : 22;
  stops.forEach((s, i) => {
    const [x, y] = S(s.x, s.y);
    const reached = i < st.done || (i === st.done && st.o.kind !== 'intro') || st.end;
    if (!reached) { ctx.fillStyle = C.land; ctx.strokeStyle = C.route; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 7); ctx.fill(); ctx.stroke(); return; }
    if (i === st.cur && st.o.kind === 'stay') return;
    roundThumb(s.show[0], x, y, W < 520 ? 10 : 13, '#fff');
  });
  if (st.o.kind === 'stay') {
    const s = st.o.s, [x, y] = S(s.x, s.y);
    const pulse = (performance.now() / 1400) % 1;
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) { ctx.beginPath(); ctx.arc(x, y, big + 6 + pulse * 22, 0, 7); ctx.strokeStyle = C.sun; ctx.globalAlpha = 1 - pulse; ctx.lineWidth = 3; ctx.stroke(); ctx.globalAlpha = 1; }
    roundThumb(s.show[st.ph], x, y, big, C.sun);
  }
  if (st.o.kind === 'leg') {
    const [wx, wy] = legPoint(st.o.L, st.part), [x, y] = S(wx, wy);
    ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fillStyle = C.route; ctx.fill();
  }
  hud(st);
}

/* ---------- overlay ---------- */
const card = $('card'), legEl = $('leg');
function dayNo(tm) { return Math.floor((midnight(tm) - midnight(stops[0].t0)) / DAY) + 1; }
function midnight(tm) { const d = new Date(tm); d.setHours(0, 0, 0, 0); return d.getTime(); }
function hud(st) {
  const key = st.o.kind + ':' + (st.o.s ? st.o.s.i + ':' + st.ph : st.o.i ?? '') + ':' + (st.o.s ? st.o.s.name : '');
  const sc = $('scrub');
  sc.value = Math.round(t / T * 1000); sc.style.setProperty('--p', (t / T * 100) + '%');
  if (key === hash) return;
  hash = key;
  const o = st.o;
  if (o.kind === 'stay') {
    const p = o.s.show[st.ph];
    $('cimg').src = p.src; $('cimg').alt = o.s.name;
    $('ccap').textContent = p.cap || o.s.name;
    $('cmeta').textContent = (p.cap ? o.s.name + ' · ' : '') + 'Jour ' + dayNo(p.t) + ' · ' + fmtDay.format(p.t) + ' · ' + fmtHour.format(p.t) + (p.est ? ' · lieu estimé' : '');
    card.classList.remove('hide', 'pop'); void card.offsetWidth; card.classList.add('pop');
    legEl.classList.add('hide');
    $('when').textContent = o.s.name + ' · jour ' + dayNo(p.t) + (o.s.photos.length > o.s.show.length ? ' · ' + o.s.photos.length + ' photos' : '');
  } else {
    card.classList.add('hide');
    if (o.kind === 'leg') {
      legEl.textContent = '';
      const em = document.createElement('em'); em.textContent = o.L.b.name;
      legEl.append((o.L.fly ? 'En vol vers ' : 'En route vers '), em, ' · ' + nf.format(Math.round(o.L.km)) + ' km');
      legEl.classList.remove('hide');
      $('when').textContent = o.L.a.name + ' → ' + o.L.b.name;
    } else if (o.kind === 'intro') {
      legEl.textContent = ''; const em = document.createElement('em'); em.textContent = $('title').value;
      legEl.append(em); legEl.classList.remove('hide');
      $('when').textContent = 'Départ · ' + fmtDay.format(stops[0].t0);
    } else {
      legEl.textContent = ''; const em = document.createElement('em'); em.textContent = 'Fin du voyage';
      legEl.append(em, ' · ' + summary().km + ' km, ' + stops.length + ' étapes'); legEl.classList.remove('hide');
      $('when').textContent = 'Retour · ' + fmtDay.format(stops[stops.length - 1].t1);
    }
  }
  document.querySelectorAll('.stop').forEach((li, i) => { li.classList.toggle('on', i === st.cur && o.kind === 'stay'); li.classList.toggle('later', i > st.cur || (o.kind === 'intro')); });
}
function summary() {
  const kmT = legs.reduce((a, L) => a + L.km, 0);
  const isos = [...new Set(stops.map(s => s.iso).filter(Boolean))];
  const days = stops.length ? Math.floor((midnight(stops[stops.length - 1].t1) - midnight(stops[0].t0)) / DAY) + 1 : 0;
  return {km: nf.format(Math.round(kmT)), isos, days};
}
function panel() {
  const sm = summary();
  const d0 = stops[0], d1 = stops[stops.length - 1];
  $('dates').textContent = d0 ? 'Du ' + fmtDay.format(d0.t0) + ' au ' + fmtDay.format(d1.t1) + ' ' + new Date(d1.t1).getFullYear() : '';
  const stats = [[sm.days, sm.days > 1 ? 'jours' : 'jour'], [sm.km, 'km parcourus'], [stops.length, 'étapes'], [photos.length, 'photos'], [sm.isos.length || 1, sm.isos.length > 1 ? 'pays' : 'pays']];
  $('stats').innerHTML = stats.map(s => '<div><b></b><span></span></div>').join('');
  [...$('stats').children].forEach((el, i) => { el.firstChild.textContent = stats[i][0]; el.lastChild.textContent = stats[i][1]; });
  const ol = $('stops'); ol.textContent = '';
  stops.forEach((s, i) => {
    const li = document.createElement('li'); li.className = 'stop'; li.tabIndex = 0;
    const n = document.createElement('span'); n.className = 'n'; n.textContent = i + 1;
    const im = document.createElement('img'); im.src = s.show[0].src; im.alt = '';
    const box = document.createElement('div');
    const inp = document.createElement('input'); inp.value = s.name; inp.setAttribute('aria-label', 'Nom de l\'étape ' + (i + 1)); inp.readOnly = VIEWER; inp.id = 'stop-' + i;
    inp.addEventListener('input', () => { s.name = inp.value || s.auto; names[s.key] = inp.value; hash = null; draw(); });
    inp.addEventListener('click', e => e.stopPropagation());
    const sm2 = document.createElement('small');
    const same = midnight(s.t0) === midnight(s.t1);
    sm2.textContent = (same ? fmtShort.format(s.t0) : fmtShort.format(s.t0) + ' – ' + fmtShort.format(s.t1)) + ' · ' + s.photos.length + ' photo' + (s.photos.length > 1 ? 's' : '');
    box.append(inp, sm2); li.append(n, im, box);
    const go = () => { const o = seq.find(q => q.kind === 'stay' && q.s === s); t = o.t0 + 0.01; hash = null; draw(); };
    li.addEventListener('click', go);
    li.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === li) go(); });
    ol.append(li);
  });
  $('sample').hidden = !isDemo;
}
function autoTitle() {
  const isos = [];
  for (const s of stops) if (s.iso && !isos.includes(s.iso)) isos.push(s.iso);
  const main = isos.length > 1 && stops[0].iso === isos[0] && stops.filter(s => s.iso === isos[0]).length === 1 ? isos.slice(1) : isos;
  const m = stops.length ? fmtMonth.format(stops[0].t0) : '';
  return (main.slice(0, 3).map(regionName).join(', ') || 'Mon voyage') + ', ' + m;
}

/* ---------- playback ---------- */
const pico = $('pico');
function setPlay(on) {
  playing = on && stops.length > 0;
  if (playing && t >= T - 0.01) t = 0;
  pico.setAttribute('d', playing ? 'M4 3h4v14H4zM12 3h4v14h-4z' : 'M5 3l12 7-12 7z');
  $('play').setAttribute('aria-label', playing ? 'Pause' : 'Lecture');
  last = performance.now();
}
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (playing) { t += dt * speed; if (t >= T) { t = T; setPlay(false); } }
  draw();
  requestAnimationFrame(loop);
}
$('play').addEventListener('click', () => setPlay(!playing));
$('speed').addEventListener('click', () => { speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; $('speed').textContent = '×' + speed; });
$('scrub').addEventListener('input', e => { t = e.target.value / 1000 * T; hash = null; draw(); });
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
  if (e.code === 'Space' && e.target.tagName !== 'BUTTON') { e.preventDefault(); setPlay(!playing); }
});
$('title').addEventListener('input', () => { hash = null; });
if (VIEWER) $('title').readOnly = true;

/* ---------- import ---------- */
function thumbOf(img, w, h) {
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const s = Math.min(w, h), g = c.getContext('2d');
  g.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, 96, 96);
  return c;
}
function finishPhoto(p) {
  return new Promise(res => {
    const im = new Image();
    im.onload = () => { p.thumb = thumbOf(im, im.naturalWidth, im.naturalHeight); res(p); };
    im.onerror = () => res(p);
    im.src = p.src;
  });
}
function scaleToJpeg(bmp, w, h) {
  const m = 1000 / Math.max(w, h), s = Math.min(1, m);
  const c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}
function placeholder(name) {
  const c = document.createElement('canvas'); c.width = 400; c.height = 300;
  const g = c.getContext('2d'); g.fillStyle = '#dfe6f3'; g.fillRect(0, 0, 400, 300);
  g.fillStyle = '#5b6170'; g.font = '500 20px Inter, sans-serif'; g.textAlign = 'center'; g.fillText('Aperçu indisponible', 200, 145); g.font = '15px Inter, sans-serif'; g.fillText(name.slice(0, 40), 200, 175);
  return c.toDataURL('image/jpeg', 0.8);
}
async function readFile(f) {
  let meta = null;
  try { meta = await exifr.parse(f, {tiff: true, exif: true, gps: true, xmp: false, icc: false, iptc: false}); } catch (e) {}
  let src = null;
  try { const b = await createImageBitmap(f); src = scaleToJpeg(b, b.width, b.height); b.close && b.close(); } catch (e) {
    try { const th = await exifr.thumbnail(f); if (th) { const b = await createImageBitmap(new Blob([th], {type: 'image/jpeg'})); src = scaleToJpeg(b, b.width, b.height); } } catch (e2) {}
  }
  if (!src) src = placeholder(f.name);
  const date = meta && (meta.DateTimeOriginal || meta.CreateDate || meta.ModifyDate);
  const lat = meta && typeof meta.latitude === 'number' && isFinite(meta.latitude) ? meta.latitude : null;
  const lon = meta && typeof meta.longitude === 'number' && isFinite(meta.longitude) ? meta.longitude : null;
  return {id: ++pid, t: date instanceof Date && !isNaN(date) ? date.getTime() : f.lastModified, noDate: !(date instanceof Date), lat, lon, est: lat === null || (lat === 0 && lon === 0), src};
}
async function ingest(list) {
  const files = [...list].filter(f => /^image\//.test(f.type) || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
  if (!files.length) return;
  const busy = $('busy'); busy.classList.add('on'); setPlay(false);
  const got = [];
  for (let i = 0; i < files.length; i++) {
    $('busyn').textContent = (i + 1) + ' sur ' + files.length;
    $('busyb').style.width = ((i + 1) / files.length * 100) + '%';
    try { got.push(await finishPhoto(await readFile(files[i]))); } catch (e) {}
  }
  busy.classList.remove('on');
  const located = got.filter(p => !p.est);
  const warn = $('warn');
  if (!located.length) {
    warn.hidden = false;
    warn.textContent = 'Aucune de ces ' + got.length + ' photos ne contient de lieu. Les photos envoyées par WhatsApp, Messenger ou captures d\'écran perdent leur position : prenez les originaux depuis votre téléphone ou votre ordinateur (sur iPhone, AirDrop ou « Options › Toutes les données de la photo »).';
    return;
  }
  if (isDemo) { photos = []; names = {}; isDemo = false; $('title').value = ''; }
  photos.push(...got);
  estimate();
  build();
  if (!$('title').value || $('title').dataset.auto === '1') { $('title').value = autoTitle(); $('title').dataset.auto = '1'; }
  const nE = photos.filter(p => p.est).length, nD = photos.filter(p => p.noDate).length;
  const msgs = [];
  if (nE) msgs.push(nE + ' photo' + (nE > 1 ? 's' : '') + ' sans lieu, placée' + (nE > 1 ? 's' : '') + ' d\'après l\'heure de prise de vue.');
  if (nD) msgs.push(nD + ' photo' + (nD > 1 ? 's' : '') + ' sans date, classée' + (nD > 1 ? 's' : '') + ' d\'après la date du fichier.');
  warn.hidden = !msgs.length; warn.textContent = msgs.join(' ');
  panel(); t = 0; setPlay(true);
}
function estimate() {
  photos.sort((a, b) => a.t - b.t);
  const L = photos.filter(p => !p.est);
  for (const p of photos) {
    if (!p.est) continue;
    let a = null, b = null;
    for (const q of L) { if (q.t <= p.t) a = q; else { b = q; break; } }
    const q = a && b ? (p.t - a.t <= b.t - p.t ? a : b) : (a || b);
    p.lat = q.lat; p.lon = q.lon;
  }
}
$('files').addEventListener('change', e => { ingest(e.target.files); e.target.value = ''; });
let dragN = 0;
const stage = $('stage');
if (!VIEWER) {
  window.addEventListener('dragenter', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { dragN++; $('drop').classList.add('on'); } });
  window.addEventListener('dragleave', () => { dragN = Math.max(0, dragN - 1); if (!dragN) $('drop').classList.remove('on'); });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => { e.preventDefault(); dragN = 0; $('drop').classList.remove('on'); if (e.dataTransfer?.files?.length) ingest(e.dataTransfer.files); });
}

/* ---------- demo ---------- */
function rnd(seed) { let s = seed % 2147483647 || 7; return () => (s = s * 16807 % 2147483647) / 2147483647; }
function sky(g, w, h, hour) {
  const gr = g.createLinearGradient(0, 0, 0, h);
  const night = hour >= 20 || hour < 6, gold = hour >= 17 || hour < 8;
  gr.addColorStop(0, night ? '#0b1640' : gold ? '#ff8a5c' : '#5aa7f2');
  gr.addColorStop(1, night ? '#3d2c6e' : gold ? '#ffd79a' : '#d8eeff');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  return {night, gold};
}
function paint(kind, hour, seed) {
  const w = 720, h = 540, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), r = rnd(seed * 7919 + 13), m = sky(g, w, h, hour);
  const sunY = m.gold ? 330 : 120;
  if (!m.night) { g.fillStyle = m.gold ? '#fff1c9' : '#fffbe6'; g.beginPath(); g.arc(520 + r() * 100, sunY, 46, 0, 7); g.fill(); }
  else { g.fillStyle = '#fff'; for (let i = 0; i < 60; i++) { g.globalAlpha = r(); g.fillRect(r() * w, r() * h * .6, 2, 2); } g.globalAlpha = 1; }
  const hills = (y, col, amp) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 40) g.lineTo(x, y + Math.sin(x / 90 + r() * .4) * amp); g.lineTo(w, h); g.fill(); };
  const torii = (x, y, s, col) => { g.fillStyle = col; g.fillRect(x - 70 * s, y - 150 * s, 14 * s, 150 * s); g.fillRect(x + 56 * s, y - 150 * s, 14 * s, 150 * s); g.fillRect(x - 95 * s, y - 165 * s, 190 * s, 16 * s); g.fillRect(x - 80 * s, y - 128 * s, 160 * s, 10 * s); g.fillStyle = '#222'; g.fillRect(x - 100 * s, y - 175 * s, 200 * s, 10 * s); };
  if (kind === 'plane') {
    g.fillStyle = '#e9eef6'; g.fillRect(0, 0, w, h);
    g.save(); g.beginPath(); g.ellipse(w / 2, h / 2, 190, 230, 0, 0, 7); g.clip(); sky(g, w, h, hour);
    g.fillStyle = '#fff'; for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(r() * w, 330 + r() * 160, 90 + r() * 80, 26 + r() * 18, 0, 0, 7); g.fill(); }
    g.fillStyle = '#cfd6e2'; g.beginPath(); g.moveTo(200, 300); g.lineTo(560, 250); g.lineTo(560, 270); g.lineTo(230, 330); g.fill(); g.restore();
    g.strokeStyle = '#c3cad6'; g.lineWidth = 22; g.beginPath(); g.ellipse(w / 2, h / 2, 200, 240, 0, 0, 7); g.stroke();
  } else if (kind === 'fuji') {
    hills(330, '#8fa9d6', 6);
    g.fillStyle = '#5d79b3'; g.beginPath(); g.moveTo(120, 380); g.lineTo(330, 150); g.lineTo(390, 150); g.lineTo(620, 380); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(275, 210); g.lineTo(330, 150); g.lineTo(390, 150); g.lineTo(445, 210); for (let x = 445; x > 275; x -= 28) g.lineTo(x - 14, 196 + r() * 22); g.fill();
    hills(400, '#2f6b55', 14); g.fillStyle = m.gold ? '#f0a77b' : '#6fa3e0'; g.fillRect(0, 440, w, 100);
    g.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 14; i++) g.fillRect(r() * w, 450 + r() * 80, 40 + r() * 60, 3);
  } else if (kind === 'lake') {
    hills(300, '#7c9a6e', 18); hills(360, '#3f6b4c', 12); torii(470, 470, .8, '#e0412b');
    g.fillStyle = m.gold ? '#e79e7a' : '#4f8fd6'; g.fillRect(0, 470, w, 70);
  } else if (kind === 'sea') {
    g.fillStyle = m.gold ? '#f29a72' : '#3d7fd1'; g.fillRect(0, 330, w, 210);
    g.fillStyle = 'rgba(255,255,255,.3)'; for (let i = 0; i < 22; i++) g.fillRect(r() * w, 340 + r() * 190, 30 + r() * 70, 3);
    torii(360, 420, 1.25, '#e33b22'); g.fillStyle = 'rgba(160,30,20,.35)'; g.fillRect(270, 425, 18, 90); g.fillRect(432, 425, 18, 90);
    hills(310, '#3c5f4a', 26); g.fillStyle = m.gold ? '#f29a72' : '#3d7fd1'; g.fillRect(0, 330, w, 10);
  } else if (kind === 'temple') {
    hills(380, '#4d7a52', 16);
    const x = 360; g.fillStyle = '#8b2e24';
    for (let i = 0; i < 5; i++) { const y = 400 - i * 52, s = 1 - i * .14; g.fillStyle = '#3a2a2a'; g.beginPath(); g.moveTo(x - 120 * s, y - 20); g.quadraticCurveTo(x, y - 46, x + 120 * s, y - 20); g.lineTo(x + 90 * s, y - 34); g.lineTo(x - 90 * s, y - 34); g.fill(); g.fillStyle = '#c2412f'; g.fillRect(x - 60 * s, y - 20, 120 * s, 32); }
    g.fillStyle = '#3a2a2a'; g.fillRect(x - 3, 110, 6, 60);
    for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#f4a9c0' : '#2f5d3f'; g.beginPath(); g.arc(r() * 160 + (i % 2 ? 520 : 40), 430 + r() * 40, 60 + r() * 30, 0, 7); g.fill(); }
    g.fillStyle = '#b8a98f'; g.fillRect(0, 500, w, 40);
  } else if (kind === 'bamboo') {
    g.fillStyle = '#cfe8b8'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) { const x = r() * w, s = 8 + r() * 22; g.fillStyle = `hsl(${95 + r() * 30},${40 + r() * 20}%,${22 + r() * 30}%)`; g.fillRect(x, 0, s, h); g.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 40 + r() * 60; y < h; y += 90 + r() * 30) g.fillRect(x, y, s, 4); }
    g.fillStyle = '#8f7b5d'; g.beginPath(); g.moveTo(260, h); g.lineTo(340, 330); g.lineTo(380, 330); g.lineTo(470, h); g.fill();
  } else if (kind === 'gates') {
    g.fillStyle = '#2b1a14'; g.fillRect(0, 0, w, h);
    for (let i = 9; i >= 0; i--) { const s = 1 - i * .085, cx = 360 + i * 6; g.fillStyle = i % 2 ? '#e5482c' : '#f0582f'; g.fillRect(cx - 230 * s, 270 - 230 * s, 40 * s, 520 * s); g.fillRect(cx + 190 * s, 270 - 230 * s, 40 * s, 520 * s); g.fillStyle = '#1b1210'; g.fillRect(cx - 260 * s, 270 - 250 * s, 520 * s, 30 * s); }
    g.fillStyle = '#d8c7a5'; g.beginPath(); g.moveTo(180, h); g.lineTo(330, 300); g.lineTo(410, 300); g.lineTo(560, h); g.fill();
  } else if (kind === 'deer') {
    hills(360, '#6f9a58', 10); g.fillStyle = '#8fbf6a'; g.fillRect(0, 430, w, 110);
    for (let i = 0; i < 4; i++) { g.fillStyle = '#2f5d3f'; g.beginPath(); g.arc(60 + i * 200 + r() * 60, 300, 70 + r() * 30, 0, 7); g.fill(); }
    const dx = 330, dy = 400; g.fillStyle = '#a8703f';
    g.beginPath(); g.ellipse(dx, dy, 90, 42, 0, 0, 7); g.fill();
    g.fillRect(dx - 70, dy + 20, 12, 80); g.fillRect(dx - 40, dy + 20, 12, 84); g.fillRect(dx + 40, dy + 20, 12, 84); g.fillRect(dx + 66, dy + 20, 12, 80);
    g.beginPath(); g.moveTo(dx + 60, dy - 20); g.lineTo(dx + 110, dy - 110); g.lineTo(dx + 140, dy - 100); g.lineTo(dx + 95, dy - 10); g.fill();
    g.beginPath(); g.ellipse(dx + 140, dy - 112, 34, 20, -.3, 0, 7); g.fill();
    g.fillStyle = '#f4e6d0'; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(dx - 60 + r() * 110, dy - 20 + r() * 30, 5, 0, 7); g.fill(); }
    g.fillStyle = '#1d1d1d'; g.beginPath(); g.arc(dx + 150, dy - 116, 4, 0, 7); g.fill();
  } else if (kind === 'street') {
    g.fillStyle = m.night ? '#1a1430' : '#5b4a6e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) { g.fillStyle = `hsl(${r() * 360},70%,${m.night ? 55 : 65}%)`; g.fillRect(r() * w, 40 + r() * 200, 30 + r() * 50, 90 + r() * 120); }
    g.fillStyle = '#2a2235'; g.fillRect(0, 0, 110, h); g.fillRect(w - 110, 0, 110, h);
    for (let i = 0; i < 7; i++) { const y = 120 + i * 50, s = 1 - i * .1; for (const x of [140 + i * 22, w - 140 - i * 22]) { g.fillStyle = 'rgba(255,90,60,.35)'; g.beginPath(); g.arc(x, y, 40 * s, 0, 7); g.fill(); g.fillStyle = i % 2 ? '#ff5a36' : '#fff0d8'; g.beginPath(); g.ellipse(x, y, 20 * s, 28 * s, 0, 0, 7); g.fill(); } }
    g.fillStyle = '#3b3346'; g.beginPath(); g.moveTo(120, h); g.lineTo(330, 300); g.lineTo(390, 300); g.lineTo(600, h); g.fill();
  } else {
    hills(440, m.night ? '#1b1d3a' : '#7a8fb5', 4);
    for (let i = 0; i < 22; i++) {
      const bw = 30 + r() * 50, bh = 80 + r() * 300, x = i * 34 - 20 + r() * 10;
      g.fillStyle = m.night ? `hsl(240,25%,${12 + r() * 10}%)` : `hsl(215,${15 + r() * 15}%,${45 + r() * 25}%)`;
      g.fillRect(x, h - 60 - bh, bw, bh);
      g.fillStyle = m.night ? '#ffd97a' : 'rgba(255,255,255,.45)';
      for (let yy = h - 50 - bh; yy < h - 70; yy += 14) for (let xx = x + 5; xx < x + bw - 6; xx += 10) if (r() < (m.night ? .45 : .3)) g.fillRect(xx, yy, 5, 7);
    }
    if (m.night) { for (let i = 0; i < 5; i++) { g.fillStyle = ['#ff4f8b', '#4fd2ff', '#ffe14f', '#7dff8a', '#ff7a3c'][i]; g.fillRect(40 + i * 140, 300 + r() * 60, 70, 18); } }
    g.fillStyle = m.night ? '#14152b' : '#55607a'; g.fillRect(0, h - 60, w, 60);
  }
  return c.toDataURL('image/jpeg', 0.84);
}
const DEMO = [
  // day, time, lat, lon, kind, caption, place
  [0, '09:40', 49.009, 2.548, 'plane', 'Décollage de Roissy', 'Paris'],
  [1, '18:30', 35.659, 139.700, 'city', 'Shibuya au crépuscule', 'Tokyo'],
  [2, '08:10', 35.715, 139.797, 'temple', 'Sensō-ji avant la foule', 'Tokyo'],
  [2, '13:00', 35.671, 139.765, 'street', 'Ruelles de Yūrakuchō', 'Tokyo'],
  [2, '21:15', 35.694, 139.703, 'city', 'Shinjuku, néons', 'Tokyo'],
  [3, '10:20', 35.676, 139.699, 'bamboo', 'Forêt du Meiji-jingū', 'Tokyo'],
  [4, '09:50', 35.204, 139.025, 'fuji', 'Le Fuji depuis le lac Ashi', 'Hakone'],
  [4, '16:40', 35.205, 139.026, 'lake', 'Torii flottant de Hakone', 'Hakone'],
  [5, '17:20', 34.995, 135.785, 'temple', 'Kiyomizu-dera', 'Kyoto'],
  [6, '07:30', 35.017, 135.672, 'bamboo', 'Arashiyama à l\'aube', 'Kyoto'],
  [6, '11:00', 34.967, 135.773, 'gates', 'Mille torii à Fushimi Inari', 'Kyoto'],
  [6, '20:30', 35.004, 135.775, 'street', 'Lanternes de Gion', 'Kyoto'],
  [7, '10:00', 34.685, 135.843, 'deer', 'Les daims de Nara', 'Nara'],
  [7, '13:30', 34.689, 135.840, 'temple', 'Tōdai-ji', 'Nara'],
  [7, '20:45', 34.669, 135.501, 'street', 'Dōtonbori', 'Osaka'],
  [8, '11:00', 34.687, 135.526, 'city', 'Vue sur Osaka', 'Osaka'],
  [9, '12:30', 34.296, 132.320, 'sea', 'Itsukushima, marée haute', 'Miyajima'],
  [9, '18:10', 34.297, 132.319, 'sea', 'Le grand torii au couchant', 'Miyajima'],
  [10, '09:00', 34.395, 132.453, 'city', 'Hiroshima, dernier matin', 'Hiroshima']
];
async function loadDemo() {
  const base = new Date(2026, 4, 2).getTime();
  photos = await Promise.all(DEMO.map((d, i) => {
    const [hh, mm] = d[1].split(':').map(Number);
    const tm = base + d[0] * DAY + (hh * 60 + mm) * 6e4;
    return finishPhoto({id: ++pid, t: tm, lat: d[2], lon: d[3], est: false, cap: d[5], place: d[6], src: paint(d[4], hh, i + 3)});
  }));
  names = {}; isDemo = true; $('title').value = 'Japon, mai 2026'; $('title').dataset.auto = ''; $('warn').hidden = true;
  build(); panel(); t = 0;
}
$('demo').addEventListener('click', async () => { await loadDemo(); setPlay(true); });

/* ---------- export ---------- */
let downloads = null;
if (!VIEWER && window.claude && window.claude.use) window.claude.use('downloads').then(d => { downloads = d; if (d) $('exp').hidden = false; }).catch(() => {});
$('exp').addEventListener('click', async () => {
  const b = $('exp'), label = b.textContent;
  b.textContent = 'Préparation…'; b.disabled = true;
  try {
    const [appJs, d3s, topo] = await Promise.all(['app.js', 'd3.min.js', 'topojson-client.min.js'].map(f => fetch(f).then(r => r.text())));
    const safe = s => s.replace(/<\/script/gi, '<\\/script');
    const data = {world: WORLD_TXT, cities: CITIES, trip: {title: $('title').value, names, photos: photos.map(p => ({id: p.id, t: p.t, lat: p.lat, lon: p.lon, est: p.est, cap: p.cap || '', place: p.place || '', src: p.src}))}};
    const esc = s => s.replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
    const html = '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc($('title').value || 'Kevoyage') + '</title>' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Instrument+Serif&family=Inter:wght@400;500;600&display=swap"><style>' + CSS + '</style></head><body>' + SHELL +
      '<script>' + safe(d3s) + '</script><script>' + safe(topo) + '</script><script>window.KEV=' + JSON.stringify(data).replace(/</g, '\\u003c') + '</script><script>' + safe(appJs) + '</script></body></html>';
    const fn = ($('title').value || 'carnet').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'carnet';
    await downloads.save({filename: 'kevoyage-' + fn + '.html', data: new Blob([html], {type: 'text/html'})});
    b.textContent = 'Carnet téléchargé';
  } catch (e) {
    b.textContent = e && e.code === 'declined' ? label : 'Téléchargement impossible ici';
  }
  b.disabled = false;
  setTimeout(() => { b.textContent = label; }, 3000);
});

/* ---------- boot ---------- */
readColors();
new MutationObserver(() => { readColors(); draw(); }).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme', 'class']});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); draw(); });
const ro = new ResizeObserver(() => resize());
ro.observe(cv);
(async () => {
  await loadGeo();
  if (KEV) {
    names = KEV.trip.names || {}; isDemo = false;
    photos = await Promise.all(KEV.trip.photos.map(p => { pid = Math.max(pid, p.id); return finishPhoto(Object.assign({}, p)); }));
    $('title').value = KEV.trip.title; build(); panel();
  } else await loadDemo();
  resize();
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setPlay(true);
  else { const o = seq.find(q => q.kind === 'stay' && q.s.i === Math.min(2, stops.length - 1)); if (o) t = o.t0 + 0.1; }
  requestAnimationFrame(t0 => { last = t0; loop(t0); });
})();
}
