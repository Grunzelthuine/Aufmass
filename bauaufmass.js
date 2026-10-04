"use strict";

/* ============================================================
   Bauaufmaß (seit Version 10.0)
   Alternative zum normalen Materialaufmaß: Kunde + Arbeitsbeschreibung,
   darunter Etagen -> Räume. Pro Raum vorbereitete Zähler (Steckdosen,
   Cat, Sat, Rollo, FBH, Melder, Geräteanschlüsse, KNX ...), Beleuchtung
   als Liste von Schaltungen (mit Schaltstellen + Auslässen) und frei
   hinzufügbares Material (Katalog/Standardmaterial/Freitext).
   Datum = Erstellungsdatum des Bauaufmaßes (kein eigenes Datumsfeld).
   Export: PDF nach Etage/Raum + Gesamtzusammenstellung, nur Positionen > 0.
   Wird VOR app.js geladen; nutzt dessen Funktionen erst zur Laufzeit.
   ============================================================ */

const STORAGE_KEY_BAUAUFMASSE = "aufmass_v1_bauaufmasse";

const BAU_ETAGEN_VORGABEN = ["KG", "EG", "OG", "DG", "Spitzboden", "Außenbereich"];

const BAU_RAUM_VORSCHLAEGE = [
  "Flur", "Bad", "Küche", "Esszimmer", "Wohnzimmer", "Schlafzimmer", "Abstellraum",
  "HWR", "Dachboden", "Eltern", "Kind 1", "Kind 2", "Kind 3", "Keller", "HAR", "Büro",
  "Garage", "Terrasse", "Hof"
];
const BAU_RAUM_VORSCHLAEGE_WEITERE = [
  "Gäste-WC", "Windfang", "Diele", "Treppenhaus", "Galerie", "Ankleide", "Gästezimmer",
  "Speisekammer", "Technikraum", "Hobbyraum", "Werkstatt", "Carport", "Balkon",
  "Wintergarten", "Garten", "Eingang außen"
];

const BAU_POSITIONEN_GRUPPEN = [
  { id: "installation", titel: "Installation", immerOffen: true, positionen: [
    { key: "steckdose", b: "Steckdose" },
    { key: "cat1", b: "Cat 1-fach" },
    { key: "cat2", b: "Cat 2-fach" },
    { key: "sat", b: "Sat-Anschluss" },
    { key: "fbh", b: "FBH Thermostat" }
  ] },
  { id: "melder", titel: "Melder", positionen: [
    { key: "rauchmelder", b: "Rauchmelder" },
    { key: "bewegungsmelder", b: "Bewegungsmelder" },
    { key: "praesenzmelder", b: "Präsenzmelder" }
  ] },
  { id: "geraete", titel: "Geräteanschlüsse", positionen: [
    { key: "herd", b: "Herdanschluss" },
    { key: "geschirrspueler", b: "Anschluss Geschirrspüler" },
    { key: "waschmaschine", b: "Anschluss Waschmaschine" },
    { key: "trockner", b: "Anschluss Trockner" },
    { key: "kuehlschrank", b: "Anschluss Kühlschrank" },
    { key: "dunstabzug", b: "Anschluss Dunstabzug" },
    { key: "durchlauferhitzer", b: "Anschluss Durchlauferhitzer" }
  ] },
  { id: "komm", titel: "Kommunikation / KNX", positionen: [
    { key: "tae", b: "TAE / Telefon" },
    { key: "klingel", b: "Klingel / Sprechanlage" },
    { key: "knxtaster", b: "KNX-Taster" },
    { key: "rtr", b: "Raumtemperaturregler / -fühler" }
  ] }
];

const BAU_SCHALTUNGSTYPEN = [
  { key: "aus", b: "Ausschaltung", min: 1 },
  { key: "kontroll", b: "Kontrollschaltung", min: 1 },
  { key: "kontrollwechsel", b: "Kontrollwechselschaltung", min: 2 },
  { key: "dimmer", b: "Dimmer", min: 1 },
  { key: "wechsel", b: "Wechselschaltung", min: 2 },
  { key: "wechseldimmer", b: "Wechselschaltung mit Dimmer", min: 2 },
  { key: "kreuz", b: "Kreuzschaltung", min: 3 }
];

// Rollos (v10.1): je Rollo-Anschluss Bedienung wählbar
const BAU_ROLLO_BEDIENUNG = [
  { key: "keine", b: "Keine", label: "ohne Schalter/Taster" },
  { key: "schalter", b: "Schalter", label: "Schalter", mat: "Rolloschalter" },
  { key: "taster", b: "Taster", label: "Taster", mat: "Rollotaster" }
];

const BAU_AUSLAESSE = [
  { key: "wand", b: "Wandauslass" },
  { key: "decke", b: "Deckenauslass" },
  { key: "steckdose", b: "Schaltbare Steckdose" },
  { key: "strahler", b: "Strahler" }
];

let bauaufmasse = [];
let currentBauaufmass = null;
let currentRaum = null;       // { etage, raum } während die Raum-Ansicht offen ist
let bauScrollPosition = 0;    // Scrollposition der Bauaufmaß-Ansicht beim Öffnen eines Raums

/* ---------- Storage ---------- */

function ladeBauaufmasse() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BAUAUFMASSE);
    bauaufmasse = raw ? JSON.parse(raw) : [];
    bauaufmasse.forEach((b) => b.etagen.forEach((e) => e.raeume.forEach(migriereRaum)));
  } catch (e) {
    console.error("Fehler beim Laden der Bauaufmaße", e);
    bauaufmasse = [];
  }
}

