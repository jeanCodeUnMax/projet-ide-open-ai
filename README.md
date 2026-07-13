# IDE Open AI

Application desktop Electron construite autour d’**OpenFox**, avec un gestionnaire MCP gouverné inspiré des capacités décrites pour Windsurf/Cascade.

> Statut : MVP 0.1.0. Le moteur agentique est OpenFox 2.0.50. Le projet n’est pas affilié à OpenAI, Windsurf, Codeium ou l’équipe OpenFox.

## Fonctionnalités livrées

- lancement et supervision d’OpenFox dans une application Electron ;
- fenêtre principale utilisant l’interface complète OpenFox ;
- profil OpenFox isolé dans les données de l’application ;
- sélection native du workspace ;
- gestion des serveurs MCP `stdio` et Streamable HTTP ;
- test, ajout, suppression et activation outil par outil ;
- limite stricte de **100 outils MCP actifs** ;
- import/export d’un fichier `mcp_config.json` contenant `mcpServers` ;
- interpolation `${env:VARIABLE}` au lancement ;
- fenêtre de journaux et redémarrage du moteur ;
- configuration d’empaquetage Windows NSIS, Linux AppImage/DEB et macOS DMG.

## Prérequis

- Node.js 22 minimum. Node.js 24 est préférable, car le paquet OpenFox audité le demande dans son champ `engines`.
- npm 10 ou supérieur.
- Pour certains MCP `stdio` : `npx`, `uvx`, Python ou Docker selon le serveur choisi.

## Installation

```bash
git clone https://github.com/jeanCodeUnMax/projet-ide-open-ai.git
cd projet-ide-open-ai
npm install
npm start
```

Le premier lancement ouvre le dossier **Documents** comme workspace. Utilise `Projet > Ouvrir un workspace…` pour le remplacer.

## Configuration d’un MCP

Ouvre `MCP > Gestionnaire MCP…`.

Exemple `stdio` :

```json
{
  "name": "filesystem",
  "transport": "stdio",
  "command": "npx",
  "args": [
    "-y",
    "@modelcontextprotocol/server-filesystem",
    "${env:WORKSPACE_PATH}"
  ]
}
```

Exemple HTTP :

```json
{
  "name": "remote",
  "transport": "http",
  "url": "https://example.test/mcp",
  "headers": {
    "Authorization": "Bearer ${env:MCP_ACCESS_TOKEN}"
  }
}
```

Les variables doivent être présentes dans l’environnement qui lance Electron.

### Windows PowerShell

```powershell
$env:MCP_ACCESS_TOKEN="secret"
npm start
```

### Linux/macOS

```bash
MCP_ACCESS_TOKEN="secret" npm start
```

## Vérification

```bash
npm run check
```

## Construction des installateurs

```bash
npm run dist:win
npm run dist:linux
npm run dist:mac
```

Les artefacts sont générés dans `release/`. La construction native d’une plateforme doit généralement être exécutée sur cette plateforme.

## Architecture

Voir :

- `docs/ARCHITECTURE.md`
- `docs/MCP-PARITY.md`
- `docs/SECURITY.md`
- `docs/DELIVERY.md`

## Ce qui reste à développer

- transport SSE ;
- OAuth MCP et stockage sécurisé des jetons ;
- exposition des `resources` et `prompts` MCP ;
- marketplace de serveurs vérifiés ;
- liste blanche administrateur ;
- signature de code et mise à jour automatique ;
- intégration plus profonde directement dans un fork complet d’OpenFox.

## Origine

- OpenFox : `https://github.com/co-l/openfox`
- Document de comparaison MCP fourni : documentation Windsurf/Cascade MCP.
