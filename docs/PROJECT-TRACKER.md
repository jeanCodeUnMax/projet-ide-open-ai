# Tracker de projet — IDE Open AI

> Document de reprise, de pilotage et de synthèse.
>
> Dernière mise à jour : 13 juillet 2026  
> Version du document : 1.0  
> Version applicative suivie : MVP 0.3.0  
> Branche de référence : `agent/ui-agents-rag`

---

## 1. Objectif du projet

Construire un **AI Development Operating System** sous forme d’application Electron reposant sur OpenFox, capable de coordonner :

- l’utilisateur ;
- les modèles et agents ;
- les outils MCP ;
- la communication Agent-to-Agent ;
- la mémoire unifiée et le watchdog Hephaistos-kit ;
- l’ingestion et la recherche documentaire RAG ;
- les workflows de développement, de contrôle, de sécurité et de documentation.

L’objectif n’est pas de créer un simple IDE avec un chat, mais un environnement de travail où les agents peuvent :

1. comprendre le workspace ;
2. récupérer la mémoire utile ;
3. déléguer des tâches ;
4. appeler des outils ;
5. produire des artefacts ;
6. vérifier leur travail ;
7. conserver les preuves, décisions et connaissances produites.

---

## 2. Résumé exécutif

### État global

| Domaine | État | Commentaire |
|---|---|---|
| Socle Electron/OpenFox | 🟢 Développé | Code présent, lancement réel à valider sur le poste cible |
| Gestion MCP | 🟢 Développé | `stdio`, Streamable HTTP, limite de 100 outils, import/export et variables d’environnement |
| Noyau Agent-to-Agent | 🟢 Développé | Agent Cards, registre, tâches, messages, artefacts, client et serveur local |
| Hephaistos-kit | 🟡 Adaptateur prêt | Contrat HTTP réel à mapper et tester dans un workspace équipé |
| RAG texte | 🟢 Validé localement | Ingestion texte et génération des index vérifiées |
| OCR PDF et images | 🟡 Implémenté | Binaires et documents réels à tester sur le poste cible |
| Description d’images | 🟡 Implémentée | Endpoint vision réel à configurer et tester |
| Embeddings Mistral | 🟡 Implémentés | Appel réel à valider avec une clé |
| Qdrant | 🟡 Implémenté | Création de collection, upsert et recherche réels à valider |
| Interface Agents et Knowledge | 🟢 Développée | Rendu Electron réel à valider après installation |
| Recherche hybride | 🟢 Code testé | Recherche lexicale validée, branche vectorielle réelle à tester |
| Intégration A2A ↔ OpenFox | 🔴 À faire | L’executor de démonstration n’est pas encore relié aux sessions OpenFox |
| Préparation production | 🔴 Non commencée | Authentification, signatures, packaging validé et observabilité complète restent à réaliser |

### Situation GitHub

| Élément | État | Rôle |
|---|---|---|
| `main` | Stable mais incomplet | Contient seulement le point de départ minimal |
| PR #1 | Ouverte, brouillon, fusionnable | Socle Electron/OpenFox/MCP + A2A + Hephaistos + RAG multimodal |
| PR #2 | Ouverte, brouillon, fusionnable | Interface Agents/Knowledge + registre persistant + ingestion visuelle + recherche hybride |

Ordre obligatoire de fusion :

```text
PR #1 → main
PR #2 → main
```

La PR #2 dépend de la PR #1.

---

## 3. Ce qui a été livré

## 3.1 Socle Electron et OpenFox

- [x] application Electron ;
- [x] lancement supervisé d’OpenFox dans un processus Node séparé ;
- [x] profil OpenFox isolé du profil utilisateur ;
- [x] sélection du workspace ;
- [x] journaux runtime ;
- [x] redémarrage du moteur ;
- [x] restrictions Electron : `contextIsolation`, sandbox et IPC limité ;
- [x] configuration d’empaquetage Windows, Linux et macOS.

### À valider au retour