function speichereBauaufmasse() {
  try {
    localStorage.setItem(STORAGE_KEY_BAUAUFMASSE, JSON.stringify(bauaufmasse));
  } catch (e) {
    console.error("Fehler beim Speichern", e);
    alert("Speichern fehlgeschlagen (evtl. Speicher voll). Bitte PDF sichern.");
  }
}

function istLeeresBauaufmass(b) {
  const k = b.kunde;
  return !k.name.trim() && !k.ansprechpartner.trim() && !k.strasse.trim() && !k.plzOrt.trim() &&
    !k.telefon.trim() && !b.baustelle.trim() && !b.arbeitsbeschreibung.trim() && b.etagen.length === 0;
}

function upsertCurrentBauaufmass() {
  const idx = bauaufmasse.findIndex((x) => x.id === currentBauaufmass.id);
  currentBauaufmass.geaendert = new Date().toISOString();
  if (idx >= 0) bauaufmasse[idx] = currentBauaufmass;
  else bauaufmasse.unshift(currentBauaufmass);
  speichereBauaufmasse();
}

// Von autosave() in app.js aufgerufen. Bereits gespeicherte Bauaufmaße werden
// auch dann aktualisiert, wenn sie (z. B. nach Löschen aller Etagen) leer sind.
function autosaveBauaufmass() {
  if (!currentBauaufmass) return;
  const bestehend = bauaufmasse.some((x) => x.id === currentBauaufmass.id);
  if (bestehend || !istLeeresBauaufmass(currentBauaufmass)) upsertCurrentBauaufmass();
}

function neuesBauaufmass() {
  const jetzt = new Date().toISOString();
  return {
    id: neueId(),
    typ: "bau",
    erstellt: jetzt,
    geaendert: jetzt,
    kunde: { name: "", ansprechpartner: "", strasse: "", plzOrt: "", telefon: "" },
    baustelle: "",
    arbeitsbeschreibung: "",
    etagen: [] // { id, name, raeume: [Raum] }
  };
}

function neuerRaum(name) {
  return { id: neueId(), name, positionen: {}, schaltungen: [], rollos: [], material: [] };
}

function neuesRollo(anzahl = 1, bedienung = "keine") {
  return { id: neueId(), anzahl, bedienung, bedienAnzahl: 1, bemerkung: "" };
}

// v10.0 hatte "Rollo" als einfachen Zähler – in Rollo-Einträge ohne Bedienung umwandeln.
function migriereRaum(raum) {
  if (!Array.isArray(raum.rollos)) raum.rollos = [];
  const alt = raum.positionen && raum.positionen.rollo;
  if (alt > 0) raum.rollos.push(neuesRollo(alt, "keine"));
  if (raum.positionen) delete raum.positionen.rollo;
}

function rolloBedienung(key) {
  return BAU_ROLLO_BEDIENUNG.find((x) => x.key === key) || BAU_ROLLO_BEDIENUNG[0];
}

