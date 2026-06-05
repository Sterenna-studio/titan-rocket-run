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
- La distance donne des os.
- Les os servent à acheter des améliorations.

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

Tu peux aussi ouvrir `index.html` directement, mais le serveur local est plus propre pour charger les assets.

## Structure

```text
.
├── index.html
├── package.json
├── README.md
├── src/
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

- Ajouter un écran titre.
- Ajouter un vrai panel de résultats après chaque run.
- Ajouter des obstacles / pickups pendant le vol.
- Équilibrer les coûts d'upgrades.
- Ajouter sons et effets visuels.
- Préparer une version Phaser ou Godot si besoin.
