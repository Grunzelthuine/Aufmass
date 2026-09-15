"use strict";

/* ============================================================
   Material-Aufmaß App
   Speicherung: localStorage (rein lokal auf dem Gerät)
   Materialstamm: materials.json (aus DATANORM erzeugt)
   ============================================================ */

const STORAGE_KEY = "aufmass_v1_liste";
const STORAGE_KEY_PACKLISTEN = "aufmass_v1_packlisten";
const app = document.getElementById("app");
const headerTitle = document.getElementById("headerTitle");
const btnBack = document.getElementById("btnBack");
const btnNew = document.getElementById("btnNew");

let aufmassListe = [];      // alle gespeicherten Aufmaße
let currentAufmass = null;  // aktuell im Formular geöffnetes Aufmaß
let packlisten = [];          // alle gespeicherten Packlisten
let currentPackliste = null;  // aktuell geöffnete Packliste
let materialDB = [];        // Materialstamm aus materials.json (DATANORM)
let materialDBReady = false;
let standardMaterialDB = [];      // Materialstamm aus standardmaterial.json
let standardMaterialDBReady = false;
let selectedArtikel = null;         // aktuell gewähltes Material (Tab "Aus Liste")
let selectedStandardArtikel = null; // aktuell gewähltes Material (Tab "Standardmaterial")
let saveTimer = null;

/* ---------- Storage ---------- */

function ladeListe() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    aufmassListe = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Fehler beim Laden der gespeicherten Aufmaße", e);
    aufmassListe = [];
  }
}

function speichereListe() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(aufmassListe));
  } catch (e) {
    console.error("Fehler beim Speichern", e);
    alert("Speichern fehlgeschlagen (evtl. Speicher voll). Bitte PDF sichern.");
  }
}

function istLeeresAufmass(a) {
  return (
    !a.kunde.name.trim() &&
    !a.kunde.ansprechpartner.trim() &&
    !a.kunde.strasse.trim() &&
    !a.kunde.plzOrt.trim() &&
    !a.kunde.telefon.trim() &&
    !a.baustelle.trim() &&
    !a.arbeitsbeschreibung.trim() &&
    a.material.length === 0
  );
}

function upsertCurrentInListe() {
  const idx = aufmassListe.findIndex((a) => a.id === currentAufmass.id);
  currentAufmass.geaendert = new Date().toISOString();
  if (idx >= 0) {
    aufmassListe[idx] = currentAufmass;
  } else {
    aufmassListe.unshift(currentAufmass);
  }
  speichereListe();
}

function ladePacklisten() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PACKLISTEN);
    packlisten = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Fehler beim Laden der gespeicherten Packlisten", e);
    packlisten = [];
  }
}

function speicherePacklisten() {
  try {
    localStorage.setItem(STORAGE_KEY_PACKLISTEN, JSON.stringify(packlisten));
  } catch (e) {
    console.error("Fehler beim Speichern", e);
    alert("Speichern fehlgeschlagen (evtl. Speicher voll).");
  }
}

function istLeerePackliste(p) {
  return !p.bezeichnung.trim() && p.material.length === 0;
}

function upsertCurrentPackliste() {
  const idx = packlisten.findIndex((p) => p.id === currentPackliste.id);
  currentPackliste.geaendert = new Date().toISOString();
  if (idx >= 0) {
    packlisten[idx] = currentPackliste;
  } else {
    packlisten.unshift(currentPackliste);
  }
  speicherePacklisten();
}

function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (currentAufmass && !istLeeresAufmass(currentAufmass)) {
      upsertCurrentInListe();
    }
    if (currentPackliste && !istLeerePackliste(currentPackliste)) {
      upsertCurrentPackliste();
    }
  }, 300);
}

/* ---------- Hilfsfunktionen ---------- */

