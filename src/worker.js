// Cloudflare Worker: serves the static site from ./public and adds one API route,
// POST /api/venue, where Claude searches the web for a Copenhagen venue and writes
// a video gear guide in the same format as public/data/stengade.json.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5-5";
const CACHE_DAYS = 30;
const MAX_CONTINUATIONS = 4;

const JOBS = ["", "concert", "livestream", "musicvideo", "interview"];
// Kit types (see public/data/gear.json) the house can provide, so the crew can leave theirs at home.
const HOUSE_TYPES = ["led_light", "light_stand", "tripod", "recorder", "stream_encoder", "camera_mic"];

const num = (type) => ({ type: [type, "null"] });

const GUIDE_TOOL = {
  name: "save_guide",
  description: "Gem den færdige videoguide til spillestedet. Kald den præcis én gang, når research er færdig.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["found", "reason", "name", "area", "address", "website", "profile", "sources", "rooms"],
    properties: {
      found: { type: "boolean", description: "false hvis stedet ikke findes eller ikke er et spillested i Storkøbenhavn" },
      reason: { type: "string", description: "Kort forklaring hvis found er false, ellers tom" },
      name: { type: "string" },
      area: { type: "string", description: "Bydel, fx Nørrebro" },
      address: { type: "string" },
      website: { type: "string" },
      profile: { type: "string", description: "1-2 sætninger om stedet" },
      sources: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "url"],
          properties: { title: { type: "string" }, url: { type: "string" } },
        },
      },
      rooms: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "standing", "seated", "stage_width_m", "stage_depth_m", "ceiling_m", "leq15_dba",
            "house_has", "bring", "leave_home", "good_to_know", "house_provides"],
          properties: {
            name: { type: "string" },
            standing: num("integer"),
            seated: num("integer"),
            stage_width_m: num("number"),
            stage_depth_m: num("number"),
            ceiling_m: { ...num("number"), description: "Højde fra scene til loft/rig" },
            leq15_dba: num("number"),
            house_has: { type: "string" },
            bring: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["text", "inferred", "needs"],
                properties: {
                  text: { type: "string" },
                  inferred: { type: "string", description: "Tom hvis punktet står i en kilde; ellers hvorfor I udleder det" },
                  needs: { type: "string", enum: JOBS, description: "Opgavetype punktet kun gælder for, eller tom" },
                },
              },
            },
            leave_home: { type: "string" },
            good_to_know: { type: "string" },
            house_provides: { type: "array", items: { type: "string", enum: HOUSE_TYPES } },
          },
        },
      },
    },
  },
};

const SYSTEM = `Du researcher spillesteder i København for videoproduktionsfolk (folk der filmer koncerter, livestreams, musikvideoer og interviews), ikke for bands.

Brug web_search til at finde stedets officielle side og helst dets tech spec / rider (ofte en PDF under "teknik", "udlejning" eller "artist info"). Søg også efter rummets størrelse, kapacitet, scene, lysrig, lydpult og internet.

Skriv derefter guiden på dansk med save_guide:
- Ét objekt pr. rum/sal der bruges til koncerter.
- "bring": 6-10 konkrete punkter set fra en videofotografs side: objektiver (lofthøjde og scenestørrelse), kamerapositioner og stativ vs. gimbal (barriere, publikum), lyd-feed fra pulten, lys (LED-flimmer, må man tilføje lys), strøm, internet til livestream. Brug "needs" for punkter der kun gælder én opgavetype.
- Hold fakta og gæt adskilt: sæt "inferred" til en kort begrundelse, når punktet er din vurdering og ikke står i en kilde. Opfind aldrig tal; brug null når et tal ikke findes.
- "house_provides" kun for ting kilden siger huset har (fx fast lysrig = led_light).
- "sources": de sider du faktisk brugte.

Hvis stedet ikke findes, eller ikke er et spillested i Storkøbenhavn, kald save_guide med found=false og en kort reason, og tomme felter.
Afslut altid med at kalde save_guide.`;

