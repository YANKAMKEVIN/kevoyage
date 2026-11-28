// @ts-check
/** Formats de dates et de nombres en français, noms de pays. */
import { etat } from './state.js';

// Les dates s'affichent depuis l'heure murale (heure vécue sur place, écrite en UTC, voir temps.js) : fuseau UTC ici.
const UTC = 'UTC';
export const fmtDay = new Intl.DateTimeFormat('fr-FR', {weekday: 'short', day: 'numeric', month: 'long', timeZone: UTC});
export const fmtHour = new Intl.DateTimeFormat('fr-FR', {hour: '2-digit', minute: '2-digit', timeZone: UTC});
export const fmtMonth = new Intl.DateTimeFormat('fr-FR', {month: 'long', year: 'numeric', timeZone: UTC});
export const fmtShort = new Intl.DateTimeFormat('fr-FR', {day: 'numeric', month: 'short', timeZone: UTC});
try { const dn = new Intl.DisplayNames(['fr'], {type: 'region'}); etat.regionName = iso => { try { return dn.of(iso) || iso; } catch (e) { return iso; } }; } catch (e) {}
export const nf = new Intl.NumberFormat('fr-FR');
