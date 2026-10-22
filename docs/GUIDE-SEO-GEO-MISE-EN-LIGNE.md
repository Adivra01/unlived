# UNLIVED — guide de mise en ligne, SEO et GEO

Version du 19 octobre 2026. Le site est une présentation de concepts et une liste d’attente, sans commande ni paiement. GEO désigne ici la visibilité dans les réponses des moteurs génératifs.

## 1. Hébergement : garder le serveur et les données

Le site ne fonctionne pas entièrement sur un hébergement de fichiers statiques. Il utilise Python 3.10+ et SQLite pour les comptes, favoris, produits, contacts, inscriptions et questionnaires. Prévoir un service Python avec disque persistant, un processus durable et une terminaison HTTPS. Un déploiement qui efface `.data/` perdrait les inscriptions.

- Déployer les fichiers du projet et les médias nécessaires.
- Conserver `.data/unlived.sqlite3` sur le disque persistant, hors accès public. Ne jamais le publier dans Git.
- Avant de déplacer une base utilisée, créer une sauvegarde cohérente avec `python3 manage.py backup`. Restaurer cette sauvegarde serveur arrêté, plutôt que copier un fichier SQLite en cours d’écriture.
- Lancer `PUBLIC_ORIGIN=https://unlived.club python3 server.py --host 127.0.0.1 --port 8081` derrière le reverse proxy HTTPS de l’hébergeur. Dans un conteneur qui impose une écoute sur toutes ses interfaces, adapter `--host` à sa documentation et n’exposer que le proxy public.
- Le proxy doit conserver le Host public configuré. Le navigateur doit appeler `/api/` sur le même domaine. Ne pas séparer l’API et le site sans adapter l’authentification.
- Configurer le redémarrage automatique du processus, des sauvegardes quotidiennes, une alerte d’erreur et une procédure de restauration.
- Les comptes test sont réservés à la recette : créer un vrai administrateur avec `manage.py create-user` et retirer les comptes test avant ouverture publique. Les mots de passe ne doivent jamais figurer dans les fichiers servis.
- L’expéditeur n’étant pas configuré, aucun e-mail automatique ni récupération de mot de passe par e-mail n’est actif.

## 2. Domaine et sitemap

Choisir une seule adresse HTTPS, avec ou sans `www`. Faire rediriger les autres variantes en 301 vers cette adresse. Éviter de publier une copie indexable sur le domaine provisoire de l’hébergeur.

Une fois le vrai domaine connu :

```sh
python3 scripts/prepare-seo.py https://unlived.club
```

Le domaine retenu est `https://unlived.club`. Le script refuse les domaines d’exemple. Il crée `sitemap.xml`, met à jour `robots.txt`, les canoniques, Open Graph et les données structurées. Le démarrage avec `PUBLIC_ORIGIN` réalise également cette préparation.

Le sitemap comprend 12 URL : accueil, histoire, boutique, trois produits, contact et cinq pages d’information. Il exclut compte, administration, formulaire de waitlist et fiche produit générique. Il ne contient ni paramètres de campagne ni filtres ni variantes de langue non rendues côté serveur. Pas de dates `lastmod` artificielles : en ajouter uniquement lorsqu’elles correspondent à de vraies modifications de contenu.

Vérifier après déploiement : `/sitemap.xml` et `/robots.txt` répondent 200 ; chaque URL du sitemap répond 200 et sa canonique pointe vers elle-même. Ne pas soumettre un sitemap contenant localhost ou un domaine fictif.

## 3. Google Search Console

1. Ajouter une propriété **Domaine** dans Search Console.
2. Copier le TXT de vérification fourni par Google chez le gestionnaire DNS, attendre sa propagation puis valider.
3. Soumettre `sitemap.xml` dans Sitemaps.
4. Inspecter l’accueil, la boutique et une fiche produit ; utiliser « Tester l’URL publiée » puis demander l’indexation.
5. Suivre les rapports Indexation, Performances et Core Web Vitals. Corriger les exclusions inattendues, sans chercher à indexer les pages de compte.

L’indexation et les positions ne sont pas garanties. Les changements peuvent demander du temps. Un sitemap aide à découvrir les pages ; il ne force pas leur indexation.

## 4. Breadcrumbs et données structurées