function erstelltDatumISO(b) {
  const d = new Date(b.erstellt);
  if (isNaN(d)) return heuteISO();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function schaltungTyp(key) {
  return BAU_SCHALTUNGSTYPEN.find((t) => t.key === key) || BAU_SCHALTUNGSTYPEN[0];
}

function schaltungBezeichnung(s) {
  const t = schaltungTyp(s.typ);
  return t.b + (s.schaltstellen > 1 ? ` (${s.schaltstellen} Schaltstellen)` : "");
}

function raumZusammenfassung(raum) {
  const teile = [];
  const nS = raum.schaltungen.length;
  if (nS) teile.push(`${nS} Schaltung${nS === 1 ? "" : "en"}`);
  const nR = (raum.rollos || []).reduce((s, r) => s + r.anzahl, 0);
  if (nR) teile.push(`${nR} Rollo${nR === 1 ? "" : "s"}`);
  const nP = Object.values(raum.positionen).reduce((s, v) => s + (v > 0 ? v : 0), 0);
  if (nP) teile.push(`${nP} Anschl./Geräte`);
  const nM = raum.material.filter((m) => m.menge > 0).length;
  if (nM) teile.push(`${nM} Material`);
  return teile.length ? teile.join(" · ") : "noch leer";
}

/* ---------- Übersicht (Bereich in zeigeUebersicht) ---------- */

function renderBauaufmassUebersicht() {
  const btn = document.getElementById("btnNewBauaufmass");
  if (!btn) return;
  btn.addEventListener("click", () => oeffneBauaufmass(neuesBauaufmass()));
  const listeEl = document.getElementById("bauaufmassListe");
  const leerEl = document.getElementById("bauaufmasseLeer");
  leerEl.hidden = bauaufmasse.length !== 0;
  const sortiert = [...bauaufmasse].sort((a, b) => (b.geaendert || "").localeCompare(a.geaendert || ""));
  for (const b of sortiert) {
    const li = document.createElement("li");
    li.className = "aufmass-card";
    const nRaeume = b.etagen.reduce((s, e) => s + e.raeume.length, 0);
    const kundeName = b.kunde.name.trim() || "(ohne Kundenname)";
    const beschreibung = b.arbeitsbeschreibung.trim();
    li.innerHTML = `
      <div class="info">
        <p class="kunde">${escapeHtml(kundeName)}</p>
        <p class="meta">${formatDatumDE(erstelltDatumISO(b))} · ${b.etagen.length} Etage${b.etagen.length === 1 ? "" : "n"}, ${nRaeume} Raum${nRaeume === 1 ? "" : "e"}${beschreibung ? " · " + escapeHtml(beschreibung) : ""}</p>
      </div>
      <span class="chevron">›</span>`;
    li.addEventListener("click", () => oeffneBauaufmass(b));
    listeEl.appendChild(li);
  }
}

/* ---------- Bauaufmaß-Ansicht ---------- */

function oeffneBauaufmass(b, scrollY) {
  currentBauaufmass = b;
  currentRaum = null;
  currentAufmass = null;
  currentPackliste = null;
  zurueckAktion = null;
  headerTitle.textContent = "Bauaufmaß";
  btnBack.hidden = false;
  btnNew.hidden = true;

  const tpl = document.getElementById("tpl-bauaufmass");
  app.innerHTML = "";
  app.appendChild(tpl.content.cloneNode(true));

  const felder = [
    ["b_kundeName", () => b.kunde.name, (v) => (b.kunde.name = v)],
    ["b_ansprechpartner", () => b.kunde.ansprechpartner, (v) => (b.kunde.ansprechpartner = v)],
    ["b_strasse", () => b.kunde.strasse, (v) => (b.kunde.strasse = v)],
    ["b_plzOrt", () => b.kunde.plzOrt, (v) => (b.kunde.plzOrt = v)],
    ["b_telefon", () => b.kunde.telefon, (v) => (b.kunde.telefon = v)],
    ["b_baustelle", () => b.baustelle, (v) => (b.baustelle = v)],
    ["b_arbeitsbeschreibung", () => b.arbeitsbeschreibung, (v) => (b.arbeitsbeschreibung = v)]
  ];
  for (const [id, getter, setter] of felder) {
    const el = document.getElementById(id);
    el.value = getter();
    el.addEventListener("input", (e) => { setter(e.target.value); autosave(); });
  }
  document.getElementById("b_datumHinweis").textContent =
    `Datum im Export: ${formatDatumDE(erstelltDatumISO(b))} (Erstellungsdatum)`;

  // Etage hinzufügen
  const chipsEl = document.getElementById("b_etagenChips");
  for (const name of BAU_ETAGEN_VORGABEN) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = name;
    chip.disabled = b.etagen.some((e) => e.name === name);
    chip.addEventListener("click", () => fuegeEtageHinzu(name));
    chipsEl.appendChild(chip);
  }
  const etageFrei = document.getElementById("b_etageFrei");
  const etageFreiBtn = document.getElementById("b_etageFreiBtn");
  const etageFreiAdd = () => {
    const name = etageFrei.value.trim();
    if (!name) { etageFrei.focus(); return; }
    fuegeEtageHinzu(name);
  };
  etageFreiBtn.addEventListener("click", etageFreiAdd);
  etageFrei.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); etageFreiAdd(); } });

  renderEtagen();

  const bestehend = bauaufmasse.some((x) => x.id === b.id);
  const btnLoeschen = document.getElementById("btnBauLoeschen");
  btnLoeschen.hidden = !bestehend;
  btnLoeschen.addEventListener("click", () => {
    if (!confirm("Dieses Bauaufmaß wirklich löschen?")) return;
    bauaufmasse = bauaufmasse.filter((x) => x.id !== b.id);
    speichereBauaufmasse();
    zeigeUebersicht();
  });
  document.getElementById("btnBauPdf").addEventListener("click", () => {
    autosaveBauaufmass();
    erstelleBauPdf(b);
  });

  window.scrollTo(0, scrollY || 0);
}

function etagenRang(name) {
  const i = BAU_ETAGEN_VORGABEN.indexOf(name);
  return i >= 0 ? i : 99;
}

function fuegeEtageHinzu(name) {
  const b = currentBauaufmass;
  if (b.etagen.some((e) => e.name.toLowerCase() === name.toLowerCase())) {
    alert(`Etage „${name}“ ist bereits vorhanden.`);
    return;
  }
  const etage = { id: neueId(), name, raeume: [] };
  // Vorgabe-Etagen in sinnvoller Reihenfolge einsortieren (KG, EG, OG, ...),
  // eigene Bezeichnungen hinten anhängen.
  const rang = etagenRang(name);
  let pos = b.etagen.length;
  if (rang < 99) {
    const idx = b.etagen.findIndex((e) => etagenRang(e.name) > rang);
    if (idx >= 0) pos = idx;
  }
  b.etagen.splice(pos, 0, etage);
  autosave();
  oeffneBauaufmass(b, window.scrollY);
  const karte = document.querySelector(`[data-etage-id="${etage.id}"]`);
  if (karte) {
    karte.querySelector(".raum-add-panel").hidden = false;
    karte.scrollIntoView({ block: "start", behavior: "smooth" });
  }
}

function eindeutigerRaumname(etage, name) {
  if (!etage.raeume.some((r) => r.name === name)) return name;
  let n = 2;
  while (etage.raeume.some((r) => r.name === `${name} ${n}`)) n++;
  return `${name} ${n}`;
}

// "Kind 1" -> "Kind 2" (nächste freie Nummer), "Bad" -> "Bad 2"
function kopieRaumname(etage, name) {
  const m = name.match(/^(.*?)\s*(\d+)$/);
  const basis = m ? m[1] : name;
  let n = m ? parseInt(m[2], 10) + 1 : 2;
  while (etage.raeume.some((r) => r.name === `${basis} ${n}`)) n++;
  return `${basis} ${n}`;
}

