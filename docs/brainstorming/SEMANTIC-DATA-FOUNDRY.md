# Semantic Data Foundry

> Statut : R&D / Business  
> Origine : issue GitHub [#4](https://github.com/jeanCodeUnMax/projet-ide-open-ai/issues/4)  
> Décision actuelle : conserver l’idée, sans développement dans la V1.

## 1. Intention

Étudier un moteur capable de transformer un dossier, un sujet ou un ensemble de documents en un **jeu de connaissances structuré, vérifiable et commercialisable**.

Nom de travail : **Semantic Data Foundry (SDF)**.

Le système ne doit pas simplement produire beaucoup de questions-réponses. Il doit extraire, couvrir, vérifier et structurer le sens du corpus afin de créer des données utiles pour :

- instruction tuning ;
- supervised fine-tuning ;
- spécialisation métier ;
- benchmark et évaluation ;
- apprentissage progressif ;
- RAG ;
- agents experts ;
- tutorat et formation ;
- graphes et représentations sémantiques.

## 2. Principe commercial

La valeur ne vient pas du volume brut, mais de la preuve de qualité.

```text
Besoin réel du client
→ diagnostic des lacunes
→ corpus disponible
→ artefacts nécessaires
→ génération ciblée
→ validation
→ mesure avant / après
```

Le système ne doit pas fonctionner ainsi :

```text
PDF
→ 50 000 paires
→ chercher ensuite un acheteur
```

Il doit partir du résultat attendu par le client.

## 3. Hypothèse business

Un corpus spécialisé peut avoir une valeur commerciale s’il apporte :

- droits et provenance explicites ;
- couverture mesurée du domaine ;
- réponses vérifiables et citées ;
- faible redondance ;
- niveaux de difficulté ;
- diversité des formes de raisonnement ;
- séparation train / validation / test ;
- gain mesurable sur un modèle, un agent ou un benchmark ;
- versionnement ;
- mises à jour.

Un petit jeu très contrôlé peut avoir plus de valeur qu’un grand volume répétitif ou halluciné.

## 4. Partir du besoin client

Avant de produire les données, il faut répondre à :

```text
Quel problème doit être résolu ?
Qui utilisera le système ?
Quelles erreurs coûtent le plus cher ?
Quelles connaissances manquent ?
Quelles réponses sont aujourd’hui mauvaises ?
Comment mesurera-t-on l’amélioration ?
```

### Correspondance besoin / produit

| Besoin client | Produit pertinent |
|---|---|
| Entraîner un modèle métier | Dataset d’instruction |
| Tester un agent | Golden set / benchmark |
| Améliorer un RAG | Questions de retrieval, citations et cas difficiles |
| Former des salariés | Parcours pédagogique et cas pratiques |
| Contrôler la conformité | Règles, exceptions et scénarios |
| Détecter les hallucinations | Jeu adversarial et négatif |
| Maintenir une expertise | Dataset versionné par abonnement |

## 5. Vérifier ce qui existe déjà

Avant toute fabrication, réaliser une **gap analysis** :

1. que possède déjà le client ;
2. quels datasets publics existent ;
3. quels benchmarks existent ;
4. quels outils commerciaux répondent déjà au besoin ;
5. quelle partie reste réellement non couverte.

La Foundry ne doit pas reconstruire gratuitement une ressource déjà disponible, sauf si la valeur ajoutée est claire :

- meilleure langue ;
- domaine plus précis ;
- données plus récentes ;
- provenance vérifiée ;
- cas métier privés ;
- meilleure couverture des exceptions ;
- validation humaine ;
- benchmark démontrant un gain.

## 6. Chaîne de transformation

```text
Documents
  ↓
OCR / extraction / segmentation
  ↓
Structure documentaire
  ↓
Unités de sens
  ↓
Knowledge Graph
  ↓
Générateurs spécialisés par type de raisonnement
  ↓
Réponses + preuves + citations
  ↓
Déduplication lexicale et sémantique
  ↓
Critique indépendante / validation croisée
  ↓
Train / validation / test sans fuite
  ↓
Benchmark sur modèles cibles
  ↓
Dataset versionné + rapport qualité
```

## 7. Couches extractibles

### 7.1 Structure documentaire

- sections ;
- articles ;
- annexes ;
- définitions ;
- tableaux ;
- exceptions ;
- renvois internes.

### 7.2 Unités de sens atomiques

- faits ;
- règles ;
- obligations ;
- interdictions ;
- conditions ;
- délais ;
- acteurs ;
- conséquences.

### 7.3 Graphe sémantique

- entités ;
- relations ;
- causes ;
- conséquences ;
- temporalité ;
- contradictions ;
- dépendances ;
- preuves.

### 7.4 Paires question-réponse

- factuelles ;
- définitionnelles ;
- conditionnelles ;
- causales ;
- comparatives ;
- analogiques ;
- déductives ;
- syllogistiques ;
- contre-exemples ;
- cas pratiques ;
- erreurs fréquentes ;
- questions adversariales.

### 7.5 Raisonnement vérifiable

Le système ne doit pas prétendre retranscrire une pensée interne. Il doit produire un raisonnement contrôlable :

```text
prémisses
→ règle appliquée
→ conclusion
→ exceptions
→ citations
→ confiance
```

### 7.6 Exemples négatifs et contrastifs

- réponse plausible mais fausse ;
- condition manquante ;
- confusion entre deux notions ;
- mauvaise analogie ;
- citation incorrecte ;
- exception oubliée.

### 7.7 Évaluation séparée

- questions non vues ;
- cas difficiles ;
- tests de généralisation ;
- fidélité aux sources ;
- résistance aux formulations ambiguës ;
- détection des réponses non justifiées.

## 8. Catalogue d’essences

La valeur ajoutée pourrait être une taxonomie des essences extractibles :

- essence factuelle ;
- essence définitionnelle ;
- essence réglementaire ;
- essence causale ;
- essence temporelle ;
- essence relationnelle ;
- essence procédurale ;
- essence analogique ;
- essence contradictoire ;
- essence pédagogique ;
- essence décisionnelle ;
- essence expérientielle.

Exemple :

```json
{
  "type": "regle_conditionnelle",
  "acteur": "employeur",
  "condition": "plus de 50 salariés",
  "obligation": "mettre en place la procédure X",
  "exception": "cas prévu par l’article Y",
  "source": {
    "document": "loi-example.pdf",
    "page": 24,
    "article": "12"
  },
  "confiance": 0.97
}
```

## 9. Budget sémantique

Un document ne contient pas automatiquement des dizaines de milliers d’unités indépendantes.

La Foundry devra estimer :

```text
concepts distincts
× relations utiles
× formes de raisonnement pertinentes
× niveaux de difficulté
```

Exemple de restitution honnête :

```text
2 400 unités de connaissance distinctes
8 700 relations
12 000 paires fondamentales
35 000 variantes pédagogiques
3 000 cas d’évaluation protégés
```

Cette distinction évite les datasets artificiellement gonflés.

## 10. SQP — Semantic Question Pairing Protocol

Schéma minimal envisagé :

```text
item_id
source_id
source_location
source_hash
domain
concepts
question_type
reasoning_type
difficulty
question
answer
structured_rationale
citations
confidence
validator_status
negative_examples
split
license
version
```

## 11. Produits commerciaux possibles

### Dataset expert sous licence

Pack versionné pour un domaine précis.

### Fabrication sur mesure

Transformation des documents privés d’une entreprise.

### Benchmark et golden set

Produit d’évaluation fiable, souvent plus défendable qu’un gros corpus d’entraînement.

### Abonnement de mise à jour

À chaque évolution d’une loi, d’une norme ou d’une documentation :

```text
nouvelle version
→ détection des changements
→ mise à jour des connaissances
→ régénération ciblée
→ nouveau benchmark
```

### API, SaaS ou on-premise

Le client garde ses documents et reçoit le pipeline, le rapport et les artefacts.

### Packs pédagogiques

Compétence structurée, niveaux progressifs, cas pratiques et examens.

### Protocole ou data contract

Schéma commun et métriques permettant de comparer plusieurs producteurs de données.

## 12. Positionnement recommandé

Le modèle le plus défendable est probablement :

```text
pipeline propriétaire
+ validation indépendante
+ benchmark mesurable
+ mises à jour
+ provenance et licence
+ service métier
```

La vente unique d’un fichier est fragile. La valeur durable se trouve dans la méthode, le contrôle qualité et la maintenance.

## 13. Livrable commercial idéal

```text
01 — Corpus source et droits
02 — Analyse du besoin client
03 — Cartographie sémantique
04 — Méthodologie utilisée
05 — Artefacts générés
06 — Dataset ou benchmark
07 — Citations et provenance
08 — Rapport qualité
09 — Mesures avant / après
10 — Limites et recommandations
```

Exemple de rapport :

```text
Couverture estimée : 87 %
Réponses reliées à une source : 100 %
Redondance sémantique : 3,4 %
Contradictions non résolues : 12
Items validés automatiquement : 8 450
Items contrôlés manuellement : 600
Précision sur le benchmark : 94 %
```

## 14. LLM et modèles du monde

### Pour les LLM

Les paires structurées peuvent servir au post-entraînement, à l’évaluation, au tutorat, au RAG et à la spécialisation métier.

### Pour les modèles du monde

Les questions-réponses seules sont insuffisantes. Il faut aussi produire des trajectoires :

```text
état / observation
→ action
→ conséquence
→ nouvel état
→ retour / récompense
```

Cette extension vers les blocs d’expérience reste une piste R&D distincte.

## 15. Conditions minimales de qualité

- réponses importantes reliées à une preuve ;
- licence ou droit d’usage explicite ;
- déduplication lexicale et sémantique ;
- séparation stricte train / validation / test ;
- audit des contradictions ;
- vérification humaine d’un échantillon utile ;
- critique par agent indépendant ;
- mesure de couverture ;
- mesure du taux d’hallucination ;
- benchmark avant / après ;
- documentation complète des limites.

## 16. Expérience future minimale

Prendre un corpus juridiquement exploitable et produire :

- A : 1 000 paires fortement contrôlées ;
- B : 10 000 paires filtrées ;
- C : 50 000 paires générées massivement.

Comparer :

- précision métier ;
- fidélité aux sources ;
- généralisation ;
- redondance ;
- hallucinations ;
- coût de production ;
- gain réel avant / après ;
- valeur perçue par un acheteur.

## 17. Laboratoire de preuves

Avant toute commercialisation, construire plusieurs démonstrateurs sur des corpus libres ou juridiquement exploitables.

Pour chaque expérimentation :

```text
source
→ besoin simulé
→ méthode
→ essences extraites
→ artefacts produits
→ contrôles qualité
→ résultats
→ limites
```

Le portfolio doit prouver comment la Foundry travaille, et non seulement montrer un volume généré.

## 18. Décision actuelle

- conserver l’idée dans la branche `brainstorming` ;
- ne pas modifier la V1 ni les PR en cours ;
- ne pas commencer la génération massive sans métriques, droits et benchmark ;
- partir du besoin client ;
- vérifier ce qui existe déjà ;
- développer plus tard un laboratoire de preuves ;
- reprendre la piste après stabilisation du produit principal.