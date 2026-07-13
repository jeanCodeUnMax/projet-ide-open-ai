# LCX — Latent Context Exchange

> Statut : R&D / V5  
> Origine : issue GitHub [#3](https://github.com/jeanCodeUnMax/projet-ide-open-ai/issues/3)  
> Décision actuelle : conserver et préparer l’expérimentation, sans toucher au produit principal.

## 1. Intention

Étudier un protocole **machine-to-machine** où les agents ne communiquent plus principalement en texte ou en tokens, mais échangent directement des représentations numériques :

- embeddings ;
- tenseurs ;
- états cachés ;
- résumés ou deltas de KV-cache ;
- matrices relationnelles ;
- graphes sémantiques ;
- blocs d’expérience multimodaux.

Le texte humain devient alors une vue d’audit, de contrôle et de débogage, et non le média principal de transport de l’information.

## 2. Hypothèse

Le cycle actuel impose souvent :

```text
état interne A
→ texte
→ tokens
→ embeddings
→ reconstruction approximative dans B
```

Cette conversion peut introduire :

- perte d’information ;
- ambiguïté ;
- coût en tokens ;
- latence ;
- linéarisation forcée d’un état multidimensionnel ;
- reconstruction imparfaite par le modèle récepteur.

LCX testerait plutôt :

```text
état interne A
→ extraction
→ projection / alignement
→ paquet latent
→ validation
→ fusion dans l’état B
```

## 3. Vision inspirée des modèles du monde

L’objectif à long terme n’est pas seulement de transmettre une conclusion, mais éventuellement un **bloc d’expérience** comprenant :

```text
situation
+ perception
+ entités
+ relations
+ action
+ conséquence
+ chronologie
+ causalité
+ incertitude
+ apprentissage
```

Cette représentation pourrait être plus proche d’une mémoire épisodique ou d’un modèle du monde qu’un simple message textuel.

## 4. Niveaux d’échange à expérimenter

### 4.1 Embedding-to-embedding

Transmission d’un vecteur sémantique compact.

Avantages :

- simple à stocker ;
- facile à comparer ;
- compatible avec les bases vectorielles ;
- peu coûteux.

Limites :

- ne transmet pas nécessairement un raisonnement ;
- perte de structure ;
- faible auditabilité ;
- sens dépendant du modèle d’embedding.

### 4.2 Hidden-state-to-hidden-state

Transmission d’une matrice intermédiaire du modèle.

Avantages :

- plus riche qu’un embedding global ;
- peut conserver une structure séquentielle ;
- peut transporter un état de raisonnement continu.

Limites :

- accès nécessaire aux couches internes ;
- forte dépendance au modèle ;
- alignement complexe entre modèles différents ;
- risques de sécurité et d’opacité.

### 4.3 KV-delta / cache-to-cache

Transmission d’une partie de la mémoire d’attention, ou uniquement de l’information nouvelle.

Avantages :

- évite de reconstruire tout le contexte ;
- potentiel important de réduction de latence ;
- conservation plus directe de la mémoire de contexte.

Limites :

- dépendance forte à l’architecture, au tokenizer et aux dimensions ;
- payload volumineux ;
- possibilité de corruption ou d’injection opaque ;
- interopérabilité difficile.

### 4.4 Graphe ou matrice sémantique canonique

Transmission d’une représentation intermédiaire contrôlée :

- entités ;
- relations ;
- intentions ;
- contraintes ;
- preuves ;
- temporalité ;
- causalité ;
- confiance ;
- contradictions.

Avantages :

- meilleure interopérabilité ;
- format contrôlable ;
- possibilité d’audit ;
- compatibilité avec le futur Knowledge Operating System.

Limites :

- moins riche qu’un état latent brut ;
- besoin d’une ontologie ou d’un schéma ;
- coût de construction et de validation.

### 4.5 Mode hybride adaptatif

Combinaison recommandée :

```text
latent pour la richesse et la vitesse
+ graphe canonique pour l’interopérabilité
+ texte court pour l’audit humain
+ fallback A2A textuel
```

## 5. Architecture proposée

```text
Agent A
  ↓
Latent Extractor
  ↓
Semantic Bottleneck / Projection Adapter
  ↓
LCX Packet
  ↓
Integrity Gate
  ↓
Compatibility Gate
  ↓
Fusion Adapter
  ↓
Agent B
```

## 6. Enveloppe minimale LCX

```text
protocol_version
message_id
task_id
context_id
sender_model_fingerprint
receiver_model_fingerprint
representation_type
layer_range
shape
dtype
quantization
projection_adapter_id
attention_mask
confidence
uncertainty
provenance_hash
payload_digest
optional_human_digest
```

Le payload tensoriel devrait être binaire et sûr. L’enveloppe pourrait être transportée en JSON, CBOR ou Protobuf.

## 7. Compatibilité entre modèles

### Cas A — Même modèle, mêmes poids

C’est le premier cas à tester.

Conditions :

- même modèle ;
- mêmes poids ;
- même tokenizer ;
- même architecture ;
- mêmes couches ;
- même version.

Le transfert direct de hidden states ou de KV-cache devient alors envisageable.

### Cas B — Modèles de la même famille

Utiliser un adaptateur appris :

- projection linéaire ;
- MLP ;
- low-rank adapter ;
- cross-attention bridge.

Exemple simplifié :

```text
z_B = Wz_A + b
```

### Cas C — Modèles hétérogènes

Passer par :

- un espace latent canonique ;
- un graphe sémantique ;
- un autoencodeur partagé ;
- un semantic bottleneck appris.

Le protocole doit refuser l’injection directe si l’alignement n’est pas prouvé.

## 8. Modes d’injection possibles

### Pseudo-tokens continus

Les représentations reçues sont injectées comme embeddings spéciaux qui ne correspondent à aucun mot.

### Cross-attention

Le récepteur garde son contexte normal et utilise le paquet LCX comme mémoire externe.

### Injection KV-cache

Le cache reçu est injecté dans certaines couches d’attention après validation.

### Fusion mathématique contrôlée

```text
z_fusion = αz_B + βP(z_A)
```

avec :

- `z_B` : état courant du récepteur ;
- `z_A` : état transmis ;
- `P` : projection ;
- `α`, `β` : portes contrôlées par confiance et compatibilité.

## 9. Sécurité obligatoire

Un canal latent est plus opaque qu’un message textuel. Il doit être considéré comme non fiable par défaut.

Mesures minimales :

- signature ou HMAC du manifeste et du payload ;
- fingerprint exact du modèle, tokenizer et adapter ;
- validation de forme, dtype, amplitude et distribution ;
- limites de taille ;
- sandbox des payloads non fiables ;
- journal d’audit textuel minimal ;
- watchdog Hephaistos ;
- détection de dérive ;
- comparaison avec le digest humain ;
- fallback vers A2A textuel ;
- refus d’un cache opaque non authentifié.

## 10. Prototype expérimental minimal

### Baseline

Deux agents locaux utilisant exactement le même modèle.

Comparer :

1. A2A texte ;
2. embedding partagé ;
3. hidden state partagé ;
4. résumé de KV-cache partagé ;
5. graphe sémantique canonique.

### Tâches de test

- transmission d’un contexte long ;
- transfert d’un plan ;
- résolution collaborative ;
- fusion de preuves contradictoires ;
- mémoire de workspace ;
- génération de code avec reviewer séparé ;
- transmission d’un bloc d’expérience.

### Mesures

- exactitude finale ;
- conservation de l’information ;
- latence ;
- volume transmis ;
- tokens économisés ;
- coût GPU/CPU ;
- stabilité après plusieurs relais ;
- compatibilité inter-modèles ;
- auditabilité ;
- résistance à une altération du payload.

## 11. Critère de réussite

LCX doit améliorer au moins deux axes sans dégrader gravement les autres :

- précision ;
- latence ;
- volume transmis ;
- consommation de tokens ;
- cohérence multi-agents ;
- conservation du contexte.

Il doit également conserver :

- une preuve d’origine ;
- une compatibilité vérifiable ;
- un mécanisme de refus sûr ;
- un fallback texte ;
- une trace d’audit.

## 12. Position dans la roadmap

```text
V1–V2
A2A textuel, MCP, Hephaistos, RAG et orchestration fiable

V3–V4
Graphe de connaissances, mémoire structurée, gouvernance et observabilité

V5 / R&D
LCX, communication latent-to-latent, blocs d’expérience et sélection adaptative du média
```

## 13. Décision actuelle

- ne pas intégrer LCX dans le chemin critique ;
- ne pas modifier les PR actuelles ;
- conserver le concept dans la branche `brainstorming` ;
- créer plus tard un laboratoire séparé ;
- utiliser des modèles locaux open-weight ;
- construire un benchmark reproductible ;
- accepter le résultat expérimental, qu’il confirme ou non l’hypothèse.