# Kevoyage

**Le carnet de voyage qui se raconte tout seul.**

Déposez les photos d'un voyage : Kevoyage lit la date et le lieu de chaque photo, puis dessine une carte animée du trajet. La caméra vole d'une étape à l'autre, une ligne rouge relie les villes, et vos photos apparaissent en polaroïd avec le lieu, le jour et l'heure.

## Ce que fait l'appli

- **Carte animée** : lecture, pause, vitesse ×1, ×2 ou ×4, et barre de défilement pour aller à n'importe quel moment du voyage.
- **Étapes automatiques** : les photos prises au même endroit sont regroupées, et chaque étape prend le nom de la ville la plus proche. Vous pouvez renommer les étapes et le voyage.
- **Résumé du voyage** : jours, kilomètres parcourus, étapes, photos et pays.
- **Photos sans lieu** : elles sont rattachées à l'étape la plus proche dans le temps. Si aucune photo n'a de lieu, l'appli explique pourquoi (WhatsApp, Messenger et les captures d'écran effacent la position).
- **Partage** : « Télécharger le carnet » crée un seul fichier HTML contenant la carte et les photos. Il s'ouvre dans n'importe quel navigateur, sans installation.
- **Démo incluse** : un voyage de 11 jours au Japon (Paris, Tokyo, Hakone, Kyoto, Nara, Osaka, Miyajima, Hiroshima) avec des photos illustrées.
- **Voyage gardé** : votre voyage (photos réduites, noms, titre) est retrouvé à la prochaine visite. Pour en commencer un autre : « Voir la démo » puis « Ajouter mes photos ».
- **Mode clair et sombre**, ordinateur et téléphone.

## Vie privée

Tout se passe dans le navigateur. Les photos ne sont jamais envoyées sur un serveur : la date et le lieu sont lus directement sur votre appareil, et le voyage est gardé dans le stockage du navigateur (IndexedDB), sur cet appareil seulement.

## Lancer l'appli en local

L'appli charge ses données (carte du monde, villes) depuis ses propres fichiers, il faut donc la servir avec un petit serveur web :

```bash
npm start            # ou : python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000.

## Contenu du dépôt

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css` | Page et styles |
| `src/trip.js` | Le voyage sans DOM : étapes, trajets, séquence animée, résumé, titre automatique |
| `src/geo.js` | Projection, distances, ville la plus proche |
| `src/store.js`, `src/keep.js` | Sauvegarde versionnée du voyage (IndexedDB), même format que les carnets |
| `src/map.js`, `src/hud.js`, `src/playback.js` | Carte sur canvas, polaroïds et panneau, lecture |
| `src/photos.js`, `src/demo.js` | Import des photos (EXIF), démo du Japon |
| `src/exporter.js`, `src/bundle.js` | Carnet téléchargé : un seul fichier HTML, modules rassemblés en un script |
| `world.json` | Contours des pays (Natural Earth 1:50m, via world-atlas) |
| `cities.json` | 7 342 villes avec noms en français (Natural Earth populated places) |
| `d3.min.js`, `topojson-client.min.js`, `exifr.min.js` | Bibliothèques : cartographie, contours, lecture des données EXIF |

## Technique

- Modules ES sans étape de construction ; typage `// @ts-check` et JSDoc vérifié par `npm run types` (TypeScript strict).
- Le carnet téléchargé embarque tous les modules dans un seul script, dans l'ordre où le navigateur les évalue : il s'ouvre hors ligne, sans serveur.

## Sauvegarde

Le voyage en cours est gardé dans IndexedDB (base `kevoyage`, clé `courant`), avec un numéro de version. Un voyage abîmé ou venant d'une version plus récente est mis de côté (`courant.abimee`) et l'appli repart de la démo. Les carnets téléchargés utilisent le même format ; ceux exportés avant la version 1.1.0 (sans numéro de version) s'ouvrent toujours.

## Tests

```bash
npm install
npx playwright install chromium
npm run types    # typage
npm run unit     # étapes, trajets, lecture, résumé, sauvegarde, carnet, photos EXIF de test
npm run smoke    # fumée sur ordinateur, iPhone SE et Pixel 7
npm run partie   # parcours complet : démo, import de vraies photos, rechargement, carnet hors ligne, iPhone SE
npm test         # tout
```

La CI GitHub (`.github/workflows/tests.yml`) lance tout sur chaque PR ; captures dans `test-results/`.
