# UNLIVED — API PHP et SQLite partagée sur Hostinger

## Architecture

L’hébergement PHP est la source centrale. `api.php` traite l’authentification, les requêtes de données, les opérations métier et le tracking. `business-api.php` contient le catalogue, les paniers, favoris, commandes, campagnes, promotions, affiliations, retraits, demandes et statistiques.

Tous les nouveaux enregistrements PHP utilisent `.data/auth.sqlite3` et sa clé `.data/auth.key`. Le navigateur ne reçoit aucun accès SQL direct. Les champs personnels sont chiffrés ; mots de passe hachés, sessions et jetons vérifiés côté serveur. L’inscription publique ne permet jamais de choisir un rôle administrateur.

Le serveur de prévisualisation `python3 server.py --port 8081` transmet ses requêtes à `https://unlived.club` par HTTPS. Il n’initialise aucune base locale et n’y enregistre rien en cas de panne du serveur partagé. Les cookies de développement sont HttpOnly et limités à localhost. Une ancienne session locale nécessite une reconnexion. Le mode `--standalone` conserve le backend Python pour une installation autonome explicite sur VPS ; il n’est pas le mode de développement habituel.

## Déploiement PHP

1. Sauvegarder le dossier privé `.data` de l’hébergement, en conservant ensemble les bases et leurs clés.
2. Déployer le dépôt à jour, notamment `.htaccess`, `api.php`, `auth-mail.php`, `business-api.php`, `translations.php`, `waitlist-api.php`, `waitlist-admin.php`, `waitlist-export.php`, `auth-test-import.php`, les fichiers HTML/JS et `data/catalog.json`. Ne pas remplacer `.data` ni envoyer une base locale à sa place.
3. Utiliser PHP 8.3 maintenu et à jour avec `pdo_sqlite` et `openssl`. Le dossier du site doit permettre la création du répertoire privé `.data` par PHP. `.htaccess` bloque son accès Web et celui des modules internes.
4. Configurer les secrets Resend sur l’hébergement : `RESEND_API_KEY`, `RESEND_FROM`, `EMAIL_PUBLIC_ORIGIN=https://unlived.club`. Le fichier `.env` local n’est pas publié par Git ; sa configuration doit également exister sur Hostinger pour les e-mails en ligne.
5. Configurer une tâche cron chaque minute : `php /chemin/du/site/scripts/send-auth-emails.php`. Elle reprend les envois non aboutis sans nécessiter une visite du site.
6. Vérifier la connexion, le catalogue, une modification de variante, une inscription et son avis, le tableau de bord et les exports.

Les modifications ne sont pas appliquées à l’hébergement simplement parce qu’elles existent dans le dépôt local. Le déploiement Hostinger doit avoir récupéré cette version.

## Reprise des données existantes

Au premier appel de l’API, le catalogue est importé une seule fois depuis `data/catalog.json`. Les modifications ultérieures faites dans l’administration ne sont pas écrasées par un redéploiement du catalogue.

Si `.data/waitlist.sqlite3` existe, ses inscriptions et avis sont déchiffrés avec `waitlist.key` puis repris dans la base centrale, dans une transaction. Les liens entre inscriptions et questionnaires sont conservés. Une migration enregistrée empêche leur réimportation répétée. En cas de clé manquante ou de déchiffrement impossible, l’opération échoue sans valider une migration partielle. Les anciens fichiers restent conservés comme historique et ne reçoivent plus les nouvelles inscriptions.

Les comptes PHP existants restent dans la même base avec leurs rôles et mots de passe. Les données du backend Python historique ne sont pas automatiquement copiées : son format et sa clé sont différents. Ne pas renommer `unlived.sqlite3` en `auth.sqlite3`.

Pour les deux comptes de test locaux uniquement, l’administration waitlist propose **Restaurer mes comptes administrateur et client**. Choisir le fichier privé `.data/transfert-comptes-test.json`, puis confirmer. L’import autorise uniquement contact@unlived.club (administrateur) et client.test@unlived.example (client), conserve leurs rôles fixes et révoque leurs sessions. L’ancien admin.test@unlived.example est renommé en contact@unlived.club en conservant son identifiant, ses données et le mot de passe haché du transfert. Si les deux adresses existent déjà comme comptes distincts, l’import est refusé sans fusion. Les anciens fichiers de transfert v1 restent acceptés et migrent également vers contact@unlived.club. Le fichier contient des hachages bcrypt, pas de mots de passe en clair ; il est ignoré par Git et doit rester privé. L’adresse client de test `.example` ne peut pas recevoir les e-mails de récupération ; l’administrateur utilise désormais contact@unlived.club.

## Administration et exports

Le compte administrateur est redirigé vers `admin.html`. La redirection forcée du tableau de bord en ligne vers l’ancienne page waitlist a été supprimée. Les droits sont contrôlés dans l’API, pas seulement dans l’interface.

L’ancienne page `waitlist-admin.php` reste disponible pour les exports et le provisionnement initial. Elle accepte le code administrateur existant ou une session du compte administrateur principal. L’authentification par code est limitée côté stockage persistant. Le code privé n’est pas affiché dans la documentation. Le formulaire **Créer mon compte administrateur sur le site** ne remplace jamais un compte existant et impose la politique de mot de passe.

L’export XLSX comprend les onglets Inscriptions et Avis, avec filtres et première ligne figée. Les numéros de téléphone restent du texte et les réponses ne deviennent jamais des formules. Importer le fichier dans Google Sheets via Fichier → Importer. Le CSV avec séparateur point-virgule reste disponible, ainsi que les exports filtrés du tableau de bord.

## Routes et fonctions

Les routes de données utilisent POST JSON, `X-UNLIVED-Request: 1`, des cookies de session et un contrôle d’origine.