- [ ] `npm install` sur le poste réel ;
- [ ] `npm start` ;
- [ ] chargement complet de l’interface OpenFox ;
- [ ] changement de workspace ;
- [ ] arrêt et redémarrage propres ;
- [ ] packaging de la première version installable.

---

## 3.2 MCP

- [x] serveurs MCP `stdio` ;
- [x] serveurs MCP Streamable HTTP ;
- [x] activation et désactivation outil par outil ;
- [x] limite stricte de 100 outils actifs ;
- [x] import et export `mcp_config.json` ;
- [x] interpolation `${env:VARIABLE}` ;
- [x] conservation des placeholders dans la configuration exportée ;
- [x] test de connexion avant ajout d’un serveur ;
- [x] refus explicite du SSE non supporté par le moteur audité.

### À faire

- [ ] transport SSE ;
- [ ] OAuth MCP ;
- [ ] découverte des ressources MCP ;
- [ ] découverte des prompts MCP ;
- [ ] stockage des secrets dans le trousseau système ;
- [ ] politiques d’autorisation par agent et par outil ;
- [ ] marketplace et liste blanche des serveurs autorisés.

---

## 3.3 Agent-to-Agent

- [x] validation d’Agent Cards ;
- [x] Agent Card de l’orchestrateur ;
- [x] registre d’agents ;
- [x] recherche par tags et compétences ;
- [x] messages A2A ;
- [x] artefacts A2A ;
- [x] cycle de vie des tâches ;
- [x] transitions interdites contrôlées ;
- [x] client de découverte ;
- [x] client de délégation ;
- [x] serveur HTTP local ;
- [x] lecture, liste et annulation de tâches ;
- [x] registre persistant par workspace.

### À faire

- [ ] relier l’executor A2A aux sessions OpenFox ;
- [ ] streaming ;
- [ ] tâches asynchrones et abonnements ;
- [ ] push notifications ;
- [ ] authentification OAuth/OIDC ;
- [ ] signatures JWS des Agent Cards ;
- [ ] tests d’interopérabilité avec d’autres implémentations A2A ;
- [ ] budgets de temps, tokens et coût par tâche ;
- [ ] reprise après incident et idempotence.

---

## 3.4 Hephaistos-kit

### Ce qui existe

- [x] adaptateur HTTP configurable ;
- [x] vérification de santé ;
- [x] récupération de mémoire avant une tâche ;
- [x] récupération du contexte unifié ;
- [x] mémorisation du résultat après une tâche ;
- [x] événements watchdog : démarrage, réussite et échec ;
- [x] mode neutre lorsque Hephaistos n’est pas disponible ;
- [x] aucun second système mémoire recréé en parallèle.

### Ce qui manque

- [ ] connaître le contrat HTTP réel de Hephaistos-kit ;
- [ ] mapper les routes exactes ;
- [ ] mapper le format des requêtes et réponses ;
- [ ] identifier les niveaux ou événements watchdog réellement disponibles ;
- [ ] configurer Hephaistos par workspace depuis l’interface ;
- [ ] afficher les niveaux `std0`, `std1`, `std2` ;
- [ ] tester la récupération et l’écriture de mémoire réelles ;
- [ ] tester la reconnexion lorsque le service redémarre ;
- [ ] définir la politique de rétention et de confidentialité.

### Décision d’architecture

Hephaistos-kit reste la **source principale de mémoire et de supervision du workspace**. Le projet ne doit pas créer silencieusement une mémoire concurrente susceptible de produire des divergences.

---

## 3.5 RAG multimodal

### Pipeline développé

```text
Document
  ↓
Checksum SHA-256
  ↓
Extraction de texte native
  ↓
OCR PDF ou image
  ↓
Extraction des images
  ↓
Description des images
  ↓
Génération et enrichissement des tags
  ↓
Découpage en chunks avec chevauchement
  ↓
Embeddings
  ↓
Indexation Qdrant
  ↓
Manifestes et index documentaire
```

### Capacités livrées

