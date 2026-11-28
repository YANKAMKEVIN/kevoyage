// @ts-check
/** Carte polaroïd, bandeau du trajet, panneau des étapes et résumé. */
import { $, VIEWER } from './dom.js';
import { fmtDay, fmtHour, fmtShort, nf } from './fmt.js';
import { etat } from './state.js';
import { draw } from './map.js';
import { keepSoon } from './keep.js';
import { dayNo, summary } from './trip.js';
import { wall, wallDay } from './temps.js';

/* ---------- overlay ---------- */
const card = $('card'), legEl = $('leg');
export function hud(st) {
  const key = st.o.kind + ':' + (st.o.s ? st.o.s.i + ':' + st.ph : st.o.i ?? '') + ':' + (st.o.s ? st.o.s.name : '');
  const sc = $('scrub');
  sc.value = Math.round(etat.t / etat.T * 1000); sc.style.setProperty('--p', (etat.t / etat.T * 100) + '%');
  if (key === etat.hash) return;
  etat.hash = key;
  const o = st.o;
  if (o.kind === 'stay') {
    const p = o.s.show[st.ph];
    $('cimg').src = p.src; $('cimg').alt = o.s.name;
    $('ccap').textContent = p.cap || o.s.name;
    $('cmeta').textContent = (p.cap ? o.s.name + ' · ' : '') + 'Jour ' + dayNo(p) + ' · ' + fmtDay.format(wall(p)) + ' · ' + fmtHour.format(wall(p)) + (p.est ? ' · lieu estimé' : '');
    card.classList.remove('hide', 'pop'); void card.offsetWidth; card.classList.add('pop');
    legEl.classList.add('hide');
    $('when').textContent = o.s.name + ' · jour ' + dayNo(p) + (o.s.photos.length > o.s.show.length ? ' · ' + o.s.photos.length + ' photos' : '');
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
      $('when').textContent = 'Départ · ' + fmtDay.format(etat.stops[0].w0);
    } else {
      legEl.textContent = ''; const em = document.createElement('em'); em.textContent = 'Fin du voyage';
      legEl.append(em, ' · ' + summary().km + ' km, ' + etat.stops.length + ' étapes'); legEl.classList.remove('hide');
      $('when').textContent = 'Retour · ' + fmtDay.format(etat.stops[etat.stops.length - 1].w1);
    }
  }
  document.querySelectorAll('.stop').forEach((li, i) => { li.classList.toggle('on', i === st.cur && o.kind === 'stay'); li.classList.toggle('later', i > st.cur || (o.kind === 'intro')); });
}
// le titre est un champ d'une ligne : on réduit la police plutôt que de couper « juin 2025 »
export function fitTitle() {
  const el = $('title'); el.style.fontSize = '';
  let fs = parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollWidth > el.clientWidth + 1 && fs > 22) { fs -= 2; el.style.fontSize = fs + 'px'; }
}
export function panel() {
  fitTitle();
  const sm = summary();
  const d0 = etat.stops[0], d1 = etat.stops[etat.stops.length - 1];
  $('dates').textContent = d0 ? 'Du ' + fmtDay.format(d0.w0) + ' au ' + fmtDay.format(d1.w1) + ' ' + new Date(d1.w1).getUTCFullYear() : '';
  const stats = [[sm.days, sm.days > 1 ? 'jours' : 'jour'], [sm.km, 'km parcourus'], [etat.stops.length, 'étapes'], [etat.photos.length, 'photos'], [sm.isos.length || 1, sm.isos.length > 1 ? 'pays' : 'pays']];
  $('stats').innerHTML = stats.map(s => '<div><b></b><span></span></div>').join('');
  [...$('stats').children].forEach((el, i) => { el.firstChild.textContent = stats[i][0]; el.lastChild.textContent = stats[i][1]; });
  const ol = $('stops'); ol.textContent = '';
  etat.stops.forEach((s, i) => {
    const li = document.createElement('li'); li.className = 'stop'; li.tabIndex = 0;
    const n = document.createElement('span'); n.className = 'n'; n.textContent = String(i + 1);
    const im = document.createElement('img'); im.src = s.show[0].src; im.alt = '';
    const box = document.createElement('div');
    const inp = document.createElement('input'); inp.value = s.name; inp.setAttribute('aria-label', 'Nom de l\'étape ' + (i + 1)); inp.readOnly = VIEWER; inp.id = 'stop-' + i;
    inp.addEventListener('input', () => { s.name = inp.value || s.auto; etat.names[s.key] = inp.value; etat.hash = null; draw(); keepSoon(); });
    inp.addEventListener('click', e => e.stopPropagation());
    const sm2 = document.createElement('small');
    const same = wallDay(s.w0) === wallDay(s.w1);
    sm2.textContent = (same ? fmtShort.format(s.w0) : fmtShort.format(s.w0) + ' – ' + fmtShort.format(s.w1)) + ' · ' + s.photos.length + ' photo' + (s.photos.length > 1 ? 's' : '');
    box.append(inp, sm2); li.append(n, im, box);
    const go = () => { const o = etat.seq.find(q => q.kind === 'stay' && q.s === s); if (!o) return; etat.t = o.t0 + 0.01; etat.hash = null; draw(); };
    li.addEventListener('click', go);
    li.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === li) go(); });
    ol.append(li);
  });
  $('sample').hidden = !etat.isDemo;
}
