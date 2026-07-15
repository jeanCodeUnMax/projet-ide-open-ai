# Étude de faisabilité — Migration d’IDE Open AI vers une véritable plateforme IDE

> Branche : `migration/ide-platform-integration`
> Date : 2026-07-15
> Statut : décision d’architecture proposée

## 1. Objet

IDE Open AI fonctionne actuellement comme une application Electron construite autour d’OpenFox. Cette approche a permis de valider :

- le moteur OpenFox ;
- les projets et sessions ;
- l’explorateur de workspace ;
- l’éditeur de fichiers ;
- les workflows ;
- les MCP ;
- le RAG ;
- la sécurité ;
- le lancement de modèles locaux et distants.

Elle impose cependant de reconstruire progressivement les fonctionnalités d’un IDE mature : éditeur multi-onglets, navigation symbolique, LSP, débogage, tests, terminal, SCM, extensions, navigateur intégré, tâches, préférences, raccourcis, fenêtres secondaires et accessibilité.

L’objectif de la migration est de conserver les services différenciants d’IDE Open AI tout en les intégrant dans une plateforme IDE open source complète.

## 2. Besoin produit

Le produit cible doit :

1. remplacer Copilot comme assistant principal et non ajouter un simple chat secondaire ;
2. faire d’OpenFox le moteur d’orchestration agentique ;
3. comprendre nativement le workspace, les éditeurs, sélections et diagnostics ;
4. comprendre le terminal, les tâches, tests, Git et débogueur ;
5. accéder à un navigateur intégré et à son état vérifiable ;
6. gérer les MCP, leurs outils et leur politique de sécurité ;
7. découvrir et utiliser les skills ;
8. conserver les workflows, critères d’acceptation et templates ;
9. fournir une interface contractuelle à Yfastos ;
10. permettre l’export/import de la configuration actuelle ;
11. rester distribuable sous forme desktop Windows, puis Linux/macOS ;
12. ne pas dépendre d’un service propriétaire obligatoire.

## 3. Frontière avec Yfastos

Yfastos reste propriétaire de :

- la mémoire unifiée ;
- le watchdog ;
- la surveillance globale ;
- la synchronisation de ses données ;
- sa logique interne de gouvernance.

La migration IDE ne réimplémente pas ces fonctions. Elle fournit uniquement un **contrat de connexion** : événements, commandes, identifiants, états et capacités.

## 4. Candidats analysés

### 4.1 Fork de VS Code OSS

Le dépôt `microsoft/vscode` contient Code - OSS sous licence MIT. La distribution officielle Visual Studio Code ajoute des personnalisations Microsoft et utilise une licence produit distincte.

#### Avantages

- UX familière ;
- écosystème très vaste ;
- éditeur, terminal, Git, debug, tests et remote matures ;
- API d’extension riche ;
- APIs récentes pour chat participants, outils et modèles ;
- possibilité de créer notre propre distribution.

#### Inconvénients

- dépôt très volumineux et évolution mensuelle ;
- coût permanent de synchronisation avec l’amont ;
- personnalisation profonde du workbench difficile à maintenir ;
- certaines expériences IA de la distribution Microsoft sont liées à Copilot ou à des composants non présents dans une distribution OSS ;
- conflits possibles avec les participants et surfaces intégrées ;
- politique et compatibilité des marketplaces ;
- remplacement total de Copilot plus complexe qu’une extension additionnelle.

#### Verdict

Faisable, mais coûteux. À réserver au cas où la compatibilité exacte VS Code devient un impératif supérieur à la modularité.

### 4.2 VSCodium

VSCodium n’est pas un fork fonctionnel distinct. Son dépôt contient principalement les scripts qui construisent Code - OSS avec une configuration libre et sans télémétrie Microsoft.

#### Avantages

- distribution propre de Code - OSS ;
- Open VSX ;
- télémétrie désactivée ;
- base utilisateur connue.

#### Inconvénients

- ce n’est pas une plateforme de personnalisation plus simple que VS Code ;
- les changements profonds doivent toujours être réalisés dans Code - OSS ou par extension ;
- il ne réduit pas le coût d’un fork produit.

#### Verdict

Bon modèle de build et de distribution, mais pas la meilleure base architecturale pour notre produit.

### 4.3 Extension VS Code/VSCodium

#### Avantages

- prototype très rapide ;
- accès au workspace, éditeurs, diagnostics, terminal, tâches, Git, debug et tests ;
- possibilité de créer une vue, un chat participant, des commandes et des outils ;
- installation dans un IDE déjà utilisé.

