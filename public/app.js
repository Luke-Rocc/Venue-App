const venueSelect = document.getElementById("venue");
const roomSelect = document.getElementById("room");
const content = document.getElementById("content");

let venue = null;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function stat(value, label) {
  return value == null ? "" : `<div class="stat"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
}

function renderRoom() {
  const room = venue.rooms.find((r) => r.id === roomSelect.value);
  if (!room) return;
  const cap = room.capacity || {};
  const stage = room.stage || {};
  const gear = room.gear || {};
  const stageSize = stage.width_m ? `${stage.width_m} x ${stage.depth_m} m` : null;

  const bring = (gear.bring || []).map((item, i) => `
    <li><label>
      <input type="checkbox" data-key="${esc(venue.id)}:${esc(room.id)}:${i}">
      <span>${esc(item.text)}
        ${item.inferred ? `<span class="tag">udledt</span><span class="why">${esc(item.inferred)}</span>` : ""}
      </span>
    </label></li>`).join("");

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

async function init() {
  try {
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
