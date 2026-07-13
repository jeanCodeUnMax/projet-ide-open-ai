# Parité MCP : OpenFox, Windsurf et IDE Open AI

## Audit du moteur OpenFox

Le dépôt OpenFox analysé contient déjà :

- le SDK officiel `@modelcontextprotocol/sdk` ;
- les transports `stdio` et Streamable HTTP ;
- la connexion et reconnexion des serveurs ;
- la découverte des outils ;
- l’estimation de leur coût en tokens ;
- un cache de définitions quand le serveur est indisponible ;
- l’activation/désactivation outil par outil ;
- la persistance dans `config.json` ;
- une API REST et un onglet de réglages React.

## Écarts constatés par rapport au document Windsurf fourni

| Capacité | OpenFox audité | IDE Open AI MVP |
|---|---:|---:|
| stdio | Oui | Oui |
| Streamable HTTP | Oui | Oui |
| SSE | Non | Non, phase 2 |
| OAuth | Non identifié | Non, phase 2 |
| Activation par outil | Oui | Oui |
| Limite de 100 outils | Non | Oui, contrôle Electron |
| Import/export `mcpServers` | Configuration interne | Oui |
| `${env:VAR}` | Non identifié | Oui, résolution au lancement |
| Cache des outils | Oui | Hérité d’OpenFox |
| Resources MCP | Non | Non, phase 2 |
| Prompts MCP | Non | Non, phase 2 |
| Marketplace | Non | Non, phase 2 |
| Liste blanche administrateur | Non | Non, phase 3 |

## Phase 2 recommandée

1. Étendre `McpServerConfig.transport` à `stdio | http | sse`.
2. Ajouter `SSEClientTransport` du SDK MCP et une migration de configuration.
3. Introduire un gestionnaire OAuth avec stockage dans le trousseau système Electron.
4. Découvrir `resources/list` et `prompts/list`, puis les rendre disponibles via des outils internes dédiés.
5. Déporter la limite de 100 outils dans le moteur OpenFox afin qu’elle soit respectée par toutes les interfaces, pas seulement Electron.