#### Inconvénients

- le produit ne contrôle pas totalement l’IDE ;
- Copilot peut rester installé et prioritaire ;
- certains noms et participants sont réservés ;
- les participants intégrés peuvent prendre priorité ;
- sécurité et cycle de vie limités par l’extension host ;
- navigateur et orchestration multi-processus moins maîtrisables ;
- difficulté à imposer notre Security Gate et notre configuration produit.

#### Verdict

Excellent **adaptateur de migration** ou canal de distribution secondaire. Insuffisant comme produit final si OpenFox doit devenir le cerveau natif de l’IDE.

### 4.4 Eclipse Theia Platform / Theia IDE

Eclipse Theia est un framework open source destiné à construire des IDE desktop et web. Il supporte le protocole d’extensions VS Code et permet de composer un produit en sélectionnant ses dépendances.

Theia IDE est à la fois une application desktop exploitable et un template officiel de produit. Son application Electron est construite à partir de packages sélectionnés.

#### Capacités déjà disponibles

- éditeur Monaco ;
- workspace et filesystem ;
- explorateur et recherche ;
- terminal et tâches ;
- SCM/Git ;
- débogage et tests ;
- mini-browser ;
- extensions VS Code/Open VSX ;
- architecture frontend/backend ;
- fenêtres secondaires ;
- application Electron et browser ;
- packages IA modulaires ;
- agents, prompts, variables et skills ;
- intégration MCP et UI MCP ;
- OAuth MCP et coffre OS pour les jetons ;
- fournisseurs OpenAI, Anthropic, Google, Ollama et autres.

#### Point décisif

Les dépendances du produit sont composables. Le template Theia IDE inclut actuellement `@theia/ai-copilot`, mais notre produit peut simplement **ne pas inclure ce package** et installer nos propres extensions OpenFox/Yfastos.

#### Avantages

- pas besoin de maintenir un fork massif de VS Code ;
- personnalisation produit native ;
- extensions frontend et backend par injection de dépendances ;
- OpenFox peut être un service backend de premier rang ;
- Theia AI possède déjà les concepts d’agents et de skills ;
- Theia MCP couvre déjà `stdio`, HTTP et OAuth ;
- mini-browser déjà disponible ;
- possibilité de distribuer desktop et web ;
- compatibilité partielle avec les extensions VS Code.

#### Inconvénients

- compatibilité VS Code non parfaite ;
- écosystème plus petit ;
- apprentissage de l’architecture Theia/Inversify ;
- build monorepo Yarn/Lerna ;
- risque de double orchestration entre Theia AI et OpenFox ;
- nécessité de décider quelle couche possède MCP, sessions, prompts et modèles.

#### Verdict

**Meilleur candidat pour le produit final.**

## 5. Décision recommandée

### Choix principal

Construire une **application Theia personnalisée**, en utilisant Theia IDE comme template de packaging et Theia Platform comme base fonctionnelle.

### Ne pas faire

- ne pas intégrer l’application Electron actuelle comme iframe permanente ;
- ne pas maintenir deux explorateurs et deux systèmes de workspace ;
- ne pas laisser Theia AI et OpenFox orchestrer les mêmes agents en parallèle ;
- ne pas inclure `@theia/ai-copilot` ;
- ne pas transmettre toutes les informations IDE par prompt texte non structuré ;
- ne pas réimplémenter Yfastos.

### Architecture de propriété

- **Theia** possède l’IDE, le workspace, les éditeurs, les diagnostics, le terminal, les tâches, Git, le debug, les tests, le navigateur et le shell UI.
- **OpenFox** possède les sessions agentiques, agents, workflows, critères, orchestration et exécution LLM.
- **Security Gate** possède les décisions d’autorisation, MCP sensibles, secrets et audit.
- **Yfastos** possède mémoire unifiée, watchdog et synchronisation selon son propre contrat.
- **IDE Context Bridge** transforme l’état Theia en capacités structurées utilisables par OpenFox et Yfastos.

## 6. Architecture cible