Les fils d’Ariane visibles relient les pages à l’accueil ; les produits passent par la boutique. Le script ajoute le JSON-LD `BreadcrumbList`, ainsi que `Organization`, `WebSite` et `WebPage`. Les fiches ont un objet `Product` cohérent avec les nouveaux visuels.

Aucun prix à zéro, aucune fausse disponibilité, aucun avis ou stock inventé n’est ajouté. Sans offre de vente, ne pas rechercher artificiellement les résultats enrichis marchands : les fiches restent des pages de découverte. Quand la vente ouvrira, ajouter uniquement des `Offer`, prix, devise, disponibilité, livraison et retours vérifiés.

Utiliser le test des résultats enrichis Google et Schema Markup Validator avec le domaine réel. Le balisage ne garantit pas un affichage enrichi.

## 5. Langues et SEO international

Les cinq langues actuelles sont une aide à la navigation par dictionnaires JavaScript. La détection du pays est indicative et le choix manuel doit toujours rester disponible. Cette version ne représente **pas** cinq ensembles de pages SEO indépendants.

Pour acquérir du trafic dans plusieurs langues : produire de vraies pages rendues dans leur langue à des URL distinctes (`/fr/`, `/en/`, `/es/`, `/it/`, `/ar/`), traduire titres et descriptions, ajouter des canoniques propres et des `hreflang` réciproques avec `x-default`. Ne pas annoncer ces variantes tant qu’elles n’existent pas. Éviter une redirection forcée par IP qui empêcherait visiteurs ou robots d’accéder à une langue.

## 6. GEO : être compréhensible et vérifiable

Google indique qu’il n’existe pas de balisage spécifique indispensable pour ses fonctions IA : les bases du SEO s’appliquent. Un fichier `llms.txt` n’est pas une condition d’indexation et ne garantit aucune citation.

- Expliquer clairement : marque née au Mali, première édition de trois t-shirts, phase de concept, liste d’attente gratuite, programmes en préparation.
- Garder des informations cohérentes entre accueil, produits, histoire et FAQ.
- Préciser ce qui existe aujourd’hui et ce qui est envisagé. Ne pas présenter les deux formations comme déjà disponibles.
- Publier des réponses courtes aux questions réelles : lancement, tailles, inscription, motif au dos, absence de réservation.
- Compléter l’identité légale, le contact professionnel et les informations d’hébergement ; des sources identifiables renforcent la confiance.
- Documenter les matières, fabrication, mesures et engagements seulement après confirmation.
- Obtenir des mentions éditoriales pertinentes et des liens authentiques ; éviter les faux avis et pages répétitives.

## 7. Bing, Copilot et suivi

Ajouter le domaine dans Bing Webmaster Tools, vérifier sa propriété et soumettre le même sitemap. IndexNow est une option pour signaler les modifications aux moteurs participants ; cela ne remplace pas Search Console et ne garantit pas l’indexation.

Pour mesurer le lancement : compter les inscriptions par pièce, taille et campagne, puis les réponses au questionnaire. Une inscription gratuite mesure l’intérêt, **pas une intention d’achat validée au futur prix**. Prévoir une seconde phase avec prix annoncé et confirmation de l’intérêt. Ne pas envoyer les noms, e-mails ou téléphones dans un outil d’analytics.

## 8. Dernières informations à fournir avant ouverture

- Hébergeur définitif ; domaine configuré : `https://unlived.club`.
- Nom/dénomination légale, adresse professionnelle, immatriculation applicable et moyen de contact direct : les mentions actuelles comportent encore ces éléments à compléter.
- Durées de conservation définitives et localisation de l’hébergement pour la confidentialité.
- Adresse d’expédition des e-mails lorsque le service sera activé.
- Vérification du formulaire, connexion et export sur l’hébergement final, avec données fictives ; vérification mobile et restauration d’une sauvegarde.

## Sources officielles

- [Google — créer et envoyer un sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google — fils d’Ariane](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)
- [Google — fonctionnalités IA et votre site](https://developers.google.com/search/docs/appearance/ai-features)
- [Google — sites multilingues](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)
- [Bing — sitemaps](https://www2.bing.com/webmasters/help/sitemaps-3b5cf6ed)
- [Bing — IndexNow](https://www2.bing.com/indexnow/getstarted)
