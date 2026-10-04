# Venue Guide

Vælg et spillested i København og se hvor stort det er, og hvad bandet skal tage med.

Ren statisk side (HTML, CSS, JS), ingen build-trin.

## Kør lokalt

```sh
python3 -m http.server 8000
```

Åbn http://localhost:8000.

## Tilføj et spillested

1. Læg en JSON-fil i `data/` (se `data/stengade.json` som skabelon; hvert rum har et `gear`-felt med pakkelisten).
2. Tilføj stedet i `data/venues.json`.

## Deploy på Cloudflare Pages

Forbind repoet i Cloudflare Pages med:

- Framework preset: **None**
- Build command: *(tom)*
- Build output directory: `/`
