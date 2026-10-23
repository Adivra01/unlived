# Mettre UNLIVED en ligne sur Hostinger

Cette archive contient l’application web Python complète. Elle ne peut pas être hébergée comme un simple site statique : l’API et SQLite gèrent les comptes, favoris, produits, inscriptions à la waitlist et réponses au questionnaire.

## Déploiement Git sur l’hébergement Web Hostinger

La liste d’attente et son questionnaire utilisent `waitlist-api.php` lorsque le site est publié sur un domaine. Les inscriptions sont enregistrées dans `.data/waitlist.sqlite3` avec les champs personnels chiffrés. Dans hPanel → PHP Configuration, utiliser PHP 8+ et activer `pdo_sqlite` et `openssl`. Le répertoire du site doit être accessible en écriture par PHP pour créer `.data` ; le fichier `.htaccess` interdit l’accès Web à ce dossier. Sauvegarder ensemble `waitlist.sqlite3` et `waitlist.key` : sans cette clé, les données chiffrées sont illisibles.

Après le déploiement Git, ouvrir le formulaire de liste d’attente et effectuer une inscription réelle de contrôle. Si une erreur mentionne `pdo_sqlite`, activer l’extension dans hPanel. Le questionnaire suit immédiatement l’inscription.

L’administration de cette liste est disponible à `https://unlived.club/waitlist-admin.php`. Le code d’accès généré pour ce déploiement est conservé uniquement dans le fichier local privé `.data/waitlist-admin-password.txt` ; il ne figure pas dans Git. Cette page montre les inscriptions, les trois réponses et permet d’exporter un CSV pour Excel ou Google Sheets. Les inscriptions faites en local avec Python se trouvent dans une autre base et ne remontent pas automatiquement sur Hostinger.

La création de compte, la connexion, la déconnexion et la modification des identifiants passent par `api.php` sur l’hébergement Web. Ces comptes sont stockés séparément de la base Python locale ; les anciens comptes locaux ne sont pas importés automatiquement. Les favoris, commandes, tableaux de bord et autres routes métier utilisent encore le serveur Python. Ils nécessitent la configuration VPS ci-dessous ou une conversion supplémentaire vers PHP.

## Offre Hostinger requise pour l’application complète

Ce projet est une application Python avec une base SQLite persistante. Il faut un **VPS Hostinger** avec accès SSH/root. L’intégration Git des offres d’hébergement Web classiques déploie des sites PHP ou statiques et ne lance pas ce serveur Python. Un ZIP ou un push Git seul ne rend donc pas le backend exécutable sur une offre Web classique.

Sur le VPS, installer Python 3.10 ou plus récent et Git, cloner ce dépôt dans un répertoire privé, puis installer les dépendances :

```sh
git clone https://github.com/Adivra01/unlived.git
cd unlived
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

Lancer le serveur derrière un reverse proxy HTTPS (par exemple Nginx), en le liant à `127.0.0.1`. Le fichier `Procfile` est destiné aux plateformes qui utilisent ce format ; un VPS Hostinger standard ne le lance pas automatiquement. Exemple de commande de premier démarrage :

```sh
PUBLIC_ORIGIN=https://unlived.club .venv/bin/python server.py --host 127.0.0.1 --port 8081
```

Pour garder le service actif après fermeture de la session SSH et le redémarrer après un reboot, configure-le comme service `systemd`, puis configure Nginx et le certificat HTTPS pour `unlived.club`.

Définir comme variable d’environnement persistante du service :

```text
PUBLIC_ORIGIN=https://unlived.club
```

Pour le suivi derrière un reverse proxy local, définir aussi `TRUSTED_PROXIES=127.0.0.1/32,::1/128`
et transmettre `X-Forwarded-For` depuis ce proxy. Seuls les proxys explicitement autorisés peuvent
déclarer l’adresse du visiteur. Sans cette configuration, une requête provenant de localhost est
exclue des statistiques. Une connexion administrateur exclut son navigateur et son IP pendant un an,
y compris après déconnexion. Les IP exclues sont conservées sous forme de HMAC, jamais dans les événements.

L’attribution affiliée consentie dure 30 jours : cookie HttpOnly, association au compte à la connexion,
puis conservation sur le panier et sur la commande créée. Le code et le taux sont figés sur cette commande.
Un code invalide, suspendu ou appartenant à l’acheteur ne génère aucune attribution. Le futur prestataire
de paiement devra confirmer le paiement côté serveur et calculer la commission à partir de la commande ;
les visites et paniers ne sont jamais considérés comme des ventes payées.

Tests des parcours sur base temporaire : `python3 scripts/test-workflows.py`.

Le domaine doit pointer vers le service et le trafic public doit passer en HTTPS. Si l’hébergeur attribue un autre domaine, remplacer la valeur par l’adresse HTTPS réellement utilisée.

## Disque et données

Le répertoire `.data` à la racine du projet contient la base SQLite et la clé de chiffrement. Il doit rester sur le stockage persistant du VPS et être sauvegardé avec des permissions privées. Au premier démarrage, l’application initialise les tables et importe les trois t-shirts depuis `data/catalog.json`. Ne place pas `.data` dans le répertoire public servi par Nginx.

L’archive ne contient volontairement ni base locale, ni clé de chiffrement, ni comptes de test. L’application créera une nouvelle clé dans `.data/encryption.key` au premier démarrage. Garder ce fichier privé et le sauvegarder avec la base. Si la clé est perdue, les champs personnels chiffrés ne pourront plus être déchiffrés.

Après le premier déploiement, utiliser la console du service pour créer l’administrateur :

```sh
python3 manage.py create-user --email ton-adresse@example.com --role admin --name Administrateur
```

La commande demande un mot de passe et l’affiche une seule fois. Créer un mot de passe unique, puis ouvrir `https://unlived.club/admin.html`.

## Sauvegardes et fonctions disponibles

Créer des sauvegardes régulières depuis la console du service :

```sh
python3 manage.py backup
```

Stocker ces sauvegardes dans un emplacement privé distinct du site. L’envoi de courriels, le paiement des commandes et le versement automatique des commissions ne sont pas activés : ils attendent la configuration de leurs prestataires.

La configuration de l’indexation, du sitemap, des breadcrumbs et de Google Search Console est détaillée dans `docs/GUIDE-SEO-GEO-MISE-EN-LIGNE.md`.

## E-mails de sécurité

Voir `docs/SECURITE-AUTHENTIFICATION.md`. Définir les secrets Resend sur le serveur, `EMAIL_PUBLIC_ORIGIN=https://unlived.club`, et une adresse expéditrice autorisée. Pour PHP, configurer une tâche cron chaque minute : `php /chemin/prive/du/projet/scripts/send-auth-emails.php`. Les nouvelles inscriptions publiques exigent une confirmation.
