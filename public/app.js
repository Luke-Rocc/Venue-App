const searchInput = document.getElementById("venue-search");
const results = document.getElementById("venue-results");
const detail = document.getElementById("venue-detail");
const roomSelect = document.getElementById("room");
const content = document.getElementById("content");
const profileForm = document.getElementById("profile-form");

const gearForm = document.getElementById("gear-form");

const PROFILE_KEY = "venue-video:profile";
const GEAR_KEY = "venue-video:kit";
const AI_KEY = "venue-video:ai-venues";
const SOCIAL = ["instagram", "youtube", "vimeo", "tiktok", "linkedin", "website"];
let venue = null;
let gearCatalog = [];
let venues = [];

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Profile

function loadProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}; } catch { return {}; }
}

function hasProfile(p) {
  return Boolean(p.name || p.operators || (p.jobs && p.jobs.length));
}

function fillProfileForm() {
  const p = loadProfile();
  profileForm.name.value = p.name || "";
  profileForm.operators.value = p.operators || "";
  profileForm.querySelectorAll("input[name=jobs]").forEach((box) => {
    box.checked = (p.jobs || []).includes(box.value);
  });
  profileForm.soundTech.checked = Boolean(p.soundTech);
  SOCIAL.forEach((k) => { profileForm[k].value = p.social?.[k] || ""; });
  renderSocialLinks(p);
}

function saveProfile() {
  const p = {
    name: profileForm.name.value.trim(),
    operators: parseInt(profileForm.operators.value, 10) || null,
    jobs: [...profileForm.querySelectorAll("input[name=jobs]:checked")].map((b) => b.value),
    soundTech: profileForm.soundTech.checked,
    social: Object.fromEntries(SOCIAL.map((k) => [k, profileForm[k].value.trim()]).filter(([, v]) => v)),
  };
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    document.getElementById("saved").textContent = "Gemt.";
  } catch {
    document.getElementById("saved").textContent = "Kunne ikke gemme på denne enhed.";
  }
  renderSocialLinks(p);
  if (venue) renderRoom();
}

const SOCIAL_LABELS = { instagram: "Instagram", youtube: "YouTube", vimeo: "Vimeo", tiktok: "TikTok", linkedin: "LinkedIn", website: "Hjemmeside" };
const SOCIAL_BASE = {
  instagram: "https://instagram.com/",
  youtube: "https://youtube.com/@",
  vimeo: "https://vimeo.com/",
  tiktok: "https://tiktok.com/@",
  linkedin: "https://linkedin.com/in/",
  website: "https://",
};