| Route | Fonctions |
| --- | --- |
| `/api/translations/fr` (GET, cinq langues) | Dictionnaires de traduction, cache HTTP et ETag |
| `/api/auth` | Session, connexion, inscription, déconnexion, confirmation e-mail, récupération, changement d’identifiants |
| `/api/data` | Lecture/écriture autorisées sur produits, variantes, médias, favoris, commandes, messages, inscriptions et avis ; relations imbriquées du client existant |
| `/api/business` | Tableau de bord, compte client, paniers, candidatures, liens affiliés uniques, retraits, demandes, campagnes, promotions, paramètres, état des e-mails et reprise de leur envoi |
| `/api/track` | Événements consentis, déduplication, exclusion administrateur/IP, attribution affiliée persistante |
| `/api/waitlist` ou `waitlist-api.php` | Inscription et questionnaire avec jeton personnel |

Les visiteurs ne lisent que le catalogue actif. Les clients ne lisent que leurs propres favoris, paniers et commandes. Les opérations administratives exigent le rôle validé par le serveur. Une modification de produit, variante et médias est atomique ; une variante invalide annule l’ensemble. Les suppressions de produits retirent aussi leurs variantes, médias et favoris.

Un code affilié est créé à la candidature et conservé lors de l’activation. L’attribution consentie dure 30 jours : jeton de cookie HttpOnly, liaison au compte à la connexion, puis conservation dans le panier et la commande. Les achats personnels et les affiliations suspendues sont exclus. Le tracking ne stocke aucune IP brute ; les exclusions utilisent un HMAC et les identifiants visiteurs tournent mensuellement. Les événements sont conservés 395 jours.

Comme dans le backend Python, aucun navigateur ni administrateur ne peut déclarer un paiement confirmé via l’API de données. Seules les commandes réellement confirmées côté serveur entrent dans les commissions, après le délai de retenue. Un retrait réserve le solde pour éviter sa réutilisation. Le prestataire de paiement et les virements réels ne sont pas implémentés par ce portage.

## Vérifications

Tests isolés, sans écriture en production :

```sh
php scripts/test-php-backend.php
python3 scripts/test-shared-api.py
```

Le test PHP utilise une copie temporaire des modules et un catalogue de référence. Il vérifie notamment migration chiffrée/idempotente, permissions, modifications atomiques, favoris, inscription/avis, affiliation et retour, commandes, commissions, retraits, marketing, suivi et suppression.

Un test HTTP PHP WebAssembly est fourni : installer `@php-wasm/cli` dans un dossier temporaire puis définir `UNLIVED_PHP_WASM_MODULES` vers son dossier `node_modules` et lancer `node scripts/test-php-http.mjs`. Ce test exerce les routes réelles, cookies, sessions, contrôle d’origine, waitlist et export avec une session administrateur. Aucun secret `.env` réel n’est chargé.

La validation locale PHP 8.3 avec SQLite/OpenSSL ne remplace pas le contrôle après déploiement sur PHP/Apache Hostinger. Les extensions, permissions, règles de réécriture et secrets de cet hébergement doivent être présents.

Guides complémentaires : `docs/SECURITE-AUTHENTIFICATION.md` et `docs/GUIDE-SEO-GEO-MISE-EN-LIGNE.md`.

## Isolation des comptes et favoris

Les favoris sont privés à leur propriétaire pour tous les rôles, y compris administrateur. Un `user_id` fourni à l’écriture doit correspondre à la session ; il ne permet pas de choisir un autre propriétaire. Les filtres de lecture, mise à jour et suppression ne peuvent pas élargir ce périmètre. Le tableau de bord et ses exports ne contiennent plus de métriques ni de listes de favoris. Les favoris ne créent ni événement d’audit administratif ni e-mail de notification.

Le panier connecté est chargé depuis le serveur, même lorsqu’il est vide. Les écritures vérifient le compte attendu, et le navigateur ignore les réponses d’un ancien compte. Les données personnelles de l’espace client sont effacées de l’interface à la déconnexion. Le panier invité reste indépendant ; il n’est pas fusionné silencieusement avec celui d’un client.

Test fonctionnel de l’interface sans réseau : `UNLIVED_JSDOM_MODULE=/chemin/vers/jsdom node scripts/test-client-isolation.cjs`. Il utilise une API simulée et vérifie deux clients, les réponses retardées, les rubriques, le menu mobile et la déconnexion. Il ne constitue pas un contrôle visuel dans un navigateur réel.

## Bande défilante et résiliations

Marketing permet de régler le texte, un code facultatif, le lien interne, la visibilité, le mode fixe/défilant et la durée de passage (5 à 180 secondes). Le bandeau est affiché au-dessus de la navigation publique et dans l’espace client. Il peut être mis en pause ; les préférences de réduction des animations sont respectées. L’aperçu reprend les paramètres enregistrés.

Les demandes de résiliation sont privées au client, stockées dans la base centrale et présentées dans Demandes côté administrateur. Le badge du menu est actualisé périodiquement lorsque l’administration est visible. Ouvrir cette rubrique recharge les demandes. Le traitement reste distinct d’une suppression définitive : le client reçoit un statut dans son espace.

Les modules d’animation GSAP sont désormais dans `assets/vendor/` : publier ce dossier avec les fichiers HTML et `.htaccess`. La politique CSP n’autorise plus les scripts de CDN. La nouvelle migration `personal-data-v2` réencode les données personnelles existantes avec conservation des types et compatibilité avec les anciens champs chiffrés. Sauvegarder le dossier privé avant mise à jour et contrôler ensuite le site avec les nouvelles règles HTTPS/CSP sur Hostinger.
