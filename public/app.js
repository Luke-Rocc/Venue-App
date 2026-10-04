const venueSelect = document.getElementById("venue");
const roomSelect = document.getElementById("room");
const content = document.getElementById("content");
const profileForm = document.getElementById("profile-form");

const gearForm = document.getElementById("gear-form");

const PROFILE_KEY = "venue-video:profile";
const GEAR_KEY = "venue-video:gear";
let venue = null;
let gearCatalog = [];

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
}

function saveProfile() {
  const p = {
    name: profileForm.name.value.trim(),
    operators: parseInt(profileForm.operators.value, 10) || null,
    jobs: [...profileForm.querySelectorAll("input[name=jobs]:checked")].map((b) => b.value),
    soundTech: profileForm.soundTech.checked,
  };
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    document.getElementById("saved").textContent = "Gemt.";
  } catch {
    document.getElementById("saved").textContent = "Kunne ikke gemme på denne enhed.";
  }
  if (venue) renderRoom();
}

// Gear

function loadGear() {
  try { return JSON.parse(localStorage.getItem(GEAR_KEY)) || { owned: [], notes: "" }; } catch { return { owned: [], notes: "" }; }
}

function ownsGear(id) {
  return (loadGear().owned || []).includes(id);
}

function renderGearForm() {
  const g = loadGear();
  document.getElementById("gear-list").innerHTML = gearCatalog.map((item) => `
    <li><label>
      <input type="checkbox" name="owned" value="${esc(item.id)}" ${(g.owned || []).includes(item.id) ? "checked" : ""}>
      <span>${esc(item.name)}</span>
    </label></li>`).join("");
  gearForm.notes.value = g.notes || "";
}

function saveGear() {
  const g = {
    owned: [...gearForm.querySelectorAll("input[name=owned]:checked")].map((b) => b.value),
    notes: gearForm.notes.value,
  };
  try {
    localStorage.setItem(GEAR_KEY, JSON.stringify(g));
    document.getElementById("gear-saved").textContent = "Gemt.";
  } catch {
    document.getElementById("gear-saved").textContent = "Kunne ikke gemme på denne enhed.";
  }
  if (venue) renderRoom();
}

// Splits the band's own gear into what to bring and what the house already has.
function ownGearSection(room) {
  const g = loadGear();
  const owned = gearCatalog.filter((item) => (g.owned || []).includes(item.id));
  if (!owned.length) {
    return `<p class="muted">Tip: kryds jeres udstyr af under <a href="#" data-goto="gear">Gear</a>, så ser I hvad der skal med.</p>`;
  }
  const provided = room.gear?.house_provides || [];
  const bring = owned.filter((item) => !provided.includes(item.id));
  const leave = owned.filter((item) => provided.includes(item.id));
  const list = (items) => items.length ? `<ul>${items.map((i) => `<li>${esc(i.name)}</li>`).join("")}</ul>` : `<p class="muted">Intet.</p>`;
  return `<section class="card"><h3>Jeres gear her</h3>
    <div class="split">
      <div><b>Tag med</b>${list(bring)}${g.notes ? `<p class="muted">Andet: ${esc(g.notes)}</p>` : ""}</div>
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

async function loadVenue(entry) {
  venue = await (await fetch(entry.file)).json();
  roomSelect.innerHTML = venue.rooms.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join("");
  renderRoom();
}

// Tabs

function showTab(name) {
  document.querySelectorAll("[role=tab]").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
  document.querySelectorAll("[role=tabpanel]").forEach((panel) => { panel.hidden = panel.id !== `tab-${name}`; });
  if (location.hash !== `#${name}`) history.replaceState(null, "", `#${name}`);
}

document.querySelectorAll("[role=tab]").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));
document.addEventListener("click", (e) => {
  const link = e.target.closest("[data-goto]");
  if (link) { e.preventDefault(); showTab(link.dataset.goto); }
});

async function init() {
  fillProfileForm();
  gearForm.addEventListener("input", saveGear);
  gearForm.addEventListener("submit", (e) => e.preventDefault());
  profileForm.addEventListener("input", saveProfile);
  profileForm.addEventListener("submit", (e) => e.preventDefault());
  showTab(["profile", "gear"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "venues");

  try {
    gearCatalog = await (await fetch("data/gear.json")).json();
    renderGearForm();
    const venues = await (await fetch("data/venues.json")).json();
    venueSelect.innerHTML = venues.map((v) => `<option value="${esc(v.id)}">${esc(v.name)}</option>`).join("");
    venueSelect.addEventListener("change", () => loadVenue(venues.find((v) => v.id === venueSelect.value)));
    roomSelect.addEventListener("change", renderRoom);
    await loadVenue(venues[0]);
  } catch (err) {
    content.innerHTML = `<p>Kunne ikke indlæse data. (${esc(err.message)})</p>`;
  }
}

init();
