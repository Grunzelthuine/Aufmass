"use strict";

/* ============================================================
   Zentrale Materialdatenbank (seit Version 15.0)
   Ersetzt die bisher getrennten Listen
     - Standardmaterial (standardmaterial.json + eigene Ergänzungen)
     - Produktliste fürs Bauaufmaß (Abdeckungen, KNX, Melder, Verteilung)
     - eigene Artikel (unbekannte EAN)
   durch EINE Datenbank mit Kategorien:
     aufmass_v1_kategorien: freie Kategorien [{id, name}]
     aufmass_v1_material:   Einträge [{id, kat, name, nr, ean, einheit}]
   Systemkategorien (für die Auswahlfelder im Bauaufmaß) kommen aus
   PRODUKT_KATEGORIEN (bauaufmass.js) und haben die id "sys:<key>".
   IDs beim Übernehmen alter Daten sind deterministisch, damit mehrere
   Geräte beim Cloud-Sync keine Dubletten erzeugen. Übernommene Einträge
   tragen _imp: true (cloudsync.js behandelt sie dann als „alt“).
   Wird nach bauaufmass.js und vor app.js geladen.
   ============================================================ */

const STORAGE_KEY_KATEGORIEN = "aufmass_v1_kategorien";
const STORAGE_KEY_MATERIAL = "aufmass_v1_material";
const DB_VERSION_KEY = "aufmass_v1_db_version";
const KAT_EIGENE = "kat:eigene-artikel";
const EINHEITEN = ["Stck", "m", "Pack", "Rolle", "Satz", "kg", "VE", "Paar"];

let dbKategorien = [];  // freie Kategorien
let dbMaterial = [];

function dbIdHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function katIdAusName(name) {
  const slug = name.toLowerCase().replace(/[äöüß]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" }[c]))
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return "kat:" + (slug || dbIdHash(name));
}

/* ---------- Laden / Speichern ---------- */

function ladeDatenbank() {
  try { dbKategorien = JSON.parse(localStorage.getItem(STORAGE_KEY_KATEGORIEN) || "[]"); } catch (e) { dbKategorien = []; }
  try { dbMaterial = JSON.parse(localStorage.getItem(STORAGE_KEY_MATERIAL) || "[]"); } catch (e) { dbMaterial = []; }
  if (!dbKategorien.some((k) => k.id === KAT_EIGENE)) dbKategorien.push({ id: KAT_EIGENE, name: "Eigene Artikel" });
  aktualisiereAbgeleiteteListen();
}

function speichereKategorien() {
  try { localStorage.setItem(STORAGE_KEY_KATEGORIEN, JSON.stringify(dbKategorien)); }
  catch (e) { console.error(e); alert("Speichern der Kategorien fehlgeschlagen."); }
}

function speichereMaterial() {
  try { localStorage.setItem(STORAGE_KEY_MATERIAL, JSON.stringify(dbMaterial)); }
  catch (e) { console.error(e); alert("Speichern der Materialdatenbank fehlgeschlagen (Speicher voll?)."); }
  aktualisiereAbgeleiteteListen();
}

// Aus der Datenbank abgeleitete Listen für „Standardmaterial“ und „Aus Liste“ (eigene Artikel)
function aktualisiereAbgeleiteteListen() {
  if (typeof standardMaterialDB === "undefined") return; // app.js noch nicht geladen
  const reihenfolge = new Map(alleKategorien().map((k, i) => [k.id, i]));
  standardMaterialDB = dbMaterial
    .map((m) => ({ id: m.id, k: kategorieName(m.kat), b: m.name, e: m.einheit || "Stck", n: m.nr || "", g: m.ean || "", _r: reihenfolge.has(m.kat) ? reihenfolge.get(m.kat) : 999 }))
    .sort((a, b) => a._r - b._r || a.b.localeCompare(b.b, "de"))
    .map((a) => ({ ...a, _s: (a.k + " " + a.b + " " + a.n + " " + a.g).toLowerCase() }));
  standardMaterialDBReady = true;
  eigeneArtikel = dbMaterial
    .filter((m) => m.ean || m.nr)
    .map((m) => ({ n: m.nr || m.ean, b: m.name, e: m.einheit || "Stck", g: m.ean || "", _eigen: true, _dbId: m.id, _s: ((m.nr || "") + " " + (m.ean || "") + " " + m.name).toLowerCase() }));
}

/* ---------- Kategorien ---------- */

function systemKategorien() {
  return PRODUKT_KATEGORIEN.map((k) => ({ id: "sys:" + k.key, name: k.b, gruppe: k.gruppe || "Bauaufmaß", system: true, einheit: k.einheit || "Stck", ph: k.ph || "" }));
}

function alleKategorien() {
  const frei = dbKategorien.map((k) => ({ ...k, gruppe: "Standardmaterial", system: false }));
  frei.sort((a, b) => (a.id === KAT_EIGENE) - (b.id === KAT_EIGENE));
  return frei.concat(systemKategorien());
}

function kategorieInfo(katId) {
  return alleKategorien().find((k) => k.id === katId) || { id: katId, name: "Ohne Kategorie", gruppe: "Standardmaterial", system: false };
}

function kategorieName(katId) {
  return kategorieInfo(katId).name;
}

function legeKategorieAn(name) {
  const n = name.trim();
  if (!n) return null;
  const vorhanden = dbKategorien.find((k) => k.name.toLowerCase() === n.toLowerCase());
  if (vorhanden) return vorhanden;
  let id = katIdAusName(n);
  while (dbKategorien.some((k) => k.id === id) || id.startsWith("sys:")) id += "-2";
  const k = { id, name: n };
  dbKategorien.push(k);
  speichereKategorien();
  return k;
}

// <select> mit allen Kategorien, gruppiert
function fuelleKategorieSelect(select, gewaehlt, mitNeu) {
  select.innerHTML = "";
  let og = null;
  for (const k of alleKategorien()) {
    if (!og || og.label !== k.gruppe) {
      og = document.createElement("optgroup");
      og.label = k.gruppe;
      select.appendChild(og);
    }
    const o = document.createElement("option");
    o.value = k.id;
    o.textContent = k.name;
    og.appendChild(o);
  }
  if (mitNeu) {
    const o = document.createElement("option");
    o.value = "__neu__";
    o.textContent = "➕ Neue Kategorie…";
    select.appendChild(o);
  }
  if (gewaehlt) select.value = gewaehlt;
}

/* ---------- Einträge ---------- */

function dbMaterialDerKategorie(katId) {
  return dbMaterial.filter((m) => m.kat === katId).sort((a, b) => a.name.localeCompare(b.name, "de"));
}

function dbFindeCode(code) {
  const c = (code || "").trim();
  if (!c) return null;
  return dbMaterial.find((m) => (m.ean && m.ean === c) || (m.nr && m.nr === c)) || null;
}

// Neuer Eintrag; gleicher Name in gleicher Kategorie -> vorhandenen aktualisieren
function dbNeu({ kat, name, nr, ean, einheit }) {
  const n = (name || "").trim();
  if (!n) return null;
  let m = dbMaterial.find((x) => x.kat === kat && x.name.toLowerCase() === n.toLowerCase());
  if (m) {
    if (nr) m.nr = nr;
    if (ean) m.ean = ean;
    if (einheit) m.einheit = einheit;
    delete m._imp;
  } else {
    m = { id: neueId(), kat, name: n, nr: nr || "", ean: ean || "", einheit: einheit || kategorieInfo(kat).einheit || "Stck" };
    dbMaterial.push(m);
  }
  speichereMaterial();
  return m;
}

function dbAendern(m, felder) {
  Object.assign(m, felder);
  delete m._imp;
  speichereMaterial();
}

function dbLoeschen(id) {
  dbMaterial = dbMaterial.filter((m) => m.id !== id);
  speichereMaterial();
}

/* ---------- Übernahme der alten Listen (einmalig je Gerät) ---------- */

async function initDatenbank() {
  ladeDatenbank();
  if (localStorage.getItem(DB_VERSION_KEY)) return;
  const neu = [];
  const katFuer = (name) => {
    const k = legeKategorieAn(name || "Sonstige Standardartikel");
    return k.id;
  };
  const add = (m) => { if (!dbMaterial.some((x) => x.id === m.id) && !neu.some((x) => x.id === m.id)) neu.push({ ...m, _imp: true }); };
  // 1. Standardmaterial-Grundliste
  try {
    const res = await fetch("standardmaterial.json");
    const daten = await res.json();
    for (const a of daten) add({ id: "std:" + dbIdHash(a.k + "|" + a.b), kat: katFuer(a.k), name: a.b, nr: "", ean: "", einheit: a.e || "Stck" });
  } catch (e) {
    console.error("standardmaterial.json konnte nicht geladen werden – Übernahme beim nächsten Start", e);
    return; // ohne Grundliste nicht als erledigt markieren
  }
  // 2. eigene Standardmaterial-Ergänzungen
  try {
    for (const a of JSON.parse(localStorage.getItem("aufmass_v1_standard_ergaenzungen") || "[]")) {
      add({ id: "std:" + dbIdHash(a.k + "|" + a.b), kat: katFuer(a.k), name: a.b, nr: a.n || "", ean: "", einheit: a.e || "Stck" });
    }
  } catch (e) { /* egal */ }
  // 3. eigene Artikel (unbekannte EAN)
  try {
    for (const a of JSON.parse(localStorage.getItem("aufmass_v1_eigene_artikel") || "[]")) {
      if (!a.g && !a.n) continue;
      add({ id: "ean:" + (a.g || a.n), kat: KAT_EIGENE, name: a.b, nr: "", ean: a.g || a.n, einheit: a.e || "Stck" });
    }
  } catch (e) { /* egal */ }
  // 4. Produktliste (Bauaufmaß)
  try {
    for (const p of JSON.parse(localStorage.getItem("aufmass_v1_produkte") || "[]")) {
      const info = PRODUKT_KATEGORIEN.find((k) => k.key === p.kat) || {};
      add({ id: p.id, kat: "sys:" + p.kat, name: p.name, nr: p.nr || "", ean: p.ean || "", einheit: info.einheit || "Stck" });
    }
  } catch (e) { /* egal */ }
  dbMaterial = dbMaterial.concat(neu);
  speichereKategorien();
  speichereMaterial();
  localStorage.setItem(DB_VERSION_KEY, "1");
  if (typeof aktualisiereListenansicht === "function") aktualisiereListenansicht();
}

/* ---------- Formular: Eintrag anlegen / bearbeiten ----------
   Kamera-Scan bzw. Eingabe von EAN/Art.-Nr. sucht im Großhandelskatalog
   (DATANORM) und in der eigenen Datenbank und füllt Bezeichnung + Art.-Nr. */
function baueMaterialFormular({ katId, katFest, eintrag, onSave, onCancel }) {
  const form = document.createElement("div");
  form.className = "selected-article produkt-form";
  form.innerHTML = `
    <label class="pf-kat-wrap">Kategorie <select class="pf-kat"></select></label>
    <div class="pf-katneu inline-add" hidden><input type="text" placeholder="Name der neuen Kategorie"></div>
    <label>EAN / Art.-Nr. (optional – scannen oder eingeben)
      <div class="suche-mit-scan">
        <input type="text" class="pf-code" inputmode="numeric" autocomplete="off" placeholder="z. B. 4011377…">
        <button type="button" class="btn-scan pf-scan" aria-label="Barcode scannen">📷</button>
        <button type="button" class="btn btn-secondary pf-suchen">Suchen</button>
      </div>
    </label>
    <p class="hint pf-hinweis" hidden></p>
    <label>Bezeichnung <input type="text" class="pf-name" autocomplete="off"></label>
    <div class="field-grid two-col">
      <label>Art.-Nr. <input type="text" class="pf-nr" autocomplete="off"></label>
      <label>Einheit <input type="text" class="pf-einheit" list="pf_einheiten" autocomplete="off"></label>
    </div>
    <datalist id="pf_einheiten">${EINHEITEN.map((e) => `<option value="${e}"></option>`).join("")}</datalist>
    <div class="action-bar">
      <button type="button" class="btn btn-secondary pf-speichern" disabled>${eintrag ? "Änderungen speichern" : "In Datenbank speichern"}</button>
      <button type="button" class="btn-danger-text pf-abbrechen">Abbrechen</button>
    </div>`;
  const katSel = form.querySelector(".pf-kat");
  const katNeu = form.querySelector(".pf-katneu");
  const name = form.querySelector(".pf-name");
  const nr = form.querySelector(".pf-nr");
  const einheit = form.querySelector(".pf-einheit");
  const code = form.querySelector(".pf-code");
  const hinweis = form.querySelector(".pf-hinweis");
  const btnSpeichern = form.querySelector(".pf-speichern");
  fuelleKategorieSelect(katSel, (eintrag && eintrag.kat) || katId || KAT_EIGENE, true);
  if (katFest) form.querySelector(".pf-kat-wrap").hidden = true;
  const setzePlatzhalter = () => {
    const info = kategorieInfo(katSel.value);
    name.placeholder = info.ph || "Bezeichnung";
    if (!eintrag && !einheit.value) einheit.value = info.einheit || "Stck";
  };
  katSel.addEventListener("change", () => {
    katNeu.hidden = katSel.value !== "__neu__";
    if (!katNeu.hidden) katNeu.querySelector("input").focus();
    else setzePlatzhalter();
  });
  if (eintrag) {
    name.value = eintrag.name;
    nr.value = eintrag.nr || "";
    einheit.value = eintrag.einheit || "Stck";
    code.value = eintrag.ean || "";
  }
  setzePlatzhalter();
  const pruefe = () => { btnSpeichern.disabled = !name.value.trim(); };
  name.addEventListener("input", pruefe);
  pruefe();

  const suche = (wert) => {
    const c = (wert || "").trim();
    if (!c) { code.focus(); return; }
    code.value = c;
    hinweis.hidden = false;
    const inDb = dbFindeCode(c);
    if (inDb && (!eintrag || inDb.id !== eintrag.id)) {
      hinweis.innerHTML = `ℹ Schon in der Datenbank: <strong>${escapeHtml(inDb.name)}</strong> (${escapeHtml(kategorieName(inDb.kat))}).`;
      return;
    }
    const treffer = typeof materialDB !== "undefined"
      ? (sucheNachEan(c, 3).find((a) => !a._eigen) || materialDB.find((a) => a.n === c))
      : null;
    if (treffer) {
      name.value = treffer.b;
      nr.value = treffer.n;
      einheit.value = treffer.e || einheit.value;
      hinweis.innerHTML = `✓ Im Katalog gefunden: <strong>${escapeHtml(treffer.b)}</strong> – Bezeichnung kann angepasst werden.`;
    } else {
      hinweis.textContent = (typeof materialDBReady !== "undefined" && !materialDBReady)
        ? "Katalog wird noch geladen – Bezeichnung bitte selbst eintragen oder gleich noch einmal suchen."
        : "Nicht im Katalog gefunden – Bezeichnung bitte selbst eintragen.";
      name.focus();
    }
    pruefe();
  };
  form.querySelector(".pf-suchen").addEventListener("click", () => suche(code.value));
  code.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); suche(code.value); } });
  form.querySelector(".pf-scan").addEventListener("click", () => oeffneBarcodeScanner((roh) => suche(roh)));

  btnSpeichern.addEventListener("click", () => {
    const n = name.value.trim();
    if (!n) return;
    let kat = katSel.value;
    if (kat === "__neu__") {
      const k = legeKategorieAn(katNeu.querySelector("input").value);
      if (!k) { katNeu.querySelector("input").focus(); return; }
      kat = k.id;
    }
    const c = code.value.trim();
    const ean = istEanAehnlich(c) ? c : "";
    const artNr = nr.value.trim() || (c && !ean ? c : "");
    const e = einheit.value.trim() || "Stck";
    let ergebnis;
    if (eintrag) { dbAendern(eintrag, { kat, name: n, nr: artNr, ean, einheit: e }); ergebnis = eintrag; }
    else ergebnis = dbNeu({ kat, name: n, nr: artNr, ean, einheit: e });
    onSave(ergebnis);
  });
  form.querySelector(".pf-abbrechen").addEventListener("click", () => onCancel && onCancel());
  if (!eintrag) setTimeout(() => (katFest ? name : code).focus(), 0);
  return form;
}

