# Authentification et e-mails — vérifications du 23 octobre 2026

## Configuration

Les secrets se trouvent dans `.env`, ignoré par Git, avec des permissions locales 0600.
Ne jamais inclure ce fichier dans une archive publique ni afficher la clé dans les journaux.

Variables : `RESEND_API_KEY`, `RESEND_FROM`, `EMAIL_PUBLIC_ORIGIN`.
Le serveur Python relit ce fichier pour chaque envoi : une modification de clé ne nécessite pas de redémarrage.
Pour le développement, l’origine est `http://localhost:8081`. Pour l’hébergement public, utiliser
`https://unlived.club`, et configurer également `PUBLIC_ORIGIN=https://unlived.club` pour Python.
Les liens ne sont jamais construits à partir de l’en-tête Host envoyé par le visiteur.

La clé configurée a permis de consulter le statut vérifié de `unlived.club` et d’effectuer un envoi
de simulation Resend accepté. Cela valide l’intégration API, pas la réception dans toutes les boîtes réelles.

## Parcours

- Inscription : aucun accès connecté avant confirmation. Les comptes existants et les comptes provisionnés
  par la commande de gestion restent reconnus ; la nouvelle exigence concerne les inscriptions publiques.
- Confirmation : lien valable 24 heures, usage unique et validation explicite sur la page.
- Mot de passe oublié : même réponse pour une adresse connue ou inconnue ; lien valable 30 minutes.
- Réinitialisation : vérification du jeton et de la règle de mot de passe, invalidation de toutes les sessions
  et des autres jetons, notification par e-mail. Aucune connexion automatique avec le lien.
- Changement d’adresse : mot de passe actuel obligatoire, ancienne adresse conservée jusqu’à validation de
  la nouvelle. Les anciennes sessions sont alors invalidées et l’ancienne adresse reçoit une notification.
- Mot de passe : règle demandée de 8 à 256 caractères, majuscule A–Z, chiffre et ponctuation. Validation
  sur le serveur, indépendamment du navigateur. Python utilise scrypt avec sel ; PHP utilise Argon2id
  si disponible, sinon bcrypt avec rejet explicite au-delà de 72 octets pour éviter la troncature.

Les liens transportent leur jeton dans le fragment de l’URL, supprimé dès l’ouverture de la page.
Une visite GET, notamment par un scanner de messagerie, ne confirme rien. Le jeton n’est consommé que par
un POST explicite. La base des jetons conserve uniquement leur SHA-256 ; les e-mails en attente sont chiffrés.

## File d’envoi

Python démarre un worker avec le serveur. Il récupère les messages toutes les deux secondes, supprime
les messages expirés ou dont le jeton a déjà été invalidé, et réessaie jusqu’à cinq fois avec délai progressif.
Une clé d’idempotence stable évite les doubles envois lors des reprises. Les erreurs n’affichent ni clé ni jeton.
Configuration affiche le nombre d’envois en attente/échec et permet de relancer les échecs.

Sur PHP 8.1 ou supérieur, les requêtes réussies traitent la file après la réponse lorsque FastCGI le permet. Ajouter une
tâche cron chaque minute pour les reprises même en l’absence de visite :

```sh
php /chemin/prive/du/projet/scripts/send-auth-emails.php
```

Ce script refuse toute exécution depuis HTTP. La clé `.env` doit être renseignée séparément sur l’hébergement
puisqu’elle n’est pas déployée par Git. Le backend PHP centralise les données métier dans `auth.sqlite3` et reprend l’ancienne waitlist
dans une migration atomique. La prévisualisation locale relaie vers cette API ; les anciennes bases
Python ne sont ni utilisées dans ce mode, ni copiées automatiquement sur Hostinger.

## Audit local et tests

```sh
python3 scripts/test-auth-security.py
python3 scripts/test-workflows.py
```

15 tests passent sur des bases et comptes temporaires. Le fournisseur d’e-mails est simulé dans ces tests.
Les vérifications couvrent les mots de passe faibles, l’absence de session avant confirmation, les faux rôles,
les liens expirés/aléatoires/réutilisés ou utilisés pour le mauvais objectif, la révocation des sessions,
la confirmation du changement d’adresse, la réponse non énumérante de récupération, la limitation persistante
des tentatives, le CSRF, l’accès aux fichiers privés et aux données d’un autre compte, le chiffrement et la
reprise des e-mails. Les tests existants couvrent aussi produits, disponibilité, attribution affiliée et tracking.

Les contrôles du DOM vérifient l’absence de requête lors du simple chargement d’un lien, le retrait du jeton
de l’URL, la confirmation explicite et l’accord des deux mots de passe. La syntaxe PHP 8.3 est analysée,
et le backend est exécuté en PHP 8.3 WebAssembly avec SQLite/OpenSSL sur des bases temporaires :
19 tests métier, plus les parcours HTTP de session, contrôle d’origine, confirmation e-mail,
récupération, jetons à usage unique et export XLSX. Voir `scripts/test-php-backend.php` et
`scripts/test-php-http.mjs`. Apache Hostinger, la tâche cron et les envois depuis cet hébergement
restent à vérifier après déploiement.

Protections renforcées : limites de tentatives persistantes même après un échec, vérification de session
sous transaction lors des changements sensibles, limitation de l’énumération, CSP stricte sur la page de
challenge, absence de référent et protection contre l’intégration en frame. Apache interdit les fichiers
cachés, clés, bases et journaux SQLite, archives, code Python et répertoires internes.

Il s’agit d’une revue ciblée et de tests locaux, pas d’un pentest exhaustif du serveur public ni d’une garantie
d’absence de toute vulnérabilité. La validation en production doit inclure réception réelle des messages,
HTTPS, configuration Apache/PHP, cron et sauvegarde sécurisée des clés et bases.

Références de conception : [OWASP — Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html),
[API d’envoi Resend](https://resend.com/docs/api-reference/emails/send-email),
[idempotence Resend](https://resend.com/changelog/idempotency-keys),
[adresses de simulation officielles](https://resend.dev/).
