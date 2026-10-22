# Mettre UNLIVED en ligne

Cette archive contient l’application web Python complète. Elle ne peut pas être hébergée comme un simple site statique : l’API et SQLite gèrent les comptes, favoris, produits, inscriptions à la waitlist et réponses au questionnaire.

## Hébergement requis

Choisir un hébergeur qui accepte une application Python 3.10+ et fournit un disque persistant. Installer le contenu du ZIP à la racine du service. Le fichier `Procfile` donne la commande de démarrage ; si l’hébergeur demande une commande, utiliser :

```sh
python3 server.py --host 0.0.0.0 --port $PORT
```

Définir cette variable d’environnement sur le service :

```text
PUBLIC_ORIGIN=https://unlived.club
```

Le domaine doit pointer vers le service et le trafic public doit passer en HTTPS. Si l’hébergeur attribue un autre domaine, remplacer la valeur par l’adresse HTTPS réellement utilisée.

## Disque et données

Monter un disque persistant sur le chemin `.data` à la racine de l’application. Au premier démarrage, l’application crée la base SQLite, initialise les tables et importe les trois t-shirts depuis `data/catalog.json`. Sans ce disque persistant, les comptes, inscriptions et questionnaires peuvent disparaître lors d’un redéploiement.

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