// Kompatibel zu den Auswahlfeldern im Bauaufmaß (Kategorie-Schlüssel ohne "sys:")
function baueProduktFormular({ kat, onSave, onCancel }) {
  return baueMaterialFormular({ katId: "sys:" + kat, katFest: true, onSave, onCancel });
}

function produkteDerKategorie(kat) {
  return dbMaterialDerKategorie("sys:" + kat);
}

/* ---------- Verwaltungsansicht ---------- */

function oeffneDatenbank(suchtext) {
  setzeAnsicht("datenbank");
  currentAufmass = null;
  currentPackliste = null;
  currentBauaufmass = null;
  currentRaum = null;
  zurueckAktion = zeigeStart;
  headerTitle.textContent = "Materialdatenbank";
  btnBack.hidden = false;
  btnNew.hidden = true;
  app.innerHTML = "";
  const view = document.createElement("section");
  view.className = "view";
  view.innerHTML = `
    <div class="db-kopf">
      <input type="search" class="db-suche" placeholder="Suchen (Bezeichnung, Art.-Nr., EAN)…" autocomplete="off">
      <div class="db-aktionen">
        <button type="button" class="btn btn-primary db-neu">＋ Material</button>
        <button type="button" class="btn btn-secondary db-scan">📷 Scannen</button>
        <button type="button" class="btn btn-outline-neutral db-katneu">＋ Kategorie</button>
      </div>
      <div class="db-form"></div>
    </div>
    <p class="hint db-info"></p>
    <div class="db-liste view"></div>
    <details class="section-card">
      <summary>Sichern / Wiederherstellen</summary>
      <p class="hint">Die Datenbank wird mit dem Cloud-Sync automatisch abgeglichen. Zusätzlich kannst du sie als Datei sichern.</p>
      <div class="action-bar">
        <button type="button" class="btn btn-secondary db-export">Als Datei sichern</button>
        <label class="btn btn-outline-neutral db-import-label">Datei einlesen<input type="file" accept="application/json,.json" class="db-import" hidden></label>
      </div>
    </details>`;
  app.appendChild(view);
  window.scrollTo(0, 0);

  const suche = view.querySelector(".db-suche");
  const formPlatz = view.querySelector(".db-form");
  const liste = view.querySelector(".db-liste");
  const info = view.querySelector(".db-info");
  const offen = new Set();
  suche.value = suchtext || "";

  const zeigeFormular = (opts) => {
    formPlatz.innerHTML = "";
    formPlatz.appendChild(baueMaterialFormular({
      ...opts,
      onSave: (m) => { formPlatz.innerHTML = ""; offen.add(m.kat); render(); },
      onCancel: () => { formPlatz.innerHTML = ""; }
    }));
    formPlatz.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  view.querySelector(".db-neu").addEventListener("click", () => zeigeFormular({}));
  view.querySelector(".db-scan").addEventListener("click", () => {
    zeigeFormular({});
    formPlatz.querySelector(".pf-scan").click();
  });
  view.querySelector(".db-katneu").addEventListener("click", () => {
    const n = prompt("Name der neuen Kategorie:");
    if (n && n.trim()) { const k = legeKategorieAn(n); offen.add(k.id); render(); }
  });

  const render = () => {
    const q = suche.value.trim().toLowerCase();
    const worte = q.split(/\s+/).filter(Boolean);
    liste.innerHTML = "";
    let letzteGruppe = null;
    let sichtbar = 0;
    for (const k of alleKategorien()) {
      let eintraege = dbMaterialDerKategorie(k.id);
      if (worte.length) {
        eintraege = eintraege.filter((m) => {
          const s = (m.name + " " + (m.nr || "") + " " + (m.ean || "") + " " + k.name).toLowerCase();
          return worte.every((w) => s.includes(w));
        });
        if (!eintraege.length) continue;
      }
      if (k.gruppe !== letzteGruppe) {
        letzteGruppe = k.gruppe;
        const h = document.createElement("h3");
        h.className = "pl-gruppe";
        h.textContent = k.gruppe;
        liste.appendChild(h);
      }
      sichtbar += eintraege.length;
      const det = document.createElement("details");
      det.className = "section-card";
      det.open = worte.length > 0 || offen.has(k.id);
      det.addEventListener("toggle", () => { if (det.open) offen.add(k.id); else offen.delete(k.id); });
      det.innerHTML = `<summary><span></span></summary>
        <div class="db-kat-aktionen"></div>
        <ul class="pl-eintraege"></ul>`;
      det.querySelector("summary span").textContent = `${k.name} (${eintraege.length})`;
      const akt = det.querySelector(".db-kat-aktionen");
      const plus = document.createElement("button");
      plus.type = "button";
      plus.className = "btn-link-accent";
      plus.textContent = "＋ Material in dieser Kategorie";
      plus.addEventListener("click", () => zeigeFormular({ katId: k.id }));
      akt.appendChild(plus);
      if (!k.system && k.id !== KAT_EIGENE) {
        const ren = document.createElement("button");
        ren.type = "button";
        ren.className = "btn-mini";
        ren.textContent = "✎";
        ren.setAttribute("aria-label", "Kategorie umbenennen");
        ren.addEventListener("click", () => {
          const n = prompt("Kategorie umbenennen:", k.name);
          if (n && n.trim()) { const kk = dbKategorien.find((x) => x.id === k.id); kk.name = n.trim(); speichereKategorien(); aktualisiereAbgeleiteteListen(); render(); }
        });
        const del = document.createElement("button");
        del.type = "button";
        del.className = "btn-mini btn-mini-danger";
        del.textContent = "✕";
        del.setAttribute("aria-label", "Kategorie löschen");
        del.addEventListener("click", () => {
          const anzahl = dbMaterialDerKategorie(k.id).length;
          if (!confirm(anzahl ? `Kategorie „${k.name}“ mit ${anzahl} Einträgen löschen?` : `Kategorie „${k.name}“ löschen?`)) return;
          dbMaterial = dbMaterial.filter((m) => m.kat !== k.id);
          dbKategorien = dbKategorien.filter((x) => x.id !== k.id);
          speichereKategorien();
          speichereMaterial();
          render();
        });
        akt.appendChild(ren);
        akt.appendChild(del);
      }
      const ul = det.querySelector("ul");
      if (!eintraege.length) {
        const li = document.createElement("li");
        li.className = "hint";
        li.textContent = "Noch keine Einträge.";
        ul.appendChild(li);
      }
      for (const m of eintraege) {
        const li = document.createElement("li");
        li.className = "pl-eintrag";
        li.innerHTML = `<div class="info"><strong></strong><small></small></div>
          <span class="komp-aktionen">
            <button type="button" class="btn-mini" aria-label="Bearbeiten">✎</button>
            <button type="button" class="btn-mini btn-mini-danger" aria-label="Löschen">✕</button>
          </span>`;
        li.querySelector("strong").textContent = m.name;
        li.querySelector("small").textContent = [m.einheit || "Stck", m.nr && `Art.-Nr. ${m.nr}`, m.ean && `EAN ${m.ean}`].filter(Boolean).join(" · ");
        li.querySelector('[aria-label="Bearbeiten"]').addEventListener("click", () => {
          const platz = document.createElement("li");
          platz.appendChild(baueMaterialFormular({
            eintrag: m,
            onSave: (x) => { offen.add(x.kat); render(); },
            onCancel: render
          }));
          li.replaceWith(platz);
        });
        li.querySelector('[aria-label="Löschen"]').addEventListener("click", () => {
          if (!confirm(`„${m.name}“ aus der Datenbank löschen? (Bereits erfasste Aufmaße behalten den Eintrag.)`)) return;
          dbLoeschen(m.id);
          render();
        });
        ul.appendChild(li);
      }
      liste.appendChild(det);
    }
    info.textContent = worte.length
      ? `${sichtbar} Treffer`
      : `${dbMaterial.length} Einträge in ${alleKategorien().length} Kategorien. Kategorie antippen zum Aufklappen.`;
  };
  let t = null;
  suche.addEventListener("input", () => { clearTimeout(t); t = setTimeout(render, 150); });
  render();

  // Sichern / Wiederherstellen
  view.querySelector(".db-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ kategorien: dbKategorien, material: dbMaterial }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Materialdatenbank_${heuteISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
  view.querySelector(".db-import").addEventListener("change", async (e) => {
    const datei = e.target.files[0];
    if (!datei) return;
    try {
      const d = JSON.parse(await datei.text());
      let n = 0;
      for (const k of d.kategorien || []) if (!dbKategorien.some((x) => x.id === k.id)) dbKategorien.push({ id: k.id, name: k.name });
      for (const m of d.material || []) {
        const i = dbMaterial.findIndex((x) => x.id === m.id);
        if (i >= 0) dbMaterial[i] = m; else dbMaterial.push(m);
        n++;
      }
      speichereKategorien();
      speichereMaterial();
      alert(`${n} Einträge eingelesen.`);
      render();
    } catch (err) {
      alert("Datei konnte nicht gelesen werden: " + err.message);
    }
    e.target.value = "";
  });
}
