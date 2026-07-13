# Brainstorming — laboratoire d’idées

> Branche dédiée : `brainstorming`  
> Statut : idées, hypothèses, pistes business et protocoles expérimentaux.  
> Cette branche ne doit jamais modifier le chemin critique de la V1 sans décision explicite.

## Rôle de cette branche

Cette branche sert de mémoire durable pour les idées qui méritent d’être conservées, structurées et éventuellement expérimentées plus tard, sans perturber les branches de développement.

Elle contient :

- les hypothèses de recherche ;
- les idées de protocoles ;
- les pistes business ;
- les expériences envisagées ;
- les critères permettant de décider si une idée doit entrer dans la roadmap produit ;
- les liens avec les issues GitHub correspondantes.

## Règle de gouvernance

Une idée suit le cycle suivant :

```text
Idée brute
→ clarification
→ document de brainstorming
→ hypothèse testable
→ protocole expérimental
→ benchmark
→ décision : adopter / modifier / abandonner
```

Aucune idée de cette branche ne devient une fonctionnalité de production sans :

1. un besoin identifié ;
2. un périmètre clair ;
3. des critères de réussite ;
4. un prototype isolé ;
5. une validation technique et sécurité ;
6. une décision explicite dans le tracker principal.

## Idées actuellement conservées

### 1. LCX — Latent Context Exchange

Communication machine-to-machine entre agents par représentations latentes, embeddings, tenseurs, états cachés, graphes ou éléments de KV-cache, avec un canal textuel réservé à l’audit humain.

- Document : [`LCX-LATENT-CONTEXT-EXCHANGE.md`](./LCX-LATENT-CONTEXT-EXCHANGE.md)
- Issue : [#3 — R&D V5 — Latent Context Exchange entre agents](https://github.com/jeanCodeUnMax/projet-ide-open-ai/issues/3)
- Horizon : V5 / laboratoire R&D
- État : réflexion, aucune intégration dans la V1

### 2. Semantic Data Foundry

Transformation de corpus métier en connaissances structurées, jeux d’évaluation, datasets experts, graphes sémantiques et artefacts pédagogiques, avec preuve de provenance et gain mesurable.

- Document : [`SEMANTIC-DATA-FOUNDRY.md`](./SEMANTIC-DATA-FOUNDRY.md)
- Issue : [#4 — R&D / Business — Semantic Data Foundry](https://github.com/jeanCodeUnMax/projet-ide-open-ai/issues/4)
- Horizon : après stabilisation du produit principal
- État : réflexion business/R&D, aucun développement dans la V1

## Relation avec les autres branches

```text
main
└── version stable

agent/a2a-rag-hephaistos
└── socle technique

agent/ui-agents-rag
└── interface Agents / Knowledge et tracker

brainstorming
└── mémoire des idées, hypothèses et futurs laboratoires
```

La branche `brainstorming` est volontairement longue durée. Elle peut recevoir régulièrement de nouveaux documents sans ouvrir automatiquement une Pull Request vers `main`.

## Format recommandé pour une nouvelle idée

Chaque nouveau document devrait contenir :

```text
Titre
Statut
Problème observé
Intuition
Hypothèse testable
Valeur potentielle
Architecture envisagée
Risques
Expérience minimale
Mesures
Critère de réussite
Décision actuelle
Liens vers issues et travaux connexes
```

## Décision actuelle

Le développement reste concentré sur :

1. Electron / OpenFox ;
2. MCP ;
3. Agent-to-Agent ;
4. Hephaistos-kit ;
5. RAG, OCR, vision et Qdrant ;
6. orchestration et gouvernance.

Les idées de cette branche sont conservées, mais ne doivent rien casser ni ralentir dans la roadmap active.