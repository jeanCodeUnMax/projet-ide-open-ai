# DEV Tracker — MCP Security Gateway

> Statut : conception terminée, implémentation différée
> Branche : `security/mcp-security-gateway`
> Date : 2026-07-15

## États

- `[ ]` à faire
- `[~]` en cours
- `[x]` terminé
- `[!]` bloqué
- `[-]` différé

## Livrables de conception

- [x] PRD du MCP Security Gateway
- [x] analyse de faisabilité
- [x] architecture gateway transparente
- [x] stratégie proxy HTTP
- [x] stratégie wrapper `stdio`
- [x] modèle `execution_id`
- [x] capacités éphémères à usage unique
- [x] anti-rejeu, révocation et suspension
- [x] règles de confirmation humaine
- [x] stratégie de coffre de secrets
- [x] plan de migration progressif

## Phase 0 — Threat model et politique

- [ ] formaliser les frontières de confiance
- [ ] créer `config/security-policy.schema.json`
- [ ] créer `security-policy-store.mjs`
- [ ] créer `security-gate.mjs`
- [ ] décisions `ALLOW/WARN/CONFIRM/BLOCK`
- [ ] classifications READ/WRITE/DESTRUCTIVE/NETWORK/EXECUTION/ADMIN
- [ ] mode `monitor/protected/locked`
- [ ] tests unitaires de politique

## Phase 1 — Identité et capacités

- [ ] `ide_instance_id`
- [ ] session gateway rotative
- [ ] `execution_id` unique par appel
- [ ] token opaque 256 bits
- [ ] TTL 30 secondes
- [ ] usage unique
- [ ] audience par MCP
- [ ] scope par outil
- [ ] liaison au workspace
- [ ] liaison aux arguments sensibles
- [ ] table anti-rejeu en mémoire
- [ ] tests de concurrence

## Phase 2 — Journal de sécurité

- [ ] événements corrélés par `execution_id`
- [ ] redaction secrets/tokens/headers
- [ ] rotation et rétention
- [ ] export expurgé
- [ ] tests avec secrets canaris

## Phase 3 — Mode observation

- [ ] feature flag `OPENAI_IDE_MCP_GATEWAY`
- [ ] décisions théoriques sans blocage
- [ ] rapport de migration MCP
- [ ] mesure des faux positifs
- [ ] non-régression OpenFox

## Phase 4 — Proxy MCP HTTP

- [ ] serveur loopback dynamique
- [ ] authentification de session
- [ ] routes par serveur
- [ ] JSON et SSE
- [ ] gestion `Mcp-Session-Id`
- [ ] HTTPS distant obligatoire
- [ ] validation Origin
- [ ] protection DNS rebinding
- [ ] limites de taille et timeout
- [ ] réécriture de la configuration OpenFox
- [ ] rollback vers mode observation

## Phase 5 — Wrapper MCP `stdio`

- [ ] wrapper Node interne
- [ ] lancement du vrai MCP
- [ ] environnement minimal
- [ ] framing JSON-RPC
- [ ] séparation stdout/stderr
- [ ] interception `tools/call`
- [ ] confirmation asynchrone
- [ ] arrêt de l’arbre processus
- [ ] tests Windows `.cmd/.exe`
- [ ] tests de processus orphelin

## Phase 6 — Security Center

- [ ] vue générale
- [ ] vue MCP
- [ ] profils `monitor/protected/locked`
- [ ] sessions actives
- [ ] révocation et suspension
- [ ] journal
- [ ] confirmations humaines
- [ ] exceptions temporaires
- [ ] intégration au gestionnaire MCP

## Phase 7 — Coffre de secrets

- [ ] `safeStorage` Electron
- [ ] fichier chiffré hors workspace
- [ ] placeholder `${vault:NOM}`
- [ ] résolution dans Electron Main uniquement
- [ ] secret par service
- [ ] migration assistée depuis `.env`
- [ ] rotation recommandée pour secrets déjà committés

## Phase 8 — Enforcement

- [ ] HTTP en mode `protected`
- [ ] `stdio` en mode `protected`
- [ ] confirmation des actions destructives
- [ ] mode `locked`
- [ ] suppression du bypass direct en production
- [ ] tests de sécurité complets

## Critères de sortie

- [ ] aucun appel MCP OpenFox ne contourne le gateway
- [ ] chaque appel possède un `execution_id`
- [ ] un token rejoué est refusé
- [ ] un token d’un autre MCP est refusé
- [ ] un changement de workspace invalide la session
- [ ] une suppression demande confirmation
- [ ] les secrets n’atteignent jamais le renderer
- [ ] aucun secret ou token complet dans les logs
- [ ] les MCP HTTP non TLS sont bloqués par défaut
- [ ] les MCP `stdio` existants fonctionnent via wrapper
- [ ] `npm run check` et CI verts

## Décision de clôture

La conception sécurité est suffisamment définie pour être mise en pause. Aucun changement runtime MCP n’est activé dans cette branche. La prochaine initiative est la migration d’IDE Open AI vers une vraie plateforme IDE open source.
