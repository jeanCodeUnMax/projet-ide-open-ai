# Analyse de faisabilité — MCP Security Gateway

> Projet : IDE Open AI
> Branche : `security/mcp-security-gateway`
> Version : 1.0.0
> Date : 2026-07-15

## 1. Conclusion exécutive

La mise en place d’un MCP Security Gateway est **faisable**, mais elle doit être réalisée progressivement.

La partie la plus simple et la plus sûre est le contrôle des MCP HTTP via un proxy local. La partie la plus sensible est l’interception des MCP `stdio`, car OpenFox les lance actuellement directement à partir de la configuration générée.

Décision recommandée :

1. ajouter d’abord un moteur de politique en mode observation ;
2. router les MCP HTTP via un proxy local ;
3. router ensuite les MCP `stdio` via un wrapper ;
4. activer les blocages seulement après validation en conditions réelles ;
5. ajouter le coffre de secrets après stabilisation du routage.

Le projet peut être protégé sans casser son fonctionnement à condition de conserver un mode `monitor`, des tests de non-régression et une voie de retour à la configuration directe pendant la migration.

## 2. Architecture actuelle analysée

### 2.1 Configuration canonique

IDE Open AI possède déjà une configuration MCP canonique :

- validation des noms ;
- transport `stdio` ou HTTP ;
- normalisation des arguments, variables et headers ;
- limitation du nombre d’outils ;
- résolution des placeholders `${env:NOM}` ;
- environnement système filtré pour les sous-processus.

Cette base est favorable à l’ajout d’une politique de sécurité centrale.

### 2.2 Synchronisation vers OpenFox

Le chemin actuel est :

```text
mcp_config canonique
        |
        v
résolution des variables
        |
        v
écriture dans config OpenFox
        |
        v
OpenFox lance/contacte le MCP
```

Le point de contrôle existe avant le lancement, mais pas encore à chaque appel `tools/call`.

### 2.3 Interface MCP

Le gestionnaire MCP permet déjà :

- ajout et suppression de serveurs ;
- test de connexion ;
- import/export ;
- activation ou désactivation d’outils ;
- affichage du transport, du statut et du coût estimé ;
- redémarrage OpenFox.

Le Security Center peut donc compléter une interface existante plutôt que créer un second gestionnaire concurrent.

## 3. Faisabilité par composant

| Composant | Faisabilité | Complexité | Risque de régression | Décision |
|---|---:|---:|---:|---|
| moteur de politique local | élevée | moyenne | faible | MVP |
| `execution_id` | élevée | faible | faible | MVP |
| journal expurgé | élevée | moyenne | faible | MVP |
| tokens opaques en mémoire | élevée | moyenne | faible | MVP |
| proxy MCP HTTP local | élevée | moyenne | moyen | phase 1 |
| wrapper MCP `stdio` | élevée | élevée | moyen/élevé | phase 2 |
| confirmations humaines | élevée | moyenne | moyen | phase 3 |
| révocation et suspension | élevée | moyenne | moyen | phase 3 |
| coffre Electron `safeStorage` | élevée | moyenne | moyen | phase 4 |
| OAuth MCP complet | moyenne/élevée | élevée | moyen | phase 4 |
| DPoP | moyenne | élevée | moyen | optionnel |
| sandbox OS par processus | moyenne | très élevée | élevé | hors MVP |
| blocage global d’autres applications locales | faible | très élevée | élevé | hors périmètre |

## 4. Option A — Modifier directement OpenFox

### Principe

Modifier le client MCP d’OpenFox pour appeler le Security Gate avant chaque outil.

### Avantages

- intégration native ;
- connaissance directe de l’agent et du contexte ;
- interface de confirmation potentiellement plus riche ;
- moins de proxies intermédiaires.

### Inconvénients

- maintenance d’un fork ou patch du bundle OpenFox ;
- risque de casse à chaque mise à jour ;
- couplage fort à des détails internes ;
- tests plus difficiles ;
- risque de bloquer le démarrage de l’application.

### Verdict

Non recommandé comme première implémentation. Peut devenir une contribution amont ou une optimisation ultérieure.

