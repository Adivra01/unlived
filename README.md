# UNLIVED — site de présentation et administration

Site en français composé des pages d’accueil (`index.html`), d’histoire (`histoire.html`), de produit (`produit.html`) et de l’espace d’administration (`admin.html`). Le site public reste en HTML, CSS et JavaScript avec GSAP 3 / ScrollTrigger, sans compilation. L’espace d’administration utilise Supabase Auth, la base de données PostgreSQL du projet UNLIVED et ses règles RLS. Les commandes sont préparées dans la base, mais le paiement en ligne n’est pas encore connecté.

## Aperçu local

Depuis ce dossier, lancer un serveur local :

```sh
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000. L’admin est disponible sur http://localhost:8000/admin.html. Pour parcourir le tableau sans connexion, ouvrir http://localhost:8000/admin.html?preview=1 : cet aperçu ne montre que le catalogue public et ne permet aucune modification.

Les photos et le film optimisés se trouvent dans `assets/`. Les dépendances de navigateur sont chargées depuis jsDelivr ; une connexion Internet est nécessaire pour Supabase, GSAP et les polices.

## Première connexion admin

1. Créer un compte e-mail + mot de passe dans **Authentication → Users** du projet Supabase.
2. Ouvrir **SQL Editor**, remplacer l’adresse ci-dessous par celle du compte, puis exécuter la requête :

```sql
insert into public.admin_users (user_id)
select id from auth.users
where email = 'toi@unlived.co';
```

3. Se connecter sur `/admin.html` avec ce compte.

Le fichier `supabase-config.js` contient l’URL du projet et sa clé **publishable**, destinée au navigateur. Aucune clé secrète ou `service_role` n’est exposée. La migration initiale est dans `supabase/migrations/` ; elle active RLS sur toutes les tables et réserve la gestion des commandes et messages aux identifiants présents dans `admin_users`.

L’admin comprend le tableau de bord, le catalogue, les variantes et leur galerie (un lien par ligne, `.mp4` pour la vidéo), les commandes, les clients calculés depuis les commandes, la boîte de réception et les réglages d’accès. Le formulaire de contact enregistre ses messages dans Supabase, avec une ouverture de l’application e-mail en solution de repli. Les prix et stocks restent vides tant qu’ils ne sont pas confirmés. La boutique publique lit le catalogue actif depuis Supabase ; les commandes apparaîtront une fois un paiement connecté.
