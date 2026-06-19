# Titan Rocket Run

Prototype HTML5 Canvas autour de Titan.

## Concept

Titan doit courir, prendre de la vitesse, sauter depuis une rampe, utiliser éventuellement une rocket en plein vol, puis aller le plus loin possible.

Boucle de jeu :

```text
Run → Jump → Fly/Fall → Distance → Rewards → Upgrades → Retry
```

## Gameplay

- Alterner `A` / `D` pour charger la course.
- Appuyer sur `Espace` au bon moment sur la rampe.
- Maintenir `Shift` en vol pour utiliser la rocket.
- En vol, ramasser les os flottants (plus ils sont haut, plus ils rapportent) et éviter les mines rouges qui freinent Titan.
- La distance et les os ramassés donnent des récompenses.
- Les os servent à acheter des améliorations.
- Un écran titre lance la partie, et un panel de résultats (distance, vitesse max, qualité de saut, os, badges) s'affiche après chaque run.
- Le bouton 🔊 en haut à droite coupe / réactive le son.

## Asset Browser

Une page dédiée permet de consulter et valider facilement les sprites de Titan :

```text
asset-browser.html
```

Elle permet de :

- filtrer par animation ;
- rechercher une frame ;
- zoomer les cartes ;
- prévisualiser une frame en grand ;
- lire rapidement une animation ;
- récupérer le chemin exact de chaque PNG.

## Upgrades

- Chaussures : meilleure accélération.
- Rampe : meilleure fenêtre de timing et meilleur angle.
- Rocket : plus de boost en l'air.
- Cape aéro : moins de perte de vitesse.
- Ligne de départ : vitesse initiale augmentée.

## Lancer le proto

Depuis la racine du repo :

```bash
python -m http.server 8000
```

Puis ouvrir :

```text
http://localhost:8000
```

Pour consulter les assets :

```text
http://localhost:8000/asset-browser.html
```

Tu peux aussi ouvrir `index.html` directement, mais le serveur local est plus propre pour charger les assets.

## Structure

```text
.
├── index.html
├── asset-browser.html
├── package.json
├── README.md
├── src/
│   ├── asset-browser.css
│   ├── asset-browser.js
│   ├── game.js
│   └── style.css
└── assets/
    ├── titan_manifest.json
    └── titan/
        ├── idle/
        ├── walk/
        ├── run/
        ├── jump/
        ├── attack_combo/
        ├── bark_energy_blast/
        ├── hurt/
        ├── knockout/
        └── sit_rest/
```

## Roadmap rapide

- ✅ Écran titre.
- ✅ Panel de résultats après chaque run (stats + badges).
- ✅ Obstacles / pickups pendant le vol.
- 🔁 Équilibrage des coûts d'upgrades (premier passage fait, à affiner en jouant).
- ✅ Sons (WebAudio synthétisé) et effets visuels (screen shake, flashs).
- Préparer une version Phaser ou Godot si besoin.