- [x] Markdown ;
- [x] TXT ;
- [x] JSON ;
- [x] PDF texte avec Poppler ;
- [x] PDF scanné avec OCRmyPDF ;
- [x] images avec Tesseract ;
- [x] extraction des images PDF avec `pdfimages` ;
- [x] description visuelle via endpoint compatible OpenAI ;
- [x] tags déterministes ;
- [x] tags fournis manuellement ;
- [x] chunking avec chevauchement ;
- [x] embeddings Mistral ;
- [x] Qdrant ;
- [x] identifiants déterministes compatibles avec Qdrant ;
- [x] fichiers `document.md`, `manifest.json`, `index.json`, `INDEX.md` ;
- [x] isolation des erreurs document par document ;
- [x] glisser-déposer dans l’interface.

### Structure générée

```text
.ide-ai/rag/
├── index.json
├── INDEX.md
└── documents/
    └── <document-id>/
        ├── document.md
        └── manifest.json
```

### À valider au retour

- [ ] PDF contenant déjà du texte ;
- [ ] PDF entièrement scanné ;
- [ ] PDF mixte texte + images ;
- [ ] image contenant du texte français ;
- [ ] image contenant un diagramme ;
- [ ] tableau ;
- [ ] document volumineux ;
- [ ] document dupliqué ;
- [ ] document modifié puis réindexé ;
- [ ] document volontairement malveillant ou contenant une prompt injection.

### Améliorations possibles

- [ ] conserver les numéros de page précis ;
- [ ] lier chaque chunk à sa page et à sa zone ;
- [ ] conserver les coordonnées des blocs OCR ;
- [ ] ajouter les miniatures d’images ;
- [ ] détecter tableaux, diagrammes et code source ;
- [ ] produire des citations page/image/chunk ;
- [ ] dédupliquer les images et chunks ;
- [ ] ajouter une recherche BM25 dédiée ;
- [ ] ajouter un reranker ;
- [ ] détecter les contradictions entre documents ;
- [ ] versionner les connaissances et les embeddings ;
- [ ] déclencher une réindexation incrémentale via le watchdog.

---

## 3.6 Interface Agents et Knowledge

- [x] panneau Electron dédié ;
- [x] affichage de l’Agent Card intégrée ;
- [x] ajout d’un agent distant ;
- [x] rafraîchissement d’un agent ;
- [x] activation et désactivation ;
- [x] suppression ;
- [x] registre persistant dans `.ide-ai/agents/index.json` ;
- [x] sélection multiple de documents ;
- [x] glisser-déposer ;
- [x] affichage de la progression ;
- [x] affichage des documents indexés ;
- [x] affichage des tags, chunks et images ;
- [x] ouverture sécurisée du Markdown produit ;
- [x] recherche lexicale ;
- [x] recherche vectorielle optionnelle ;
- [x] fusion Reciprocal Rank Fusion ;
- [x] affichage du mode de recherche réellement utilisé ;
- [x] état de disponibilité Hephaistos.

### À améliorer

- [ ] afficher les logs détaillés d’une ingestion ;
- [ ] relancer uniquement une étape en échec ;
- [ ] supprimer ou réindexer un document ;
- [ ] filtrer par tags, type, date et source ;
- [ ] montrer la page et l’image d’origine d’un résultat ;
- [ ] afficher les scores lexicaux et vectoriels ;
- [ ] ajouter une vue graphe des relations ;
- [ ] permettre la création et l’édition d’Agent Cards ;
- [ ] exposer les niveaux watchdog.

---

## 4. Ce qui a fonctionné

### Tests automatisés

- **20 tests réussis** ;
- **0 échec** ;
- syntaxe JavaScript/ESM vérifiée ;
- sélecteurs HTML utilisés par le contrôleur vérifiés ;
- cycle de vie A2A vérifié ;
- registre persistant vérifié ;
- file d’ingestion et événements de progression vérifiés ;
- recherche lexicale vérifiée ;
- normalisation MCP et limite d’outils vérifiées.

### Tests fonctionnels réalisés

