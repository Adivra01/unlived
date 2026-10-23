# UNLIVED — SQLite

## Démarrer

```sh
python3 server.py --port 8081
```

Site : http://127.0.0.1:8081/index.html
Administration : http://127.0.0.1:8081/admin.html
Compte client : http://127.0.0.1:8081/compte.html

Utiliser ce serveur Python, pas un serveur statique : les comptes et inscriptions nécessitent l’API locale.
Python 3.10+ et sa bibliothèque standard suffisent. Le catalogue initial est dans `data/catalog.json`.
Son import se fait une seule fois. Le catalogue contient les références actuelles et les futurs chapitres en brouillon.
La base persistante est `.data/unlived.sqlite3` ; ce dossier est privé, ignoré par Git et non servi par HTTP.
Aucun compte n’est créé automatiquement au démarrage.

## Comptes et accès

```sh
python3 manage.py create-user --email admin@example.com --role admin --name Administrateur
python3 manage.py create-user --email client@example.com --role client --name Client
python3 manage.py backup
```

Les mots de passe générés ne sont affichés qu’à la création. Ils sont stockés sous forme de hachage scrypt salé.
Sessions aléatoires, cookie HttpOnly/SameSite, expiration à 7 jours. Les rôles sont vérifiés côté serveur.
L’inscription publique crée uniquement des clients. Les clients ne lisent que leurs favoris et commandes.
La modification de l’e-mail ou du mot de passe exige le mot de passe actuel.
Les confirmations d’adresse et la récupération par e-mail utilisent Resend et une file d’envoi chiffrée.
Configuration et tests : [sécurité de l’authentification](docs/SECURITE-AUTHENTIFICATION.md).

## Liste d’attente et avis

Choix produit et taille → coordonnées et consentement → remerciement et questionnaire.
Les inscriptions et réponses sont enregistrées dans SQLite et réservées aux administrateurs.
Administration → Liste d’intérêt : recherche, filtre produit, avec/sans réponse, actualisation.
Trois exports CSV UTF-8 : contacts, avis seuls, contacts et avis réunis. Les exports respectent les filtres.
Import Excel ou Google Sheets avec séparateur point-virgule. Les champs à risque de formule sont neutralisés.
Pas de synchronisation Google ni d’envoi automatique d’e-mail pour le moment.
Les commandes et leur suivi restent préparés ; aucun paiement réel n’est connecté.

## Langues et devises

Cinq langues intégrées : français, anglais, espagnol, italien, arabe (RTL).
Modifier `locales/translations.tsv` et `locales/runtime.tsv`, puis lancer `python3 scripts/build-locales.py` et redémarrer.
La détection du pays utilise country.is sans clé, avec repli sur la langue du navigateur.
Le choix manuel est mémorisé. Les nouveaux textes doivent être ajoutés aux dictionnaires.
Les photos restent fidèles aux vêtements ; les textes imprimés sont expliqués en légende traduite.
Les conversions monétaires utilisent Frankfurter, cache de 24 heures. Montants indicatifs marqués ≈.
Si le taux manque, affichage en euros. Les données comptables d’origine ne sont pas converties.

## Hébergement

Cette version tourne localement. Pour recueillir des inscriptions depuis des publicités, déployer le serveur
sur un hébergement avec disque persistant et HTTPS, et définir `PUBLIC_ORIGIN=https://votre-domaine`.
Le proxy HTTPS doit joindre le serveur Python. Ne jamais publier `.data` ni les sauvegardes.
Faire des sauvegardes régulières avec `manage.py backup`. Les polices, GSAP, la géolocalisation et les taux
peuvent contacter des services publics ; comptes et catalogue n’exigent aucune clé externe.

## Version de préparation au lancement — octobre 2026

- Guide complet : `docs/GUIDE-SEO-GEO-MISE-EN-LIGNE.md`.
- Persona, hypothèses et messages : `docs/PERSONA-ET-LIGNE-EDITORIALE.md`.
- Préparer les canoniques, JSON-LD et le sitemap : `python3 scripts/prepare-seo.py https://unlived.club`.
- Les prix publics sont volontairement non renseignés pendant le test d’intérêt. Il ne s’agit pas de produits gratuits.
- Le bouton de son et le hero vidéo ont été retirés de l’accueil.