function renderEtagen() {
  const b = currentBauaufmass;
  const container = document.getElementById("b_etagen");
  const leer = document.getElementById("b_etagenLeer");
  container.innerHTML = "";
  leer.hidden = b.etagen.length !== 0;

  b.etagen.forEach((etage, etageIdx) => {
    const karte = document.createElement("div");
    karte.className = "etage-karte";
    karte.dataset.etageId = etage.id;
    karte.innerHTML = `
      <div class="etage-kopf">
        <strong class="etage-name"></strong>
        <div class="etage-aktionen">
          <button type="button" class="btn-mini" data-a="hoch" aria-label="Nach oben" ${etageIdx === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="btn-mini" data-a="runter" aria-label="Nach unten" ${etageIdx === b.etagen.length - 1 ? "disabled" : ""}>↓</button>
          <button type="button" class="btn-mini" data-a="umbenennen" aria-label="Umbenennen">✎</button>
          <button type="button" class="btn-mini btn-mini-danger" data-a="loeschen" aria-label="Etage löschen">✕</button>
        </div>
      </div>
      <ul class="raum-liste"></ul>
      <button type="button" class="btn-link-accent raum-add-toggle">+ Raum hinzufügen</button>
      <div class="raum-add-panel" hidden>
        <div class="chip-row raum-chips"></div>
        <div class="kategorie-titel-klein">Weitere Vorschläge</div>
        <div class="chip-row raum-chips-weitere"></div>
        <div class="inline-add">
          <input type="text" class="raum-frei" placeholder="Eigener Raumname">
          <button type="button" class="btn btn-secondary raum-frei-btn">Hinzufügen</button>
        </div>
      </div>`;
    karte.querySelector(".etage-name").textContent = etage.name;

    karte.querySelector('[data-a="hoch"]').addEventListener("click", () => verschiebeEtage(etageIdx, -1));
    karte.querySelector('[data-a="runter"]').addEventListener("click", () => verschiebeEtage(etageIdx, 1));
    karte.querySelector('[data-a="umbenennen"]').addEventListener("click", () => {
      const neu = prompt("Etage umbenennen:", etage.name);
      if (neu && neu.trim()) {
        etage.name = neu.trim();
        autosave();
        oeffneBauaufmass(b, window.scrollY);
      }
    });
    karte.querySelector('[data-a="loeschen"]').addEventListener("click", () => {
      const hinweis = etage.raeume.length ? ` inkl. ${etage.raeume.length} Raum/Räume` : "";
      if (!confirm(`Etage „${etage.name}“${hinweis} wirklich löschen?`)) return;
      b.etagen = b.etagen.filter((e) => e.id !== etage.id);
      autosave();
      oeffneBauaufmass(b, window.scrollY);
    });

    const raumListe = karte.querySelector(".raum-liste");
    if (etage.raeume.length === 0) {
      const li = document.createElement("li");
      li.className = "hint raum-leer";
      li.textContent = "Noch keine Räume.";
      raumListe.appendChild(li);
    }
    for (const raum of etage.raeume) {
      const li = document.createElement("li");
      li.className = "raum-karte";
      li.innerHTML = `<div class="info"><p class="kunde"></p><p class="meta"></p></div><span class="chevron">›</span>`;
      li.querySelector(".kunde").textContent = raum.name;
      li.querySelector(".meta").textContent = raumZusammenfassung(raum);
      li.addEventListener("click", () => oeffneRaum(etage, raum));
      raumListe.appendChild(li);
    }

    const panel = karte.querySelector(".raum-add-panel");
    karte.querySelector(".raum-add-toggle").addEventListener("click", () => { panel.hidden = !panel.hidden; });

    const fuegeRaumHinzu = (name) => {
      etage.raeume.push(neuerRaum(eindeutigerRaumname(etage, name)));
      autosave();
      oeffneBauaufmass(b, window.scrollY);
      const k = document.querySelector(`[data-etage-id="${etage.id}"]`);
      if (k) k.querySelector(".raum-add-panel").hidden = false; // für mehrere Räume am Stück offen lassen
    };
    const baueChips = (ziel, namen) => {
      for (const name of namen) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip";
        if (etage.raeume.some((r) => r.name === name)) chip.classList.add("chip-benutzt");
        chip.textContent = name;
        chip.addEventListener("click", () => fuegeRaumHinzu(name));
        ziel.appendChild(chip);
      }
    };
    baueChips(karte.querySelector(".raum-chips"), BAU_RAUM_VORSCHLAEGE);
    baueChips(karte.querySelector(".raum-chips-weitere"), BAU_RAUM_VORSCHLAEGE_WEITERE);
    const frei = karte.querySelector(".raum-frei");
    const freiAdd = () => {
      const name = frei.value.trim();
      if (!name) { frei.focus(); return; }
      fuegeRaumHinzu(name);
    };
    karte.querySelector(".raum-frei-btn").addEventListener("click", freiAdd);
    frei.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); freiAdd(); } });

    container.appendChild(karte);
  });
}

function verschiebeEtage(idx, richtung) {
  const b = currentBauaufmass;
  const ziel = idx + richtung;
  if (ziel < 0 || ziel >= b.etagen.length) return;
  [b.etagen[idx], b.etagen[ziel]] = [b.etagen[ziel], b.etagen[idx]];
  autosave();
  oeffneBauaufmass(b, window.scrollY);
}

/* ---------- Raum-Ansicht ---------- */

// Zähler-Zeile: Bezeichnung + (−) [Zahl] (+)
function baueZaehler(label, wert, min, onChange) {
  const row = document.createElement("div");
  row.className = "zaehler-zeile" + (wert > 0 ? " aktiv" : "");
  row.innerHTML = `
    <span class="zaehler-label"></span>
    <div class="menge-control">
      <button type="button" class="btn-qty" data-action="dec" aria-label="weniger">−</button>
      <input type="number" step="1" min="${min}" inputmode="numeric" class="menge-input">
      <button type="button" class="btn-qty" data-action="inc" aria-label="mehr">+</button>
    </div>`;
  row.querySelector(".zaehler-label").textContent = label;
  const input = row.querySelector("input");
  input.value = wert;
  const setze = (v) => {
    v = Math.max(min, Math.round(isNaN(v) ? min : v));
    wert = v;
    input.value = v;
    row.classList.toggle("aktiv", v > 0);
    onChange(v);
  };
  row.querySelector('[data-action="dec"]').addEventListener("click", () => setze(wert - 1));
  row.querySelector('[data-action="inc"]').addEventListener("click", () => setze(wert + 1));
  input.addEventListener("change", () => setze(parseFloat(input.value)));
  return row;
}

