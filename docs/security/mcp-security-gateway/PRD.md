# PRD — MCP Security Gateway

> Projet : IDE Open AI
> Branche : `security/mcp-security-gateway`
> Statut : Proposed
> Version : 1.0.0
> Date : 2026-07-15

## 1. Résumé

IDE Open AI doit empêcher qu’un agent, une page renderer, un processus externe ou un serveur MCP compromis puisse appeler librement les outils MCP configurés par l’utilisateur.

La solution cible est un **MCP Security Gateway** possédé par le processus principal Electron. OpenFox ne contacte plus directement les serveurs MCP : il passe par un wrapper ou un proxy local contrôlé par l’application.

Le gateway fournit :

- authentification de l’instance IDE ;
- identifiant unique pour chaque exécution ;
- autorisation par serveur, outil, workspace et paramètres ;
- jetons éphémères et non rejouables ;
- confirmations humaines pour les actions sensibles ;
- révocation, suspension et rotation des sessions ;
- journal local expurgé ;
- intégration au Security Center.

## 2. Problème

### 2.1 Architecture actuelle

La configuration MCP canonique est validée et stockée par IDE Open AI, puis résolue et copiée dans la configuration OpenFox. OpenFox lance directement les MCP `stdio` ou contacte directement les MCP HTTP.

Conséquences :

- la politique de sécurité n’est pas évaluée à chaque appel d’outil ;
- un secret MCP peut être injecté dans un processus sans contrôle fin par outil ;
- un MCP HTTP peut recevoir des requêtes sans audience ou scope vérifié par IDE Open AI ;
- les opérations sensibles ne disposent pas d’un identifiant d’exécution uniforme ;
- la révocation et l’anti-rejeu ne sont pas centralisés ;
- le journal de sécurité ne voit pas nécessairement toutes les exécutions.

### 2.2 Menaces couvertes

- appel MCP déclenché par une injection de prompt indirecte ;
- appel depuis un renderer compromis ;
- MCP HTTP accessible par un autre client local ou distant ;
- réutilisation d’un jeton volé ;
- élévation de privilèges d’un outil de lecture vers écriture ou suppression ;
- modification des paramètres après autorisation ;
- utilisation d’un jeton destiné à un autre MCP ;
- lancement d’un paquet MCP non approuvé ou non épinglé ;
- fuite de secrets dans les logs, le renderer ou le contexte LLM ;
- déni de service par révocation abusive de jetons valides.

## 3. Objectifs

### 3.1 Objectifs fonctionnels

1. Tous les appels MCP configurés dans IDE Open AI passent par le gateway.
2. Chaque appel reçoit un `execution_id` unique et traçable.
3. Chaque appel est évalué par une politique centrale avant transmission.
4. Les autorisations sont liées au MCP, à l’outil, au workspace et, selon le niveau de risque, aux paramètres.
5. Les capacités sensibles utilisent un jeton éphémère à usage unique.
6. Les actions destructives ou externes peuvent exiger une confirmation humaine.
7. Les sessions et jetons peuvent être révoqués depuis le Security Center.
8. Les secrets restent dans le processus principal ou dans un coffre OS.
9. Les logs ne contiennent jamais la valeur complète d’un secret ou d’un jeton.
10. Le mode normal reste compatible avec les MCP `stdio` et HTTP existants.

### 3.2 Objectifs non fonctionnels

- surcoût cible inférieur à 10 ms pour une décision locale simple ;
- aucun appel réseau requis pour évaluer une politique locale ;
- comportement déterministe et testable ;
- fonctionnement Windows prioritaire, sans verrouiller Linux/macOS ;
- absence de modification automatique du code utilisateur ;
- migration progressive, avec retour arrière possible ;
- panne du gateway : échec fermé en modes `protected` et `locked`, avertissement en mode `monitor`.

## 4. Hors périmètre initial

