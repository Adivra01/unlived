# Administration et données — première version

## Navigation et interface

Les appels à l’action ont une bordure visible et un survol avec couleur et arrondi. Les flèches décoratives de redirection ont été retirées ; le chevron du sélecteur de langue est conservé. La navigation présente Favoris, pays/langue AUTO et Panier. Sur les petits écrans, cette rangée dispose de son propre espace.

## Audience

L’onglet Audience propose 1, 7, 30, 90 ou 365 jours, des vues quotidiennes, les pages et produits consultés, les pays estimés, les campagnes et les affiliés. Export CSV compatible Excel/Sheets. La mesure dépend du consentement : elle n’est donc pas un décompte exhaustif. Les identifiants visiteurs changent chaque mois. Les visites localhost, administrateurs et robots identifiés sont exclues. Sur le domaine public, clique « Exclure mon navigateur » depuis Audience pour exclure aussi ce navigateur lorsque tu es déconnecté. Ce choix ne couvre pas les autres navigateurs ou appareils. La rétention des événements est de 395 jours. Pas de fingerprinting et pas d’IP brute enregistrée.

## Marketing et affiliation

Marketing permet de modifier l’annonce publique, créer des liens UTM, préparer des codes promotionnels et configurer le taux par défaut (20 %), le seuil et le délai de commission. L’administrateur approuve les candidatures et peut modifier chaque taux. L’espace client montre ses données, son lien actif, ses commissions et ses demandes. Les demandes de fermeture restent à examiner : elles ne suppriment pas automatiquement un compte.

Les paiements réels, remboursements et virements sont **non configurés**. Les codes sont seulement vérifiables dans le panier. Le calcul des commissions est préparé pour des commandes payées confirmées par un futur connecteur ; aucune commission n’est créée à partir d’une simple inscription. Il faudra intégrer le webhook signé du prestataire, l’attribution à la commande, les taxes/frais, les remboursements et la réconciliation avant ouverture des ventes. La validation de production refuse les commandes sans paiement confirmé.

## Protection et hébergement

Les mots de passe sont hachés avec scrypt. Les sessions utilisent un cookie HttpOnly. Les données personnelles principales (nom, e-mail, téléphone, messages et avis) sont chiffrées au niveau des champs. **Le fichier SQLite entier n’est pas chiffré.** Aucune carte bancaire n’est recueillie ou stockée. Le futur prestataire devra héberger la saisie des cartes.

Installer `python3 -m pip install -r requirements.txt`. Héberger le serveur Python sur un volume persistant, derrière HTTPS, avec `PUBLIC_ORIGIN=https://unlived.club`. La base est `.data/unlived.sqlite3`. La clé est `.data/encryption.key`, ou la variable `UNLIVED_ENCRYPTION_KEY`. Ne jamais changer ou perdre cette clé. La sauvegarder séparément et de manière sécurisée ; le backup SQLite seul est insuffisant. Les anciennes copies de base réalisées avant chiffrement peuvent encore contenir du texte clair et doivent être protégées.

`python3 manage.py backup` sauvegarde la base. Les comptes de test doivent être désactivés ou leurs mots de passe modifiés avant publication. L’envoi d’e-mails et la récupération de mot de passe restent à configurer avec l’adresse expéditrice.
