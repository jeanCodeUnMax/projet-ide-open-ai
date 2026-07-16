# IDE-AI — Migration Eclipse Theia

Ce dossier contient l’application Eclipse Theia native du projet. Il reste isolé du shell Electron historique afin de permettre une migration progressive et réversible.

## Responsabilités

```text
Theia      → workspace, éditeurs, terminal, Git, tâches, tests, debug et mini-browser
OpenFox    → chat, sessions, agents, workflows, modèles, MCP, skills et commandes
Security   → autorisations, secrets, gates MCP et audit
Yfastos    → système externe propriétaire de la mémoire, du watchdog et de la synchronisation
```

Theia ne développe pas Yfastos. Elle expose uniquement un bridge optionnel pour publier des événements IDE et recevoir du contexte externe.

## État actuel

Le premier bridge fonctionnel OpenFox est présent :

- le backend Theia recherche l’installation OpenFox existante à la racine du dépôt ;
- il sélectionne un port libre sur `127.0.0.1` ;
- il réutilise le profil OpenFox historique et ses configurations ;
- il transmet le workspace actif avec `WORKSPACE_PATH` ;
- il démarre et supervise le processus OpenFox ;
- il attend `/api/health` avant de déclarer le service prêt ;
- il arrête le processus avec Theia ;
- l’interface OpenFox complète est intégrée dans le panneau droit de Theia.

La synchronisation détaillée des éditeurs, diagnostics, Git, terminal, tâches, tests et mini-browser constitue le jalon suivant.

## Structure

```text
theia/
├─ applications/
│  └─ electron/                 produit desktop Theia
└─ packages/
   └─ ide-ai-core/
      ├─ src/common/            contrats JSON-RPC
      ├─ src/node/              runtime et services backend
      └─ src/browser/           panneau OpenFox natif
```

## Variables optionnelles

```text
IDE_AI_OPENFOX_PORT=10369
IDE_AI_OPENFOX_CLI=E:\chemin\vers\openfox\dist\cli\index.js
IDE_AI_OPENFOX_USER_DATA=C:\chemin\vers\ancien-userData
IDE_AI_NODE_BINARY=C:\Program Files\nodejs\node.exe
IDE_AI_SECURITY_MODE=protected
IDE_AI_YFASTOS_URL=http://127.0.0.1:<port>
```

En fonctionnement normal, aucune variable OpenFox n’est nécessaire : le bridge recherche automatiquement le paquet installé par `npm install` à la racine.

## Prérequis

- Node.js 22 ou supérieur ;
- Yarn Classic 1.22.x ;
- `npm install` exécuté à la racine pour disposer d’OpenFox ;
- outils de compilation natifs requis par Electron/Theia.

## Installation

Depuis la racine du dépôt :

```powershell
npm install

cd theia
corepack enable
corepack prepare yarn@1.22.22 --activate
yarn install --non-interactive --network-timeout 600000
```

## Compilation et démarrage

```powershell
yarn workspace @ide-ai/theia-core compile
yarn workspace ide-ai-theia-electron build
yarn workspace ide-ai-theia-electron start
```

Au démarrage, le panneau `OpenFox` s’ouvre à droite. Il affiche une page d’attente pendant le lancement du runtime, puis charge l’interface OpenFox complète.

## Politique de CI économique

Les workflows lourds sont manuels :

- `Theia Spike` compile le module sur demande ;
- `Theia Windows Desktop` fabrique l’installateur sur demande ;
- l’artefact Windows conserve uniquement `IDE-AI-Setup-*.exe` pendant un jour ;
- les commits ordinaires n’exécutent que la CI structurelle légère.

Cette politique évite les reconstructions Electron et les artefacts de plusieurs centaines de mégaoctets à chaque petite modification.