function neueId() {
  return "am_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function heuteISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatDatumDE(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// "m", "M", " m " etc. gelten als Meter-Einheit (für die Mengen-Zusatzeingabe).
function istMeterEinheit(einheit) {
  return (einheit || "").trim().toLowerCase() === "m";
}

function rundeMenge(n) {
  return Math.round(n * 100) / 100;
}

function neuesAufmass() {
  return {
    id: neueId(),
    erstellt: new Date().toISOString(),
    geaendert: new Date().toISOString(),
    datum: heuteISO(),
    kunde: { name: "", ansprechpartner: "", strasse: "", plzOrt: "", telefon: "" },
    baustelle: "",
    arbeitsbeschreibung: "",
    material: []
  };
}

function neuePackliste() {
  return {
    id: neueId(),
    erstellt: new Date().toISOString(),
    geaendert: new Date().toISOString(),
    bezeichnung: "",
    datum: heuteISO(),
    material: [] // { id, bezeichnung, artikelnummer, einheit, menge, quelle, erledigt }
  };
}

/* ---------- Materialstamm laden ---------- */

async function ladeMaterialDB() {
  try {
    const res = await fetch("materials.json");
    const data = await res.json();
    // Suchstring vorab in Kleinbuchstaben cachen für schnelle Filterung
    materialDB = data.map((a) => ({ ...a, _s: (a.n + " " + a.b).toLowerCase() }));
    materialDBReady = true;
  } catch (e) {
    console.error("Materialstamm konnte nicht geladen werden", e);
    materialDB = [];
    materialDBReady = false;
  }
}

function sucheMaterial(query, limit = 30) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const worte = q.split(/\s+/).filter(Boolean);
  const treffer = [];
  for (let i = 0; i < materialDB.length; i++) {
    const item = materialDB[i];
    let ok = true;
    for (const w of worte) {
      if (!item._s.includes(w)) { ok = false; break; }
    }
    if (ok) {
      treffer.push(item);
      if (treffer.length >= limit) break;
    }
  }
  return treffer;
}

async function ladeStandardMaterialDB() {
  try {
    const res = await fetch("standardmaterial.json");
    const data = await res.json();
    standardMaterialDB = data.map((a) => ({ ...a, _s: (a.k + " " + a.b).toLowerCase() }));
    standardMaterialDBReady = true;
  } catch (e) {
    console.error("Standardmaterial-Liste konnte nicht geladen werden", e);
    standardMaterialDB = [];
    standardMaterialDBReady = false;
  }
}

/* ---------- Navigation / Rendering ---------- */