## 5. Option B — Gateway externe transparent

### Principe

Réécrire la configuration générée pour que tous les MCP passent par des composants possédés par IDE Open AI.

```text
MCP HTTP réel  <- proxy local <- OpenFox
MCP stdio réel <- wrapper     <- OpenFox
```

### Avantages

- faible dépendance au code interne OpenFox ;
- compatibilité avec les mises à jour ;
- politique et logs centralisés ;
- tests avec des MCP factices ;
- possibilité de désactiver le gateway temporairement en migration.

### Inconvénients

- gestion correcte du streaming et des sessions ;
- wrapper `stdio` sensible aux erreurs de framing JSON-RPC ;
- confirmations asynchrones à coordonner ;
- nécessité de masquer les destinations réelles dans la configuration générée.

### Verdict

Option recommandée.

## 6. Option C — Imposer des jetons aux serveurs MCP tiers

### Principe

Chaque serveur MCP devrait vérifier un jeton d’exécution IDE.

### Limite fondamentale

Les MCP tiers ne connaissent pas ce protocole. Un serveur `stdio` standard lit seulement du JSON-RPC sur `stdin` et n’a aucune obligation de vérifier une extension propriétaire.

### Faisable pour

- les MCP développés par IDE Open AI ;
- les MCP enveloppés par un wrapper ;
- les MCP HTTP compatibles OAuth ;
- les serveurs acceptant des extensions d’authentification.

### Non garanti pour

- un paquet tiers exécuté directement par une autre application locale ;
- un endpoint distant public sans authentification ;
- un processus compromis avec les mêmes droits utilisateur.

### Verdict

Le jeton est une excellente capacité interne, mais le gateway reste la barrière obligatoire pour les serveurs génériques.

## 7. Faisabilité du transport HTTP

### 7.1 Fonctionnement cible

OpenFox utilise une URL locale :

```text
http://127.0.0.1:<port>/mcp/<server>
```

Le gateway contacte ensuite le serveur réel.

### 7.2 Éléments à implémenter

- POST JSON-RPC ;
- réponses JSON ;
- réponses `text/event-stream` ;
- GET SSE facultatif ;
- DELETE de session ;
- transfert contrôlé de `Mcp-Session-Id` ;
- header de version MCP ;
- limites de taille et timeout ;
- validation d’Origin ;
- TLS obligatoire à distance ;
- gestion OAuth séparée des tokens internes.

### 7.3 Risques

- coupure d’un flux SSE ;
- mauvaise association session/client ;
- répétition involontaire d’une requête lors d’une reconnexion ;
- fuite de headers amont ;
- confusion entre token IDE et token OAuth distant.

### 7.4 Mitigations

- tests de transport avec serveur factice ;
- aucun retry automatique sur un `tools/call` non idempotent ;
- stockage des sessions par couple instance/serveur ;
- liste explicite des headers transférables ;
- redaction systématique ;
- séparation stricte des credentials.

### Verdict

Faisabilité élevée.

## 8. Faisabilité du transport `stdio`

### 8.1 Fonctionnement cible

OpenFox lance :

```text
node electron/mcp/mcp-gateway-stdio.mjs --server <name>
```

Le wrapper lance ensuite la commande réelle.

### 8.2 Responsabilités du wrapper

- conserver un buffer par flux ;
- découper correctement les messages par lignes ;
- accepter uniquement du JSON-RPC valide sur stdout ;
- garder stderr séparé ;
- reconnaître `tools/call` ;
- demander une autorisation ;
- transmettre les notifications et réponses ;
- gérer arrêt, timeout et signaux ;
- tuer l’arbre enfant lors d’une révocation.

### 8.3 Risques

- serveur écrivant du texte non JSON sur stdout ;
- message très volumineux ;
- deadlock durant une confirmation ;
- processus enfant orphelin ;
- différence Windows/Linux dans les signaux ;
- collision entre plusieurs instances ;
- dépendance `npx` qui télécharge au premier lancement.

### 8.4 Mitigations