function oeffneRaum(etage, raum) {
  bauScrollPosition = window.scrollY;
  currentRaum = { etage, raum };
  selectedArtikel = null;
  selectedStandardArtikel = null;
  selectedFavoritArtikel = null;
  migriereRaum(raum);
  const b = currentBauaufmass;
  zurueckAktion = () => oeffneBauaufmass(b, bauScrollPosition);
  headerTitle.textContent = `${etage.name} · ${raum.name}`;
  btnBack.hidden = false;
  btnNew.hidden = true;

  const tpl = document.getElementById("tpl-raum");
  app.innerHTML = "";
  app.appendChild(tpl.content.cloneNode(true));
  window.scrollTo(0, 0);

  // Name
  const nameInput = document.getElementById("r_name");
  nameInput.value = raum.name;
  nameInput.addEventListener("input", () => {
    raum.name = nameInput.value;
    headerTitle.textContent = `${etage.name} · ${raum.name || "Raum"}`;
    autosave();
  });
  document.getElementById("r_etage").textContent = etage.name;

  renderSchaltungen();

  // Schaltung hinzufügen
  const typenEl = document.getElementById("r_schaltungTypen");
  for (const t of BAU_SCHALTUNGSTYPEN) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip chip-schaltung";
    btn.textContent = "+ " + t.b;
    btn.addEventListener("click", () => {
      raum.schaltungen.push({ id: neueId(), typ: t.key, schaltstellen: t.min, wand: 0, decke: 0, steckdose: 0, strahler: 0, bemerkung: "" });
      autosave();
      renderSchaltungen();
      const karten = document.querySelectorAll(".schaltung-karte");
      if (karten.length) karten[karten.length - 1].scrollIntoView({ block: "center", behavior: "smooth" });
    });
    typenEl.appendChild(btn);
  }

  // Rollos
  renderRollos();
  document.getElementById("r_rolloHinzufuegen").addEventListener("click", () => {
    raum.rollos.push(neuesRollo());
    autosave();
    renderRollos();
    const karten = document.querySelectorAll(".rollo-karte");
    if (karten.length) karten[karten.length - 1].scrollIntoView({ block: "center", behavior: "smooth" });
  });

  // Zähler-Gruppen
  const gruppenEl = document.getElementById("r_gruppen");
  for (const g of BAU_POSITIONEN_GRUPPEN) {
    const details = document.createElement("details");
    details.className = "section-card";
    const summe = () => g.positionen.reduce((s, p) => s + (raum.positionen[p.key] || 0), 0);
    details.open = g.immerOffen || summe() > 0;
    const summary = document.createElement("summary");
    const setzeTitel = () => {
      const s = summe();
      summary.textContent = g.titel + (s ? ` (${s})` : "");
    };
    setzeTitel();
    details.appendChild(summary);
    for (const p of g.positionen) {
      details.appendChild(baueZaehler(p.b, raum.positionen[p.key] || 0, 0, (v) => {
        if (v > 0) raum.positionen[p.key] = v;
        else delete raum.positionen[p.key];
        setzeTitel();
        autosave();
      }));
    }
    gruppenEl.appendChild(details);
  }

  // Material (Katalog / Standard / Freitext)
  klonMaterialTabs("materialHinzufuegenRaum");
  bindeMaterialAuswahl(raum.material, () => {
    renderRaumMaterial();
    autosave();
  });
  renderRaumMaterial();

  document.getElementById("btnRaumFertig").addEventListener("click", () => zurueckAktion());
  document.getElementById("btnRaumKopieren").addEventListener("click", () => {
    const kopie = JSON.parse(JSON.stringify(raum));
    kopie.id = neueId();
    kopie.name = kopieRaumname(etage, raum.name || "Raum");
    kopie.schaltungen.forEach((s) => (s.id = neueId()));
    kopie.rollos.forEach((r) => (r.id = neueId()));
    kopie.material.forEach((m) => (m.id = neueId()));
    etage.raeume.splice(etage.raeume.indexOf(raum) + 1, 0, kopie);
    autosave();
    oeffneRaum(etage, kopie);
  });
  document.getElementById("btnRaumLoeschen").addEventListener("click", () => {
    if (!confirm(`Raum „${raum.name}“ wirklich löschen?`)) return;
    etage.raeume = etage.raeume.filter((r) => r.id !== raum.id);
    autosave();
    zurueckAktion();
  });
}

