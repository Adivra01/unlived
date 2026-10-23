# UNLIVED — SQLite

## Démarrer

```sh
python3 server.py --port 8081
```

Site : http://127.0.0.1:8081/index.html
Administration : http://127.0.0.1:8081/admin.html
Compte client : http://127.0.0.1:8081/compte.html

Ce serveur sert les fichiers locaux et relaie les données vers l’API PHP partagée d’unlived.club.
Aucune base locale n’est créée au démarrage et aucune écriture locale ne remplace un échec distant.
Installer les dépendances Python avec `pip install -r requirements.txt` si nécessaire.

## Comptes et accès

L’API PHP utilise `.data/auth.sqlite3` sur Hostinger pour les comptes et les données métier.
Les rôles sont vérifiés côté serveur. Les clients ne lisent que leurs favoris et commandes.
Les mots de passe sont hachés avec Argon2id lorsqu’il est disponible, sinon bcrypt.
L’inscription publique crée des clients et exige la confirmation de l’adresse e-mail.
La modification des identifiants exige le mot de passe actuel. Les e-mails de sécurité passent par Resend.

Déploiement, migration des anciennes inscriptions, création administrateur et tests : [HEBERGEMENT.md](HEBERGEMENT.md).
Les commandes `manage.py` concernent uniquement l’ancien backend Python autonome et ne modifient pas Hostinger.

## Liste d’attente et avis

Choix produit et taille → coordonnées et consentement → remerciement et questionnaire.
Les inscriptions et réponses sont enregistrées dans SQLite et réservées aux administrateurs.
Administration → Liste d’intérêt : recherche, filtre produit, avec/sans réponse, actualisation.
Trois exports CSV UTF-8 : contacts, avis seuls, contacts et avis réunis. Les exports respectent les filtres.
Import Excel ou Google Sheets avec séparateur point-virgule. Les champs à risque de formule sont neutralisés.
Un export XLSX à deux onglets est aussi disponible depuis l’administration waitlist.
Pas de synchronisation automatique Google Sheets ; les e-mails de sécurité utilisent Resend.
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

L’application PHP complète peut être déployée sur l’hébergement Web Hostinger avec PHP 8.3 maintenu et à jour, SQLite et OpenSSL.
Le tableau de bord ne requiert plus de backend Python hébergé. Préserver `.data` et ses clés lors des déploiements.
La configuration Resend doit aussi être présente sur le serveur ; le fichier `.env` local n’est pas publié par Git.
Voir [HEBERGEMENT.md](HEBERGEMENT.md) pour la procédure et les vérifications.

## Version de préparation au lancement — octobre 2026

- Guide complet : `docs/GUIDE-SEO-GEO-MISE-EN-LIGNE.md`.
- Persona, hypothèses et messages : `docs/PERSONA-ET-LIGNE-EDITORIALE.md`.
- Préparer les canoniques, JSON-LD et le sitemap : `python3 scripts/prepare-seo.py https://unlived.club`.
- Les prix publics sont volontairement non renseignés pendant le test d’intérêt. Il ne s’agit pas de produits gratuits.
- Le bouton de son et le hero vidéo ont été retirés de l’accueil.
