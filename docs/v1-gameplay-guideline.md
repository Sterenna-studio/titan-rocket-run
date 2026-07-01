# Titan Rocket Run - Guideline Gameplay V1

## Intention

La V1 doit rester un runner lisible avec une identite bretonne, pas repartir en melange confus course / lancer / plateforme. La bonne direction est :

- une boucle principale simple : lancer, courir, sauter, booster, collecter ;
- une seconde chance claire quand Titan tombe sous la piste ;
- des biomes bretons qui changent le rythme sans changer toutes les regles ;
- des obstacles lisibles, droles et localises ;
- du feedback visuel fort sur la vitesse, surtout l'elongation/distorsion de Titan.

## Boucle V1

1. Le joueur lance Titan avec une charge courte et satisfaisante.
2. Titan court automatiquement dans une piste haute.
3. Le joueur saute, air-jump, corrige avec la rocket et collecte des os.
4. Si Titan tombe, il arrive dans un niveau souterrain de rattrapage.
5. Dans le souterrain, il peut trouver un boost special pour remonter vers la piste haute.
6. S'il tombe sous le souterrain, game over.
7. La fenetre de resultats s'ouvre au-dessus du sprite de Titan et compte progressivement les gains.

Cette structure donne une erreur recuperable, puis une vraie punition. Elle rend la chute moins frustrante sans supprimer le risque.

## Priorites de developpement

### Priorite 1 - Deux niveaux, une seconde chance

Objectif : faire exister le niveau souterrain avant d'ajouter beaucoup d'obstacles.

- Ajouter un etat de run : `surface`, `underground`, `recovering`, `gameOver`.
- Quand Titan tombe sous la piste surface, teleport/transition vers une piste souterraine au lieu de finir la run.
- Le souterrain doit etre plus bas, plus sombre, plus serre et plus stressant.
- Ajouter un collectible `boost special` qui declenche une remontee vers la surface.
- Si Titan tombe sous le souterrain : game over.

Regle de design : le joueur doit comprendre en moins d'une seconde qu'il a eu une seconde chance.

### Priorite 2 - Reintroduire le lancement sans recharger tout le jeu

Objectif : garder le plaisir du depart charge, mais en faire un bonus court, pas le coeur du jeu.

- Maintenir `Espace` au depart pour charger.
- Relacher pour partir.
- Zone verte = bonus de vitesse et rocket pleine.
- Trop court = depart normal, pas punition forte.
- Trop long = depart puissant mais moins stable, avec un petit wobble visuel.

Regle de design : le lancement doit durer 1 a 1.4 s max. Apres ca, le jeu redevient runner.

### Priorite 3 - Pistes plus hautes et plus interessantes

Objectif : retrouver de la verticalite sans perdre la lisibilite.

- Surface : route principale avec plateformes hautes, arches, toits, falaises, ponts.
- Souterrain : caves, tunnels, portiques, rails, pierres humides.
- Ajouter quelques embranchements simples : route sure basse, route bonus haute.
- Garder les gaps de base faisables sans upgrade.
- Utiliser les os pour dessiner la trajectoire recommandee.

Regle de design : chaque obstacle doit avoir une lecture claire avant d'arriver a l'ecran central.

### Priorite 4 - Bretagne comme carte de progression

Utiliser des lieux bretons comme jalons et biomes, avec elements visuels et mecaniques associes.

- Saint-Malo : remparts, mouettes, vent de mer, pierre grise.
- Broceliande : brume, racines, pierres luminescentes, sons mystiques.
- Carnac : menhirs, alignements, plateformes de pierre, distorsion rituelle.
- Quiberon : falaises, embruns, rafales laterales.
- Brest / port : grues, cables, containers, pluie.
- Monts d'Arree : lande, pluie fine, sol glissant, silhouettes rocheuses.
- Rennes : ruelles, paves, petites mamies qui veulent caresser Titan.

Regle de design : un lieu = un fond identifiable + un obstacle signature + une variation de gameplay.

### Priorite 5 - Obstacles vivants et lisibles

Surface :

- mouettes a eviter en hauteur ;
- rafales de vent qui poussent legerement ;
- pluie qui reduit un peu la visibilite mais pas les controles ;
- glace qui allonge les glissades sur certaines plateformes ;
- menhirs comme piliers ou passages etroits.

