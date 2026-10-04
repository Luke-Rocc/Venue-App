# Venue Video Guide

Vælg et spillested i København og se hvor stort det er, og hvilket videoudstyr du skal tage med for at filme der.

Statisk side (HTML, CSS, JS) i `public/` plus en lille Cloudflare Worker (`src/worker.js`), som lader AI finde nye spillesteder.

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

## AI: find et spillested

I søgningen kan man trykke "Find ... med AI". Siden kalder `POST /api/venue`, hvor Workeren beder Claude søge på nettet efter stedets tech spec og skrive en videoguide i samme format som `stengade.json`. Guiden gemmes på brugerens enhed.

Det kræver en API-nøgle fra Anthropic som secret på Cloudflare:

- Cloudflare: Workers & Pages → venue-app → Settings → Variables and Secrets → Add → Type *Secret*, navn `ANTHROPIC_API_KEY`.
- Lokalt: læg `ANTHROPIC_API_KEY=...` i `.dev.vars` og kør `npm install && npx wrangler dev`.
