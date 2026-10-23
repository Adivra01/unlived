# Revue de sécurité et de fonctionnement — 23 octobre 2026

## Portée et état

Revue du code PHP/SQLite, du backend Python conservé, des scripts client/admin, des parcours de compte, des exports et de la configuration Web. Tests d’attaque et de régression exécutés sur des bases temporaires ; contrôle en lecture seule de plusieurs protections du domaine public. Cette revue ne constitue ni une certification, ni un pentest exhaustif de l’infrastructure Hostinger. Elle ne peut pas garantir « aucune intrusion possible ».

Les modifications de cette itération restent à publier sur Hostinger. Les règles Apache/LiteSpeed, CSP, redirections et envois réels doivent être contrôlés après déploiement. Le paiement n’est pas ouvert.

## Corrections et protections vérifiées

| Sujet | Mesure |
| --- | --- |
| Routage | Le rôle serveur dirige un client connecté sur admin.html vers compte.html#apercu. Un administrateur depuis compte.html rejoint admin.html. La connexion n’est pas annulée parce que le rôle est client. |
| Autorisation | Les actions privilégiées utilisent le rôle relu depuis la session serveur. Le navigateur ne peut pas choisir son rôle à l’inscription. |
| Isolation | Favoris, panier, commandes et demandes sont limités au propriétaire. Les favoris ne remontent ni au tableau de bord ni aux notifications administrateur. |
| Données anciennes dans l’interface | Les panneaux métier et la liste globale des clients sont effacés à la déconnexion. Les anciennes réponses asynchrones ne peuvent pas remplir l’aperçu public ou le compte suivant. Le dialogue de modification est fermé lors de la déconnexion. |
| Chiffrement | Les champs personnels applicatifs utilisent AES-256-GCM en PHP et Fernet dans le backend Python. La nouvelle sérialisation préserve les objets et tableaux, chiffre les champs sensibles imbriqués et reste compatible avec les anciens formats. |
| Reprise du chiffrement | Une migration atomique et idempotente réencode les anciennes lignes applicatives. Les identifiants, relations et dates sont conservés. La base et la clé restent nécessaires ensemble. |
| Mots de passe | Hachage salé Argon2id si disponible ; sinon bcrypt avec coût 12 pour les nouveaux hachages. La politique de création/changement reste vérifiée côté serveur. Les anciens mots de passe ne sont pas modifiés par cette revue. |
| Sessions et CSRF | Cookies HttpOnly, Secure sur le domaine HTTPS, SameSite, expiration ; vérification de l’origine et en-tête applicatif sur les API, jeton CSRF pour les formulaires de maintenance. |
| Récupération | Jetons aléatoires à durée limitée, finalité vérifiée, usage unique et révocation des sessions. Les e-mails restent chiffrés dans la file d’envoi. |
| Injection SQL | Identifiants SQL issus des listes de tables autorisées ; valeurs liées par requêtes préparées. Les filtres applicatifs ne sont pas concaténés comme des expressions SQL. Les payloads d’injection testés sont refusés ou traités comme des valeurs. |
| XSS et navigateur | Contenus utilisateurs échappés ou créés par textContent ; CSP restrictive sans unsafe-eval ni scripts inline génériques. L’introduction statique utilise une empreinte exacte. Base, objets et encadrement sont bloqués ; permissions caméra/micro/géolocalisation désactivées. |
| Dépendances | GSAP/ScrollTrigger 3.13.0 sont servis depuis assets/vendor, avec en-têtes de licence conservés et empreintes SHA-256 vérifiées. Le navigateur ne charge plus ces scripts depuis un CDN. La page sécurité amont consultée n’affiche pas d’avis publié ; cela ne prouve pas l’absence de défaut. |
| Fichiers privés | .env, .git, .data, bases, clés et modules internes sont interdits côté Web. Le module de vérification waitlist et les journaux SQLite sont également bloqués dans la configuration préparée. |
| Transport | Redirection vers le domaine canonique HTTPS et HSTS préparés pour toutes les pages. L’API conserve ses protections anti-cache, anti-MIME-sniffing et de cadrage. |
| Paiement | Les champs carte/PAN/CVV/CVC sont refusés, y compris imbriqués. Les opérations de données ne peuvent pas déclarer un paiement confirmé, un montant payé ou une commission. Les commissions ne reposent que sur des commandes confirmées côté serveur. |
| Résiliation | Demande enregistrée en base, visible à l’administrateur, compteur des demandes à traiter et statut propre au client. Aucune suppression irréversible automatique n’est déclenchée. |
| Bandeau | Réglages réservés à l’administrateur, durée bornée, lien interne validé et contenu textuel non interprété comme HTML. Pause clavier/souris et mode de mouvement réduit. |

