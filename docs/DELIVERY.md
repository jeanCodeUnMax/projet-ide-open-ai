# État de livraison — MVP 0.3.0

## Validé dans l’environnement de construction

- syntaxe JavaScript/ESM de tous les fichiers ajoutés ;
- validation de l’Agent Card de l’orchestrateur ;
- registre d’agents et recherche par tags ;
- cycle de vie des tâches A2A et transitions interdites ;
- serveur A2A local : découverte, envoi d’un message, exécution et artefact ;
- adaptateur Hephaistos configurable et mode neutre lorsqu’il est absent ;
- chunking, tags déterministes, manifests et index documentaire ;
- génération d’identifiants UUID déterministes compatibles avec Qdrant ;
- ingestion réelle d’un fichier texte vers `.ide-ai/rag/` ;
- normalisation MCP, variables d’environnement et limite de 100 outils ;
- isolation des profils OpenFox selon la plateforme.

Commandes exécutées :

```bash
npm run check
node scripts/ingest-document.mjs <fichier-texte> --workspace <workspace>
node scripts/a2a-dev-server.mjs
curl http://127.0.0.1:43110/.well-known/agent-card.json
curl -X POST http://127.0.0.1:43110/message:send ...
```

Résultat automatisé : **20 tests réussis, 0 échec**.

La tranche 0.3 ajoute le registre persistant d’agents, la file d’ingestion avec progression, la recherche lexicale et la fusion vectorielle optionnelle.

Le test HTTP A2A a produit une tâche `TASK_STATE_COMPLETED` avec un artefact. Le test RAG a produit `document.md`, `manifest.json`, `index.json` et `INDEX.md`.

## Non validé dans l’environnement de construction

L’environnement ne permet pas d’installer les dépendances npm ni les outils système supplémentaires. Les éléments suivants n’ont donc pas été testés de bout en bout ici :

- lancement Electron/OpenFox après `npm install` ;
- OCR d’un PDF réel avec Poppler, OCRmyPDF et Tesseract ;
- description d’images par un modèle vision externe ;
- appel réel à l’API d’embeddings Mistral ;
- création de collection et upsert réel dans Qdrant ;
- connexion au service Hephaistos-kit réel, dont le contrat HTTP exact reste à mapper.

Ces validations doivent être exécutées dans un workspace équipé des services concernés.
