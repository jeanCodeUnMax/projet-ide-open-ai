# Interface Agents et Knowledge

## Accès

Dans l’application Electron :

```text
AI OS → Agents et Knowledge…
```

Le panneau regroupe trois fonctions qui partagent le workspace actif.

## Registre d’agents

L’onglet **Agents** permet de :

- visualiser l’Agent Card de l’orchestrateur intégré ;
- tester la découverte d’un agent A2A distant ;
- enregistrer sa carte dans `.ide-ai/agents/index.json` ;
- activer ou désactiver un agent distant ;
- rafraîchir sa carte depuis `/.well-known/agent-card.json` ;
- supprimer un agent du registre du workspace.

Les entrées corrompues sont ignorées à la lecture afin qu’un seul agent invalide ne bloque pas tout le workspace.

## Ingestion RAG

L’onglet **Ingestion RAG** accepte :

- PDF ;
- PNG, JPEG, WebP et TIFF ;
- Markdown ;
- texte brut ;
- JSON.

L’utilisateur peut sélectionner plusieurs fichiers ou les déposer dans la fenêtre. Le processus remonte les phases suivantes :

```text
checksum
extraction / OCR
analyse des images
création des tags
chunking
embeddings
indexation vectorielle
écriture des fichiers d’index
```

Les échecs sont isolés par document. Un document invalide n’annule pas le reste du lot.

## Recherche

L’onglet **Recherche** fonctionne toujours en mode lexical local à partir des manifests de chunks.

Lorsque Mistral et Qdrant sont configurés, le service ajoute :

1. un embedding de la requête ;
2. une recherche vectorielle Qdrant ;
3. une fusion Reciprocal Rank Fusion entre classements lexical et vectoriel.

Le résultat indique le mode réellement utilisé : `lexical` ou `hybrid`.

## Limites de sécurité

- les chemins déposés doivent être absolus et pointer vers des fichiers existants ;
- seuls les formats explicitement autorisés sont acceptés ;
- un lot est limité à 50 fichiers ;
- l’ouverture d’un document passe par son identifiant dans `index.json` ;
- les chemins calculés doivent rester dans `.ide-ai/rag` ;
- aucun HTML documentaire n’est injecté dans la fenêtre : les contenus sont affichés avec `textContent`.