- limite de taille ;
- timeout de décision ;
- file d’attente par serveur ;
- arrêt forcé avec suivi PID ;
- tests Windows prioritaires ;
- version exacte obligatoire en modes protégés ;
- mode compatibilité pour serveurs non conformes ;
- capture de stderr sans exposition de secrets.

### Verdict

Faisabilité élevée, mais c’est le composant présentant le plus grand risque de régression.

## 9. Jetons et identifiants

### 9.1 Jeton opaque ou JWT

#### Jeton opaque

Avantages :

- simple ;
- révocable ;
- aucune donnée sensible côté client ;
- stockage en mémoire ;
- rotation facile.

Inconvénient :

- nécessite le gateway pour chaque validation.

#### JWT

Avantages :

- validation distribuée ;
- claims explicites ;
- adapté à des serveurs compatibles.

Inconvénients :

- gestion de clés ;
- révocation plus complexe ;
- risque de mauvaise validation d’audience ;
- données visibles dans le token même si signées.

### Décision

Jeton opaque pour le MVP. JWT/DPoP seulement pour les intégrations distantes qui en ont besoin.

## 10. Stockage et coffre de secrets

### 10.1 Situation cible

- politique non sensible : JSON dans le répertoire utilisateur de l’application ;
- secrets : coffre chiffré hors workspace ;
- tokens de session et capacités : mémoire uniquement ;
- logs : empreintes, jamais valeurs.

### 10.2 `safeStorage`

Electron `safeStorage` est adapté au chiffrement local lié au profil OS. Il protège notamment une fuite du dépôt ou la copie du fichier chiffré, mais ne remplace pas la protection contre un processus malveillant exécuté sous le même compte.

### 10.3 Migration `.env`

Étapes sûres :

1. analyser le `.env` ;
2. sélectionner les variables sensibles ;
3. importer dans le coffre ;
4. vérifier que les services fonctionnent ;
5. remplacer par `${vault:NOM}` ou supprimer la valeur ;
6. sauvegarder avant suppression ;
7. proposer la rotation si le fichier a déjà été commité.

### Verdict

Faisabilité élevée, mais à livrer après le gateway afin de ne pas cumuler deux changements de runtime critiques.

## 11. Intégration au Security Center

### Réutilisable immédiatement

L’application possède déjà :

- indicateur d’audit ;
- bouton bouclier ;
- audit automatique au changement de workspace ;
- niveaux de risque ;
- IPC d’audit.

### Extensions nécessaires

- fenêtre ou panneau détaillé ;
- profil `monitor/protected/locked` ;
- liste des MCP et niveau de confiance ;
- demandes de confirmation ;
- sessions actives ;
- révocation ;
- journal ;
- gestion du coffre ;
- exceptions temporaires.

### Verdict

Faisabilité élevée avec faible risque de régression si l’interface reste séparée du gestionnaire MCP existant pendant le MVP.

## 12. Compatibilité avec la configuration actuelle

### Champs conservés

- `transport` ;
- `command` ;
- `args` ;
- `env` ;
- `url` ;
- `headers` ;
- `disabledTools`.

### Champs supplémentaires proposés

```json
{
  "security": {
    "trust": "approved",
    "riskClass": "write",
    "allowedScopes": [],
    "confirmScopes": [],
    "versionPinRequired": true,
    "networkPolicy": "loopback-only"
  }
}
```

### Compatibilité

La fonction de validation doit accepter les anciens documents et produire une politique par défaut. Aucun fichier utilisateur ne doit devenir invalide uniquement parce que le champ `security` est absent.

## 13. Risques de sécurité créés par le gateway

Le gateway devient lui-même une cible privilégiée.

### Risques

- élévation de privilège via IPC ;
- fuite du secret de session ;
- bypass par endpoint non protégé ;
- injection dans les logs ;
- confusion de workspace ;
- course entre validation et exécution ;
- saturation mémoire de la table de tokens ;
- confirmation trompeuse ;
- proxy utilisé comme relais réseau.

### Protections