function zeigeUebersicht() {
  currentAufmass = null;
  currentPackliste = null;
  selectedArtikel = null;
  selectedStandardArtikel = null;
  headerTitle.textContent = "Material-Aufmaß";
  btnBack.hidden = true;
  btnNew.hidden = false;

  const tpl = document.getElementById("tpl-uebersicht");
  app.innerHTML = "";
  app.appendChild(tpl.content.cloneNode(true));

  const listeEl = document.getElementById("aufmassListe");
  const leerEl = document.getElementById("listeLeer");

  if (aufmassListe.length === 0) {
    leerEl.hidden = false;
    leerEl.querySelector('[data-action="new"]').addEventListener("click", () => oeffneFormular(neuesAufmass()));
  } else {
    leerEl.hidden = true;
    const sortiert = [...aufmassListe].sort((a, b) => (b.geaendert || "").localeCompare(a.geaendert || ""));

    for (const a of sortiert) {
      const li = document.createElement("li");
      li.className = "aufmass-card";
      const anzahl = a.material.length;
      const kundeName = a.kunde.name.trim() || "(ohne Kundenname)";
      const beschreibung = a.arbeitsbeschreibung.trim();
      li.innerHTML = `
        <div class="info">
          <p class="kunde">${escapeHtml(kundeName)}</p>
          <p class="meta">${formatDatumDE(a.datum)} · ${anzahl} Position${anzahl === 1 ? "" : "en"}${beschreibung ? " · " + escapeHtml(beschreibung) : ""}</p>
        </div>
        <span class="chevron">›</span>
      `;
      li.addEventListener("click", () => oeffneFormular(a));
      listeEl.appendChild(li);
    }
  }

  document.getElementById("btnNewPackliste").addEventListener("click", () => oeffnePackliste(neuePackliste()));

  const packlistenListeEl = document.getElementById("packlistenListe");
  const packlistenLeerEl = document.getElementById("packlistenLeer");

  if (packlisten.length === 0) {
    packlistenLeerEl.hidden = false;
  } else {
    packlistenLeerEl.hidden = true;
    const sortiertP = [...packlisten].sort((a, b) => (b.geaendert || "").localeCompare(a.geaendert || ""));

    for (const p of sortiertP) {
      const li = document.createElement("li");
      li.className = "aufmass-card";
      const gesamt = p.material.length;
      const offenAnzahl = p.material.filter((m) => !m.erledigt).length;
      const bezeichnung = p.bezeichnung.trim() || "(ohne Bezeichnung)";
      li.innerHTML = `
        <div class="info">
          <p class="kunde">${escapeHtml(bezeichnung)}</p>
          <p class="meta">${formatDatumDE(p.datum)} · ${offenAnzahl} von ${gesamt} noch zu packen</p>
        </div>
        <span class="chevron">›</span>
      `;
      li.addEventListener("click", () => oeffnePackliste(p));
      packlistenListeEl.appendChild(li);
    }
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function oeffneFormular(aufmass) {
  currentAufmass = aufmass;
  currentPackliste = null;
  selectedArtikel = null;
  selectedStandardArtikel = null;
  headerTitle.textContent = "Aufmaß";
  btnBack.hidden = false;
  btnNew.hidden = true;

  const tpl = document.getElementById("tpl-formular");
  app.innerHTML = "";
  app.appendChild(tpl.content.cloneNode(true));

  fuelleFormular();
  bindeFormularEvents();
  renderMaterialTabelle();
}

function fuelleFormular() {
  const a = currentAufmass;
  document.getElementById("f_kundeName").value = a.kunde.name;
  document.getElementById("f_ansprechpartner").value = a.kunde.ansprechpartner;
  document.getElementById("f_strasse").value = a.kunde.strasse;
  document.getElementById("f_plzOrt").value = a.kunde.plzOrt;
  document.getElementById("f_telefon").value = a.kunde.telefon;
  document.getElementById("f_baustelle").value = a.baustelle;
  document.getElementById("f_datum").value = a.datum;
  document.getElementById("f_arbeitsbeschreibung").value = a.arbeitsbeschreibung;
  const bestehend = aufmassListe.some((x) => x.id === a.id);
  document.getElementById("btnLoeschen").hidden = !bestehend;
}

function bindeFormularEvents() {
  const a = currentAufmass;

  const feldBindungen = [
    ["f_kundeName", () => a.kunde.name, (v) => (a.kunde.name = v)],
    ["f_ansprechpartner", () => a.kunde.ansprechpartner, (v) => (a.kunde.ansprechpartner = v)],
    ["f_strasse", () => a.kunde.strasse, (v) => (a.kunde.strasse = v)],
    ["f_plzOrt", () => a.kunde.plzOrt, (v) => (a.kunde.plzOrt = v)],
    ["f_telefon", () => a.kunde.telefon, (v) => (a.kunde.telefon = v)],
    ["f_baustelle", () => a.baustelle, (v) => (a.baustelle = v)],
    ["f_datum", () => a.datum, (v) => (a.datum = v)],
    ["f_arbeitsbeschreibung", () => a.arbeitsbeschreibung, (v) => (a.arbeitsbeschreibung = v)]
  ];
  for (const [id, , setter] of feldBindungen) {
    document.getElementById(id).addEventListener("input", (e) => {
      setter(e.target.value);
      autosave();
    });
  }

  klonMaterialTabs("materialHinzufuegenAufmass");
  bindeMaterialAuswahl(a.material, () => {
    renderMaterialTabelle();
    autosave();
  });

  // Löschen / PDF
  document.getElementById("btnLoeschen").addEventListener("click", () => {
    if (!confirm("Dieses Aufmaß wirklich löschen?")) return;
    aufmassListe = aufmassListe.filter((x) => x.id !== a.id);
    speichereListe();
    zeigeUebersicht();
  });

  document.getElementById("btnPdf").addEventListener("click", () => {
    if (!istLeeresAufmass(a)) upsertCurrentInListe();
    erstellePdf(a);
  });
}

/* Klont den wiederverwendbaren "Material hinzufügen"-Baustein (Tabs Aus
   Liste / Standardmaterial / Freitext) in den Platzhalter mit der
   übergebenen ID. Wird sowohl vom Aufmaß- als auch vom Packliste-Formular
   genutzt (immer nur eines davon gleichzeitig im DOM). */
function klonMaterialTabs(platzhalterId) {
  const tpl = document.getElementById("tpl-material-tabs");
  const platzhalter = document.getElementById(platzhalterId);
  platzhalter.innerHTML = "";
  platzhalter.appendChild(tpl.content.cloneNode(true));
}

/* Verdrahtet die drei Material-Tabs (Aus Liste / Standardmaterial /
   Freitext). `material` ist das Array, in das neue Positionen eingefügt
   werden (currentAufmass.material oder currentPackliste.material).
   `onHinzufuegen` wird nach jedem erfolgreichen Hinzufügen aufgerufen
   (übernimmt Re-Rendering + Autosave beim Aufrufer). */
function bindeMaterialAuswahl(material, onHinzufuegen) {
  // Tabs
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const ziel = tab.dataset.tab;
      document.getElementById("tabListe").hidden = ziel !== "liste";
      document.getElementById("tabStandard").hidden = ziel !== "standard";
      document.getElementById("tabFrei").hidden = ziel !== "frei";
    });
  });

  // Autocomplete
  const sucheInput = document.getElementById("f_suche");
  const ergebnisListe = document.getElementById("sucheErgebnisse");
  const ausgewaehlt = document.getElementById("ausgewaehlterArtikel");
  const mengeListe = document.getElementById("f_mengeListe");
  const einheitListe = document.getElementById("f_einheitListe");
  const btnAddListe = document.getElementById("btnAddListe");

  let sucheTimer = null;
  sucheInput.addEventListener("input", () => {
    clearTimeout(sucheTimer);
    selectedArtikel = null;
    aktualisiereAddListeButton();
    const q = sucheInput.value;
    sucheTimer = setTimeout(() => zeigeSucheErgebnisse(q), 120);
  });
  sucheInput.addEventListener("focus", () => {
    if (sucheInput.value.trim()) zeigeSucheErgebnisse(sucheInput.value);
  });
  document.addEventListener("click", (e) => {
    if (!ergebnisListe.contains(e.target) && e.target !== sucheInput) {
      ergebnisListe.hidden = true;
    }
  });

  function zeigeSucheErgebnisse(q) {
    if (!materialDBReady) {
      ergebnisListe.innerHTML = '<li class="no-result">Materialliste wird geladen…</li>';
      ergebnisListe.hidden = false;
      return;
    }
    const treffer = sucheMaterial(q);
    ergebnisListe.innerHTML = "";
    if (q.trim().length < 2) {
      ergebnisListe.hidden = true;
      return;
    }
    if (treffer.length === 0) {
      ergebnisListe.innerHTML = '<li class="no-result">Keine Treffer – ggf. Freitext verwenden</li>';
      ergebnisListe.hidden = false;
      return;
    }
    for (const item of treffer) {
      const li = document.createElement("li");
      li.innerHTML = `${escapeHtml(item.b)}<small>Art.-Nr. ${escapeHtml(item.n)} · ${escapeHtml(item.e)}</small>`;
      li.addEventListener("click", () => {
        selectedArtikel = item;
        sucheInput.value = item.b;
        ergebnisListe.hidden = true;
        einheitListe.value = item.e;
        ausgewaehlt.hidden = false;
        ausgewaehlt.innerHTML = `<strong>${escapeHtml(item.b)}</strong><span class="muted">Art.-Nr. ${escapeHtml(item.n)} · ${escapeHtml(item.e)}</span>`;
        mengeListe.focus();
        aktualisiereAddListeButton();
      });
      ergebnisListe.appendChild(li);
    }
    ergebnisListe.hidden = false;
  }

  function aktualisiereAddListeButton() {
    const menge = parseFloat(mengeListe.value);
    btnAddListe.disabled = !selectedArtikel || !(menge > 0);
  }
  mengeListe.addEventListener("input", aktualisiereAddListeButton);

  btnAddListe.addEventListener("click", () => {
    if (!selectedArtikel) return;
    const menge = parseFloat(mengeListe.value) || 0;
    if (!(menge > 0)) return;
    material.push({
      id: neueId(),
      bezeichnung: selectedArtikel.b,
      artikelnummer: selectedArtikel.n,
      einheit: selectedArtikel.e,
      menge,
      quelle: "liste",
      erledigt: false
    });
    // Reset
    selectedArtikel = null;
    sucheInput.value = "";
    mengeListe.value = "";
    einheitListe.value = "";
    ausgewaehlt.hidden = true;
    aktualisiereAddListeButton();
    onHinzufuegen();
    sucheInput.focus();
  });

  // Standardmaterial (Kategorie-Liste aus standardmaterial.json)
  const sucheStandardInput = document.getElementById("f_sucheStandard");
  const standardListeEl = document.getElementById("standardListe");
  const ausgewaehltStandard = document.getElementById("ausgewaehlterArtikelStandard");
  const mengeStandard = document.getElementById("f_mengeStandard");
  const einheitStandard = document.getElementById("f_einheitStandard");
  const btnAddStandard = document.getElementById("btnAddStandard");

  function aktualisiereAddStandardButton() {
    const menge = parseFloat(mengeStandard.value);
    btnAddStandard.disabled = !selectedStandardArtikel || !(menge > 0);
  }

  function waehleStandardArtikel(item) {
    selectedStandardArtikel = item;
    sucheStandardInput.value = item.b;
    einheitStandard.value = item.e;
    ausgewaehltStandard.hidden = false;
    ausgewaehltStandard.innerHTML = `<strong>${escapeHtml(item.b)}</strong><span class="muted">${escapeHtml(item.k)} · ${escapeHtml(item.e)}</span>`;
    mengeStandard.focus();
    aktualisiereAddStandardButton();
  }

  function renderStandardListe(query) {
    const q = (query || "").trim().toLowerCase();
    const worte = q.split(/\s+/).filter(Boolean);
    standardListeEl.innerHTML = "";

    if (!standardMaterialDBReady) {
      standardListeEl.innerHTML = '<div class="no-result">Standardmaterial-Liste wird geladen…</div>';
      return;
    }

    let letzteKategorie = null;
    let treffer = 0;
    for (const item of standardMaterialDB) {
      if (worte.length) {
        let ok = true;
        for (const w of worte) {
          if (!item._s.includes(w)) { ok = false; break; }
        }
        if (!ok) continue;
      }
      if (item.k !== letzteKategorie) {
        const h = document.createElement("div");
        h.className = "kategorie-titel";
        h.textContent = item.k || "Sonstiges";
        standardListeEl.appendChild(h);
        letzteKategorie = item.k;
      }
      const row = document.createElement("div");
      row.className = "artikel-zeile";
      row.innerHTML = `${escapeHtml(item.b)}<small>${escapeHtml(item.e)}</small>`;
      row.addEventListener("click", () => waehleStandardArtikel(item));
      standardListeEl.appendChild(row);
      treffer++;
    }
    if (treffer === 0) {
      standardListeEl.innerHTML = '<div class="no-result">Keine Treffer – ggf. Freitext verwenden</div>';
    }
  }

  let sucheStandardTimer = null;
  sucheStandardInput.addEventListener("input", () => {
    clearTimeout(sucheStandardTimer);
    selectedStandardArtikel = null;
    ausgewaehltStandard.hidden = true;
    aktualisiereAddStandardButton();
    const q = sucheStandardInput.value;
    sucheStandardTimer = setTimeout(() => renderStandardListe(q), 120);
  });
  mengeStandard.addEventListener("input", aktualisiereAddStandardButton);

  btnAddStandard.addEventListener("click", () => {
    if (!selectedStandardArtikel) return;
    const menge = parseFloat(mengeStandard.value) || 0;
    if (!(menge > 0)) return;
    material.push({
      id: neueId(),
      bezeichnung: selectedStandardArtikel.b,
      artikelnummer: "",
      einheit: selectedStandardArtikel.e,
      menge,
      quelle: "standard",
      erledigt: false
    });
    selectedStandardArtikel = null;
    sucheStandardInput.value = "";
    mengeStandard.value = "";
    einheitStandard.value = "";
    ausgewaehltStandard.hidden = true;
    aktualisiereAddStandardButton();
    renderStandardListe("");
    onHinzufuegen();
  });

  renderStandardListe(""); // initial: komplette Liste nach Kategorie durchsuchbar anzeigen

  // Freitext
  const bezFrei = document.getElementById("f_bezeichnungFrei");
  const mengeFrei = document.getElementById("f_mengeFrei");
  const einheitFrei = document.getElementById("f_einheitFrei");
  const btnAddFrei = document.getElementById("btnAddFrei");

  btnAddFrei.addEventListener("click", () => {
    const bezeichnung = bezFrei.value.trim();
    if (!bezeichnung) { bezFrei.focus(); return; }
    const menge = parseFloat(mengeFrei.value) || 1;
    const einheit = einheitFrei.value.trim() || "Stk";
    material.push({
      id: neueId(),
      bezeichnung,
      artikelnummer: "",
      einheit,
      menge,
      quelle: "frei",
      erledigt: false
    });
    bezFrei.value = "";
    mengeFrei.value = "";
    einheitFrei.value = "";
    onHinzufuegen();
    bezFrei.focus();
  });
}