- découverte de l’Agent Card locale ;
- appel HTTP `message:send` ;
- création d’une tâche ;
- passage à `TASK_STATE_COMPLETED` ;
- génération d’un artefact ;
- ingestion réelle d’un fichier texte ;
- génération de `document.md` ;
- génération de `manifest.json` ;
- génération de `index.json` ;
- génération de `INDEX.md`.

---

## 5. Ce qui n’a pas pu être validé

Ces points ne sont pas nécessairement défaillants. Ils sont **non vérifiés dans un environnement réel**.

| Élément | Cause | Action de reprise |
|---|---|---|
| Installation npm complète | environnement de construction sans accès normal aux dépendances | exécuter `npm install` sur le poste cible |
| Démarrage Electron/OpenFox | dépendances non installées dans l’environnement de construction | exécuter `npm start` |
| OCR PDF réel | Poppler, OCRmyPDF et Tesseract non installés | installer les binaires et utiliser un corpus de test |
| Description d’images | aucun endpoint vision réel configuré | configurer URL, modèle et clé |
| Embeddings Mistral | aucune clé réelle utilisée | configurer la clé et vérifier dimensions/coût |
| Qdrant réel | aucun serveur Qdrant disponible | démarrer Qdrant et exécuter upsert/recherche |
| Hephaistos réel | contrat API non fourni | relever les routes et payloads du service |
| Packaging | Electron non lancé de bout en bout | générer l’installeur après validation runtime |
| Interopérabilité A2A | aucun agent externe de référence testé | créer une matrice de tests croisés |

---

## 6. Risques principaux

| Risque | Niveau | Réponse proposée |
|---|---:|---|
| Contrat Hephaistos différent des routes supposées | Élevé | construire un adaptateur de mapping et des tests contractuels |
| Incompatibilité Node/OpenFox/Electron | Élevé | figer les versions et tester Node 22 puis Node 24 |
| OCR trop lent sur gros PDF | Moyen | file de tâches, limites, parallélisme contrôlé et cache |
| Coût vision et embeddings | Moyen | budgets, métriques, tailles maximales et fournisseurs locaux optionnels |
| Prompt injection dans les documents | Élevé | séparer données et instructions, classer la confiance et filtrer les actions |
| RAG poisoning | Élevé | provenance, checksum, approbation des sources et versionnement |
| Trop d’outils MCP dans le contexte | Moyen | limite actuelle de 100, profils et sélection dynamique |
| Divergence entre mémoire Hephaistos et index RAG | Moyen | définir la responsabilité de chaque stockage et une stratégie de synchronisation |
| PR empilées fusionnées dans le mauvais ordre | Moyen | fusion obligatoire PR #1 puis PR #2 |
| Complexité excessive trop tôt | Élevé | livrer une V1 verticale testable avant d’ajouter le graphe et les agents spécialisés |

---

## 7. Plan de reprise au retour

## Étape 1 — Récupération Git

1. relire la PR #1 ;
2. fusionner la PR #1 dans `main` ;
3. rebaser ou retargeter la PR #2 si GitHub ne le fait pas automatiquement ;
4. relire la PR #2 ;
5. fusionner la PR #2 dans `main` ;
6. récupérer le dépôt :

```bash
git switch main
git pull origin main
```

## Étape 2 — Installation

```bash
node --version
npm --version
npm install
npm run check
```

Cible recommandée : Node.js 24 si OpenFox l’exige réellement dans l’environnement utilisé.

## Étape 3 — Premier démarrage

```bash
npm start
```

Vérifier :

- ouverture Electron ;
- chargement OpenFox ;
- menu MCP ;
- menu Agents et Knowledge ;
- changement de workspace ;
- journaux ;
- arrêt propre.

## Étape 4 — Hephaistos

Relever dans le service réel :

- URL de santé ;
- recherche mémoire ;
- écriture mémoire ;
- récupération du contexte ;
- événements watchdog ;
- authentification ;
- identifiant de workspace ;
- formats JSON exacts.

