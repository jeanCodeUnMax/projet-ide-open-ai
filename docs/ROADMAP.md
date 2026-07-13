# Roadmap IDE Open AI

## Phase 0 — Socle livré

- application Electron autour d’OpenFox ;
- gestionnaire MCP `stdio` et Streamable HTTP ;
- limite de 100 outils ;
- interpolation des variables d’environnement ;
- configuration et journalisation isolées.

## Phase 1 — Branche `agent/a2a-rag-hephaistos`

- [x] source de vérité `config/app-schema.json` ;
- [x] Agent Card de l’orchestrateur ;
- [x] registre et cycle de vie des tâches A2A ;
- [x] client et serveur A2A HTTP local ;
- [x] adaptateur configurable Hephaistos mémoire/watchdog ;
- [x] pipeline OCR PDF et images ;
- [x] description d’images via endpoint vision ;
- [x] tags déterministes ;
- [x] embeddings Mistral ;
- [x] upsert Qdrant ;
- [x] `index.json`, `INDEX.md`, `manifest.json`, `document.md` ;
- [x] tests unitaires du noyau.

## Phase 2 — Intégration IDE

- [x] panneau Agents et Agent Cards ;
- [x] panneau RAG avec glisser-déposer ;
- [x] état visuel de l’ingestion par étape ;
- [x] recherche hybride lexicale + Qdrant avec RRF ;
- [ ] citations vers page, image et chunk ;
- [ ] liaison réelle entre l’executor A2A et les sessions OpenFox ;
- [ ] configuration Hephaistos par workspace avec validation de contrat ;
- [ ] affichage std0/std1/std2 du watchdog.

## Phase 3 — Protocoles complets

- [ ] streaming A2A ;
- [ ] tâches asynchrones et abonnements ;
- [ ] push notifications ;
- [ ] signatures JWS des Agent Cards ;
- [ ] OAuth/OIDC et scopes par compétence ;
- [ ] tests d’interopérabilité A2A v1 ;
- [ ] SSE MCP, resources et prompts MCP ;
- [ ] pont A2A ↔ MCP avec politiques d’autorisation.

## Phase 4 — Orchestration gouvernée

- [ ] planner ;
- [ ] code-worker ;
- [ ] reviewer indépendant ;
- [ ] security-auditor ;
- [ ] test-runner ;
- [ ] documentation-agent ;
- [ ] exécution séquentielle ou parallèle avec budget ;
- [ ] score de confiance et preuves ;
- [ ] défense contre prompt injection, RAG poisoning et tool abuse.

## Phase 5 — Knowledge Operating System

- [ ] graphe d’entités et relations ;
- [ ] back-office des embeddings, poids et clusters ;
- [ ] mémoire courte Redis, historique PostgreSQL, vecteurs Qdrant, graphe ;
- [ ] provenance et versionnement des connaissances ;
- [ ] détection des doublons et contradictions ;
- [ ] réindexation incrémentale pilotée par watchdog.
