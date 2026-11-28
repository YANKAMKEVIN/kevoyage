# Kevoyage

**Le carnet de voyage qui se raconte tout seul.**

Déposez les photos d'un voyage : Kevoyage lit la date et le lieu de chaque photo, puis dessine une carte animée du trajet. La caméra vole d'une étape à l'autre, une ligne rouge relie les villes, et vos photos apparaissent en polaroïd avec le lieu, le jour et l'heure.

## Ce que fait l'appli

- **Carte animée** : lecture, pause, vitesse ×1, ×2 ou ×4, et barre de défilement pour aller à n'importe quel moment du voyage.
- **Étapes automatiques** : les photos prises au même endroit sont regroupées, et chaque étape prend le nom de la ville la plus proche. Vous pouvez renommer les étapes et le voyage.
- **Résumé du voyage** : jours, kilomètres parcourus, étapes, photos et pays.
- **Fuseaux horaires** : l'heure et le jour affichés sont ceux vécus sur place. Quand le téléphone note le fuseau de la prise de vue (iPhone, Android récents), le voyage est remis dans l'ordre réel, même après un vol qui traverse plusieurs fuseaux ou la ligne de changement de date ; une photo sans fuseau prend celui d'une photo voisine prise au même endroit.
- **Photos sans lieu** : elles sont rattachées à l'étape la plus proche dans le temps. Si aucune photo n'a de lieu, l'appli explique pourquoi (WhatsApp, Messenger et les captures d'écran effacent la position).
- **Partage** : « Télécharger le carnet » crée un seul fichier HTML contenant la carte et les photos. Il s'ouvre dans n'importe quel navigateur, sans installation.
- **Démo incluse** : un voyage de 11 jours au Japon (Paris, Tokyo, Hakone, Kyoto, Nara, Osaka, Miyajima, Hiroshima) avec 19 photos peintes avec Codex (dossier `art/`, prompts dans `tools/art/prompts.json`). Si elles manquent, des photos dessinées prennent le relais.
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
| `src/store.js`, `src/idb.js`, `src/keep.js` | Sauvegarde versionnée du voyage, même format que les carnets ; rangement par paquets dans IndexedDB |
| `src/temps.js` | Heures et jours vécus sur place, d'après le fuseau de chaque photo |
| `src/thumbs.js` | Miniatures rondes de la carte, faites à la demande |
| `src/map.js`, `src/hud.js`, `src/playback.js` | Carte sur canvas, polaroïds et panneau, lecture |
| `src/photos.js`, `src/demo.js` | Import des photos, démo du Japon |
| `src/meta.js`, `src/sizes.js` | Date et lieu lus dans l'EXIF (dates d'appareil non réglé refusées), tailles des photos réduites |
| `src/exporter.js`, `src/carnet.js`, `src/bundle.js` | Carnet téléchargé : assemblage du fichier HTML unique (testé sans navigateur), modules rassemblés en un script |
| `world.json` | Contours des pays (Natural Earth 1:50m, via world-atlas) |
| `cities.json` | 7 342 villes avec noms en français (Natural Earth populated places) |
| `d3.min.js`, `topojson-client.min.js`, `exifr.min.js` | Bibliothèques : cartographie, contours, lecture des données EXIF |

## Technique

- Modules ES sans étape de construction ; typage `// @ts-check` et JSDoc vérifié par `npm run types` (TypeScript strict).
- Le carnet téléchargé embarque tous les modules dans un seul script, dans l'ordre où le navigateur les évalue : il s'ouvre hors ligne, sans serveur.

## Sauvegarde

Le voyage en cours est gardé dans IndexedDB (base `kevoyage`), avec deux numéros : `SAVE_VERSION` pour le format du voyage (migré par `migrate()`) et `DB_VERSION` pour le schéma de la base. Depuis le schéma 2 (version 1.3.0), la clé `courant` ne contient que l'en-tête (titre, noms, empreinte de chaque paquet) et les photos sont rangées par paquets de 100 dans le magasin `photos` : renommer une étape n'écrit que l'en-tête, un import n'écrit que les paquets nouveaux, le tout dans une seule transaction. Un voyage gardé par une version précédente est rangé en paquets à la première ouverture, sans perte (`src/idb.js`). Au-delà de 5000 photos, l'appli prévient que le voyage ne peut pas être gardé. Si le voyage ne peut pas être gardé (stockage plein, navigation privée, IndexedDB qui ne répond pas), l'appli le dit et conseille de télécharger le carnet ; quand le stockage est plein, le voyage abîmé mis de côté est libéré d'abord. Un voyage abîmé ou venant d'une version plus récente est mis de côté (`courant.abimee`) et l'appli repart de la démo. Les carnets téléchargés utilisent le même format ; ceux exportés avant la version 1.1.0 (sans numéro de version) s'ouvrent toujours.

## Tests

```bash
npm ci
npx playwright install chromium
npm run types    # typage
npm run unit     # EXIF, étapes, photos sans lieu, fuseaux et heure d'été, trajets, résumé, IndexedDB, carnet, fichiers de Pages
npm run smoke    # fumée sur ordinateur, iPhone SE et Pixel 7
npm run partie   # parcours complet : démo, import de vraies photos, rechargement, carnet hors ligne, iPhone SE
npm run robustesse # vitesse, onglet caché, dates EXIF bizarres, navigation privée, stockage plein, base de la 1.2, 300 photos, carnet sur Pixel 7
npm run charge   # charge : 3000 photos (import, mémoire, sauvegarde, renommage, rechargement), seuils larges
npm test         # tout
```

La CI GitHub (`.github/workflows/tests.yml`) lance tout sur chaque PR ; le contrôle « CI Kevoyage » résume les deux jobs (à rendre obligatoire dans la protection de la branche `main`). Captures dans `test-results/`.

## Performance sur téléphone

- Photos réduites à 1000 px au plus (≈ 25 Ko chacune), miniatures de carte de 96 px ; l'image pleine taille décodée est libérée tout de suite.
- La carte n'est redessinée que pendant la lecture ou après une action ; la boucle s'arrête quand l'onglet est caché ; densité de pixels plafonnée à 2.
- Miniatures faites seulement pour les photos que la carte montre (5 par étape au plus), pas pour toutes.
- Vérifié par `npm run robustesse` avec 300 photos de 1600 × 1200, et par `npm run charge` avec 3000 photos (mesures dans `test-results/charge.json`).