Mettre ensuite à jour l’adaptateur et ajouter des tests contractuels.

## Étape 5 — Corpus de validation RAG

Créer un dossier `test-corpus/` non versionné contenant :

1. PDF texte simple ;
2. PDF scanné ;
3. PDF avec images et diagrammes ;
4. image avec texte ;
5. image avec graphique ;
6. document long ;
7. doublon ;
8. document modifié ;
9. fichier corrompu ;
10. document contenant une prompt injection.

## Étape 6 — Qdrant, embeddings et vision

- démarrer Qdrant ;
- créer une collection de test ;
- configurer Mistral ;
- configurer un modèle vision ;
- ingérer le corpus ;
- vérifier recherche lexicale, vectorielle et hybride ;
- mesurer temps, coût, qualité et erreurs.

## Étape 7 — Décision de version V1

La V1 peut être déclarée terminée uniquement lorsque les critères de la section suivante sont validés.

---

## 8. Critères de fin de V1

### Obligatoires

- [ ] les deux PR sont fusionnées ;
- [ ] installation reproductible ;
- [ ] Electron et OpenFox démarrent ;
- [ ] au moins un MCP `stdio` fonctionne ;
- [ ] au moins un MCP HTTP fonctionne ;
- [ ] Agent Card locale découvrable ;
- [ ] tâche A2A exécutable depuis l’interface ou OpenFox ;
- [ ] connexion Hephaistos réelle ;
- [ ] récupération et écriture mémoire validées ;
- [ ] watchdog reçoit un événement ;
- [ ] PDF texte indexé ;
- [ ] PDF scanné OCRisé ;
- [ ] image décrite ;
- [ ] embeddings générés ;
- [ ] données indexées dans Qdrant ;
- [ ] recherche hybride renvoie un résultat pertinent ;
- [ ] citation vers document et chunk ;
- [ ] erreurs visibles et récupérables ;
- [ ] secrets absents du dépôt et des exports ;
- [ ] installeur de développement généré.

### Souhaitables

- [ ] métriques de durée et coût ;
- [ ] suppression et réindexation documentaire ;
- [ ] filtres par tags ;
- [ ] test de reprise après redémarrage ;
- [ ] documentation utilisateur courte.

---

## 9. Backlog priorisé

## P0 — Nécessaire pour obtenir une V1 réellement utilisable

- [ ] fusionner les PR #1 et #2 ;
- [ ] valider Electron/OpenFox ;
- [ ] mapper Hephaistos ;
- [ ] relier A2A aux sessions OpenFox ;
- [ ] valider OCR, vision, embeddings et Qdrant ;
- [ ] ajouter les citations document/page/image/chunk ;
- [ ] corriger les erreurs observées sur le poste réel ;
- [ ] produire un premier installeur.

## P1 — Qualité, sécurité et confort

- [ ] supprimer et réindexer un document ;
- [ ] filtres de recherche ;
- [ ] journal détaillé des tâches ;
- [ ] budgets et limites ;
- [ ] stockage sécurisé des secrets ;
- [ ] tests d’intégration ;
- [ ] tests de prompt injection et RAG poisoning ;
- [ ] score de confiance avec provenance ;
- [ ] sélection dynamique des outils MCP.

## P2 — Extension du produit

- [ ] agents spécialisés ;
- [ ] workflows séquentiels et parallèles ;
- [ ] graphe de connaissances ;
- [ ] back-office des vecteurs et clusters ;
- [ ] surveillance et réindexation par watchdog ;
- [ ] collaboration multi-utilisateurs ;
- [ ] marketplace d’agents et de MCP.

---

## 10. Roadmap des versions

## V1 — Workspace agentique fonctionnel

**But :** obtenir une application installable et utilisable sur un vrai workspace.

Contenu :

- Electron/OpenFox ;
- MCP gouverné ;
- A2A local ;
- Hephaistos réel ;
- RAG multimodal ;
- Qdrant ;
- interface Agents et Knowledge ;
- recherche hybride ;
- citations de base ;
- logs et erreurs exploitables.