Souterrain / bas :

- cables au sol qui ralentissent Titan ;
- flaques glissantes ;
- petites mamies qui tendent les bras pour caresser Titan, obstacle drole mais tres lisible ;
- vieux panneaux, rails, casiers, objets de port.

Regle de design : un obstacle doit avoir une silhouette reconnaissable. Eviter les petits details qui tuent sans prevenir.

### Priorite 6 - Distorsion de vitesse de Titan

L'effet d'elongation doit devenir une signature visuelle.

- A vitesse normale : sprite stable.
- A vitesse elevee : stretch horizontal leger, squash vertical leger.
- Rocket : trainee, lignes de vitesse, halo cyan/vert, distortion derriere Titan.
- Atterrissage lourd : squash bref puis retour elastique.
- Boost special souterrain : elongation forte + tremblement camera court + tunnel de vitesse.

Regle de design : l'effet doit montrer la vitesse sans rendre la hitbox illisible.

### Priorite 7 - Controles configurables et supports

Clavier :

- Creer une configuration centralisee des touches.
- Exposer un petit ecran `Controles`.
- Autoriser remap : saut, rocket, gauche, droite, pause/restart.

Manette :

- Prise en charge Gamepad API.
- `A` / bouton bas = saut.
- `RT` / `RB` = rocket.
- stick gauche / d-pad = correction de trajectoire.
- vibration courte sur boost, crash, remontee surface.

Telephone :

- UI tactile persistante : gros bouton `Saut`, bouton `Rocket`, bouton `Pause`.
- Le bouton `Saut` doit etre le plus gros.
- Eviter plus de 3 boutons actifs pendant la run.
- Portrait jouable, paysage recommande.

Ecran large :

- Garder le canvas lisible au centre.
- Utiliser les cotes pour HUD, progression, leaderboard, boutique.
- Ne pas laisser le joueur voir trop loin horizontalement si ca casse le challenge.

Regle de design : une action importante = une entree claire sur chaque support.

## UI de game over

Au game over, ne pas couper brutalement vers un ecran abstrait.

- Titan tombe / s'ecrase / s'arrete dans le souterrain.
- Une petite fenetre apparait au-dessus de son sprite.
- Les gains s'affichent progressivement :
  - distance ;
  - os ramasses ;
  - bonus de lieux ;
  - combo max ;
  - total gagne ;
  - nouveau record si applicable.
- Le bouton `Rejouer` devient actif apres le comptage ou immediatement avec une animation discrete.

Regle de design : le joueur doit sentir que sa run a ete recompensee, meme apres une chute.

## Progression V1 recommandee

1. Implementer surface -> souterrain -> game over.
2. Ajouter le boost special de remontee.
3. Reintroduire le lancement charge court.
4. Ajouter l'UI de resultats progressive au-dessus de Titan.
5. Ajouter distorsion vitesse / rocket / atterrissage.
6. Ajouter un premier biome Bretagne complet : Saint-Malo ou Broceliande.
7. Ajouter mouettes + cables + mamie comme obstacles tests.
8. Ajouter controls config + gamepad.
9. Ajuster mobile et ecran large.
10. Equilibrer generation, economies d'os, boutique et leaderboard.

## Definition de V1 jouable

La V1 est prete quand :

- un nouveau joueur comprend quoi faire en moins de 10 secondes ;
- le premier run dure souvent plus de 30 secondes ;
- une chute en surface donne une vraie chance de rattrapage ;
- le game over est clair et satisfaisant ;
- au moins 3 lieux bretons sont visibles et nommes ;
- au moins 3 obstacles signatures existent ;
- clavier, mobile et manette sont jouables ;
- la vitesse de Titan se ressent visuellement ;
- le build production passe sans erreur.

## A eviter

- Ajouter trop de touches avant d'avoir une boucle stable.
- Melanger plusieurs objectifs de score concurrents.
- Faire des obstacles petits ou peu lisibles.
- Faire du souterrain un simple decor : il doit etre une vraie phase de rattrapage.
- Rendre le lancement obligatoire pour survivre aux premiers gaps.
- Mettre la Bretagne seulement dans le texte : il faut des signes visuels et mecaniques.