/* Erzeugt die Menge-Zelle mit Plus-/Minus-Buttons und (bei Einheit "m")
   dem Zusatzfeld zum Draufaddieren. `m` ist die mutierte Materialposition,
   `onChange` wird nach jeder Änderung aufgerufen (Autosave). Gemeinsam
   genutzt von der Aufmaß-Materialliste und der Packliste. */
function baueMengeZelle(m, onChange) {
  const td = document.createElement("td");
  td.className = "col-menge";
  const meterZeile = istMeterEinheit(m.einheit)
    ? `<div class="menge-add">
         <input type="number" step="any" min="0" placeholder="+ m" class="menge-add-input" inputmode="decimal">
         <button type="button" class="btn-qty-add">hinzufügen</button>
       </div>`
    : "";
  td.innerHTML = `
    <div class="menge-control">
      <button type="button" class="btn-qty" data-action="dec" aria-label="Menge verringern">−</button>
      <input type="number" step="any" min="0" value="${m.menge}" class="menge-input" inputmode="decimal">
      <button type="button" class="btn-qty" data-action="inc" aria-label="Menge erhöhen">+</button>
    </div>
    ${meterZeile}
  `;

  const mengeInput = td.querySelector(".menge-input");
  mengeInput.addEventListener("input", (e) => {
    const v = parseFloat(e.target.value);
    m.menge = isNaN(v) ? 0 : v;
    onChange();
  });

  td.querySelector('[data-action="dec"]').addEventListener("click", () => {
    m.menge = Math.max(0, rundeMenge(m.menge - 1));
    mengeInput.value = m.menge;
    onChange();
  });
  td.querySelector('[data-action="inc"]').addEventListener("click", () => {
    m.menge = rundeMenge(m.menge + 1);
    mengeInput.value = m.menge;
    onChange();
  });

  const addInput = td.querySelector(".menge-add-input");
  if (addInput) {
    const addBtn = td.querySelector(".btn-qty-add");
    const zusatzHinzufuegen = () => {
      const zusatz = parseFloat(addInput.value);
      if (!(zusatz > 0)) return;
      m.menge = rundeMenge(m.menge + zusatz);
      mengeInput.value = m.menge;
      addInput.value = "";
      onChange();
    };
    addBtn.addEventListener("click", zusatzHinzufuegen);
    addInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); zusatzHinzufuegen(); }
    });
  }

  return td;
}