- empêcher toute application locale de lancer indépendamment un serveur MCP tiers `stdio` ;
- modifier tous les serveurs MCP tiers pour qu’ils valident eux-mêmes les jetons IDE ;
- remplacer OAuth pour les MCP HTTP distants ;
- fournir une sandbox système complète par conteneur ou VM ;
- créer automatiquement des règles pare-feu administrateur ;
- analyser sémantiquement tous les paramètres d’outils avec un LLM ;
- garantir une protection contre un malware exécuté avec les mêmes droits que l’utilisateur.

## 5. Principes de sécurité

### 5.1 Aucun accès MCP direct

```text
OpenFox / agent
      |
      v
MCP Security Gateway — Electron Main
      |
      +--> wrapper stdio --> MCP stdio réel
      |
      +--> proxy HTTP ----> MCP HTTP réel
```

Le fichier OpenFox généré ne contient plus la commande ou l’URL réelle comme destination directe. Il contient uniquement les endpoints ou wrappers du gateway.

### 5.2 Séparation des identifiants

- `ide_instance_id` : instance courante de l’application ;
- `gateway_session_id` : session authentifiée OpenFox → gateway ;
- `execution_id` : traçabilité d’un appel précis ;
- `capability_token` : autorisation éphémère d’une action ;
- `mcp_session_id` : session protocolaire MCP HTTP éventuelle ;
- `upstream_access_token` : jeton OAuth ou secret du serveur distant.

Ces valeurs ne sont pas interchangeables.

### 5.3 Capabilities minimales

Une autorisation n’accorde que le minimum nécessaire :

```json
{
  "audience": "mcp:filesystem",
  "tool": "read_file",
  "scopes": ["filesystem:read"],
  "workspaceHash": "sha256:...",
  "argumentsHash": "sha256:...",
  "expiresInSeconds": 30,
  "maxUses": 1
}
```

### 5.4 Anti-rejeu

Le gateway maintient en mémoire l’état des capacités :

```text
issued -> consumed
issued -> expired
issued -> revoked
```

Toute deuxième utilisation est refusée.

### 5.5 Pas de révocation au premier appel invalide

Un seul appel invalide est refusé et journalisé. Il ne révoque pas automatiquement une exécution légitime, afin d’éviter un déni de service.

Politique par défaut :

- 1 anomalie : refus + log ;
- 3 anomalies en 10 secondes : rotation de session et suspension du MCP ;
- récidive : blocage jusqu’à validation humaine.

## 6. Profils de sécurité

### 6.1 `monitor`

- évalue et journalise ;
- ne bloque pas les appels existants ;
- affiche la décision qui aurait été appliquée ;
- destiné à la migration et au diagnostic.

### 6.2 `protected` — défaut recommandé

- bloque les appels critiques ;
- confirme les actions sensibles ;
- autorise automatiquement les lectures locales approuvées ;
- interdit les binds publics et les endpoints HTTP distants non approuvés.

### 6.3 `locked`

- tout est refusé sauf règle explicite ;
- chaque MCP doit être approuvé ;
- chaque outil possède des scopes explicites ;
- les exceptions sont temporaires ;
- la panne du gateway bloque toute exécution MCP.

## 7. Classification des outils

| Classe | Exemples | Politique par défaut |
|---|---|---|
| READ | read, search, list, inspect | autorisation automatique courte |
| WRITE | create, update, write | règle explicite ou confirmation |
| DESTRUCTIVE | delete, reset, force push, drop | confirmation humaine + usage unique |
| NETWORK | upload, send, HTTP externe, email | domaine approuvé ou confirmation |
| EXECUTION | shell, package install, script | liste blanche ou confirmation |
| ADMIN | modifier MCP, permissions, hooks | bloqué par défaut |

La classification manuelle peut être complétée par des heuristiques, mais une description de serveur MCP ne suffit jamais comme preuve de sécurité.

## 8. Conception des jetons

### 8.1 Décision MVP

Le MVP utilise des **jetons opaques aléatoires de 256 bits**, conservés uniquement en mémoire par le gateway.

