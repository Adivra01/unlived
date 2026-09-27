# UNLIVED — site de présentation

Site statique en français composé de trois pages (`index.html` pour l’accueil et la boutique, `histoire.html` pour le récit de marque, `produit.html` pour la fiche DAY ONE avec ses variantes), réalisé en HTML, CSS, JavaScript et GSAP 3 / ScrollTrigger, sans étape de compilation. Le hero lit en boucle le film `0926.mp4`, converti en H.264 sans piste son. Le bouton flottant lance le morceau Drive au clic. L’état de lecture et la position sont conservés lors du passage entre les pages du site ; la reprise automatique dépend des règles du navigateur. Le partage Drive doit autoriser la lecture à toute personne disposant du lien.

## Aperçu local

Depuis ce dossier, lancer un serveur local :

```sh
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000.

Les photos et le film optimisés se trouvent dans `assets/`. GSAP et ses plugins sont chargés depuis le CDN jsDelivr ; une connexion Internet est nécessaire pour les animations GSAP et les polices. Les prix, stocks, politiques de livraison, avis et informations de paiement n’ayant pas été fournis, la fiche produit affiche les informations de prix, composition, avis et disponibilité comme à confirmer au lancement. La galerie comprend plusieurs photos et un emplacement prêt pour chaque vidéo produit. Le formulaire ouvre l’application e-mail de la personne, sans serveur d’envoi.