function renderMaterialTabelle() {
  const a = currentAufmass;
  const tbody = document.getElementById("materialTbody");
  const leerHinweis = document.getElementById("materialLeerHinweis");
  const anzahlEl = document.getElementById("anzahlPositionen");
  tbody.innerHTML = "";
  anzahlEl.textContent = a.material.length;

  if (a.material.length === 0) {
    leerHinweis.hidden = false;
    return;
  }
  leerHinweis.hidden = true;

  a.material.forEach((m) => {
    const tr = document.createElement("tr");

    const tdBez = document.createElement("td");
    const sub = m.quelle === "liste" && m.artikelnummer ? `<div class="row-sub">Art.-Nr. ${escapeHtml(m.artikelnummer)}</div>` : "";
    tdBez.innerHTML = `${escapeHtml(m.bezeichnung)}${sub}`;
    tr.appendChild(tdBez);

    tr.appendChild(baueMengeZelle(m, autosave));

    const tdEinheit = document.createElement("td");
    tdEinheit.textContent = m.einheit;
    tr.appendChild(tdEinheit);

    const tdDel = document.createElement("td");
    tdDel.className = "col-del";
    tdDel.innerHTML = `<button class="btn-danger-text" type="button">✕</button>`;
    tdDel.querySelector("button").addEventListener("click", () => {
      currentAufmass.material = currentAufmass.material.filter((x) => x.id !== m.id);
      renderMaterialTabelle();
      autosave();
    });
    tr.appendChild(tdDel);

    tbody.appendChild(tr);
  });
}