Avantages :

- pas de clé JWT à distribuer ;
- révocation immédiate ;
- données sensibles absentes du jeton transmis ;
- implémentation plus simple à auditer.

Une version JWT/DPoP pourra être ajoutée pour les serveurs compatibles ou distribués.

### 8.2 Enregistrement interne

```ts
interface ExecutionCapability {
  tokenHash: string
  executionId: string
  instanceId: string
  gatewaySessionId: string
  serverName: string
  audience: string
  toolName: string
  scopes: string[]
  workspaceHash: string
  argumentsHash?: string
  issuedAt: string
  expiresAt: string
  maxUses: 1
  uses: 0 | 1
  status: 'issued' | 'consumed' | 'expired' | 'revoked'
}
```

Le token brut n’est jamais logué ni persisté.

### 8.3 Liaison aux paramètres

Obligatoire pour :

- suppression ;
- écriture hors fichier temporaire ;
- commande shell ;
- `git push` et opérations d’historique ;
- requête réseau contenant des données ;
- installation de dépendance.

Le hash est produit à partir d’une représentation JSON canonique.

## 9. Authentification du canal OpenFox → Gateway

Au démarrage :

1. Electron crée `ide_instance_id` et un secret de session aléatoire.
2. Le secret est injecté uniquement dans le processus OpenFox ou dans le wrapper contrôlé.
3. Le gateway valide le secret avant toute initialisation MCP.
4. Le secret est renouvelé à chaque redémarrage d’OpenFox ou changement de workspace.
5. Le renderer ne reçoit jamais ce secret.

Pour HTTP local :

```http
Authorization: Bearer <gateway_session_secret>
X-IDE-Instance-Id: <instance_id>
```

Pour `stdio`, le wrapper hérite d’un secret de bootstrap via un environnement minimal et authentifie le premier échange interne.

## 10. Transport `stdio`

### 10.1 Stratégie

OpenFox lance un wrapper fourni par IDE Open AI :

```text
node mcp-gateway-stdio.mjs --server filesystem
```

Le wrapper :

1. s’authentifie auprès du gateway ;
2. lance le vrai MCP avec une configuration validée ;
3. intercepte les messages JSON-RPC ;
4. demande une décision pour chaque `tools/call` ;
5. transmet uniquement les appels autorisés ;
6. redige les logs ;
7. arrête le sous-processus en cas de révocation.

### 10.2 Limite assumée

Un MCP tiers `stdio` ne vérifie pas forcément les jetons IDE. La barrière est donc le wrapper et le contrôle du processus lancé par IDE Open AI. Cela protège les appels issus d’OpenFox, mais n’empêche pas une autre application locale de lancer séparément le même paquet.

### 10.3 Renforcement optionnel

Pour les MCP contrôlés par le projet :

- protocole de bootstrap propriétaire ;
- vérification du parent ;
- secret de session ;
- fermeture immédiate sans preuve valide.

## 11. Transport HTTP

### 11.1 Stratégie

OpenFox contacte un proxy local unique :

```text
http://127.0.0.1:<gatewayPort>/mcp/<serverName>
```

Le proxy :

- valide l’instance et la session ;
- valide `Origin` lorsqu’il est pertinent ;
- applique la politique par outil ;
- ajoute les credentials amont ;
- conserve séparément le `Mcp-Session-Id` ;
- ne transmet jamais le token interne IDE au serveur amont ;
- limite la taille, la durée et le débit ;
- force HTTPS pour un serveur distant sauf exception explicite.

### 11.2 OAuth MCP

Pour un serveur HTTP protégé, le gateway agit comme client MCP OAuth et respecte :

- jeton dans l’en-tête `Authorization` ;
- audience/resource liée au serveur cible ;
- jetons courts ;
- refus des jetons invalides ou expirés ;
- absence de token passthrough vers une API tierce.

### 11.3 DPoP optionnel

