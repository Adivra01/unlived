# Contrôle avant déploiement — 23 octobre 2026

## Corrections réalisées

- Les favoris sont limités au propriétaire de la session, y compris pour un administrateur. Une écriture avec l’identité d’un autre client est refusée. Les filtres ne donnent pas accès aux favoris d’autrui.
- Les favoris ont été retirés des statistiques, classements et exports administrateur. Aucun e-mail ni événement d’audit administratif n’est créé lors de leur ajout.
- L’espace client efface les données personnelles à la déconnexion. Les réponses retardées d’un compte précédent ne peuvent plus remplir le compte suivant.
- Le panier connecté prend le serveur comme référence, même si le panier est vide. Les sauvegardes sont ordonnées et vérifient le compte attendu. Le panier invité reste séparé.
- Les formulaires de demandes et d’affiliation sont réinitialisés lors d’un changement de compte. Les liens affiliés utilisent l’origine publique HTTPS plutôt que localhost.
- Le titre et la description d’accueil précisent l’offre de t-shirts DAY ONE. Le discours conserve le premier pas personnel du persona, sans promesse de transformation.
- La liste d’intérêt indique clairement : gratuit, sans compte, sans paiement, sans engagement. Le questionnaire est explicitement facultatif et peut être quitté après l’inscription. Les nouveaux textes sont présents dans les cinq dictionnaires.
- Les versions des scripts modifiés sont actualisées pour éviter de conserver les anciens scripts dans le cache du navigateur.

## Vérifications passées

- 20 tests d’intégration PHP avec SQLite/OpenSSL sur une base temporaire, dont confidentialité intercomptes, permissions, migrations, catalogue, attribution et commissions.
- Parcours HTTP PHP : session, cookie sécurisé, origine, connexion/déconnexion, confirmation d’adresse, récupération, jetons à usage unique, traductions, inscription/avis et export Excel.
- 20 tests Python : authentification (8), parcours métier (7), API partagée (5).
- Interface client via DOM simulé : sept rubriques, menu mobile, déconnexion, deux clients successifs, anciennes réponses retardées et panier vide côté serveur. Aucune connexion au site réel pendant ce test.
- Syntaxe des scripts JavaScript et PHP, dictionnaires JSON et cohérence des modifications Git.
- Audit structurel : 17 pages HTML, 12 URL publiques, aucun fichier lié manquant, titres/descriptions publics présents, JSON-LD valide, canoniques cohérentes avec le sitemap, pages de compte/administration/authentification/formulaire exclues de l’indexation.

La cohérence du sitemap et des canoniques suit les indications de [Google sur les URL canoniques](https://developers.google.com/search/docs/crawling-indexing/canonicalization) et [les sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap). Les pages privées conservent leur directive [noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing).

## Points à vérifier sur l’hébergement après déploiement

- La version déposée doit inclure tous les modules PHP, `.htaccess`, les scripts, les pages et les dictionnaires modifiés. Préserver le répertoire privé `.data` et ses clés.
- Tester les deux comptes sur le site puis deux comptes clients successifs dans le même navigateur. Le transfert des anciens comptes locaux reste une opération distincte du déploiement du code.
- Contrôler le rendu réel sur téléphone et ordinateur : les tests DOM couvrent le comportement, pas une inspection visuelle d’écran.
- Vérifier la configuration Resend sur Hostinger, la réception d’un e-mail de sécurité et la tâche cron. Les tests de cette revue n’envoient pas d’e-mails à des personnes réelles.
- `mentions-legales.html` contient encore la mention « Informations en cours de finalisation » : identité de l’éditeur, adresse professionnelle, coordonnées directes, immatriculation applicable et hébergeur restent à renseigner.

Cette revue ne déploie pas les fichiers sur Hostinger et ne remplace pas la vérification de la version effectivement publiée.

## Vérification effective sur Hostinger

L’accès protégé à la page waitlist a été utilisé pour restaurer les deux comptes dans la base du serveur. Les connexions ont ensuite été testées via l’API HTTPS publique : contact@unlived.club renvoie le rôle admin, client.test@unlived.example renvoie le rôle client, avec HTTP 200 et une session conservée pour chacun. Les sessions ouvertes uniquement pour cette vérification ont été déconnectées. Les mots de passe du transfert sont inchangés.

Le contrôle afficher/masquer est ajouté aux champs de mot de passe des pages compte, administration, sécurité et waitlist, y compris les champs ajoutés dynamiquement. Il est testé sans modifier la valeur saisie ni soumettre le formulaire au clic ; le mot de passe est remasqué à la soumission. Les fichiers d’interface correspondants doivent encore être publiés pour que ce contrôle apparaisse sur le site.
