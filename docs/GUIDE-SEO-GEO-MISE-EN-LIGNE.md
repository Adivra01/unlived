# UNLIVED — déploiement, indexation et profil d’activité

Mise à jour : 23 octobre 2026. Domaine public : **https://unlived.club**. Contact professionnel : **contact@unlived.club**.

## 1. Publier la version correcte sur Hostinger

Le site utilise maintenant PHP 8.3 maintenu et à jour, SQLite et OpenSSL sur Hostinger ; Python sert uniquement à la prévisualisation locale et aux outils du projet. Suivre `HEBERGEMENT.md`. Préserver `.data/auth.sqlite3`, `.data/auth.key` et les anciennes bases/clefs conservées pour la reprise : elles ne doivent pas être remplacées par des fichiers locaux lors d’un déploiement.

Publier l’ensemble des fichiers modifiés, y compris les modules PHP, `.htaccess`, `announcement.js`, `announcement.css`, les pages, les dictionnaires et **assets/vendor/**. Les bibliothèques GSAP sont maintenant servies par le site. Les anciens scripts CDN ont été retirés pour permettre la politique CSP restrictive. La déclaration CSP inclut l’empreinte exacte du petit script d’introduction de l’accueil ; si ce script change, son empreinte doit aussi être actualisée.

Le compte administrateur est contact@unlived.club. Un compte client connecté depuis la page admin est redirigé vers compte.html#apercu ; un administrateur connecté depuis compte.html est dirigé vers admin.html. Les rôles sont contrôlés dans l’API. La bande défilante se configure dans **Marketing → Annonce en haut du site** : texte, lien interne, code facultatif, visibilité, mode fixe/défilant et durée de passage en secondes.

Après déploiement, vérifier sur le vrai domaine : connexion client/admin, catalogue, bandeau, formulaire de liste d’intérêt, avis, demandes de résiliation, export et réception d’un e-mail de sécurité. Configurer Resend et le cron d’envoi sur Hostinger ; `.env` n’est pas transmis par Git.

## 2. Sitemap et contrôles déjà effectués

- Sitemap public : https://unlived.club/sitemap.xml
- Règles d’exploration : https://unlived.club/robots.txt
- Le sitemap contient 12 URL publiques. Compte, administration, sécurité, formulaire de waitlist et fiche produit générique en sont exclus.
- Le contrôle HTTPS effectué pendant cette revue a trouvé le sitemap en HTTP 200, ses 12 pages en HTTP 200 et leurs canoniques correspondantes.
- Les contrôles locaux vérifient les fichiers liés, titres/descriptions, JSON-LD, sitemap et noindex des espaces privés.

Pour régénérer les métadonnées après une modification des pages publiques :

```sh
python3 scripts/prepare-seo.py https://unlived.club
python3 scripts/audit-release.py
```

Publier ensuite les pages générées, sitemap.xml et robots.txt. Ne pas ajouter de fausses dates `lastmod`, de pages privées, de paramètres de campagne ni de langues qui n’existent qu’en JavaScript dans le sitemap. L’adresse canonique reste sans www ; `.htaccess` prépare la redirection HTTPS et www vers ce domaine. L’alias www doit également disposer d’un certificat valide sur l’hébergement.

## 3. Valider Google Search Console

Ouvrir **[Google Search Console](https://search.google.com/search-console/welcome)**.

La balise HTML de vérification fournie par le propriétaire est ajoutée dans le `<head>` de `index.html`. Le script `scripts/prepare-seo.py` la conserve. Publier ce fichier sur l’hébergement, puis utiliser **Valider** dans la propriété de type **Préfixe de l’URL** `https://unlived.club/` si Google le demande encore. Conserver cette balise après validation. Cette méthode HTML ne remplace pas le TXT DNS nécessaire pour une propriété de type Domaine. L’ajout au code ne constitue pas une confirmation de validation ni d’indexation par Google.

Le navigateur connecté a été vérifié pendant cette revue : Google affiche **« Désolé, vous n’avez pas accès à cette propriété »** pour `sc-domain:unlived.club` et `https://unlived.club/`. Cela peut signifier que la propriété n’est pas encore validée avec ce compte Google ou qu’elle appartient à un autre compte. Aucune soumission Search Console n’a été effectuée.

Procédure :

1. Utiliser le compte Google qui doit posséder la propriété. Si elle existe déjà sur un autre compte, demander l’accès au propriétaire plutôt que créer inutilement des doublons.
2. Ajouter une propriété de type **Domaine**, valeur `unlived.club`.
3. Copier la valeur TXT exacte fournie par Google, commençant par `google-site-verification=`. Cette valeur est unique : ne pas utiliser un texte d’exemple.
4. Dans Hostinger : **Domaines → portefeuille de domaines → Gérer unlived.club → DNS / serveurs de noms → enregistrements DNS**. Si les serveurs de noms sont ailleurs, ajouter le TXT chez ce gestionnaire DNS.
5. Ajouter un enregistrement **TXT**, nom `@`, contenu fourni par Google, TTL par défaut. Ne pas remplacer les enregistrements MX, SPF, DKIM ou les autres TXT de la messagerie.
6. Revenir dans Search Console et cliquer **Valider** après propagation. Conserver le TXT de validation.

[Documentation Hostinger sur les DNS](https://support.hostinger.com/en/articles/1583249-how-to-manage-dns-records-at-hostinger).

## 4. Soumettre le sitemap et demander l’indexation

Une fois la propriété accessible :

1. Ouvrir **Sitemaps**, saisir `https://unlived.club/sitemap.xml`, puis envoyer.
2. Dans **Inspection d’URL**, inspecter https://unlived.club/, https://unlived.club/boutique.html et une fiche, par exemple https://unlived.club/day-one-noir.html.
3. Tester l’URL publiée, puis demander son indexation si elle est accessible et indexable.
4. Contrôler ensuite Indexation, Performances et Core Web Vitals. Ne pas chercher à indexer les pages de compte, d’administration ou les liens de récupération.

L’annonce du sitemap est déjà présente dans robots.txt. Google peut donc le découvrir sans soumission manuelle. La soumission via API exige un accès OAuth autorisé à la propriété ; l’autorisation dans la conversation ne remplace pas cette validation Google. Les anciens endpoints publics de « ping » Google sont supprimés. Aucun script ne peut garantir une indexation ni une position.

Sources : [soumettre un sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [API Search Console authentifiée](https://developers.google.com/webmaster-tools/v1/sitemaps/submit), [demander une nouvelle exploration](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl), [suppression des anciens pings](https://developers.google.com/search/blog/2023/06/sitemaps-lastmod-ping).

## 5. Créer la fiche de l’activité

Lien officiel : **https://business.google.com/add**.

Vérifier d’abord si UNLIVED dispose déjà d’une fiche, puis la revendiquer si nécessaire. Pour une nouvelle fiche, préparer le nom public exact, l’activité réelle, le lieu ou la zone desservie éligible, les horaires, un téléphone professionnel et le site. Ne pas inventer une adresse ni des horaires.

Google exige généralement un contact en personne avec les clients pour Google Business Profile. Une marque uniquement en ligne n’est pas éligible à une fiche Google Maps. UNLIVED a été confirmé comme activité uniquement en ligne par son propriétaire. Aucune fiche Google Business/Maps ne doit donc être créée pour cette activité dans sa configuration actuelle. Aucune fiche n’a été créée pendant cette revue. La priorité est la présence du site dans Google Search via Search Console et le sitemap.

Texte de présentation proposé, à adapter aux informations confirmées :

> UNLIVED est une marque née au Mali. Sa première édition, ACTE I: DAY ONE, explore le premier pas à travers trois t-shirts : blanc, noir et rouge signature. La collection est en préparation. Découvrez les pièces et rejoignez gratuitement la liste d’intérêt, sans achat ni réservation de stock.

Renseigner le site `https://unlived.club` et l’e-mail de contact uniquement dans les champs prévus. Publier des visuels fidèles aux produits ; ne pas ajouter de faux avis, de disponibilité non confirmée ou d’offres de vente inexistantes.

Sources : [créer ou revendiquer une fiche](https://support.google.com/business/answer/2911778), [conditions d’éligibilité](https://support.google.com/business/answer/13763036).

## 6. GEO et contenu compréhensible par les moteurs génératifs

Les bases du SEO restent applicables : contenu textuel utile, liens internes, pages accessibles et informations vérifiables. Google ne demande pas de balisage IA spécial pour ses fonctionnalités génératives. Un fichier llms.txt n’est pas une condition de présence et ne garantit aucune citation.

Le site doit garder une description cohérente de la marque, de sa phase de préparation, des trois t-shirts, des tailles et du parcours d’inscription gratuit. Distinguer ce qui existe aujourd’hui des programmes et offres envisagés. Les formations ne doivent pas être présentées comme déjà livrées.

Les données structurées Organization, WebSite, WebPage, BreadcrumbList et Product doivent correspondre au contenu visible. L’e-mail professionnel est désormais renseigné dans Organization. Aucun prix nul, faux stock, faux avis ou fausse adresse n’est ajouté pour obtenir un résultat enrichi. Ajouter des offres marchandes seulement après ouverture réelle des ventes avec prix, disponibilité et conditions confirmés.

Sources : [fonctionnalités IA de Google](https://developers.google.com/search/docs/appearance/ai-features), [guide Google 2026 sur la visibilité générative](https://developers.google.com/search/blog/2026/05/a-new-resource-for-optimizing), [fils d’Ariane](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb).

## 7. Bing et langues

Bing Webmaster Tools : **https://www.bing.com/webmasters/about**. Vérifier le domaine puis soumettre le même sitemap. IndexNow est une option pour les moteurs participants ; il exige lui aussi une preuve de contrôle du site et ne remplace pas la validation Search Console.

Les cinq langues sont des dictionnaires JavaScript de navigation. Elles ne constituent pas cinq sites SEO rendus séparément. Avant un référencement multilingue distinct, créer de vraies URL et pages par langue, puis des canoniques et hreflang réciproques. Ne pas annoncer de versions linguistiques inexistantes.

## 8. Mesurer la conversion et compléter les informations réelles

Le parcours correspond au persona documenté : découvrir une pièce, choisir une taille et s’inscrire sans compte ni paiement. Le questionnaire est facultatif. Une inscription gratuite mesure l’intérêt ; elle ne prouve pas un achat au futur prix.

Suivre les consultations, inscriptions, avis et campagnes avec consentement. Les favoris restent privés aux clients et ne deviennent pas des notifications administrateur. Ne pas transmettre noms, e-mails ou téléphones aux outils d’audience. Le bandeau peut annoncer une information ou un code ; il ne doit pas afficher une fausse urgence ni promettre une remise non paramétrée.

Restent à renseigner avec des données exactes : identité légale de l’éditeur, adresse professionnelle, immatriculation applicable, localisation de l’hébergement et durées de conservation définitives. Le contact professionnel est contact@unlived.club. Aucun paiement réel n’est ouvert et aucune donnée de carte n’est acceptée par cette application.