```text
┌────────────────────────── IDE-AI Theia Product ──────────────────────────┐
│                                                                         │
│  Theia Frontend                                                         │
│  ├─ Workspace / Editor / Diagnostics                                    │
│  ├─ Terminal / Tasks / Tests / Debug / SCM                              │
│  ├─ Mini Browser                                                        │
│  ├─ OpenFox Chat & Workflow UI                                          │
│  ├─ Security Center                                                     │
│  └─ Migration / Export UI                                               │
│                                                                         │
│  Theia Backend                                                          │
│  ├─ IDE Context Service                                                 │
│  ├─ OpenFox Runtime Adapter                                             │
│  ├─ MCP Policy Adapter                                                  │
│  ├─ Skills Bridge                                                       │
│  ├─ Browser Context Adapter                                             │
│  ├─ Migration Service                                                   │
│  └─ Yfastos Bridge Contract                                             │
│                                                                         │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                     ┌────────────┴────────────┐
                     │                         │
               OpenFox Runtime             Yfastos
           sessions / workflows       memory / watchdog / sync
```

## 7. Module OpenFox proposé

Créer un ensemble de packages Theia :

```text
packages/
├─ ide-ai-product
├─ ide-ai-openfox-common
├─ ide-ai-openfox-frontend
├─ ide-ai-openfox-backend
├─ ide-ai-context
├─ ide-ai-workflows
├─ ide-ai-security
├─ ide-ai-migration
└─ ide-ai-yfastos-contract
```

### Frontend

- activité OpenFox principale ;
- chat et sessions ;
- modèles et fournisseurs ;
- workflows ;
- critères d’acceptation ;
- références fichiers/éditeur ;
- notifications et confirmations ;
- vues Security Center et migration.

### Backend

- démarrage et supervision OpenFox ;
- API structurée vers l’état IDE ;
- conversion des commandes OpenFox en opérations Theia ;
- diffusion d’événements ;
- sécurité ;
- import/export ;
- contrat Yfastos.

## 8. Contrat de contexte IDE

OpenFox ne doit pas “deviner” l’IDE en lisant l’écran. Il doit consommer un service typé.

```ts
interface IdeContextSnapshot {
  workspace: WorkspaceContext
  editors: EditorContext[]
  activeEditor?: ActiveEditorContext
  diagnostics: DiagnosticSummary
  scm: ScmContext
  terminals: TerminalContext[]
  tasks: TaskContext[]
  tests: TestContext
  debug: DebugContext
  browser: BrowserContext
  mcp: McpContext
  skills: SkillContext
  capabilities: IdeCapability[]
}
```

### Événements

- workspace ouvert/fermé/changé ;
- fichier créé/modifié/supprimé ;
- éditeur ou sélection changé ;
- diagnostics changés ;
- terminal démarré/arrêté ;
- tâche/test/debug changé ;
- statut Git changé ;
- page navigateur, console ou capture changée ;
- MCP ou skill activé/désactivé ;
- politique sécurité changée.

## 9. Skills

Theia AI sait déjà découvrir des skills sous forme de répertoires contenant `SKILL.md`, notamment dans le workspace et les répertoires globaux.

Décision proposée :

- adopter ce format comme format canonique ;
- ajouter les répertoires historiques IDE-AI/OpenFox comme sources supplémentaires ;
- dédupliquer par identifiant ;
- laisser OpenFox demander le contenu complet d’un skill à la demande ;
- exposer à Yfastos uniquement les métadonnées et événements nécessaires.

## 10. MCP

Il existe deux options :

### Réutiliser Theia MCP comme runtime

Avantage : support déjà présent pour démarrage/arrêt, `stdio`, HTTP, OAuth et coffre système.

Risque : perte de la configuration canonique et de la sécurité déjà développées dans IDE Open AI.

### Garder IDE-AI/OpenFox comme autorité MCP

Avantage : continuité de la Security Gate, politiques et configuration.

Risque : duplication avec les widgets Theia.

### Décision proposée

- conserver une **configuration canonique IDE-AI** ;
- réutiliser les composants de transport et UI Theia lorsque pertinent ;
- placer le Security Gate avant l’appel ;
- ne jamais démarrer le même serveur dans deux runtimes ;
- créer un adaptateur Theia MCP ↔ configuration IDE-AI.

## 11. Navigateur intégré

Theia fournit `@theia/mini-browser`. Pour les tests agentiques, il faut ajouter au-dessus :

- URL et état de navigation ;
- console ;
- captures d’écran ;
- inspection DOM contrôlée ;
- réseau et erreurs ;
- automatisation Playwright/Puppeteer ;
- isolation de domaines ;
- artefacts de preuve liés aux critères.

Le mini-browser seul n’est donc pas suffisant, mais il fournit la surface IDE et le routage de base.

## 12. Export et migration

Créer un format versionné :

```text
*.ideai-export.zip
```

Contenu proposé :

