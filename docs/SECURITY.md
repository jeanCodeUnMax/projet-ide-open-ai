# Sécurité

## Mesures actives

- Interface OpenFox servie uniquement sur `127.0.0.1`.
- Profil OpenFox isolé du profil utilisateur standard.
- `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`.
- IPC limité à des opérations nommées ; aucun exécuteur de commande générique n’est exposé au renderer Electron.
- Validation stricte des noms, transports, URL, tableaux et dictionnaires MCP.
- Refus explicite des transports non pris en charge.
- Pas de `shell: true` lors du lancement de Node/OpenFox.
- Les liens externes sont ouverts dans le navigateur système et les navigations non autorisées sont bloquées.
- Le fichier exporté conserve les placeholders d’environnement plutôt que les secrets résolus.

## Risques résiduels

Un serveur MCP est du code tiers possédant les droits du compte utilisateur. Avant d’ajouter un MCP :

1. vérifier l’éditeur et le dépôt source ;
2. figer la version du paquet ;
3. limiter les variables d’environnement transmises ;
4. désactiver les outils inutiles ;
5. ne jamais importer une configuration MCP non vérifiée ;
6. exécuter les serveurs sensibles dans un conteneur ou un compte système restreint.

## Secrets

Les placeholders `${env:VAR}` sont résolus au démarrage. La copie résolue est écrite dans le profil runtime OpenFox parce que le moteur audité ne gère pas encore une couche secrète native. Le profil est isolé, mais cette solution ne remplace pas un trousseau système. La phase 2 doit utiliser `safeStorage`/Keychain/Credential Manager/libsecret.
