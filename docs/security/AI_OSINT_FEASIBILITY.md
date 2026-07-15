# Étude de faisabilité — Protection IDE-AI face aux risques AI OSINT

## 1. Objet

Cette étude analyse les risques documentés par le dépôt public `7WaySecurity/ai_osint` qui concernent directement IDE-AI, OpenFox, Ollama, les agents, les fichiers de workspace et les serveurs MCP.

Le dépôt étudié est une collection défensive et Red Team de techniques de découverte d’infrastructures IA exposées. Il ne constitue pas un composant à intégrer. Il sert ici de base de menace pour durcir IDE-AI sans casser le fonctionnement local.

## 2. Risques applicables à IDE-AI

### 2.1 Exposition réseau

- OpenFox, Ollama ou un MCP écoutant sur `0.0.0.0`, `::` ou une interface réseau.
- API locale sans authentification accessible depuis le LAN, un proxy ou un tunnel.
- Endpoint HTTP MCP distant sans TLS.

### 2.2 Fuite de secrets

- clés API dans `.env`, fichiers JSON, paramètres OpenFox, configurations MCP ou historiques ;
- secrets intégrés en clair dans `env`, `headers`, `args` ou scripts ;
- publication accidentelle dans Git.

### 2.3 Exécution agentique non fiable

- MCP `stdio` lançant une commande shell dangereuse ;
- paquet `npx` non épinglé et remplacé ultérieurement dans la chaîne d’approvisionnement ;
- scripts `preinstall`, `install`, `postinstall` ou `prepare` exécutés lors d’une installation ;
- hooks Git ou hooks de projet malveillants ;
- réglages auto-approve ou YOLO autorisant les outils sans confirmation.

### 2.4 Injection indirecte par le workspace

- instructions malveillantes dans `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `RULES.md`, règles Cursor/Windsurf ou instructions Copilot ;
- texte invisible, caractères Unicode bidirectionnels ou zéro largeur ;
- instruction demandant de lire `.env`, voler des clés, désactiver les contrôles ou envoyer des données.

### 2.5 Chemins et liens

- lien symbolique sortant du workspace ;
- traversal de chemin ;
- copie ou suppression hors du projet.

IDE-AI protège déjà les opérations manuelles de l’explorateur contre les sorties du workspace et ne suit pas les liens symboliques. Le risque doit néanmoins être signalé, car d’autres outils exécutés par OpenFox peuvent avoir une politique différente.

## 3. Protections déjà présentes

- OpenFox est forcé sur `127.0.0.1` dans la configuration isolée IDE-AI.
- L’URL Electron pointe explicitement vers `http://127.0.0.1:<port>`.
- Les fenêtres Electron utilisent `contextIsolation`, `sandbox` et `nodeIntegration: false`.
- Les navigations externes sont bloquées ou ouvertes dans le navigateur système.
- Les opérations de fichiers Electron sont confinées au workspace.
- La configuration MCP est normalisée et les variables sensibles peuvent utiliser `${env:NOM}`.
- Une limite du nombre d’outils MCP actifs est appliquée.

## 4. Lacunes confirmées

- aucun audit systématique avant d’activer un nouveau workspace ;
- aucune détection des secrets dans le projet ;
- aucune analyse des commandes MCP, paquets `npx` ou URL distantes ;
- aucune détection des réglages auto-approve ;
- aucune détection des instructions cachées ou des caractères invisibles ;
- aucun inventaire des scripts lifecycle et hooks Git ;
- pas de mode strict permettant de refuser les risques critiques ;
- pas de rapport local centralisé et expurgé.

## 5. Faisabilité

### Décision

**Faisable sans casser le projet**, à condition de séparer l’audit et l’exécution.

### Principe

1. Scanner local, déterministe et sans appel réseau.
2. Mode `warn` par défaut : l’IDE continue de fonctionner.
3. Mode `strict` optionnel : blocage uniquement sur les constats critiques.
4. Aucun secret complet dans les résultats ou journaux.
5. Limites de fichiers, taille et temps pour ne pas ralentir les gros projets.
6. Exclusions des répertoires volumineux (`node_modules`, objets Git, builds), tout en inspectant les surfaces sensibles connues.
7. Aucun changement automatique du code audité.

## 6. Plan d’implémentation

### Phase A — Audit local

Créer `electron/lib/workspace-security-auditor.mjs` pour détecter :

- secrets probables ;
- écoute réseau publique ;
- auto-approve / YOLO ;
- configurations MCP dangereuses ;
- paquets `npx` non épinglés ;
- scripts lifecycle ;
- hooks Git ;
- caractères invisibles et instructions suspectes ;
- liens symboliques.

### Phase B — Intégration IDE

- audit automatique avant le démarrage OpenFox ;
- audit avant chaque changement de workspace ;
- ligne de statut sécurité dans l’explorateur ;
- commande `Projet > Auditer la sécurité du workspace` ;
- IPC de lecture et relance d’audit ;
- rapport détaillé local.

### Phase C — Politique

- `OPENAI_IDE_SECURITY_MODE=warn` par défaut ;
- `OPENAI_IDE_SECURITY_MODE=strict` pour bloquer les constats critiques ;
- aucune interruption pour les niveaux faible, moyen ou élevé en mode normal.

### Phase D — Tests

- détection de chaque famille de risque ;
- absence de valeur secrète dans le rapport ;
- non-détection des placeholders et exemples ;
- conservation du démarrage normal en mode `warn` ;
- blocage d’un constat critique en mode `strict` ;
- régression : OpenFox reste local, Electron sandboxé, explorateur et workflows inchangés.

## 7. Hors périmètre de cette première version

- antivirus ou analyse comportementale temps réel ;
- exécution automatique de scanners externes ;
- analyse distante Shodan/Censys ;
- suppression automatique de fichiers ;
- blocage de tous les MCP distants ;
- modification automatique des prompts ou du code utilisateur.

## 8. Critères d’acceptation

- l’audit ne transmet aucune donnée ;
- le rapport ne contient aucun secret complet ;
- le mode par défaut ne bloque pas le projet ;
- un bind public ou un secret actif peut être classé critique ;
- le mode strict empêche l’activation d’un workspace critique ;
- les résultats restent reproductibles et testés ;
- aucune régression sur OpenFox, Ollama, MCP, RAG, éditeur et workflow designer.