/* ---------- Packliste ---------- */

function oeffnePackliste(packliste) {
  currentPackliste = packliste;
  currentAufmass = null;
  selectedArtikel = null;
  selectedStandardArtikel = null;
  headerTitle.textContent = "Packliste";
  btnBack.hidden = false;
  btnNew.hidden = true;

  const tpl = document.getElementById("tpl-packliste");
  app.innerHTML = "";
  app.appendChild(tpl.content.cloneNode(true));

  fuellePackliste();
  bindePacklisteEvents();
  renderPacklisteMaterial();
}

function fuellePackliste() {
  const p = currentPackliste;
  document.getElementById("p_bezeichnung").value = p.bezeichnung;
  document.getElementById("p_datum").value = p.datum;
  const bestehend = packlisten.some((x) => x.id === p.id);
  document.getElementById("btnPacklisteLoeschen").hidden = !bestehend;
}

function bindePacklisteEvents() {
  const p = currentPackliste;

  document.getElementById("p_bezeichnung").addEventListener("input", (e) => {
    p.bezeichnung = e.target.value;
    autosave();
  });
  document.getElementById("p_datum").addEventListener("input", (e) => {
    p.datum = e.target.value;
    autosave();
  });

  klonMaterialTabs("materialHinzufuegenPackliste");
  bindeMaterialAuswahl(p.material, () => {
    renderPacklisteMaterial();
    autosave();
  });

  document.getElementById("btnPacklisteLoeschen").addEventListener("click", () => {
    if (!confirm("Diese Packliste wirklich löschen?")) return;
    packlisten = packlisten.filter((x) => x.id !== p.id);
    speicherePacklisten();
    zeigeUebersicht();
  });
}