DPoP pourra être activé lorsqu’un serveur et son fournisseur OAuth le supportent, afin de lier le jeton à une clé de preuve possédée par IDE Open AI.

## 12. Gestion des secrets

### 12.1 Règles

- aucun secret dans le renderer ;
- aucun secret complet dans les logs ;
- aucun secret complet dans les erreurs ;
- aucun secret transmis à un MCP qui n’en a pas besoin ;
- résolution `${vault:NOM}` uniquement dans Electron Main ;
- environnement du sous-processus filtré par serveur ;
- rotation et révocation accessibles dans le Security Center.

### 12.2 Coffre

Le coffre cible utilise `safeStorage` Electron et un fichier chiffré hors workspace. Le coffre n’est pas requis pour le premier prototype du gateway, mais son interface doit être prévue dès le modèle de données.

## 13. Security Center

### 13.1 Vue MCP

Pour chaque serveur :

- transport ;
- origine réelle ;
- état de confiance ;
- version épinglée ou non ;
- scopes autorisés ;
- outils actifs ;
- dernière exécution ;
- anomalies ;
- session active ;
- bouton suspendre ;
- bouton révoquer ;
- bouton rotation ;
- bouton consulter le journal.

### 13.2 Confirmation

Une confirmation doit afficher :

- acteur ;
- MCP ;
- outil ;
- paramètres résumés et expurgés ;
- fichiers ou domaine affectés ;
- raison de la demande ;
- durée de l’exception ;
- choix : refuser, autoriser une fois, autoriser pour la session.

L’option permanente n’est proposée que dans les paramètres avancés.

## 14. Modèle de politique

```json
{
  "version": 1,
  "mode": "protected",
  "mcpGateway": {
    "enabled": true,
    "requireGateway": true,
    "tokenTtlSeconds": 30,
    "maxTokenUses": 1,
    "bindToWorkspace": true,
    "bindSensitiveCallsToArguments": true,
    "suspendAfterInvalidAttempts": 3,
    "invalidAttemptWindowSeconds": 10,
    "suspensionSeconds": 300
  },
  "servers": {
    "filesystem": {
      "trust": "approved",
      "allowedScopes": ["filesystem:read", "filesystem:write"],
      "confirmScopes": ["filesystem:delete"],
      "allowedWorkspace": "current",
      "network": "none"
    }
  }
}
```

## 15. API interne proposée

```ts
securityGate.authorize({
  actor,
  serverName,
  toolName,
  arguments,
  workspace,
  gatewaySessionId,
})
```

Résultat :

```ts
type SecurityDecision =
  | { status: 'allow'; executionId: string; capabilityToken: string }
  | { status: 'warn'; executionId: string; capabilityToken: string; warnings: string[] }
  | { status: 'confirm'; requestId: string; reason: string; summary: object }
  | { status: 'block'; executionId: string; code: string; reason: string }
```

## 16. Journal d’audit

Chaque entrée contient :

- horodatage ;
- `execution_id` ;
- instance et session ;
- serveur et outil ;
- classe de risque ;
- décision ;
- durée ;
- résultat ;
- raison de blocage ;
- empreinte des paramètres ;
- aucune valeur secrète.

Rétention par défaut : 30 jours ou 10 000 événements, avec rotation.

## 17. Gestion des erreurs

| Code | Sens |
|---|---|
| `GATEWAY_AUTH_REQUIRED` | canal OpenFox non authentifié |
| `GATEWAY_SESSION_REVOKED` | session révoquée |
| `CAPABILITY_EXPIRED` | jeton expiré |
| `CAPABILITY_REPLAYED` | jeton déjà consommé |
| `MCP_NOT_APPROVED` | serveur non approuvé |
| `TOOL_NOT_ALLOWED` | scope absent |
| `ARGUMENTS_CHANGED` | paramètres différents de l’autorisation |
| `WORKSPACE_MISMATCH` | workspace différent |
| `HUMAN_APPROVAL_REQUIRED` | confirmation requise |
| `MCP_SUSPENDED` | serveur suspendu après anomalies |

