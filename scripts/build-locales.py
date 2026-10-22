"""Compile the reviewed translation catalogues. No external translation service."""
import json
from pathlib import Path
root = Path(__file__).resolve().parent.parent / 'locales'
source = json.loads((root / 'source.json').read_text())
languages = ['fr', 'en', 'es', 'it', 'ar']
bundles = {lang: dict.fromkeys(source) for lang in languages}
for lang in languages:
    bundles[lang] = {s: s for s in source}
for line in (root / 'translations.tsv').read_text().splitlines():
    if not line.strip(): continue
    row = line.split('\t')
    if len(row) != 5: raise ValueError(f'Invalid catalogue row: {row[0]}')
    key = source[int(row[0])]
    for lang, value in zip(languages[1:], row[1:]): bundles[lang][key] = value
for line in (root / 'runtime.tsv').read_text().splitlines():
    if not line.strip(): continue
    row = line.split('\t')
    if len(row) != 5: raise ValueError(f'Invalid runtime row: {row[0]}')
    for lang, value in zip(languages, row): bundles[lang][row[0]] = value
for file in ('additions.tsv','additions-admin.tsv','additions-runtime.tsv'):
    path=root/file
    if not path.exists(): continue
    for line in path.read_text().splitlines():
        if not line.strip(): continue
        row=line.split('\t')
        if len(row)!=5: raise ValueError(f'Invalid {file} row: {row[0]}')
        for lang,value in zip(languages,row): bundles[lang][row[0]]=value
for lang, bundle in bundles.items():
    (root / f'{lang}.json').write_text(json.dumps(bundle, ensure_ascii=False, indent=2)+'\n')
print('Compiled five language bundles.')
