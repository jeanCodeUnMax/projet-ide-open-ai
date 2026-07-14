# Synchronisation Workspace Electron ↔ OpenFox

## Objectif

L’IDE Electron et OpenFox ne doivent plus maintenir deux projets indépendants. Le dossier choisi dans la coque Electron devient le contexte unique utilisé par :

- l’explorateur de fichiers ;
- le processus OpenFox ;
- le projet OpenFox ;
- les sessions OpenFox ;
- les agents A2A ;
- le RAG ;
- les outils MCP et les commandes lancées dans le workspace.

## Flux d’ouverture d’un workspace

1. Electron valide le dossier avec `realpath`.
2. Le watcher du workspace précédent est arrêté.
3. OpenFox est redémarré avec le nouveau dossier comme `cwd` et `WORKSPACE_PATH`.
4. Le chemin est enregistré dans la configuration isolée de l’IDE.
5. Le `WorkspaceExplorer`, le registre d’agents et le RAG reçoivent le nouveau dossier.
6. L’API OpenFox recherche un projet dont `workdir` correspond au chemin réel.
7. Si le projet n’existe pas, l’IDE appelle `POST /api/projects` pour enregistrer le dossier existant.
8. Les sessions sont chargées avec `GET /api/sessions?projectId=...`.
9. La dernière session utilisée ou la session la plus récente est sélectionnée.
10. La `WebContentsView` OpenFox navigue vers `/p/:projectId` ou `/p/:projectId/s/:sessionId`.
11. Le watcher du nouveau workspace est démarré.

## Transaction et rollback

Le changement n’est validé qu’après synchronisation du projet OpenFox. En cas d’échec :

- le processus OpenFox est redémarré dans l’ancien workspace ;
- l’ancien chemin est restauré dans les réglages ;
- les services Electron reprennent l’ancien contexte ;
- l’ancien projet et sa session sont rechargés ;
- les écritures ne sont pas dirigées vers un workspace partiellement synchronisé.

## Synchronisation des fichiers

`WorkspaceFileWatcher` observe le disque. Lorsqu’OpenFox ou un autre outil crée, modifie ou supprime un fichier :

- les événements sont regroupés par debounce ;
- les dossiers techniques sont ignorés (`.git`, `.ide-ai`, `node_modules`, builds et caches) ;
- l’événement `workspace:files-changed` est envoyé à la coque ;
- l’explorateur Electron est actualisé automatiquement ;
- le fichier actuellement ouvert est relu lorsqu’il a été modifié.

Le watcher utilise `fs.watch({ recursive: true })` lorsque la plateforme le permet. Un snapshot périodique sert de repli.

## Contexte central

Le `WorkspaceManager` expose un contexte de cette forme :

```json
{
  "rootPath": "E:\\projets\\mon-projet",
  "syncState": "ready",
  "project": {
    "id": "openfox-project-id",
    "name": "mon-projet",
    "workdir": "E:\\projets\\mon-projet"
  },
  "activeSession": {
    "id": "openfox-session-id",
    "title": "Session de développement"
  },
  "sessions": [],
  "openFoxUrl": "http://127.0.0.1:10369/p/.../s/..."
}
```

## Source de vérité

Le dossier réel reste la source de vérité des fichiers. Electron pilote la sélection du workspace. OpenFox conserve toute sa richesse fonctionnelle pour les projets, sessions, modèles, réglages, agents et outils, mais il est automatiquement aligné sur le dossier choisi dans l’IDE.

## Limites de cette version

- l’IDE sélectionne automatiquement la dernière session connue ou la plus récente ;
- aucune session vide n’est créée automatiquement lorsqu’un projet n’en possède pas ;
- le watcher actualise l’arborescence complète en conservant les dossiers développés ;
- la réindexation RAG automatique après chaque changement de fichier reste volontairement désactivée pour éviter des coûts et traitements excessifs.
