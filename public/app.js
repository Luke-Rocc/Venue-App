const searchInput = document.getElementById("venue-search");
const results = document.getElementById("venue-results");
const detail = document.getElementById("venue-detail");
const roomSelect = document.getElementById("room");
const content = document.getElementById("content");
const profileForm = document.getElementById("profile-form");

const gearForm = document.getElementById("gear-form");

const PROFILE_KEY = "venue-video:profile";
const GEAR_KEY = "venue-video:kit";
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

function renderRoom() {
  const room = venue.rooms.find((r) => r.id === roomSelect.value);
  if (!room) return;
  const p = loadProfile();
  const cap = room.capacity || {};
  const stage = room.stage || {};
  const gear = room.gear || {};
  const stageSize = stage.width_m ? `${stage.width_m} x ${stage.depth_m} m` : null;

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
    ${ownGearSection(room)}
    <section class="card"><h3>Tag med</h3><ul class="check">${bring}</ul></section>
    <section class="card"><h3>Huset har</h3><p>${esc(gear.house_has)}</p></section>
    <section class="card"><h3>Kan blive hjemme</h3><p>${esc(gear.leave_home)}</p></section>
    <section class="card"><h3>Værd at vide</h3><p>${esc(gear.good_to_know)}</p>
      ${venue.sources?.tech_spec_pdf ? `<p class="muted">Kilde: <a href="${esc(venue.sources.tech_spec_pdf)}" target="_blank" rel="noopener">${esc(venue.spec_version || "tech spec")}</a></p>` : ""}
    </section>`;

  content.querySelectorAll("input[type=checkbox]").forEach((box) => {
    try { box.checked = localStorage.getItem(box.dataset.key) === "1"; } catch {}
    box.addEventListener("change", () => {
      try { localStorage.setItem(box.dataset.key, box.checked ? "1" : "0"); } catch {}
    });
  });
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
    .sort((a, b) => Boolean(b.file) - Boolean(a.file) || a.name.localeCompare(b.name, "da"));
  if (!found.length) {
    results.innerHTML = `<li class="muted empty">Ingen spillesteder matcher "${esc(q)}".</li>`;
    return;
  }
  results.innerHTML = found.map((v) => `
    <li><button type="button" class="result" data-venue="${esc(v.id)}">
      <span class="result-main">
        <b>${esc(v.name)}</b>
        <span class="muted">${esc(v.area || "")}${v.capacity ? ` · ${esc(v.capacity)} stående` : ""}</span>
      </span>
      ${v.file ? `<span class="badge ok">Guide klar</span>` : `<span class="badge">Kommer snart</span>`}
    </button></li>`).join("");
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
  results.hidden = true;
  searchInput.parentElement.hidden = true;
  detail.hidden = false;
  history.replaceState(null, "", `#venue/${id}`);
  if (!entry.file) {
    venue = null;
    roomSelect.parentElement.hidden = true;
    content.innerHTML = `<section class="card"><h2>${esc(entry.name)}</h2>
      <div class="muted">${esc(entry.area || "")}</div>
      <p>Vi har ikke kortlagt ${esc(entry.name)} endnu, så der er ingen pakkeliste her. Den kommer, når vi har gennemgået stedets tech spec.</p></section>`;
    return;
  }
  venue = await (await fetch(entry.file)).json();
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
    results.addEventListener("click", (e) => {
      const id = e.target.closest("[data-venue]")?.dataset.venue;
      if (id) openVenue(id);
    });
    document.getElementById("back").addEventListener("click", showSearch);
    roomSelect.addEventListener("change", renderRoom);
    renderResults();
    if (location.hash.startsWith("#venue/")) await openVenue(location.hash.slice(7));
  } catch (err) {
    content.innerHTML = `<p>Kunne ikke indlæse data. (${esc(err.message)})</p>`;
  }
}

init();