- gateway dans Electron Main ou processus utilitaire isolé ;
- API minimale ;
- validation stricte des schémas ;
- port loopback dynamique ;
- secret aléatoire par session ;
- expiration agressive ;
- limite des tokens en mémoire ;
- vérification du workspace au dernier moment ;
- liste de destinations ;
- aucune URL arbitraire fournie par l’outil ;
- CSP et renderer sans Node ;
- tests de concurrence.

## 14. Performance

### Coûts attendus

- hash paramètres : négligeable pour petits payloads ;
- lookup politique : inférieur à la milliseconde ;
- log local asynchrone : faible ;
- proxy HTTP : quelques millisecondes ;
- wrapper `stdio` : faible en débit normal ;
- confirmation : coût humain volontaire.

### Limites

- arguments maximum par défaut : 1 MiB ;
- réponse maximum configurable ;
- tokens actifs maximum : 10 000 ;
- journal rotatif ;
- file d’attente par MCP ;
- nombre maximal d’appels concurrents par serveur.

## 15. Stratégie de déploiement

### Étape 1 — feature flag

```text
OPENAI_IDE_MCP_GATEWAY=off|monitor|protected|locked
```

Valeur initiale : `monitor` sur la branche de développement.

### Étape 2 — shadow decisions

Le gateway calcule les décisions, mais le routage reste direct. Comparaison des faux positifs.

### Étape 3 — HTTP opt-in

Activation serveur par serveur.

### Étape 4 — `stdio` opt-in

Activation sur un MCP factice, puis filesystem, puis autres serveurs.

### Étape 5 — `protected` par défaut

Après stabilisation et couverture de tests.

### Étape 6 — suppression du bypass

Uniquement lorsque tous les MCP supportés passent correctement par le gateway.

## 16. Plan de retour arrière

- conserver une copie de la configuration canonique ;
- générer séparément la configuration OpenFox routée ;
- feature flag global ;
- rollback automatique si le health check du gateway échoue ;
- restauration du routage direct en mode développement seulement ;
- aucune suppression des credentials existants pendant les premières phases.

En production `locked`, le fallback direct est interdit.

## 17. Estimation

Estimation indicative pour une implémentation rigoureuse par une personne :

| Phase | Charge |
|---|---:|
| politique, modèles, tests unitaires | 3 à 5 jours |
| journal et exécution IDs | 2 à 3 jours |
| proxy HTTP MCP | 4 à 7 jours |
| wrapper `stdio` | 6 à 10 jours |
| Security Center et confirmations | 5 à 8 jours |
| coffre de secrets | 4 à 7 jours |
| durcissement et tests Windows | 5 à 10 jours |

Total MVP protégé : environ 20 à 33 jours de développement concentré, hors OAuth avancé et DPoP.

## 18. Go / No-Go

### GO

- moteur de politique ;
- `execution_id` ;
- tokens opaques ;
- journal expurgé ;
- proxy HTTP ;
- wrapper `stdio` ;
- confirmations ;
- révocation ;
- Security Center ;
- coffre en phase séparée.

### NO-GO pour le MVP

- fork profond d’OpenFox ;
- JWT distribué partout ;
- pare-feu système automatique ;
- conteneur obligatoire ;
- blocage global de tous les processus locaux ;
- modification automatique des MCP tiers.

## 19. Décision finale

Le MCP Security Gateway est techniquement réaliste et cohérent avec l’architecture d’IDE Open AI.

Le chemin le plus sûr est un gateway transparent et progressif, avec :

- mode observation ;
- proxy HTTP ;
- wrapper `stdio` ;
- tokens opaques courts ;
- politique par outil ;
- confirmations ciblées ;
- secrets séparés ;
- tests de non-régression avant activation stricte.

La faisabilité est **élevée**, mais l’activation globale ne doit intervenir qu’après validation du wrapper `stdio` sur Windows.

## 20. Références

- MCP Authorization : https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
- MCP Transports : https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- Electron `safeStorage` : https://www.electronjs.org/docs/latest/api/safe-storage
- RFC 9449 — DPoP : https://www.rfc-editor.org/rfc/rfc9449.html
- PRD associé : `docs/security/mcp-security-gateway/PRD.md`
