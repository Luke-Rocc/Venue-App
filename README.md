# Venue Guide

Vælg et spillested i København og se hvor stort det er, og hvad bandet skal tage med.

Ren statisk side (HTML, CSS, JS), ingen build-trin.

## Kør lokalt

```sh
python3 -m http.server 8000 -d public
```

Åbn http://localhost:8000.

## Tilføj et spillested

1. Læg en JSON-fil i `public/data/` (se `public/data/stengade.json` som skabelon; hvert rum har et `gear`-felt med pakkelisten).
2. Tilføj stedet i `public/data/venues.json`.

## Deploy på Cloudflare

Siden deployes som en Cloudflare Worker med statiske filer (se `wrangler.jsonc`, som peger på `public/`).
Forbind repoet under Workers & Pages med:

- Build command: *(tom)*
- Deploy command: `npx wrangler deploy`
