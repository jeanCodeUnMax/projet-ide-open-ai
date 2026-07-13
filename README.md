# IDE Open AI

Application desktop Electron construite autour d’**OpenFox**, avec MCP gouverné, fondation Agent-to-Agent, réutilisation de la mémoire **Hephaistos-kit** et ingestion RAG multimodale.

> Statut : MVP 0.3.0. Le moteur agentique actuel est OpenFox 2.0.50. Le projet n’est pas affilié à OpenAI, Windsurf, Codeium ou l’équipe OpenFox.

## Fonctionnalités livrées

### Desktop et MCP

- lancement et supervision d’OpenFox dans Electron ;
- profil OpenFox isolé dans les données de l’application ;
- sélection native du workspace ;
- serveurs MCP `stdio` et Streamable HTTP ;
- activation outil par outil et limite stricte de 100 outils ;
- import/export `mcp_config.json` ;
- interpolation `${env:VARIABLE}` ;
- journaux et redémarrage du moteur ;
- empaquetage Windows, Linux et macOS.

### Agent-to-Agent

- validation d’Agent Cards A2A ;
- registre d’agents et recherche par tags de compétences ;
- cycle de vie contrôlé des tâches ;
- messages et artefacts ;
- client A2A de découverte et délégation ;
- serveur HTTP local avec découverte, envoi, lecture et annulation de tâches ;
- Agent Card de l’orchestrateur dans `config/agents/`.

### Interface Agents et Knowledge

- panneau Electron accessible par `AI OS > Agents et Knowledge…` ;
- registre persistant d’Agent Cards par workspace ;
- découverte, activation, rafraîchissement et suppression d’agents distants ;
- glisser-déposer de documents dans le pipeline RAG ;
- progression détaillée OCR, vision, tags, embeddings et indexation ;
- inventaire des documents indexés ;
- recherche lexicale locale et fusion vectorielle Qdrant lorsqu’elle est configurée.

### Hephaistos-kit

- adaptateur HTTP configurable ;
- réutilisation de la mémoire unifiée avant et après une tâche ;
- récupération du contexte du workspace ;
- transmission des événements au watchdog ;
- aucun second moteur mémoire créé en parallèle lorsque Hephaistos est absent.

### RAG multimodal

- extraction texte Markdown, TXT et JSON ;
- extraction PDF avec Poppler ;
- OCR des PDF scannés avec OCRmyPDF ;
- OCR des images avec Tesseract ;
- extraction facultative des images PDF ;
- description des images avec un endpoint vision compatible OpenAI ;
- enrichissement par tags ;
- chunking avec chevauchement ;
- embeddings Mistral ;
- indexation Qdrant ;
- génération de `document.md`, `manifest.json`, `index.json` et `INDEX.md`.

## Prérequis

- Node.js 22 minimum ; Node.js 24 est préférable car OpenFox le demande ;
- npm 10 ou supérieur ;
- pour l’OCR local : Poppler, OCRmyPDF et Tesseract avec les langues nécessaires ;
- Qdrant pour l’index vectoriel ;
- une clé Mistral pour les embeddings ;
- un endpoint vision configuré seulement lorsque la description d’images doit sortir de la machine.

## Installation

```bash
git clone https://github.com/jeanCodeUnMax/projet-ide-open-ai.git
cd projet-ide-open-ai
git switch agent/ui-agents-rag
npm install
npm run check
npm start
```

## A2A local

```bash
npm run a2a:dev
```

Le serveur écoute par défaut sur `127.0.0.1:43110`.

```text
GET  /.well-known/agent-card.json
POST /message:send
GET  /tasks
GET  /tasks/{id}
POST /tasks/{id}:cancel
```

Exemple :

```bash
curl -X POST http://127.0.0.1:43110/message:send \
  -H "Content-Type: application/a2a+json" \
  -d '{
    "message": {
      "role": "ROLE_USER",
      "messageId": "demo-1",
      "parts": [{"text": "Prépare l’ingestion RAG du projet"}]
    }
  }'
```

## Connexion à Hephaistos-kit

Les routes réelles de Hephaistos restent configurables, car le projet ne doit pas supposer son API interne.

```bash
export HEPHAISTOS_BASE_URL=http://127.0.0.1:8787
export HEPHAISTOS_WORKSPACE_ID=my-workspace
export HEPHAISTOS_TOKEN=...
npm run a2a:dev
```

Contrat d’exemple : `config/hephaistos.example.json`.

## Ingestion d’un document RAG

Sans clé ni Qdrant, le pipeline produit quand même le Markdown, le manifeste, les tags et l’index documentaire. Les embeddings et l’upsert vectoriel sont alors indiqués comme ignorés.

```bash
npm run rag:ingest -- ./documents/rapport.pdf --workspace . --tag architecture
```

Avec Mistral et Qdrant :

```bash
export MISTRAL_API_KEY=...
export QDRANT_URL=http://127.0.0.1:6333
npm run rag:ingest -- ./documents/rapport.pdf --workspace .
```

Pour décrire les images :

```bash
export VISION_API_URL=https://ton-endpoint/v1/chat/completions
export VISION_MODEL=ton-modele-vision
export VISION_API_KEY=...
```

Les résultats sont créés dans :

```text
.ide-ai/rag/
├── index.json
├── INDEX.md
└── documents/<document-id>/
    ├── document.md
    └── manifest.json
```

## Configuration MCP

Ouvre `MCP > Gestionnaire MCP…`.

```json
{
  "name": "filesystem",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "${env:WORKSPACE_PATH}"]
}
```

## Vérification

```bash
npm run check
```

## Architecture et pilotage

- `config/app-schema.json` — source de vérité des services ;
- `docs/PROJECT-TRACKER.md` — état global, reprise, risques, backlog et trajectoire V1–V4 ;
- `docs/A2A-HEPHAISTOS-RAG.md` — architecture du noyau ;
- `docs/AGENTS-RAG-UI.md` — interface Agents et Knowledge ;
- `docs/ROADMAP.md` — étapes techniques suivantes ;
- `docs/ARCHITECTURE.md` — architecture Electron/OpenFox ;
- `docs/MCP-PARITY.md` — comparaison MCP ;
- `docs/SECURITY.md` — sécurité ;
- `docs/DELIVERY.md` — livraison.

## Limites actuelles

- le serveur A2A constitue une fondation compatible avec les concepts v1, pas encore une certification d’interopérabilité complète ;
- streaming, push notifications, signatures JWS et OAuth A2A restent à développer ;
- l’executor A2A de démonstration n’est pas encore relié à une session OpenFox ;
- les routes exactes de Hephaistos doivent être mappées sur son API réelle ;
- le branchement de l’executor A2A sur une session OpenFox réelle reste à réaliser ;
- la configuration visuelle détaillée de Hephaistos reste à mapper sur son contrat API réel.

## Origine

- OpenFox : `https://github.com/co-l/openfox`
- A2A : spécification officielle du projet A2A ;
- MCP : spécification officielle Model Context Protocol.