function renderSchaltungen() {
  const { raum } = currentRaum;
  const liste = document.getElementById("r_schaltungen");
  const anzahl = document.getElementById("r_anzahlSchaltungen");
  liste.innerHTML = "";
  anzahl.textContent = raum.schaltungen.length;
  document.getElementById("r_schaltungenLeer").hidden = raum.schaltungen.length !== 0;

  raum.schaltungen.forEach((s, i) => {
    const t = schaltungTyp(s.typ);
    const karte = document.createElement("div");
    karte.className = "schaltung-karte";
    karte.innerHTML = `
      <div class="schaltung-kopf">
        <strong>${i + 1}. ${escapeHtml(t.b)}</strong>
        <button type="button" class="btn-danger-text" aria-label="Schaltung entfernen">✕</button>
      </div>
      <div class="schaltung-zaehler"></div>
      <input type="text" class="schaltung-bemerkung" placeholder="Bemerkung (optional, z. B. Spiegel, Esstisch)">`;
    karte.querySelector(".btn-danger-text").addEventListener("click", () => {
      if (!confirm(`${t.b} entfernen?`)) return;
      raum.schaltungen = raum.schaltungen.filter((x) => x.id !== s.id);
      autosave();
      renderSchaltungen();
    });
    const zaehler = karte.querySelector(".schaltung-zaehler");
    const zs = baueZaehler("Schaltstellen", s.schaltstellen, t.min, (v) => { s.schaltstellen = v; autosave(); });
    zs.classList.add("zaehler-schaltstellen");
    zaehler.appendChild(zs);
    for (const a of BAU_AUSLAESSE) {
      zaehler.appendChild(baueZaehler(a.b, s[a.key] || 0, 0, (v) => { s[a.key] = v; autosave(); }));
    }
    const bem = karte.querySelector(".schaltung-bemerkung");
    bem.value = s.bemerkung || "";
    bem.addEventListener("input", () => { s.bemerkung = bem.value; autosave(); });
    liste.appendChild(karte);
  });
}

function renderRollos() {
  const { raum } = currentRaum;
  const liste = document.getElementById("r_rollos");
  liste.innerHTML = "";
  const summe = raum.rollos.reduce((s, r) => s + r.anzahl, 0);
  document.getElementById("r_anzahlRollos").textContent = summe;
  document.getElementById("r_rollosLeer").hidden = raum.rollos.length !== 0;

  raum.rollos.forEach((r, i) => {
    const karte = document.createElement("div");
    karte.className = "schaltung-karte rollo-karte";
    karte.innerHTML = `
      <div class="schaltung-kopf">
        <strong>${i + 1}. Rollo-Anschluss</strong>
        <button type="button" class="btn-danger-text" aria-label="Rollo entfernen">✕</button>
      </div>
      <div class="rollo-anzahl"></div>
      <div class="rollo-bedienung-label">Bedienung vor Ort</div>
      <div class="segment" role="radiogroup"></div>
      <div class="rollo-bedien-anzahl"></div>
      <input type="text" class="schaltung-bemerkung" placeholder="Bemerkung (optional, z. B. Terrassentür, Gruppe Süd)">`;
    karte.querySelector(".btn-danger-text").addEventListener("click", () => {
      if (!confirm("Rollo-Anschluss entfernen?")) return;
      raum.rollos = raum.rollos.filter((x) => x.id !== r.id);
      autosave();
      renderRollos();
    });
    karte.querySelector(".rollo-anzahl").appendChild(baueZaehler("Anzahl Rollos", r.anzahl, 1, (v) => {
      r.anzahl = v;
      document.getElementById("r_anzahlRollos").textContent = raum.rollos.reduce((s, x) => s + x.anzahl, 0);
      autosave();
    }));
    const bedienAnzahlEl = karte.querySelector(".rollo-bedien-anzahl");
    const zeigeBedienAnzahl = () => {
      bedienAnzahlEl.innerHTML = "";
      const bd = rolloBedienung(r.bedienung);
      if (bd.key === "keine") return;
      bedienAnzahlEl.appendChild(baueZaehler(`Anzahl ${bd.b}`, r.bedienAnzahl || 1, 1, (v) => { r.bedienAnzahl = v; autosave(); }));
    };
    const segment = karte.querySelector(".segment");
    for (const bd of BAU_ROLLO_BEDIENUNG) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "segment-btn" + (r.bedienung === bd.key ? " aktiv" : "");
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", r.bedienung === bd.key ? "true" : "false");
      btn.textContent = bd.b;
      btn.addEventListener("click", () => {
        r.bedienung = bd.key;
        if (!(r.bedienAnzahl >= 1)) r.bedienAnzahl = 1;
        segment.querySelectorAll(".segment-btn").forEach((x) => {
          const an = x === btn;
          x.classList.toggle("aktiv", an);
          x.setAttribute("aria-checked", an ? "true" : "false");
        });
        zeigeBedienAnzahl();
        autosave();
      });
      segment.appendChild(btn);
    }
    zeigeBedienAnzahl();
    const bem = karte.querySelector(".schaltung-bemerkung");
    bem.value = r.bemerkung || "";
    bem.addEventListener("input", () => { r.bemerkung = bem.value; autosave(); });
    liste.appendChild(karte);
  });
}

function renderRaumMaterial() {
  const { raum } = currentRaum;
  const tbody = document.getElementById("r_materialTbody");
  const leer = document.getElementById("r_materialLeer");
  document.getElementById("r_anzahlMaterial").textContent = raum.material.length;
  tbody.innerHTML = "";
  leer.hidden = raum.material.length !== 0;
  raum.material.forEach((m) => {
    const tr = document.createElement("tr");
    const tdBez = document.createElement("td");
    const sub = m.artikelnummer ? `<div class="row-sub">Art.-Nr. ${escapeHtml(m.artikelnummer)}</div>` : "";
    tdBez.innerHTML = `${escapeHtml(m.bezeichnung)}${sub}`;
    tr.appendChild(tdBez);
    tr.appendChild(baueMengeZelle(m, autosave));
    const tdE = document.createElement("td");
    tdE.textContent = m.einheit;
    tr.appendChild(tdE);
    const tdDel = document.createElement("td");
    tdDel.className = "col-del";
    tdDel.innerHTML = `<button class="btn-danger-text" type="button">✕</button>`;
    tdDel.querySelector("button").addEventListener("click", () => {
      raum.material = raum.material.filter((x) => x.id !== m.id);
      renderRaumMaterial();
      autosave();
    });
    tr.appendChild(tdDel);
    tbody.appendChild(tr);
  });
}

