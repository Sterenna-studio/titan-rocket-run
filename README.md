# Titan Rocket Run

Runner-platformer autour de Titan, migré du prototype HTML Canvas vanilla vers une base Vite + TypeScript + Phaser 3.

## Stack

- Vite pour le serveur de dev et le build.
- TypeScript pour le code du jeu.
- Phaser 3 pour le rendu, les scènes, les inputs et la caméra.
- `alea` pour les seeds reproductibles.
- `simplex-noise` pour une variation naturelle des plateformes.
- Les sprites Titan restent chargés depuis `assets/titan_manifest.json`.

## Installation

```bash
npm install
```

## Commandes

```bash
npm run dev
npm run build
npm run preview
```

En dev, ouvrir l'URL affichée par Vite. Le jeu principal est sur `index.html` et l'outil de validation des sprites reste disponible sur `asset-browser.html`.

## Gameplay

- `A` / `D` ou flèches gauche/droite : déplacement et maintien de l'élan.
- `Espace` : saut, avec double saut de base.
- `Shift` : rocket boost en l'air.
- `R` : relancer la run avec la même seed.
- Chute dans le vide : fin de run.
- Les os donnent des bonus, montent le combo et rendent un peu de rocket.
- Les mines ralentissent Titan, cassent le combo, donnent un petit knockback et une invuln courte, sans tuer instantanément.

Le feeling inclut coyote time, jump buffer, saut variable, friction au sol, air control et caméra avec anticipation vers l'avant.

## Debug

- `F3` : afficher / masquer l'overlay debug.
- `F5` : relancer une run avec une nouvelle seed.
- `H` : afficher / masquer les hitboxes.

L'overlay debug affiche seed, distance, vitesse X/Y, grounded, sauts restants, rocket, plateformes actives, entities actives et combo.

## Sauvegarde

La sauvegarde reste en `localStorage` avec :

- record de distance ;
- os ;
- upgrades.

Les upgrades sont appliqués au démarrage d'une nouvelle run.

## Architecture

```text
src/
  main.ts                  # bridge DOM <-> Phaser, boutique, HUD, touch controls
  game/
    config.ts              # config Phaser/Vite runtime
    constants.ts           # constantes gameplay, events, couleurs
  scenes/
    BootScene.ts           # charge manifest + frames Titan
    MenuScene.ts           # scène menu légère
    RunScene.ts            # boucle runner-platformer
    ResultScene.ts         # scène résultat légère
  player/
    TitanController.ts     # mouvement, sauts, rocket, collisions plateforme
    TitanAnimations.ts     # chargement des frames et animations Phaser
  world/
    PlatformGenerator.ts   # génération seedée d'une plateforme et de son décor
    ChunkManager.ts        # fenêtre active de plateformes/entities
    DifficultyCurve.ts     # progression de difficulté
  systems/
    SaveSystem.ts          # localStorage + scoring de fin de run
    UpgradeSystem.ts       # boutique + stats dérivées
    CollectibleSystem.ts   # os, texture et collisions circulaires
    MineSystem.ts          # mines, texture et collisions circulaires
  types/
    game.ts                # types partagés
```

`asset-browser.html`, `src/asset-browser.js` et `src/asset-browser.css` sont conservés pour inspecter les assets. `vite.config.ts` garde `asset-browser.html` comme entrée de build et copie `assets/` dans `dist/assets` pour que le manifest et les PNG restent disponibles en production.

## Génération procédurale

`ChunkManager` maintient une fenêtre de monde active autour de la caméra. `PlatformGenerator` utilise une seed `alea` et du `simplex-noise` pour produire :

- plateformes normales ;
- plateformes boost ;
- os au sol ou en hauteur ;
- mines de plus en plus fréquentes ;
- gaps, largeurs et hauteurs modulés par `DifficultyCurve`.

La structure est volontairement simple pour pouvoir ajouter ensuite des chunks faits main, des biomes ou des règles de placement plus spécifiques sans réécrire la scène principale.

## Assets Titan

Les animations Phaser sont créées à partir de `assets/titan_manifest.json` :

- `idle`
- `walk`
- `run`
- `jump`
- `bark_energy_blast`
- `hurt`
- `knockout`
- `sit_rest`

Les dossiers `assets/` ne sont pas déplacés ni supprimés.
