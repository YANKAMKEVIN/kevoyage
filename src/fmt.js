// @ts-check
/** Formats de dates et de nombres en français, noms de pays. */
import { etat } from './state.js';

export const DAY = 864e5;
export const fmtDay = new Intl.DateTimeFormat('fr-FR', {weekday: 'short', day: 'numeric', month: 'long'});
export const fmtHour = new Intl.DateTimeFormat('fr-FR', {hour: '2-digit', minute: '2-digit'});
export const fmtMonth = new Intl.DateTimeFormat('fr-FR', {month: 'long', year: 'numeric'});
export const fmtShort = new Intl.DateTimeFormat('fr-FR', {day: 'numeric', month: 'short'});
try { const dn = new Intl.DisplayNames(['fr'], {type: 'region'}); etat.regionName = iso => { try { return dn.of(iso) || iso; } catch (e) { return iso; } }; } catch (e) {}
export const nf = new Intl.NumberFormat('fr-FR');