/* ---------- PDF-Export ---------- */

function zahlDE(n) {
  return Number(n).toLocaleString("de-DE");
}

// Liefert die Tabellenzeilen eines Raums (nur Positionen > 0). Leeres Array = Raum taucht nicht auf.
function bauRaumZeilen(raum) {
  const zeilen = [];
  if (raum.schaltungen.length) {
    zeilen.push({ gruppe: "Beleuchtung" });
    raum.schaltungen.forEach((s) => {
      const bem = (s.bemerkung || "").trim();
      zeilen.push({ b: schaltungBezeichnung(s) + (bem ? ` – ${bem}` : ""), menge: 1, e: "Stck", schaltung: true });
      for (const a of BAU_AUSLAESSE) {
        if (s[a.key] > 0) zeilen.push({ b: a.b, menge: s[a.key], e: "Stck", unter: true });
      }
    });
  }
  const rollos = (raum.rollos || []).filter((r) => r.anzahl > 0);
  if (rollos.length) {
    zeilen.push({ gruppe: "Rollos" });
    rollos.forEach((r) => {
      const bd = rolloBedienung(r.bedienung);
      const bem = (r.bemerkung || "").trim();
      const zusatz = bd.key === "keine" ? " (ohne Schalter/Taster)" : "";
      zeilen.push({ b: "Rollo" + zusatz + (bem ? ` – ${bem}` : ""), menge: r.anzahl, e: "Stck", schaltung: true });
      if (bd.mat && r.bedienAnzahl > 0) zeilen.push({ b: bd.mat, menge: r.bedienAnzahl, e: "Stck", unter: true });
    });
  }
  for (const g of BAU_POSITIONEN_GRUPPEN) {
    const pos = g.positionen.filter((p) => raum.positionen[p.key] > 0);
    if (!pos.length) continue;
    zeilen.push({ gruppe: g.titel });
    for (const p of pos) zeilen.push({ b: p.b, menge: raum.positionen[p.key], e: "Stck" });
  }
  const mat = raum.material.filter((m) => m.menge > 0);
  if (mat.length) {
    zeilen.push({ gruppe: "Material" });
    for (const m of mat) zeilen.push({ b: m.bezeichnung, nr: m.artikelnummer || "", menge: m.menge, e: m.einheit });
  }
  return zeilen;
}

function bauGesamtZeilen(b) {
  const schaltungen = new Map();
  const auslaesse = {};
  const positionen = {};
  const rolloSumme = { rollo: 0, schalter: 0, taster: 0 };
  const material = new Map();
  for (const etage of b.etagen) {
    for (const raum of etage.raeume) {
      for (const s of raum.schaltungen) {
        const key = schaltungBezeichnung(s);
        schaltungen.set(key, (schaltungen.get(key) || 0) + 1);
        for (const a of BAU_AUSLAESSE) if (s[a.key] > 0) auslaesse[a.key] = (auslaesse[a.key] || 0) + s[a.key];
      }
      for (const r of raum.rollos || []) {
        if (!(r.anzahl > 0)) continue;
        rolloSumme.rollo += r.anzahl;
        if (r.bedienung === "schalter" || r.bedienung === "taster") rolloSumme[r.bedienung] += r.bedienAnzahl || 0;
      }
      for (const [k, v] of Object.entries(raum.positionen)) if (v > 0) positionen[k] = (positionen[k] || 0) + v;
      for (const m of raum.material) {
        if (!(m.menge > 0)) continue;
        const key = (m.artikelnummer || "") + "|" + m.bezeichnung + "|" + m.einheit;
        const vorhanden = material.get(key);
        if (vorhanden) vorhanden.menge = rundeMenge(vorhanden.menge + m.menge);
        else material.set(key, { b: m.bezeichnung, nr: m.artikelnummer || "", menge: m.menge, e: m.einheit });
      }
    }
  }
  const zeilen = [];
  if (schaltungen.size) {
    zeilen.push({ gruppe: "Beleuchtung – Schaltungen" });
    // Reihenfolge wie die Schaltungstypen
    const sortiert = [...schaltungen.entries()].sort((x, y) => {
      const rx = BAU_SCHALTUNGSTYPEN.findIndex((t) => x[0].startsWith(t.b + " ") || x[0] === t.b);
      const ry = BAU_SCHALTUNGSTYPEN.findIndex((t) => y[0].startsWith(t.b + " ") || y[0] === t.b);
      return rx - ry || x[0].localeCompare(y[0], "de");
    });
    for (const [bez, n] of sortiert) zeilen.push({ b: bez, menge: n, e: "Stck" });
  }
  const aus = BAU_AUSLAESSE.filter((a) => auslaesse[a.key] > 0);
  if (aus.length) {
    zeilen.push({ gruppe: "Beleuchtung – Auslässe" });
    for (const a of aus) zeilen.push({ b: a.b, menge: auslaesse[a.key], e: "Stck" });
  }
  if (rolloSumme.rollo) {
    zeilen.push({ gruppe: "Rollos" });
    zeilen.push({ b: "Rollo", menge: rolloSumme.rollo, e: "Stck" });
    if (rolloSumme.schalter) zeilen.push({ b: "Rolloschalter", menge: rolloSumme.schalter, e: "Stck" });
    if (rolloSumme.taster) zeilen.push({ b: "Rollotaster", menge: rolloSumme.taster, e: "Stck" });
  }
  for (const g of BAU_POSITIONEN_GRUPPEN) {
    const pos = g.positionen.filter((p) => positionen[p.key] > 0);
    if (!pos.length) continue;
    zeilen.push({ gruppe: g.titel });
    for (const p of pos) zeilen.push({ b: p.b, menge: positionen[p.key], e: "Stck" });
  }
  if (material.size) {
    zeilen.push({ gruppe: "Material" });
    for (const m of material.values()) zeilen.push(m);
  }
  return zeilen;
}