function bauePacklisteZeile(m, istGepackt) {
  const tr = document.createElement("tr");
  if (istGepackt) tr.className = "zeile-gepackt";

  const tdCheck = document.createElement("td");
  tdCheck.className = "col-check";
  const checkBtn = document.createElement("button");
  checkBtn.type = "button";
  checkBtn.className = "check-btn" + (istGepackt ? " checked" : "");
  checkBtn.setAttribute("aria-label", istGepackt ? "Als noch zu packen markieren" : "Als gepackt markieren");
  checkBtn.textContent = "✓";
  checkBtn.addEventListener("click", () => {
    m.erledigt = !m.erledigt;
    renderPacklisteMaterial();
    autosave();
  });
  tdCheck.appendChild(checkBtn);
  tr.appendChild(tdCheck);

  const tdBez = document.createElement("td");
  const sub = m.quelle === "liste" && m.artikelnummer ? `<div class="row-sub">Art.-Nr. ${escapeHtml(m.artikelnummer)}</div>` : "";
  tdBez.innerHTML = `<span class="bez-text">${escapeHtml(m.bezeichnung)}</span>${sub}`;
  tr.appendChild(tdBez);

  tr.appendChild(baueMengeZelle(m, autosave));

  const tdEinheit = document.createElement("td");
  tdEinheit.textContent = m.einheit;
  tr.appendChild(tdEinheit);

  const tdDel = document.createElement("td");
  tdDel.className = "col-del";
  tdDel.innerHTML = `<button class="btn-danger-text" type="button">✕</button>`;
  tdDel.querySelector("button").addEventListener("click", () => {
    currentPackliste.material = currentPackliste.material.filter((x) => x.id !== m.id);
    renderPacklisteMaterial();
    autosave();
  });
  tr.appendChild(tdDel);

  return tr;
}

function renderPacklisteMaterial() {
  const p = currentPackliste;
  const offenTbody = document.getElementById("packlisteOffenTbody");
  const gepacktTbody = document.getElementById("packlisteGepacktTbody");
  const offenLeer = document.getElementById("packlisteOffenLeer");
  const anzahlOffen = document.getElementById("packlisteAnzahlOffen");
  const anzahlGepackt = document.getElementById("packlisteAnzahlGepackt");
  const gepacktDetails = document.getElementById("packlisteGepacktDetails");

  offenTbody.innerHTML = "";
  gepacktTbody.innerHTML = "";

  const offen = p.material.filter((m) => !m.erledigt);
  const gepackt = p.material.filter((m) => m.erledigt);

  anzahlOffen.textContent = offen.length;
  anzahlGepackt.textContent = gepackt.length;

  offenLeer.hidden = offen.length !== 0;
  gepacktDetails.hidden = gepackt.length === 0;

  offen.forEach((m) => offenTbody.appendChild(bauePacklisteZeile(m, false)));
  gepackt.forEach((m) => gepacktTbody.appendChild(bauePacklisteZeile(m, true)));
}

/* ---------- PDF-Export ---------- */

function dateiname(a) {
  const kunde = (a.kunde.name || "Aufmass").trim().replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, "").replace(/\s+/g, "_");
  return `Aufmass_${kunde}_${heuteISO()}.pdf`; // aktuelles Datum (Export-Zeitpunkt), nicht das Aufmaß-Datum
}