```text
manifest.json
settings/desktop.json
openfox/config.json
openfox/workflows/
openfox/agents/
skills/
mcp/config.json
security/policy.json
rag/manifest.json
sessions/manifest.json
layouts/
```

### Règles

- aucun secret en clair par défaut ;
- chemins absolus convertis en références explicites ;
- hash des fichiers ;
- version de schéma ;
- import transactionnel ;
- prévisualisation avant application ;
- rollback complet ;
- export optionnel des index RAG ;
- export optionnel des sessions ;
- coffre exporté uniquement sous forme chiffrée avec mot de passe distinct.

## 13. Stratégie de migration

### Phase A — figer le MVP Electron

- taguer une version stable ;
- produire un export complet ;
- conserver les tests ;
- interdire les nouvelles fonctions IDE génériques dans l’ancien shell.

### Phase B — spike Theia

- créer une application Electron minimale ;
- workspace, terminal, Git, mini-browser ;
- branding IDE-AI ;
- ne pas inclure Copilot ;
- lancer un panneau OpenFox minimal.

### Phase C — OpenFox natif

- déplacer le runtime OpenFox dans un backend Theia ;
- connecter projets et sessions ;
- brancher le Context Bridge ;
- supprimer l’iframe/WebContentsView historique.

### Phase D — portage fonctionnel

- MCP ;
- workflows ;
- RAG ;
- sécurité ;
- modèles ;
- import/export ;
- navigateur agentique.

### Phase E — contrat Yfastos

- événements normalisés ;
- health ;
- commandes ;
- identifiants ;
- capacités ;
- aucune implémentation interne Yfastos.

### Phase F — cutover

- importer un workspace réel ;
- exécuter tests UI et E2E ;
- comparer fonctionnalités ;
- migration réversible ;
- paquet Windows ;
- abandon progressif du shell historique.

## 14. Faisabilité par domaine

| Domaine | Faisabilité | Risque |
|---|---:|---:|
| produit Theia personnalisé | élevée | moyen |
| suppression Copilot | élevée | faible |
| OpenFox backend | élevée | moyen |
| workspace/editor/diagnostics | élevée | faible |
| terminal/Git/tâches/tests/debug | élevée | faible |
| skills | élevée | faible |
| MCP | élevée | moyen |
| workflows | élevée | moyen |
| navigateur agentique | moyenne/élevée | moyen |
| import/export | élevée | moyen |
| Yfastos Bridge | élevée pour le contrat | dépend de Yfastos |
| compatibilité extensions VS Code | moyenne/élevée | variable |
| migration sessions historiques | moyenne | moyen/élevé |

## 15. Risques principaux

### Double cerveau IA

Mitigation : OpenFox est l’orchestrateur unique. Theia AI fournit des primitives et UI, pas une orchestration concurrente.

### Double MCP

Mitigation : registre canonique unique et adaptateur.

### Écart de compatibilité VS Code

Mitigation : matrice d’extensions indispensables et tests Open VSX.

### Dette de fork

Mitigation : composer une application Theia par dépendances et extensions, éviter de modifier directement les packages amont.

### Migration des sessions

Mitigation : manifest versionné, import partiel et conservation en lecture seule des archives historiques.

### Browser sécurité

Mitigation : domaines isolés, Security Gate, contrôles d’Origin et automatisation séparée.

## 16. Décision finale

### Recommandation

1. utiliser **Eclipse Theia Platform** comme nouvelle base ;
2. utiliser **Theia IDE** comme template de packaging, pas comme produit figé ;
3. créer des extensions Theia frontend/backend propres à IDE-AI ;
4. exclure `@theia/ai-copilot` et les agents concurrents non nécessaires ;
5. faire d’OpenFox l’orchestrateur unique ;
6. adopter un Context Bridge typé ;
7. intégrer Yfastos uniquement par contrat ;
8. conserver une extension VS Code légère comme option secondaire ultérieure ;
9. ne pas lancer immédiatement un fork Code - OSS.

## 17. Références officielles

- Eclipse Theia Platform : https://github.com/eclipse-theia/theia
- Eclipse Theia IDE : https://github.com/eclipse-theia/theia-ide
- Composition d’une application : https://theia-ide.org/docs/composing_applications/
- Extensions Theia : https://theia-ide.org/docs/authoring_extensions/
- VS Code Code - OSS : https://github.com/microsoft/vscode
- VSCodium : https://github.com/VSCodium/vscodium
- VS Code Chat Participant API : https://code.visualstudio.com/api/extension-guides/ai/chat
