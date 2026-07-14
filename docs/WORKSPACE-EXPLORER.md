# Explorateur de workspace — MVP 0.5

## Objectif

La fenêtre principale n’affiche plus OpenFox seul. Elle devient une coque d’IDE avec :

- l’arborescence du workspace à gauche ;
- un champ permettant d’ouvrir directement un chemin absolu, y compris sur un autre disque Windows ;
- un onglet OpenFox ;
- un onglet d’aperçu de fichier ;
- une barre d’état ;
- OpenFox monté dans une `WebContentsView` isolée.

## Utilisation

1. Lancer `npm start`.
2. Cliquer sur l’icône dossier dans l’explorateur, ou saisir un chemin comme `E:\projets\mon-projet`.
3. Déplier les dossiers dans la barre latérale.
4. Cliquer sur un fichier texte pour l’afficher.
5. Cliquer sur l’onglet **OpenFox** pour revenir au chat agentique.

## Sécurité

- les chemins relatifs sont résolus avec `realpath` ;
- les sorties du workspace sont refusées ;
- les liens symboliques ne sont pas parcourus ;
- les fichiers de plus de 2 Mio ne sont pas chargés dans l’aperçu ;
- les fichiers binaires ne sont pas décodés comme texte ;
- le contenu est injecté avec `textContent`, jamais avec `innerHTML` ;
- `node_modules`, `.git`, `.ide-ai`, les builds et caches sont masqués pour éviter de bloquer l’interface.

## Limites de cette version

- aperçu en lecture seule ;
- pas encore de création, renommage ou suppression ;
- pas encore d’éditeur Monaco ;
- pas encore de surveillance automatique du système de fichiers ;
- pas encore de recherche globale dans les fichiers.
