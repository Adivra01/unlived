#!/usr/bin/env python3
"""Local-only maintenance; never exposed through the HTTP API."""
import argparse,secrets,sqlite3
from datetime import datetime
import database
p=argparse.ArgumentParser();sub=p.add_subparsers(dest='command',required=True)
c=sub.add_parser('create-user');c.add_argument('--email',required=True);c.add_argument('--role',choices=['admin','client'],default='client');c.add_argument('--name',default='Compte test')
sub.add_parser('backup')
a=p.parse_args();database.init()
if a.command=='create-user':
    with database.connect() as db:
        if database.find_user(db,a.email):raise SystemExit('Ce compte existe déjà. Aucun mot de passe modifié.')
        password=secrets.token_urlsafe(18)+'A1!';user=database.create_user(db,a.email,password,a.name,a.role)
    print('Compte créé : '+a.email+' ('+a.role+')\nMot de passe : '+password)
elif a.command=='backup':
    destination=database.ROOT/'.data'/('backup-'+datetime.now().strftime('%Y%m%d-%H%M%S')+'.sqlite3')
    with database.connect() as db,sqlite3.connect(destination) as target:db.backup(target)
    destination.chmod(0o600);print('Sauvegarde : '+str(destination));print('Conserve également une copie sécurisée séparée de .data/encryption.key (ou de UNLIVED_ENCRYPTION_KEY). Sans cette clé, les données personnelles ne peuvent pas être restaurées.')
