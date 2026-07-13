# Roadmap IDE Open AI

## Phase 0 — Socle livré

- application Electron autour d’OpenFox ;
- gestionnaire MCP `stdio` et Streamable HTTP ;
- limite de 100 outils ;
- interpolation des variables d’environnement ;
- configuration et journalisation isolées.

## Phase 1 — Noyau A2A, Hephaistos et RAG

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

## Phase 2 — Intégration IDE et exécution réelle

- [x] panneau Agents et Agent Cards ;
- [x] panneau RAG avec glisser-déposer ;
- [x] état visuel de l’ingestion par étape ;
- [x] recherche hybride lexicale + Qdrant avec RRF ;
- [x] citations vers document, checksum, page, image et chunk ;
- [x] bridge réel entre une tâche A2A et une session OpenFox ;
- [x] persistance `contextId A2A → sessionId OpenFox` ;
- [x] annulation A2A propagée à OpenFox ;
- [ ] démarrage et arrêt automatiques du bridge dans Electron ;
- [ ] gestion visuelle des sessions A2A/OpenFox ;
- [ ] configuration Hephaistos par workspace avec validation de contrat ;
- [ ] affichage std0/std1/std2 du watchdog.

## Phase 3 — Protocoles et sécurité renforcée

- [x] boucle locale A2A sécurisée par défaut ;
- [x] shared token, limites de charge, débit et concurrence ;
- [x] en-têtes HTTP de sécurité et identifiants de requête ;
- [x] séparation des instructions et sources RAG non fiables ;
- [ ] streaming A2A ;
- [ ] tâches asynchrones persistantes et abonnements ;
- [ ] push notifications ;
- [ ] signatures JWS des Agent Cards ;
- [ ] OAuth/OIDC et scopes par compétence ;
- [ ] coffre système et rotation des secrets ;
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
- [ ] défense approfondie contre prompt injection, RAG poisoning et tool abuse.

## Phase 5 — Knowledge Operating System

- [ ] graphe d’entités et relations ;
- [ ] back-office des embeddings, poids et clusters ;
- [ ] mémoire courte Redis, historique PostgreSQL, vecteurs Qdrant, graphe ;
- [ ] provenance et versionnement des connaissances ;
- [ ] détection des doublons et contradictions ;
- [ ] réindexation incrémentale pilotée par watchdog.