// Turns a handle or a pasted link into a full https URL.
function socialUrl(key, value) {
  if (/^https?:\/\//i.test(value)) return value;
  if (/^(www\.)?[\w-]+\.[a-z]{2,}\//i.test(value) && key !== "website") return "https://" + value;
  return SOCIAL_BASE[key] + value.replace(/^@/, "");
}

function renderSocialLinks(p) {
  const links = Object.entries(p.social || {}).map(([k, v]) =>
    `<a href="${esc(socialUrl(k, v))}" target="_blank" rel="noopener">${esc(SOCIAL_LABELS[k])}</a>`);
  document.getElementById("social-links").innerHTML = links.length ? `<span class="muted">Jeres links:</span> ${links.join("")}` : "";
}

// Gear

function loadKit() {
  try { return JSON.parse(localStorage.getItem(GEAR_KEY)) || { items: [] }; } catch { return { items: [] }; }
}

function saveKit(kit) {
  try { localStorage.setItem(GEAR_KEY, JSON.stringify(kit)); } catch {}
  renderKit();
  if (venue) renderRoom();
}

function ownsGear(type) {
  return loadKit().items.some((i) => i.type === type);
}

function itemLabel(i) {
  return `${i.qty > 1 ? i.qty + "× " : ""}${i.brand ? i.brand + " " : ""}${i.model}`;
}

function option(value, label) {
  return `<option value="${esc(value)}">${esc(label)}</option>`;
}

function currentCategory() {
  return gearCatalog.find((c) => c.id === gearForm.category.value);
}

function currentBrand() {
  return (currentCategory()?.brands || []).find((b) => b.brand === gearForm.brand.value);
}

// Cascading pickers: category -> brand -> model, with "Andet" for anything not listed.
function fillBrands() {
  const brands = currentCategory()?.brands || [];
  gearForm.brand.innerHTML = option("", "Vælg fabrikant") + brands.map((b) => option(b.brand, b.brand)).join("") + option("__other", "Andet");
  if (!brands.length) gearForm.brand.value = "__other";
  fillModels();
}

function fillModels() {
  const brand = currentBrand();
  const other = gearForm.brand.value === "__other";
  gearForm.model.innerHTML = option("", "Vælg model") + (brand?.models || []).map((m) => option(m.model, m.model)).join("") + option("__other", "Andet");
  gearForm.querySelector("[data-row=brand]").hidden = !(currentCategory()?.brands || []).length;
  gearForm.querySelector("[data-row=model]").hidden = other || !gearForm.brand.value;
  toggleCustom();
}

function toggleCustom() {
  const custom = gearForm.brand.value === "__other" || gearForm.model.value === "__other";
  gearForm.querySelector("[data-row=custom]").hidden = !custom;
  updatePreview();
}

function pickedItem() {
  const cat = currentCategory();
  if (!cat) return null;
  const qty = Math.max(1, parseInt(gearForm.qty.value, 10) || 1);
  const brandOther = gearForm.brand.value === "__other";
  const modelOther = gearForm.model.value === "__other";
  if (brandOther || modelOther) {
    const name = gearForm.custom.value.trim();
    if (!name) return null;
    return { category: cat.id, brand: brandOther ? "" : gearForm.brand.value, model: name, qty, type: cat.type };
  }
  const model = (currentBrand()?.models || []).find((m) => m.model === gearForm.model.value);
  if (!model) return null;
  return { category: cat.id, brand: gearForm.brand.value, model: model.model, qty, type: model.type || cat.type };
}

function updatePreview() {
  const item = pickedItem();
  document.getElementById("gear-preview").textContent = item ? itemLabel(item) : "";
  gearForm.querySelector("button[type=submit]").disabled = !item;
}

function addItem(e) {
  e.preventDefault();
  const item = pickedItem();
  if (!item) return;
  const kit = loadKit();
  const same = kit.items.find((i) => i.brand === item.brand && i.model === item.model);
  if (same) same.qty += item.qty;
  else kit.items.push({ id: Date.now().toString(36), ...item });
  saveKit(kit);
  gearForm.model.value = "";
  gearForm.custom.value = "";
  gearForm.qty.value = 1;
  toggleCustom();
}

function renderKit() {
  const kit = loadKit();
  const el = document.getElementById("kit");
  if (!kit.items.length) {
    el.innerHTML = `<p class="muted">Intet udstyr endnu. Tilføj jeres første kamera ovenfor.</p>`;
    return;
  }
  el.innerHTML = gearCatalog.map((cat) => {
    const items = kit.items.filter((i) => i.category === cat.id);
    if (!items.length) return "";
    return `<div class="kit-group"><div class="kit-cat">${esc(cat.name)}</div>
      <ul class="kit-list">${items.map((i) => `
        <li><span>${esc(itemLabel(i))}</span>
          <button type="button" class="remove" data-remove="${esc(i.id)}" aria-label="Fjern ${esc(itemLabel(i))}">×</button></li>`).join("")}
      </ul></div>`;
  }).join("");
}

function initGear() {
  gearForm.category.innerHTML = gearCatalog.map((c) => option(c.id, c.name)).join("");
  gearForm.category.addEventListener("change", fillBrands);
  gearForm.brand.addEventListener("change", fillModels);
  gearForm.model.addEventListener("change", toggleCustom);
  gearForm.custom.addEventListener("input", updatePreview);
  gearForm.qty.addEventListener("input", updatePreview);
  gearForm.addEventListener("submit", addItem);
  document.getElementById("kit").addEventListener("click", (e) => {
    const id = e.target.closest("[data-remove]")?.dataset.remove;
    if (!id) return;
    const kit = loadKit();
    kit.items = kit.items.filter((i) => i.id !== id);
    saveKit(kit);
  });
  fillBrands();
  renderKit();
}

// Splits the crew's own kit into what to bring and what the house already has.
function ownGearSection(room) {
  const items = loadKit().items;
  if (!items.length) {
    return `<p class="muted">Tip: byg jeres kit under <a href="#" data-goto="gear">Gear</a>, så ser I hvad der skal med.</p>`;
  }
  const provided = room.gear?.house_provides || [];
  const bring = items.filter((i) => !provided.includes(i.type));
  const leave = items.filter((i) => provided.includes(i.type));
  const list = (xs) => xs.length ? `<ul>${xs.map((i) => `<li>${esc(itemLabel(i))}</li>`).join("")}</ul>` : `<p class="muted">Intet.</p>`;
  return `<section class="card"><h3>Jeres kit her</h3>
    <div class="split">
      <div><b>Tag med</b>${list(bring)}</div>
      <div><b>Huset har (kan blive hjemme)</b>${list(leave)}</div>
    </div></section>`;
}

// Hide gear items the band doesn't need, based on the item's `needs` field.
function itemApplies(item, p) {
  if (!item.needs || !(p.jobs && p.jobs.length)) return true;
  return p.jobs.includes(item.needs);
}

function profileNotes(room, p) {
  if (!hasProfile(p)) return [];
  const notes = [];
  const stageWidth = room.stage?.width_m;
  if (p.operators >= 3 && stageWidth && stageWidth < 8) {
    notes.push(`I er ${p.operators} kameraoperatører på en ${stageWidth} m bred scene. Aftal faste positioner med huset på forhånd.`);
  }
  if ((p.jobs || []).includes("livestream")) {
    notes.push("Til livestream: test internettet på stedet før showet, og hav en plan B (fx 5G-router).");
  }
  if ((p.jobs || []).includes("musicvideo")) {
    notes.push("Musikvideo kræver typisk lejeaftale af rummet. Se stedets udlejningsside.");
  }
  if (p.soundTech) notes.push("I har egen lydperson. Aftal et feed fra lydpulten med husets tekniker.");
  return notes;
}

// Venues

function stat(value, label) {
  return value == null ? "" : `<div class="stat"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
}

// Floor plan: drawn from room.floor_plan, coordinates in metres from the top-left corner (stage at the top).

const PLAN_POINTS = { camera: "Kamera", power: "Strøm", info: "Info" };

function floorPlan(room) {
  const plan = room.floor_plan;
  if (!plan) return "";
  const W = plan.width_m, D = plan.depth_m, s = 50, pad = 20;
  const X = (m) => (m * s + pad).toFixed(1);
  const L = (m) => (m * s).toFixed(1);
  let n = 0;
  const legend = [];
  const shapes = plan.items.map((it) => {
    if (it.w != null) {
      const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
      return `<rect class="plan-${esc(it.kind)}${it.known ? "" : " plan-approx"}" x="${X(it.x)}" y="${X(it.y)}" width="${L(it.w)}" height="${L(it.h)}" rx="4"/>
        ${it.label ? `<text x="${X(cx)}" y="${X(cy)}" dy="0.35em">${esc(it.label)}</text>` : ""}`;
    }
    n += 1;
    legend.push(`<li><span class="plan-dot plan-${esc(it.kind)}">${n}</span><b>${PLAN_POINTS[it.kind] || ""}</b> ${esc(it.text)}</li>`);
    return `<g class="plan-point plan-${esc(it.kind)}"><circle cx="${X(it.x)}" cy="${X(it.y)}" r="16"/><text x="${X(it.x)}" y="${X(it.y)}" dy="0.35em">${n}</text></g>`;
  }).join("");
  const w = W * s + pad * 2, h = D * s + pad * 2 + 12;
  return `<section class="card"><h3>Plantegning${plan.approx ? ' <span class="tag">skitse</span>' : ""}</h3>
    <svg class="plan" viewBox="0 0 ${w} ${h}" role="img" aria-label="Plantegning af ${esc(room.name)}">
      <rect class="plan-room" x="${pad}" y="${pad}" width="${L(W)}" height="${L(D)}"/>
      ${shapes}
      <g class="plan-scale"><line x1="${X(W - 2)}" x2="${X(W)}" y1="${h - 6}" y2="${h - 6}"/><text x="${X(W - 1)}" y="${h - 10}">2 m</text></g>
    </svg>
    <ol class="plan-legend">${legend.join("")}</ol>
    ${plan.note ? `<p class="muted">${esc(plan.note)}</p>` : ""}
  </section>`;
}

function renderRoom() {
  const room = venue.rooms.find((r) => r.id === roomSelect.value);
  if (!room) return;
  const p = loadProfile();
  const cap = room.capacity || {};
  const stage = room.stage || {};
  const gear = room.gear || {};
  const stageSize = stage.width_m ? (stage.depth_m ? `${stage.width_m} x ${stage.depth_m} m` : `${stage.width_m} m bred`) : null;

  const bring = (gear.bring || []).map((item, i) => itemApplies(item, p) ? `
    <li><label>
      <input type="checkbox" data-key="${esc(venue.id)}:${esc(room.id)}:${i}">
      <span>${esc(item.text)}
        ${item.inferred ? `<span class="tag">udledt</span><span class="why">${esc(item.inferred)}</span>` : ""}
      </span>
    </label></li>` : "").join("");

  const notes = profileNotes(room, p);
  const forYou = hasProfile(p)
    ? (notes.length ? `<section class="card highlight"><h3>Til ${esc(p.name || "jer")}</h3><ul>${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></section>` : "")
    : `<p class="muted">Tip: udfyld <a href="#" data-goto="profile">Min profil</a>, så tilpasser vi listen til jeres opgave.</p>`;

  content.innerHTML = `
    ${venue.ai ? `<p class="ai-note">Lavet af AI ud fra stedets hjemmeside ${esc(new Date(venue.generated_at).toLocaleDateString("da-DK"))}. Tjek tal og regler med stedet før optagelsen.</p>` : ""}
    <section class="card">
      <h2>${esc(venue.name)}</h2>
      <div class="muted">${esc(venue.address)} · <a href="${esc(venue.website)}" target="_blank" rel="noopener">hjemmeside</a></div>
      <div class="stats">
        ${stat(cap.standing, "stående")}
        ${stat(cap.seated, "siddende")}
        ${stat(stageSize, "scene")}
        ${stat(room.spl_limits?.leq15_dba ? room.spl_limits.leq15_dba + " dB(A)" : null, "lydgrænse Leq15")}
      </div>
    </section>
    ${forYou}
    ${floorPlan(room)}
    ${ownGearSection(room)}
    <section class="card"><h3>Tag med</h3><ul class="check">${bring}</ul></section>
    <section class="card"><h3>Huset har</h3><p>${esc(gear.house_has)}</p></section>
    <section class="card"><h3>Kan blive hjemme</h3><p>${esc(gear.leave_home)}</p></section>
    <section class="card"><h3>Værd at vide</h3><p>${esc(gear.good_to_know)}</p>
      ${venue.ai ? aiSources(venue) : venue.sources?.tech_spec_pdf ? `<p class="muted">Kilde: <a href="${esc(venue.sources.tech_spec_pdf)}" target="_blank" rel="noopener">${esc(venue.spec_version || "tech spec")}</a></p>` : ""}
    </section>`;

  content.querySelectorAll("input[type=checkbox]").forEach((box) => {
    try { box.checked = localStorage.getItem(box.dataset.key) === "1"; } catch {}
    box.addEventListener("change", () => {
      try { localStorage.setItem(box.dataset.key, box.checked ? "1" : "0"); } catch {}
    });
  });
}

// AI guides: the Worker at /api/venue searches the web and returns a venue in the same format.

function loadAiVenues() {
  try { return JSON.parse(localStorage.getItem(AI_KEY)) || {}; } catch { return {}; }
}

function saveAiVenue(v) {
  const all = loadAiVenues();
  all[v.id] = v;
  try { localStorage.setItem(AI_KEY, JSON.stringify(all)); } catch {}
}

// Adds saved AI guides to the venue list, replacing a "Kommer snart" entry with the same name.
function mergeAiVenues() {
  Object.values(loadAiVenues()).forEach((v) => {
    const same = venues.find((e) => e.id === v.id || norm(e.name) === norm(v.name));
    const entry = { id: v.id, name: v.name, area: v.area, address: v.address, capacity: v.rooms[0]?.capacity?.standing, tags: [], data: v };
    if (same && same.file) return;
    if (same) Object.assign(same, { data: v, aiId: v.id });
    else venues.push(entry);
  });
}

function aiSources(v) {
  const list = v.sources?.list || [];
  if (!list.length) return "";
  return `<p class="muted">Kilder: ${list.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a>`).join(" · ")}</p>`;
}

function showDetail() {
  results.hidden = true;
  searchInput.parentElement.hidden = true;
  detail.hidden = false;
}

async function findWithAi(name) {
  showDetail();
  venue = null;
  roomSelect.parentElement.hidden = true;
  content.innerHTML = `<section class="card ai-loading"><h2>${esc(name)}</h2>
    <p><span class="spinner" aria-hidden="true"></span> AI'en søger efter stedet og læser dets tech spec. Det tager typisk 1-2 minutter.</p></section>`;
  let data;
  try {
    const res = await fetch("api/venue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    data = await res.json().catch(() => ({ error: `Serveren svarede ${res.status}.` }));
  } catch {
    data = { error: "Ingen forbindelse. Prøv igen." };
  }
  if (detail.hidden) return; // user went back while waiting
  if (data.error || !data.found) {
    content.innerHTML = `<section class="card"><h2>${esc(name)}</h2>
      <p>${esc(data.error || data.reason || "Fandt ikke stedet.")}</p>
      <button type="button" class="ai-button" data-ai="${esc(name)}">Prøv igen</button></section>`;
    return;
  }
  saveAiVenue(data.venue);
  mergeAiVenues();
  renderResults();
  const entry = venues.find((e) => e.data?.id === data.venue.id);
  history.replaceState(null, "", `#venue/${entry?.id || data.venue.id}`);
  showVenue(data.venue);
}

// Search

function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ø/g, "o").replace(/æ/g, "ae").replace(/å/g, "a");
}

function matches(v, q) {
  const hay = norm([v.name, v.area, v.address, ...(v.tags || [])].join(" "));
  return norm(q).split(/\s+/).filter(Boolean).every((word) => hay.includes(word));
}

function renderResults() {
  const q = searchInput.value.trim();
  const found = venues.filter((v) => matches(v, q))
    .sort((a, b) => Boolean(b.file || b.data) - Boolean(a.file || a.data) || a.name.localeCompare(b.name, "da"));
  const exact = found.some((v) => norm(v.name) === norm(q));
  const aiRow = q.length >= 2 && !exact ? `<li><button type="button" class="ai-button" data-ai="${esc(q)}">Find "${esc(q)}" med AI</button></li>` : "";
  if (!found.length) {
    results.innerHTML = `<li class="muted empty">Ingen spillesteder på listen matcher "${esc(q)}".</li>${aiRow}`;
    return;
  }
  results.innerHTML = found.map((v) => `
    <li><button type="button" class="result" data-venue="${esc(v.id)}">
      <span class="result-main">
        <b>${esc(v.name)}</b>
        <span class="muted">${esc(v.area || "")}${v.capacity ? ` · ${esc(v.capacity)} stående` : ""}</span>
      </span>
      ${v.file ? `<span class="badge ok">Guide klar</span>` : v.data ? `<span class="badge ai">AI-guide</span>` : `<span class="badge">Kommer snart</span>`}
    </button></li>`).join("") + aiRow;
}

function showSearch() {
  detail.hidden = true;
  results.hidden = false;
  searchInput.parentElement.hidden = false;
  if (location.hash.startsWith("#venue/")) history.replaceState(null, "", "#venues");
}

async function openVenue(id) {
  const entry = venues.find((v) => v.id === id);
  if (!entry) return;
  showDetail();
  history.replaceState(null, "", `#venue/${id}`);
  if (entry.data) return showVenue(entry.data);
  if (!entry.file) {
    venue = null;
    roomSelect.parentElement.hidden = true;
    content.innerHTML = `<section class="card"><h2>${esc(entry.name)}</h2>
      <div class="muted">${esc(entry.area || "")}</div>
      <p>Vi har ikke kortlagt ${esc(entry.name)} endnu. AI'en kan finde stedets tech spec og lave en pakkeliste nu.</p>
      <button type="button" class="ai-button" data-ai="${esc(entry.name)}">Lav guide med AI</button></section>`;
    return;
  }
  showVenue(await (await fetch(entry.file)).json());
}

function showVenue(v) {
  venue = v;
  roomSelect.parentElement.hidden = venue.rooms.length < 2;
  roomSelect.innerHTML = venue.rooms.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join("");
  renderRoom();
}

// Tabs

function showTab(name) {
  document.querySelectorAll("[role=tab]").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
  document.querySelectorAll("[role=tabpanel]").forEach((panel) => { panel.hidden = panel.id !== `tab-${name}`; });
  if (name !== "venues" || !location.hash.startsWith("#venue/")) {
    if (location.hash !== `#${name}`) history.replaceState(null, "", `#${name}`);
  }
}

document.querySelectorAll("[role=tab]").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));
document.addEventListener("click", (e) => {
  const link = e.target.closest("[data-goto]");
  if (link) { e.preventDefault(); showTab(link.dataset.goto); }
});

async function init() {
  fillProfileForm();
  profileForm.addEventListener("input", saveProfile);
  profileForm.addEventListener("submit", (e) => e.preventDefault());
  showTab(["profile", "gear"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "venues");

  try {
    gearCatalog = await (await fetch("data/gear.json")).json();
    initGear();
    venues = await (await fetch("data/venues.json")).json();
    searchInput.addEventListener("input", renderResults);
    mergeAiVenues();
    results.addEventListener("click", (e) => {
      const id = e.target.closest("[data-venue]")?.dataset.venue;
      if (id) openVenue(id);
    });
    document.getElementById("tab-venues").addEventListener("click", (e) => {
      const name = e.target.closest("[data-ai]")?.dataset.ai;
      if (name) findWithAi(name);
    });
    document.getElementById("back").addEventListener("click", showSearch);
    roomSelect.addEventListener("change", renderRoom);
    renderResults();
    if (location.hash.startsWith("#venue/")) await openVenue(location.hash.slice(7));
  } catch (err) {
    content.innerHTML = `<p>Kunne ikke indlæse data. (${esc(err.message)})</p>`;
  }
}

// Intro animation: runs once per session, tap to skip.
const intro = document.getElementById("intro");
if (intro) {
  try { sessionStorage.setItem("introSeen", "1"); } catch {}
  const close = () => {
    intro.classList.add("done");
    setTimeout(() => intro.remove(), 300);
  };
  intro.addEventListener("click", close);
  document.addEventListener("keydown", close, { once: true });
  setTimeout(() => intro.remove(), 2500);
}

init();