function slug(s) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/ø/g, "o").replace(/æ/g, "ae").replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

// Maps the tool input onto the venue format the front end already renders.
function toVenue(g) {
  const id = "ai-" + slug(g.name);
  return {
    id,
    ai: true,
    generated_at: new Date().toISOString(),
    name: g.name,
    area: g.area,
    address: g.address,
    website: g.website,
    profile: g.profile,
    sources: { list: g.sources, tech_spec_pdf: g.sources.find((s) => /\.pdf(\?|$)/i.test(s.url))?.url || g.sources[0]?.url || null },
    spec_version: "AI-research",
    rooms: g.rooms.map((r, i) => ({
      id: slug(r.name) || `rum-${i + 1}`,
      name: r.name,
      capacity: { standing: r.standing, seated: r.seated },
      stage: { width_m: r.stage_width_m, depth_m: r.stage_depth_m, clearance_stage_to_ceiling_m: r.ceiling_m },
      spl_limits: { leq15_dba: r.leq15_dba },
      gear: {
        house_has: r.house_has,
        bring: r.bring.map((b) => ({ text: b.text, ...(b.inferred ? { inferred: b.inferred } : {}), ...(b.needs ? { needs: b.needs } : {}) })),
        leave_home: r.leave_home,
        good_to_know: r.good_to_know,
        house_provides: r.house_provides,
      },
    })),
  };
}

async function research(env, query) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, baseURL: env.ANTHROPIC_BASE_URL });
  const messages = [{ role: "user", content: `Lav en videoguide til spillestedet: ${query}` }];
  let nudged = false;

  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: 8 },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 4 },
        GUIDE_TOOL,
      ],
      messages,
    });

    if (response.stop_reason === "refusal") throw new Error("Claude afviste opgaven.");
    const call = response.content.find((b) => b.type === "tool_use" && b.name === "save_guide");
    if (call) return call.input;

    messages.push({ role: "assistant", content: response.content });
    if (response.stop_reason === "pause_turn") continue; // server-side search loop hit its limit; resume
    if (nudged) break;
    nudged = true;
    messages.push({ role: "user", content: "Kald save_guide nu med det du har fundet." });
  }
  throw new Error("Fik ingen guide tilbage.");
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function handleVenue(request, env, ctx) {
  if (request.method !== "POST") return json({ error: "Brug POST." }, 405);
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: "AI er ikke slået til endnu. Der mangler en ANTHROPIC_API_KEY på Cloudflare." }, 503);
  }
  let query;
  try { query = String((await request.json()).name || "").trim(); } catch { query = ""; }
  if (query.length < 2 || query.length > 80) return json({ error: "Skriv navnet på et spillested (2-80 tegn)." }, 400);

  // Same venue asked again within CACHE_DAYS is served from Cloudflare's cache, so it costs nothing.
  const cacheKey = new Request(`https://cache.venue-app/ai/${slug(query)}`);
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let guide;
  try {
    guide = await research(env, query);
  } catch (err) {
    const status = err instanceof Anthropic.AuthenticationError ? 503
      : err instanceof Anthropic.RateLimitError ? 429 : 502;
    const message = status === 503 ? "API-nøglen virker ikke. Tjek ANTHROPIC_API_KEY på Cloudflare."
      : status === 429 ? "For mange forespørgsler lige nu. Prøv igen om lidt."
      : `AI-søgningen fejlede: ${err.message}`;
    return json({ error: message }, status);
  }

  if (!guide.found || !guide.rooms?.length) {
    return json({ found: false, reason: guide.reason || "Fandt ikke stedet." });
  }
  const res = json({ found: true, venue: toVenue(guide) });
  res.headers.set("cache-control", `public, max-age=${CACHE_DAYS * 86400}`);
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/venue") return handleVenue(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
};
