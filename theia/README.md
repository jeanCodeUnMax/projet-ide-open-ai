# IDE-AI — Spike Eclipse Theia

Ce dossier contient la première application Eclipse Theia native du projet. Il est isolé du shell Electron historique afin de permettre une migration progressive et réversible.

## Objectifs du spike

- utiliser Theia comme propriétaire du workspace, des éditeurs, du terminal, des tâches, du SCM, du debug, des tests et du mini-browser ;
- installer OpenFox comme activité IA principale ;
- ne pas inclure `@theia/ai-copilot` ni `@theia/ai-ide` afin d’éviter un second orchestrateur agentique ;
- fournir des contrats typés à OpenFox, Security Gate, Migration et Yfastos ;
- conserver le projet Electron actuel opérationnel pendant tout le portage.

## Structure

```text
theia/
├─ applications/
│  └─ electron/                 produit desktop Theia
└─ packages/
   └─ ide-ai-core/
      ├─ src/common/            contrats JSON-RPC
      ├─ src/node/              services backend
      └─ src/browser/           vue OpenFox native
```

## Services présents

| Service | État du spike |
|---|---|
| IDE Context | workspace et capacités déclarées |
| OpenFox Bridge | contrôle de santé d’un runtime OpenFox local |
| Security Bridge | exposition du mode de politique |
| Migration Service | contrat v1, import/export encore à porter |
| Yfastos Bridge | contrat et contrôle de santé facultatif |

## Variables

```text
IDE_AI_OPENFOX_URL=http://127.0.0.1:10369
IDE_AI_SECURITY_MODE=protected
IDE_AI_YFASTOS_URL=http://127.0.0.1:<port>
```

Yfastos reste optionnel. Son absence ne bloque pas Theia.

## Prérequis

- Node.js 22 ou supérieur ;
- Yarn Classic 1.22.x ;
- outils de compilation natifs requis par Electron/Theia.

## Installation et démarrage

Depuis la racine du dépôt :

```powershell
cd theia
yarn install
yarn build
yarn start
```

Le premier build est lourd car Theia et Electron doivent être téléchargés et reconstruits.

## Décisions de propriété

```text
Theia      → IDE et surfaces de développement
OpenFox    → agents, sessions, workflows et orchestration
Security   → autorisations, secrets, MCP sensibles et audit
Yfastos    → mémoire unifiée, watchdog et synchronisation
```

La vue `OpenFox` ne duplique pas encore le chat complet. Elle valide d’abord les connexions frontend/backend et les frontières de services. Le portage fonctionnel du chat et des workflows vient ensuite.