La V1 privilégie une chaîne verticale complète plutôt que la multiplication des agents.

## V2 — Orchestration gouvernée

**But :** faire travailler plusieurs agents sans mélange de responsabilités.

Agents envisagés :

- planner ;
- code-worker ;
- reviewer ;
- test-runner ;
- security-auditor ;
- documentation-agent ;
- RAG-ingestion-agent.

Fonctions :

- pipeline séquentiel ;
- tâches parallèles contrôlées ;
- contrats d’entrée et sortie ;
- budgets ;
- revues indépendantes ;
- score de confiance ;
- preuves et décisions ;
- reprise sur échec.

## V3 — Knowledge Operating System

**But :** transformer les documents, décisions, code et résultats en connaissance exploitable.

Fonctions :

- graphe d’entités et relations ;
- provenance complète ;
- versionnement des connaissances ;
- détection de doublons ;
- détection de contradictions ;
- back-office des embeddings, clusters et liens ;
- mémoire courte, historique, vecteurs et graphe clairement séparés ;
- réindexation incrémentale pilotée par Hephaistos.

## V4 — Plateforme extensible et collaborative

**But :** faire du projet une plateforme de développement agentique complète.

Fonctions possibles :

- profils d’équipes ;
- espaces de travail partagés ;
- exécution distante ;
- marketplace d’agents ;
- marketplace MCP ;
- politiques d’entreprise ;
- audit et conformité ;
- synchronisation cloud ;
- observabilité globale ;
- évaluations automatiques ;
- plugins et SDK.

---

## 11. Idées à conserver pour plus tard

- vue visuelle des vecteurs, clusters, poids et relations ;
- liens virtuels entre concepts sans modifier les données sources ;
- représentation chronologique des actions et conséquences ;
- agent greffier qui documente les décisions ;
- score de maturité d’une connaissance selon le nombre de validations ;
- comparaison de réponses entre plusieurs modèles ;
- exécution locale prioritaire avec bascule API ;
- mode laboratoire pour tester des architectures alternatives ;
- mémoire condensée Agent-to-Agent ;
- tableaux Kanban, Eisenhower et Pomodoro intégrés au workspace ;
- Jarvis de progression personnelle et projet ;
- OCR vers Markdown/JSON conservant graphiques et images.

Ces idées ne doivent pas interrompre la finalisation de la V1. Elles restent dans le backlog V2–V4.

---

## 12. Règles de pilotage

1. Une fonctionnalité n’est pas « terminée » parce que le code existe : elle doit être testée dans son environnement réel.
2. Ne pas recréer un service déjà fourni par Hephaistos-kit.
3. A2A sert à la communication entre agents ; MCP sert à l’accès aux outils et ressources.
4. Chaque agent doit avoir un rôle limité et un contrat explicite.
5. Chaque tâche importante doit produire des artefacts et des preuves.
6. Aucun secret ne doit entrer dans Git ou dans les exports.
7. Les documents RAG sont des données non fiables, jamais des instructions privilégiées.
8. Les PR empilées doivent être fusionnées dans l’ordre de leurs dépendances.
9. Terminer une chaîne verticale V1 avant d’ouvrir trop de chantiers V2.
10. Mettre ce document à jour après chaque PR importante ou test d’intégration.

---

## 13. Format des prochaines mises à jour

Pour chaque nouvelle tranche, ajouter une entrée :

```text
Date :
Version :
Branche / PR :
Objectif :
Livré :
Tests réussis :
Tests échoués :
Non validé :
Décisions :
Risques nouveaux :
Prochaine action :
```

---

## 14. Prochaine action recommandée

La prochaine tranche de code doit rester limitée à :

1. liaison de l’executor A2A aux sessions OpenFox ;
2. citations précises document/page/image/chunk ;
3. configuration Hephaistos par workspace ;
4. affichage des événements watchdog ;
5. tests automatisés correspondants.

Les validations nécessitant le poste réel seront exécutées au retour avant de déclarer la V1 terminée.