## 18. Migration

### Phase 0 — observation

- créer le moteur de politique ;
- journaliser les décisions théoriques ;
- ne pas modifier le routage MCP.

### Phase 1 — HTTP proxy

- router les MCP HTTP via le proxy local ;
- conserver les MCP `stdio` directs ;
- valider auth, scopes et logs.

### Phase 2 — wrapper `stdio`

- réécrire la configuration OpenFox générée ;
- lancer les MCP `stdio` via le wrapper ;
- activer le contrôle `tools/call`.

### Phase 3 — enforcement

- activer `protected` par défaut ;
- confirmations et révocations ;
- intégration Security Center.

### Phase 4 — coffre et OAuth renforcé

- `${vault:NOM}` ;
- coffre OS ;
- OAuth MCP complet ;
- DPoP lorsqu’il est supporté.

## 19. Critères d’acceptation

1. Aucun serveur MCP configuré ne reçoit un appel OpenFox sans passage par le gateway.
2. Chaque `tools/call` possède un `execution_id` unique.
3. Un jeton expiré est refusé.
4. Un jeton consommé est refusé à la seconde utilisation.
5. Un jeton `filesystem` ne fonctionne pas sur `github`.
6. Un changement de workspace invalide les sessions antérieures.
7. Une modification des paramètres sensibles après autorisation est refusée.
8. Un appel de lecture approuvé ne demande pas de confirmation en mode `protected`.
9. Une suppression demande confirmation et utilise une capacité à usage unique.
10. Trois anomalies rapprochées suspendent le serveur sans permettre une révocation triviale par un seul faux appel.
11. Les secrets et tokens n’apparaissent ni dans les logs ni dans le renderer.
12. Les MCP HTTP distants non TLS sont bloqués par défaut.
13. Les MCP `stdio` existants restent fonctionnels via le wrapper.
14. Le mode `monitor` produit les mêmes résultats fonctionnels qu’avant le gateway.
15. Le mode `locked` refuse toute action sans règle explicite.

## 20. Tests requis

### Unitaires

- génération de tokens ;
- expiration ;
- consommation unique ;
- audience ;
- scopes ;
- hash workspace ;
- hash paramètres ;
- compteur d’anomalies ;
- redaction.

### Intégration

- OpenFox → proxy HTTP → MCP factice ;
- OpenFox → wrapper stdio → MCP factice ;
- changement de workspace ;
- rotation de session ;
- révocation pendant une exécution ;
- timeout ;
- crash du MCP ;
- crash du gateway.

### Sécurité

- rejeu ;
- token volé ;
- audience incorrecte ;
- paramètres modifiés ;
- accès renderer ;
- fuite dans stderr ;
- DNS rebinding sur le proxy local ;
- HTTP distant ;
- paquet MCP non épinglé ;
- déni de service par requêtes invalides.

### Non-régression

- gestionnaire MCP ;
- OpenFox ;
- Ollama ;
- workflows ;
- explorateur ;
- RAG ;
- A2A ;
- audit sécurité existant.

## 21. Métriques

- taux d’appels autorisés, confirmés et bloqués ;
- temps moyen de décision ;
- nombre de replays détectés ;
- nombre de suspensions ;
- nombre de secrets expurgés ;
- taux de confirmations acceptées/refusées ;
- erreurs fonctionnelles introduites par transport.

Aucune métrique ne quitte la machine sans consentement explicite.

## 22. Références

- MCP Authorization, version 2025-06-18 : https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
- MCP Transports, version 2025-06-18 : https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- Electron `safeStorage` : https://www.electronjs.org/docs/latest/api/safe-storage
- RFC 9449 — DPoP : https://www.rfc-editor.org/rfc/rfc9449.html
- Étude AI OSINT existante : `docs/security/AI_OSINT_FEASIBILITY.md`