function zeilenZuAutoTable(zeilen) {
  return zeilen.map((z) => {
    if (z.gruppe) {
      return [{ content: z.gruppe, colSpan: 4, styles: { fontStyle: "bold", fillColor: [238, 241, 246], textColor: [60, 70, 85], fontSize: 8.5 } }];
    }
    const bez = z.unter ? "      " + z.b : z.b;
    const style = z.schaltung ? { fontStyle: "bold" } : {};
    return [
      { content: bez, styles: style },
      z.nr || "",
      { content: zahlDE(z.menge), styles: { halign: "right" } },
      z.e
    ];
  });
}

function bauDateiname(b) {
  const kunde = (b.kunde.name || "Bauaufmass").trim().replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, "").replace(/\s+/g, "_");
  return `Bauaufmass_${kunde}_${heuteISO()}.pdf`;
}

function erstelleBauPdf(b) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const marginX = 14;
  const breite = 210 - marginX * 2;
  let y = 18;

  doc.setFontSize(16);
  doc.setFont(undefined, "bold");
  doc.text("Bauaufmaß", marginX, y);
  doc.setFont(undefined, "normal");
  doc.setFontSize(10);
  doc.text(`Datum: ${formatDatumDE(erstelltDatumISO(b))}`, 210 - marginX, y, { align: "right" });
  y += 9;
  doc.setDrawColor(210);
  doc.line(marginX, y, 210 - marginX, y);
  y += 7;

  const block = (titel, zeilen) => {
    doc.setFont(undefined, "bold");
    doc.setFontSize(11);
    doc.text(titel, marginX, y);
    y += 5.5;
    doc.setFont(undefined, "normal");
    doc.setFontSize(10);
    for (const z of zeilen) {
      const teile = doc.splitTextToSize(z, breite);
      doc.text(teile, marginX, y);
      y += teile.length * 5;
    }
    y += 2;
  };

  const k = b.kunde;
  const kundeZeilen = [];
  if (k.name.trim()) kundeZeilen.push(k.name.trim());
  if (k.ansprechpartner.trim()) kundeZeilen.push("z. Hd. " + k.ansprechpartner.trim());
  if (k.strasse.trim()) kundeZeilen.push(k.strasse.trim());
  if (k.plzOrt.trim()) kundeZeilen.push(k.plzOrt.trim());
  if (k.telefon.trim()) kundeZeilen.push("Tel. " + k.telefon.trim());
  if (!kundeZeilen.length) kundeZeilen.push("–");
  block("Kunde", kundeZeilen);
  if (b.baustelle.trim()) block("Baustelle / Bauvorhaben", [b.baustelle.trim()]);
  if (b.arbeitsbeschreibung.trim()) block("Arbeitsbeschreibung", [b.arbeitsbeschreibung.trim()]);
  y += 2;

  const tabelle = (titel, zeilen) => {
    doc.autoTable({
      startY: y,
      head: [
        [{ content: titel, colSpan: 4, styles: { fillColor: [21, 34, 56], textColor: 255, fontSize: 10.5, fontStyle: "bold" } }],
        [
          { content: "Position" },
          { content: "Art.-Nr." },
          { content: "Menge", styles: { halign: "right" } },
          { content: "Einh." }
        ]
      ],
      body: zeilenZuAutoTable(zeilen),
      margin: { left: marginX, right: marginX, bottom: 16 },
      styles: { fontSize: 9, cellPadding: 1.8 },
      headStyles: { fillColor: [214, 220, 230], textColor: [28, 37, 49], fontSize: 8.5 },
      columnStyles: { 1: { cellWidth: 30 }, 2: { cellWidth: 18 }, 3: { cellWidth: 16 } },
      rowPageBreak: "avoid"
    });
    y = doc.lastAutoTable.finalY + 6;
  };

  let raeumeMitInhalt = 0;
  for (const etage of b.etagen) {
    for (const raum of etage.raeume) {
      const zeilen = bauRaumZeilen(raum);
      if (!zeilen.length) continue; // Raum ohne Einträge > 0 erscheint nicht
      // Raumtitel nicht allein am Seitenende stehen lassen
      if (y > 297 - 40) { doc.addPage(); y = 18; }
      tabelle(`${etage.name} – ${raum.name || "Raum"}`, zeilen);
      raeumeMitInhalt++;
    }
  }

  const gesamt = bauGesamtZeilen(b);
  if (gesamt.length) {
    doc.addPage();
    y = 18;
    doc.setFontSize(14);
    doc.setFont(undefined, "bold");
    doc.text("Gesamtzusammenstellung", marginX, y);
    doc.setFont(undefined, "normal");
    y += 4;
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(`Summe aller Positionen aus ${raeumeMitInhalt} Raum/Räumen`, marginX, y + 4);
    doc.setTextColor(0);
    y += 9;
    tabelle("Gesamt", gesamt);
  } else {
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text("Keine Positionen erfasst.", marginX, y + 4);
    doc.setTextColor(0);
  }

  const seiten = doc.internal.getNumberOfPages();
  for (let i = 1; i <= seiten; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    const kunde = b.kunde.name.trim();
    if (kunde) doc.text(`Bauaufmaß ${kunde}`, marginX, 297 - 8);
    doc.text(`Seite ${i} / ${seiten}`, 210 - marginX, 297 - 8, { align: "right" });
    doc.setTextColor(0);
  }

  doc.save(bauDateiname(b));
}
