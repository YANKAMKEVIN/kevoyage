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
- **Mode clair et sombre**, ordinateur et téléphone.

## Vie privée

Tout se passe dans le navigateur. Les photos ne sont jamais envoyées sur un serveur : la date et le lieu sont lus directement sur votre appareil.

## Lancer l'appli en local

L'appli charge ses données (carte du monde, villes) depuis ses propres fichiers, il faut donc la servir avec un petit serveur web :

```bash
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000.

## Contenu du dépôt

| Fichier | Rôle |
|---|---|
| `index.html` | Page et styles |
| `app.js` | Lecture des photos, étapes, animation de la carte, démo, export |
| `world.json` | Contours des pays (Natural Earth 1:50m, via world-atlas) |
| `cities.json` | 7 342 villes avec noms en français (Natural Earth populated places) |
| `d3.min.js`, `topojson-client.min.js`, `exifr.min.js` | Bibliothèques : cartographie, contours, lecture des données EXIF |

## Crédits

Données cartographiques : [Natural Earth](https://www.naturalearthdata.com/) (domaine public). Bibliothèques : [D3](https://d3js.org/) (ISC), [TopoJSON](https://github.com/topojson/topojson-client) (ISC), [exifr](https://github.com/MikeKovarik/exifr) (MIT).
