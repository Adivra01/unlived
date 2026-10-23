# Contrôle avant déploiement — 23 octobre 2026

## Changements de cette version

- Routage corrigé : un client connecté depuis la page admin rejoint son espace client ; l’administrateur garde son accès au tableau de bord.
- Bande défilante configurable depuis Marketing : texte, code facultatif, lien, visibilité, défilement ou texte fixe et durée. Affichage public/client, aperçu administrateur, pause et respect du mouvement réduit.
- Demandes de résiliation reçues dans l’administration avec un compteur actualisé ; statut consultable uniquement par leur client.
- Favoris toujours privés, sans remontée ni notification administrateur. Les anciennes données de compte/administration sont effacées lors de la déconnexion et ne réapparaissent pas en aperçu.
- Chiffrement des données structurées et migration des anciennes données personnelles, sans perte de types ou de relations.
- Protections Web renforcées : CSP, HTTPS canonique, HSTS, permissions navigateur et scripts d’animation hébergés localement. Les données de carte sont refusées.
- Politique de confidentialité, contact professionnel et métadonnées d’organisation actualisés.

## Vérifications passées

26 tests PHP + 20 tests Python, parcours HTTP d’authentification et d’export, tests fonctionnels d’interface client/admin, bandeau et mot de passe visible. Audit de 17 pages HTML / 12 URL publiques, audit de configuration CSP et syntaxe JS/PHP/JSON sans erreur.

Le contrôle en lecture seule du site publié confirme un sitemap et 12 pages en HTTP 200, avec les canoniques attendues. Les fichiers sensibles testés sont interdits en HTTP 403. Les nouvelles protections préparées dans le code ne sont pas réputées actives tant que cette version n’a pas été publiée et vérifiée.

## Avant et après publication

1. Sauvegarder le dossier privé `.data` avec ses bases et clés ; ne pas le remplacer par celui du poste de développement.
2. Publier tous les fichiers modifiés, notamment `.htaccess`, les modules PHP, les scripts, les pages et **assets/vendor/**. Les scripts CDN d’animation ont été remplacés par ces fichiers.
3. Vérifier les connexions admin/client depuis les deux pages, le bandeau, la création d’une demande, les exports et une modification de variante.
4. Vérifier les redirections HTTP/www, les en-têtes HSTS/CSP et la console du navigateur sur le véritable hébergement. Faire une inspection visuelle mobile et ordinateur.
5. Vérifier Resend, la réception d’un e-mail et le cron. Aucun paiement réel n’est ouvert.
6. Compléter les mentions légales avec l’identité, l’adresse, l’immatriculation applicable et l’hébergement réels. Le contact professionnel contact@unlived.club est renseigné.

## Référencement et profil

[Guide SEO/GEO et indexation](GUIDE-SEO-GEO-MISE-EN-LIGNE.md) : liens Search Console, DNS Hostinger, sitemap, Bing et création du profil d’activité.

Search Console affiche « Désolé, vous n’avez pas accès à cette propriété » pour UNLIVED avec le compte connecté ; la validation/attribution de propriété reste à faire. UNLIVED est confirmé comme activité uniquement en ligne : aucune fiche Google Business/Maps ne sera créée dans cette configuration, non éligible.

[Revue de sécurité et limites](AUDIT-SECURITE-20261023.md) : preuves, corrections, chiffrement, paiements, contrôle publié et points non certifiés. Aucun audit ne garantit une absence totale de faille.
