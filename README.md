# Titan Rocket Run

Prototype HTML5 Canvas autour de Titan.

## Concept

Titan devient un **runner-platformer nerveux**, plus proche d'un petit Sonic-like que d'un simple jeu de saut depuis une rampe.

Boucle de jeu :

```text
Run → Platform jumps → Rocket saves → Bones / mines → Distance → Rewards → Upgrades → Retry
```

## Gameplay

- Maintenir `A` / `D` pour se déplacer et conserver l'élan.
- Appuyer sur `Espace` pour sauter ; Titan possède un double saut de base.
- Maintenir `Shift` pour déclencher la rocket, surtout utile en l'air pour sauver un gap.
- Sauter de plateforme en plateforme le plus loin possible.
- Ramasser les os pour gagner des bonus, monter le combo et récupérer un peu de rocket.
- Les mines sont moins punitives qu'avant : elles ralentissent Titan, cassent le combo et donnent un petit knockback, mais elles ne terminent pas la run instantanément.
- La run se termine surtout quand Titan tombe dans le vide.
- Le bouton 🔊 en haut à droite coupe / réactive le son.
- Des contrôles tactiles sont disponibles sur mobile / écran tactile.

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

- Chaussures : meilleure accélération et meilleure vitesse au sol.
- Bottes de saut : sauts plus hauts et air-jumps supplémentaires à haut niveau.
- Rocket : boost horizontal plus long.
- Cape aéro : meilleur contrôle en l'air et chute plus douce.
- Élan de départ : vitesse initiale augmentée.

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

- ✅ Pivot gameplay vers runner-platformer.
- ✅ Plateformes générées procéduralement.
- ✅ Double saut + air-jumps via upgrade.
- ✅ Mines moins punitives.
- ✅ Contrôles tactiles.
- ✅ Écran titre + panel de résultats.
- 🔁 Prochaines passes : level design plus lisible, animations d'atterrissage, pads spéciaux, ennemis et meilleure sensation Sonic-like.