## Résultats des vérifications

- **26 tests PHP** d’intégration SQLite/OpenSSL passent, dont injection, isolation, données structurées, migration, refus des cartes, résiliation et paramètres du bandeau.
- **20 tests Python** passent : 8 d’authentification, 7 de parcours métier et 5 de proxy partagé.
- Les parcours HTTP PHP passent : connexion, session, cookies, rôles, contrôle d’origine, confirmation e-mail, récupération, invalidation des anciens jetons et sessions, traductions, inscription/avis et export XLSX.
- Les tests DOM passent pour les deux rôles, à la connexion et avec une session existante ; le bandeau et son formulaire d’administration ; la confidentialité de l’aperçu ; les sept rubriques client ; les changements de compte, réponses retardées, panier serveur vide et boutons œil.
- L’audit structurel contrôle 17 pages HTML et 12 URL publiques, sans erreur ; l’audit CSP/dépendances ne relève pas d’incohérence dans les fichiers préparés.
- Les contrôles de syntaxe JavaScript/PHP et de JSON passent.

Les tests DOM ne remplacent pas une inspection visuelle sur téléphone et ordinateur. Les tests PHP utilisent un runtime PHP 8.3 avec SQLite/OpenSSL ; ils n’émulent pas les règles Apache/LiteSpeed de Hostinger.

## Vérifications effectuées sur le site publié

Le sitemap répond 200 ; ses 12 pages répondent 200 et leurs canoniques correspondent aux URL du sitemap. Les requêtes sur /.env, /.git/config, /.data/auth.sqlite3, /business-api.php et /auth-mail.php répondent 403, sans récupération de contenu sensible.

X-Frame-Options, X-Content-Type-Options et Referrer-Policy sont présents. HSTS n’était pas présent sur compte.html au moment du contrôle ; il est ajouté à la configuration préparée. Cette observation ne doit pas être confondue avec une confirmation de déploiement de la nouvelle politique.

La restauration des deux comptes et leur connexion API avaient été vérifiées en ligne lors de l’itération précédente. Le bug corrigé ici concerne le routage du client depuis l’interface admin.

## Points qui restent hors de cette validation

- Déployer ensemble les modules, scripts, pages, `.htaccess` et assets/vendor ; vérifier HTTPS/www, absence de boucle de redirection, console CSP et animations sur le domaine réel.
- Choisir une branche PHP maintenue et appliquer ses mises à jour. PHP 8.3 est la version de test ; PHP 8.1 ne doit plus être la recommandation d’hébergement en octobre 2026. Voir [le calendrier officiel PHP](https://www.php.net/supported-versions.php).
- L’accès, MFA, pare-feu/WAF, système, sauvegardes et restauration de l’hébergement ne sont pas administrés ni certifiés par ces tests. Une copie du fichier SQLite et de sa clé doit rester privée et restaurable.
- Les champs publics du catalogue et les identifiants relationnels ne sont pas tous chiffrés. Le chiffrement des informations personnelles n’est pas un chiffrement intégral du disque. Une compromission du serveur disposant de la clé reste un risque distinct.
- Les exports demandés par un administrateur contiennent les informations déchiffrées nécessaires à leur utilisation ; ils ne doivent pas être publiés comme liens publics.
- Aucun prestataire de paiement ni webhook de confirmation signé n’est connecté. Leur intégration et leur recette seront nécessaires avant toute vente réelle ; aucune conformité de paiement n’est affirmée ici.
- La politique de confidentialité a été complétée sur les favoris, paniers, résiliation et protections. L’identité légale, l’adresse et certaines durées/localisations restent à renseigner avec des informations réelles.
- Search Console refuse l’accès aux propriétés UNLIVED avec le compte Google actuellement connecté. Aucun sitemap n’a été soumis dans cette session. Voir le guide SEO/GEO pour la validation DNS et l’envoi.
- UNLIVED est une activité uniquement en ligne, confirmé par son propriétaire : aucune fiche Google Business/Maps n’a été créée, cette configuration n’étant pas éligible. Le référencement du site reste traité via Search Console et le sitemap.

Source dépendance consultée : [sécurité amont GSAP](https://github.com/greensock/GSAP/security). Guide opérationnel : `GUIDE-SEO-GEO-MISE-EN-LIGNE.md`.
