# Titan Rocket Run

Runner autour de Titan, migré du prototype HTML Canvas vanilla vers une base Vite + TypeScript + Phaser 3.

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

## Déploiement

Le workflow OVH installe les dépendances avec `npm ci`, lance `npm run build`, puis publie uniquement `dist/`. Vite utilise des chemins relatifs (`base: './'`) pour que le bundle fonctionne aussi quand le jeu est servi depuis un sous-dossier comme `/titan-rocket-run/`. Les assets copiés sans hash (`assets/titan_manifest.json` et PNG) reçoivent un `?v=` explicite via `src/game/cacheBust.ts`, basé sur `GITHUB_SHA` en CI ou `VITE_ASSET_CACHE_VERSION` si défini.

## Gameplay

- Titan avance automatiquement : la run commence directement.
- `A` / `D` ou flèches gauche/droite : correction légère de trajectoire.
- `Espace` : charge le depart au menu, puis saut avec air-jump pendant la run.
- `Shift` : boost rocket court, au sol comme en l'air.
- `P` / `Esc` : pause, avec reprise sans quitter la run.
- `R` : relancer la run avec la même seed.
- Panneau `Touches` : remap clavier persistant pour gauche, droite, saut, rocket, pause et retry.
- Manette : stick gauche / d-pad pour corriger, `A` / bouton bas pour sauter, `RB` / `RT` pour la rocket, `Start` pour pause.
- En tactile : boutons `Saut`, `Rocket` et `Pause`.
- Chute sous la piste : vraie transition vers le souterrain de rattrapage, puis game over si Titan retombe.
- Les os donnent des bonus, montent le combo et rendent un peu de rocket.
- Les plateformes restent sur une route basse et lisible ; la difficulté vient surtout du timing des gaps.
- Les upgrades renforcent la vitesse automatique, les sauts, le contrôle en l'air, l'amorti et la rocket.
- Des lieux fixes déclenchent une mini-histoire avec récompenses immédiates : os, rocket, boost de vitesse, bannière et balise lumineuse.
- Les combos rendent les os plus rentables toutes les 4 prises, tant que Titan garde son elan.

Le feeling inclut coyote time, jump buffer, saut variable, air control léger et caméra avec anticipation vers l'avant.

## Direction V1

La guideline de progression gameplay est dans [`docs/v1-gameplay-guideline.md`](docs/v1-gameplay-guideline.md). Elle cadre les prochaines etapes : seconde chance souterraine, lancement charge court, biomes bretons, obstacles vivants, distorsion de vitesse, controles configurables, manette et mobile.

## Etat actuel V1

La base actuelle est volontairement simple et propre avant de reintroduire les gros systemes :

- nouvelle sauvegarde locale `titanRocketRunSaveV1`, separee des anciens prototypes ;
- nouveau leaderboard local `titanRocketRunArcadeLeaderboardV1` ;
- accueil Sniky pour les nouveaux joueurs, avec 130 os offerts pour acheter un premier upgrade ;
- HUD global avec record, os, nombre de runs et signaux bretons debloques ;
- vraie chute vers le souterrain : Titan perce la piste, tombe avec suivi camera, puis atterrit sur la piste basse de rattrapage ;
- route aerienne espace : si Titan monte assez haut, il accroche une voie spatiale avec fond dedie, plateformes fines et os hauts ;
- embranchements bonus hauts : certaines plateformes principales gardent une route sure, avec une petite plateforme haute plus risquee et plus rentable en os ;
- lancement charge court : maintenir `Espace`, relacher dans la zone verte pour partir avec rocket pleine et vitesse bonus ;
- UI de resultat progressive : distance, vitesse, combo, signaux et recompense comptent avant l'inscription du score ;
- biomes surface plus lisibles : Saint-Malo pierre/mer, Broceliande brume/racines, Carnac menhirs/alignements et Brest port/pluie ;
- HUD de run nomme le biome courant et annonce les transitions de lieu ;
- obstacles non letaux : ils cassent la combo, secouent Titan et donnent un court etat d'invulnerabilite ;
- controles clavier remappables et persistants dans le panneau `Touches` ;
- support manette basique via Gamepad API : stick/d-pad, bouton bas pour sauter, `RB`/`RT` pour rocket, `Start` pour pause et vibrations courtes sur chocs/boosts ;
- progression par lieux bretons : Garage de Sniky, Remparts de Saint-Malo, Brume de Broceliande, Alignements de Carnac, Port de Brest, Signal des Monts d'Arree ;
- chaque signal donne os, rocket et relance de vitesse pour rendre la progression plus lisible ;
- stretch leger de Titan, squash d'atterrissage et lignes de vent rendent les pics de vitesse plus visibles ;
- Titan ne perd plus automatiquement ses bonus de vitesse en courant ; seule une correction volontaire vers la gauche le ralentit ;
- l'equilibrage fin des obstacles, de l'economie d'os et des routes bonus reste a poursuivre.

## Debug

- `F3` : afficher / masquer l'overlay debug.
- `F5` : relancer une run avec une nouvelle seed.
- `H` : afficher / masquer les hitboxes.

L'overlay debug affiche seed, distance, vitesse X/Y, grounded, sauts restants, rocket, plateformes actives, entities actives et combo.

## Sauvegarde

La sauvegarde reste en `localStorage` avec :

- version de save V1 volontairement separee des anciens essais ;
- record de distance ;
- os ;
- nombre de runs ;
- accueil Sniky vu ou non ;
- signaux bretons deja atteints ;
- upgrades.

Une nouvelle save commence avec 130 os offerts par Sniky pour acheter un premier upgrade. Les upgrades sont appliqués au démarrage d'une nouvelle run.

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
    RunScene.ts            # boucle runner simple
    ResultScene.ts         # scène résultat légère
  player/
    TitanController.ts     # mouvement, sauts, rocket, collisions plateforme
    TitanAnimations.ts     # chargement des frames et animations Phaser
  world/
    PlatformGenerator.ts   # génération seedée d'une piste basse et de ses os
    ChunkManager.ts        # fenêtre active de plateformes/entities
    DifficultyCurve.ts     # progression de difficulté
  systems/
    SaveSystem.ts          # localStorage + scoring de fin de run
    UpgradeSystem.ts       # boutique + stats dérivées
    RunMilestones.ts       # lieux d'histoire, distances fixes et récompenses
    SoundSystem.ts         # sons WebAudio proceduraux
    CollectibleSystem.ts   # os, texture et collisions circulaires
  types/
    game.ts                # types partagés
```

`asset-browser.html`, `src/asset-browser.js` et `src/asset-browser.css` sont conservés pour inspecter les assets. `vite.config.ts` garde `asset-browser.html` comme entrée de build et copie `assets/` dans `dist/assets` pour que le manifest et les PNG restent disponibles en production.

## Génération procédurale

`ChunkManager` maintient une fenêtre de monde active autour de la caméra. `PlatformGenerator` utilise une seed `alea` et du `simplex-noise` pour produire :

- plateformes normales ;
- plateformes boost ;
- plateformes longues de respiration ;
- os au sol ou légèrement au-dessus de la trajectoire ;
- gaps, largeurs et faibles variations de hauteur modulés par `DifficultyCurve`.

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