function erstellePdf(a) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const marginX = 14;
  let y = 18;

  doc.setFontSize(16);
  doc.setFont(undefined, "bold");
  doc.text("Materialaufmaß", marginX, y);
  doc.setFont(undefined, "normal");
  doc.setFontSize(10);
  doc.text(`Datum: ${formatDatumDE(a.datum)}`, 210 - marginX, y, { align: "right" });
  y += 9;

  doc.setDrawColor(210);
  doc.line(marginX, y, 210 - marginX, y);
  y += 7;

  doc.setFontSize(11);
  doc.setFont(undefined, "bold");
  doc.text("Kunde", marginX, y);
  y += 5.5;
  doc.setFont(undefined, "normal");
  doc.setFontSize(10);
  const kundeZeilen = [];
  if (a.kunde.name.trim()) kundeZeilen.push(a.kunde.name.trim());
  if (a.kunde.ansprechpartner.trim()) kundeZeilen.push("z. Hd. " + a.kunde.ansprechpartner.trim());
  if (a.kunde.strasse.trim()) kundeZeilen.push(a.kunde.strasse.trim());
  if (a.kunde.plzOrt.trim()) kundeZeilen.push(a.kunde.plzOrt.trim());
  if (a.kunde.telefon.trim()) kundeZeilen.push("Tel. " + a.kunde.telefon.trim());
  if (kundeZeilen.length === 0) kundeZeilen.push("–");
  for (const zeile of kundeZeilen) {
    doc.text(zeile, marginX, y);
    y += 5;
  }

  if (a.baustelle.trim()) {
    y += 2;
    doc.setFont(undefined, "bold");
    doc.setFontSize(11);
    doc.text("Baustelle / Bauvorhaben", marginX, y);
    y += 5.5;
    doc.setFont(undefined, "normal");
    doc.setFontSize(10);
    const zeilen = doc.splitTextToSize(a.baustelle.trim(), 210 - marginX * 2);
    doc.text(zeilen, marginX, y);
    y += zeilen.length * 5;
  }

  if (a.arbeitsbeschreibung.trim()) {
    y += 2;
    doc.setFont(undefined, "bold");
    doc.setFontSize(11);
    doc.text("Arbeitsbeschreibung", marginX, y);
    y += 5.5;
    doc.setFont(undefined, "normal");
    doc.setFontSize(10);
    const zeilen = doc.splitTextToSize(a.arbeitsbeschreibung.trim(), 210 - marginX * 2);
    doc.text(zeilen, marginX, y);
    y += zeilen.length * 5;
  }

  y += 4;

  const head = [["Pos.", "Bezeichnung", "Art.-Nr.", "Menge", "Einh."]];

  const body = a.material.map((m, i) => [
    String(i + 1),
    m.bezeichnung,
    m.artikelnummer || "–",
    m.menge.toLocaleString("de-DE"),
    m.einheit
  ]);

  doc.autoTable({
    startY: y,
    head,
    body,
    margin: { left: marginX, right: marginX },
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [21, 34, 56] },
    columnStyles: { 0: { cellWidth: 9 }, 3: { cellWidth: 18 }, 4: { cellWidth: 16 } },
    didDrawPage: () => {
      const pageCount = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text(
        `Seite ${doc.internal.getCurrentPageInfo().pageNumber} / ${pageCount}`,
        210 - marginX,
        297 - 8,
        { align: "right" }
      );
      doc.setTextColor(0);
    }
  });

  doc.save(dateiname(a));
}

/* ---------- Init ---------- */

btnBack.addEventListener("click", zeigeUebersicht);
btnNew.addEventListener("click", () => oeffneFormular(neuesAufmass()));

ladeListe();
ladePacklisten();
ladeMaterialDB();
ladeStandardMaterialDB();
zeigeUebersicht();

/* ---------- Service-Worker-Update ---------- */

function initServiceWorkerUpdate() {
  const banner = document.getElementById("updateBanner");
  const btnUpdate = document.getElementById("btnUpdate");
  let wartenderWorker = null;
  let updateAngefordert = false; // true erst NACH Klick auf "Jetzt aktualisieren"

  function zeigeUpdateBanner(worker) {
    wartenderWorker = worker;
    banner.hidden = false;
  }

  btnUpdate.addEventListener("click", () => {
    if (!wartenderWorker) return;
    updateAngefordert = true;
    wartenderWorker.postMessage({ type: "SKIP_WAITING" });
  });

  // "controllerchange" feuert auch beim allerersten Laden, sobald der erste
  // Service Worker die Seite übernimmt – das ist kein Update und darf NICHT
  // zu einem Neuladen führen. Nur neu laden, wenn der Nutzer zuvor aktiv im
  // Banner bestätigt hat.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!updateAngefordert) return;
    updateAngefordert = false;
    window.location.reload();
  });

  navigator.serviceWorker.register("sw.js").then((registration) => {
    // Fall 1: Beim Laden der Seite liegt bereits eine fertig installierte,
    // wartende Version vor (z. B. Tab war offen, während die neue Version
    // im Hintergrund heruntergeladen wurde).
    if (registration.waiting && navigator.serviceWorker.controller) {
      zeigeUpdateBanner(registration.waiting);
    }

    // Fall 2: Während die Seite offen ist, wird eine neue Version gefunden.
    registration.addEventListener("updatefound", () => {
      const neuerWorker = registration.installing;
      if (!neuerWorker) return;
      neuerWorker.addEventListener("statechange", () => {
        if (neuerWorker.state === "installed" && navigator.serviceWorker.controller) {
          zeigeUpdateBanner(neuerWorker);
        }
      });
    });

    // Aktiv nach einer neuen Version schauen, wenn die App wieder in den
    // Vordergrund kommt (z. B. nach dem Öffnen vom Homescreen).
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") registration.update();
    });
  }).catch((e) => console.error("SW-Registrierung fehlgeschlagen", e));
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", initServiceWorkerUpdate);
}
