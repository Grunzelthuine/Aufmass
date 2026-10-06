"use strict";

/* ============================================================
   Diktat im Raum (seit Version 17.0)
   Text wird über die Diktierfunktion der iPhone-Tastatur eingesprochen
   (zuverlässiger als die Web-Speech-API in der installierten PWA) und hier
   regelbasiert ausgewertet – ohne Server, ohne Internet.
   Beispiel: „6 Steckdosen, 2 Cat 2-fach, Wechselschaltung mit 2
   Deckenauslässen, Ausschaltung mit 4 Strahlern, Rollo mit Taster“
   Ablauf: Text -> werteDiktatAus() -> Vorschau -> wendeDiktatAn() auf den Raum.
   Typen/Produkte werden nicht per Sprache zugeordnet (danach per Auswahlliste).
   Wird nach bauaufmass.js geladen.
   ============================================================ */

const DIKTAT_ZAHLWORTE = {
  ein: 1, eine: 1, einen: 1, einem: 1, einer: 1, eins: 1,
  zwei: 2, zwo: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9,
  zehn: 10, elf: 11, zwölf: 12, zwoelf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15, sechzehn: 16,
  siebzehn: 17, achtzehn: 18, neunzehn: 19, zwanzig: 20, dreißig: 30, dreissig: 30, vierzig: 40, fünfzig: 50
};

// Text vereinheitlichen: Kleinschreibung, Zahlwörter -> Ziffern, „zweifach“ -> „2 fach“ usw.
function diktatNormalisieren(text) {
  let t = " " + String(text || "").toLowerCase() + " ";
  t = t.replace(/[–—]/g, "-").replace(/[;:!?]/g, ",");
  t = t.replace(/(\d+)\s*,\s*(\d+)/g, "$1.$2");             // 3,5 -> 3.5
  t = t.replace(/(\d)\s*-\s*fach/g, "$1 fach");
  // „zweifach“, „2fach“, „zweifache“
  t = t.replace(/\b(ein|zwei|drei|vier|fünf|sechs|acht)\s*-?\s*fach(e|er|en|es)?\b/g, (m, z) => ` ${DIKTAT_ZAHLWORTE[z]} fach `);
  t = t.replace(/\b(\d+)fach(e|er|en|es)?\b/g, " $1 fach ");
  t = t.replace(/\bdoppelt?e?\b/g, " 2 fach ");
  // „drei komma fünf“
  t = t.replace(/\b([a-zäöüß]+)\s+komma\s+([a-zäöüß]+)\b/g, (m, a, b) =>
    DIKTAT_ZAHLWORTE[a] !== undefined && DIKTAT_ZAHLWORTE[b] !== undefined ? ` ${DIKTAT_ZAHLWORTE[a]}.${DIKTAT_ZAHLWORTE[b]} ` : m);
  t = t.replace(/\b(\d+)\s+komma\s+(\d+)\b/g, "$1.$2");
  t = t.replace(/\b([a-zäöüß]+)einhalb\b/g, (m, a) => (DIKTAT_ZAHLWORTE[a] !== undefined ? ` ${DIKTAT_ZAHLWORTE[a]}.5 ` : m));
  t = t.replace(/\b[a-zäöüß]+\b/g, (w) => (DIKTAT_ZAHLWORTE[w] !== undefined ? String(DIKTAT_ZAHLWORTE[w]) : w));
  t = t.replace(/\s+/g, " ");
  return t;
}

/* Schlüsselwörter. Reihenfolge = Vorrang bei Überschneidung (längere zuerst).
   art: schaltung | auslass | position | rollo | bedienung | melder | knx | stellen | stripe | geraet */
const DIKTAT_MUSTER = [
  // Schaltungen
  { re: /knx[- ]?(licht|schaltung|beleuchtung|leuchte)[a-zäöüß]*/, art: "schaltung", typ: "knx" },
  { re: /hand[- ]?automatik[a-zäöüß]*/, art: "schaltung", typ: "handauto" },
  { re: /kontroll[- ]?wechsel[a-zäöüß]*/, art: "schaltung", typ: "kontrollwechsel" },
  { re: /kontroll[- ]?schalt[a-zäöüß]*/, art: "schaltung", typ: "kontroll" },
  { re: /wechsel[- ]?schaltung[a-zäöüß]* mit dimmer[a-zäöüß]*|wechsel[- ]?dimmer[a-zäöüß]*|dimmer[- ]?wechsel[a-zäöüß]*/, art: "schaltung", typ: "wechseldimmer" },
  { re: /kreuz[- ]?schaltung[a-zäöüß]*|kreuzer\b|kreuzschalter[a-zäöüß]*/, art: "schaltung", typ: "kreuz" },
  { re: /wechsel[- ]?schaltung[a-zäöüß]*|wechsler\b|wechselschalter[a-zäöüß]*/, art: "schaltung", typ: "wechsel" },
  { re: /serien[- ]?schaltung[a-zäöüß]*|serienschalter[a-zäöüß]*/, art: "schaltung", typ: "serie" },
  { re: /taster[- ]?schaltung[a-zäöüß]*|stromsto(ß|ss)[a-zäöüß]*/, art: "schaltung", typ: "taster" },
  { re: /aus[- ]?schaltung[a-zäöüß]*|aus[- ]?schalter[a-zäöüß]*/, art: "schaltung", typ: "aus" },
  { re: /dimmer[a-zäöüß]*/, art: "schaltung", typ: "dimmer" },
  // LED-Stripes
  { re: /led[- ]?(stripe|strip|streifen|band)[a-zäöüß]*|lichtband[a-zäöüß]*/, art: "stripe" },
  // Auslässe (gehören zur aktuellen Schaltung)
  { re: /(schaltbare|geschaltete|geschalteten|schaltbaren)\s+steckdose[a-zäöüß]*/, art: "auslass", key: "steckdose" },
  { re: /decken[- ]?(auslass|auslässe|auslässen|anschluss|anschlüsse|anschlüssen|lampe[a-zäöüß]*|leuchte[a-zäöüß]*|licht)\b/, art: "auslass", key: "decke" },
  { re: /wand[- ]?(auslass|auslässe|auslässen|anschluss|anschlüsse|anschlüssen|lampe[a-zäöüß]*|leuchte[a-zäöüß]*|licht)\b/, art: "auslass", key: "wand" },
  { re: /(einbau)?strahler[a-zäöüß]*|spots?\b|downlights?\b/, art: "auslass", key: "strahler" },
  // KNX
  { re: /glas[- ]?taster[a-zäöüß]*/, art: "knx", typ: "glastaster" },
  { re: /pillen?\b|taster[- ]?schnittstelle[a-zäöüß]*/, art: "knx", typ: "pille" },
  { re: /knx[- ]?(taster|tastsensor)[a-zäöüß]*|tastsensor[a-zäöüß]*/, art: "knx", typ: "tastsensor" },
  { re: /knx[- ]?präsenz[a-zäöüß]*/, art: "knx", typ: "praesenz" },
  { re: /knx[- ]?bewegung[a-zäöüß]*/, art: "knx", typ: "bewegung" },
  { re: /raumtemperaturregler[a-zäöüß]*|\brtr\b|knx[- ]?thermostat[a-zäöüß]*/, art: "knx", typ: "rtr" },
  // Melder
  { re: /präsenz[- ]?melder[a-zäöüß]*|präsenz\b/, art: "melder", typ: "praesenz" },
  { re: /bewegungs[- ]?melder[a-zäöüß]*/, art: "melder", typ: "bewegung" },
  { re: /rauch[- ]?melder[a-zäöüß]*/, art: "melder", typ: "rauchmelder" },
  // Rollos
  { re: /roll(o|laden|läden)[- ]?(schalter|taster)[a-zäöüß]*/, art: "rollobedienung" },
  { re: /roll(o|os|äden|aden|laden|läden)\b|jalousie[a-zäöüß]*|raffstore[a-zäöüß]*/, art: "rollo" },
  // Bedienung / Schaltstellen / Taster
  { re: /schaltstelle[a-zäöüß]*/, art: "stellen" },
  { re: /serientaster[a-zäöüß]*/, art: "bedienung", wert: "serientaster" },
  { re: /taster[a-zäöüß]*/, art: "bedienung", wert: "taster" },
  { re: /schalter[a-zäöüß]*/, art: "bedienung", wert: "schalter" },
  // Positionen (Zähler)
  { re: /doppel[- ]?steckdose[a-zäöüß]*/, art: "position", key: "steckdose", faktor: 2 },
  { re: /(3|drei)[- ]?fach[- ]?steckdose[a-zäöüß]*/, art: "position", key: "steckdose", faktor: 3 },
  { re: /steckdose[a-zäöüß]*/, art: "position", key: "steckdose" },
  { re: /(cat|kat|netzwerk[a-zäöüß]*|daten[a-zäöüß]*|lan)[- ]?(dose[a-zäöüß]*|anschl[a-zäöüß]*)?\s*1 fach/, art: "position", key: "cat1" },
  { re: /(cat|kat|netzwerk[a-zäöüß]*|daten[a-zäöüß]*|lan)[- ]?(dose[a-zäöüß]*|anschl[a-zäöüß]*)?\s*2 fach/, art: "position", key: "cat2" },
  { re: /1 fach\s*(cat|kat|netzwerk[a-zäöüß]*|daten[a-zäöüß]*|lan)[a-zäöüß]*/, art: "position", key: "cat1" },
  { re: /2 fach\s*(cat|kat|netzwerk[a-zäöüß]*|daten[a-zäöüß]*|lan)[a-zäöüß]*/, art: "position", key: "cat2" },
  { re: /\b(cat|kat)\b[- ]?(dose[a-zäöüß]*|anschl[a-zäöüß]*)?|netzwerk[- ]?(dose[a-zäöüß]*|anschl[a-zäöüß]*)|datendose[a-zäöüß]*|lan[- ]?dose[a-zäöüß]*/, art: "position", key: "cat2", annahme: "Cat 2-fach angenommen" },
  { re: /sat\b[- ]?(dose[a-zäöüß]*|anschl[a-zäöüß]*)?|satdose[a-zäöüß]*|antennen[- ]?dose[a-zäöüß]*/, art: "position", key: "sat" },
  { re: /fußboden[- ]?heizung[a-zäöüß]*|\bfbh\b|thermostat[a-zäöüß]*/, art: "position", key: "fbh" },
  { re: /blind[- ]?(abdeckung|deckel)[a-zäöüß]*/, art: "position", key: "blind" },
  { re: /leer[- ]?rohr[a-zäöüß]*/, art: "position", key: "leerrohr" },
  { re: /\btae\b|telefon[a-zäöüß]*/, art: "position", key: "tae" },
  { re: /klingel[a-zäöüß]*|sprechanlage[a-zäöüß]*/, art: "position", key: "klingel" },
  { re: /rahmen\s*(\d) fach|(\d) fach[- ]?rahmen|(\d) fach\s*rahmen/, art: "rahmen" },
  // Geräteanschlüsse
  { re: /herd[a-zäöüß]*|kochfeld[a-zäöüß]*/, art: "position", key: "herd" },
  { re: /geschirr[- ]?spüler[a-zäöüß]*|spül[- ]?maschine[a-zäöüß]*/, art: "position", key: "geschirrspueler" },
  { re: /wasch[- ]?maschine[a-zäöüß]*/, art: "position", key: "waschmaschine" },
  { re: /trockner[a-zäöüß]*/, art: "position", key: "trockner" },
  { re: /kühl[- ]?schr(a|ä)nk[a-zäöüß]*/, art: "position", key: "kuehlschrank" },
  { re: /dunst[- ]?abzug[a-zäöüß]*|abzugs?[- ]?haube[a-zäöüß]*|dunst[- ]?haube[a-zäöüß]*/, art: "position", key: "dunstabzug" },
  { re: /durchlauf[- ]?erhitzer[a-zäöüß]*/, art: "position", key: "durchlauferhitzer" },
  { re: /(bad|handtuch)[- ]?(heiz[a-zäöüß]*|wärmer[a-zäöüß]*)/, art: "position", key: "badheizkoerper" },
  { re: /\bwc\b|toilette[a-zäöüß]*|dusch[- ]?wc[a-zäöüß]*/, art: "position", key: "wc" }
];

const DIKTAT_FUELLWORTE = new Set(["und", "mit", "noch", "dann", "plus", "sowie", "dazu", "je", "jeweils", "stück", "stk", "x", "mal",
  "der", "die", "das", "den", "dem", "des", "im", "in", "am", "an", "auf", "für", "fuer", "eine", "ein", "einen", "bitte", "also",
  "hier", "da", "raum", "zimmer", "licht", "lampe", "lampen", "meter", "m", "metern", "fach", "anschluss", "anschlüsse", "dose", "dosen",
  "zusätzlich", "außerdem", "weitere", "weiteren", "neben", "über", "unter", "tür", "fenster", "bett", "esstisch", "sofa", "an", "von",
  "steuerung", "ohne", "temperatur", "temperatursensor", "einem", "pro", "s", "dimmbar", "dimmbare", "dimmbaren", "gedimmt",
  "schaltbar", "tunable", "white", "rgb", "rgbw", "weiß", "abgleich", "beleuchtung", "jeweils", "insgesamt", "davon"]);

function diktatZahlVor(segment) {
  const m = segment.match(/(\d+(?:\.\d+)?)\s*((?:[a-zäöüß]+\s*){0,2})$/);
  if (!m) return null;
  if (/\b(m|meter|metern|fach)\b/.test(m[2])) return null; // „3 Meter …“ / „2 fach …“ ist keine Anzahl
  return parseFloat(m[1]);
}

function diktatMeter(segment) {
  const m = segment.match(/(\d+(?:\.\d+)?)\s*(m|meter|metern)\b/);
  return m ? parseFloat(m[1]) : null;
}

/* Wertet den Text aus. Ergebnis:
   { aktionen: [...], unbekannt: [Textteile], text } – noch nichts am Raum geändert. */
function werteDiktatAus(text) {
  const t = diktatNormalisieren(text);
  // alle Treffer sammeln, Überschneidungen nach Musterreihenfolge auflösen
  const treffer = [];
  DIKTAT_MUSTER.forEach((muster, prio) => {
    const re = new RegExp(muster.re.source, "g");
    let m;
    while ((m = re.exec(t)) !== null) {
      if (!m[0]) { re.lastIndex++; continue; }
      treffer.push({ start: m.index, ende: m.index + m[0].length, text: m[0], muster, prio, m });
    }
  });
  treffer.sort((a, b) => a.start - b.start || a.prio - b.prio || (b.ende - b.start) - (a.ende - a.start));
  const gewaehlt = [];
  for (const tr of treffer) {
    const kollision = gewaehlt.find((g) => tr.start < g.ende && g.start < tr.ende);
    if (!kollision) { gewaehlt.push(tr); continue; }
    if (tr.prio < kollision.prio) { gewaehlt.splice(gewaehlt.indexOf(kollision), 1, tr); }
  }
  gewaehlt.sort((a, b) => a.start - b.start);

  const aktionen = [];
  const unbekannt = [];
  let ctx = null;          // { art: "schaltung"|"rollo"|"pille", obj }
  let letzteSchaltung = null;
  let pos = 0;
  const pruefeRest = (seg) => {
    const worte = seg.replace(/[,.]/g, " ").split(/\s+/).filter((w) => w && !/^\d+(\.\d+)?$/.test(w) && !DIKTAT_FUELLWORTE.has(w));
    if (worte.length) unbekannt.push(worte.join(" "));
  };

  gewaehlt.forEach((tr, i) => {
    const vor = t.slice(pos, tr.start);
    const nach = t.slice(tr.ende, i + 1 < gewaehlt.length ? gewaehlt[i + 1].start : t.length);
    // „2 fach“ direkt vor dem Schlüsselwort ist die Fachigkeit, die Anzahl steht davor
    const fachVor = vor.match(/(\d) fach\s*$/);
    const anzahl = diktatZahlVor(fachVor ? vor.slice(0, fachVor.index) : vor);
    pruefeRest(vor.replace(/(\d+(?:\.\d+)?)\s*$/, ""));
    pos = tr.ende;
    const mu = tr.muster;
    const n = anzahl !== null ? anzahl : 1;

    if (mu.art === "schaltung") {
      const anz = Math.max(1, Math.round(n));
      const gruppe = [];
      for (let k = 0; k < anz; k++) {
        const s = { art: "schaltung", typ: mu.typ, auslaesse: {}, stripes: [] };
        if (mu.typ === "knx") s.knxArt = /dimm/.test(nach) ? "Dimmen" : /tunable|weiß ?abgleich/.test(nach) ? "Tunable White" : /rgb/.test(nach) ? "RGB(W)" : "Schalten";
        aktionen.push(s);
        gruppe.push(s);
        letzteSchaltung = s;
      }
      ctx = { art: "schaltung", obj: letzteSchaltung, gruppe };
      return;
    }
    if (mu.art === "auslass" || mu.art === "stripe") {
      let s = ctx && ctx.art === "schaltung" ? ctx.obj : null;
      if (!s) {
        s = { art: "schaltung", typ: "aus", auslaesse: {}, stripes: [], angenommen: true };
        aktionen.push(s);
        letzteSchaltung = s;
        ctx = { art: "schaltung", obj: s };
      }
      // „zwei Wechselschaltungen mit je zwei Deckenauslässen“ -> für jede Schaltung der Gruppe
      const ziele = /\b(je|jeweils)\b/.test(vor) && ctx.gruppe ? ctx.gruppe : [s];
      for (const z of ziele) {
        if (mu.art === "stripe") {
          const meter = diktatMeter(vor) ?? diktatMeter(nach) ?? (anzahl !== null ? anzahl : 1);
          z.stripes.push(meter);
        } else {
          z.auslaesse[mu.key] = (z.auslaesse[mu.key] || 0) + Math.round(n);
        }
      }
      return;
    }
    if (mu.art === "stellen") {
      if (ctx && ctx.art === "schaltung" && anzahl !== null) ctx.obj.schaltstellen = Math.round(anzahl);
      return;
    }
    if (mu.art === "bedienung") {
      if (ctx && ctx.art === "rollo") {
        ctx.obj.bedienung = mu.wert === "schalter" ? "schalter" : "taster";
        ctx.obj.bedienAnzahl = anzahl !== null ? Math.round(anzahl) : 1;
        return;
      }
      if (ctx && ctx.art === "pille") {
        ctx.obj.ausfuehrung = mu.wert === "serientaster" ? "Serientaster" : "Taster";
        ctx.obj.tasterAnzahl = anzahl !== null ? Math.round(anzahl) : 1;
        return;
      }
      if (ctx && ctx.art === "schaltung" && ctx.obj.typ === "taster" && mu.wert !== "schalter") {
        if (anzahl !== null) ctx.obj.schaltstellen = Math.round(anzahl);
        return;
      }
      unbekannt.push(tr.text.trim());
      return;
    }
    if (mu.art === "melder") {
      // Melder direkt nach einem Handautomatik-Schalter gehört zu diesem
      if (ctx && ctx.art === "schaltung" && ctx.obj.typ === "handauto" && !ctx.obj.melderArt && mu.typ !== "rauchmelder") {
        ctx.obj.melderArt = mu.typ;
        ctx.obj.melderAnzahl = anzahl !== null ? Math.round(anzahl) : 1;
        return;
      }
      aktionen.push({ art: "melder", typ: mu.typ, anzahl: Math.round(n) });
      ctx = null;
      return;
    }
    if (mu.art === "knx") {
      const k = { art: "knx", typ: mu.typ, anzahl: Math.round(n) };
      if (mu.typ === "tastsensor") {
        const f = fachVor || nach.match(/^\s*(?:mit\s*)?(\d) fach/);
        if (f && ["1", "2", "4", "6", "8"].includes(f[1])) k.fach = f[1] + "-fach";
      }
      if (mu.typ === "glastaster") k.variante = /ohne/.test(nach.slice(0, 30)) ? "ohne Temperatursensor" : "mit Temperatursensor";
      aktionen.push(k);
      ctx = mu.typ === "pille" ? { art: "pille", obj: k } : null;
      return;
    }
    if (mu.art === "rollobedienung") {
      // „Rolloschalter“/„Rollotaster“: zum letzten Rollo, sonst neues Rollo
      let r = ctx && ctx.art === "rollo" ? ctx.obj : null;
      if (!r) { r = { art: "rollo", anzahl: 1, bedienung: "keine", bedienAnzahl: 1 }; aktionen.push(r); }
      r.bedienung = /schalter/.test(tr.text) ? "schalter" : "taster";
      r.bedienAnzahl = anzahl !== null ? Math.round(anzahl) : 1;
      ctx = { art: "rollo", obj: r };
      return;
    }
    if (mu.art === "rollo") {
      const r = { art: "rollo", anzahl: Math.max(1, Math.round(n)), bedienung: "keine", bedienAnzahl: 1 };
      aktionen.push(r);
      ctx = { art: "rollo", obj: r };
      return;
    }
    if (mu.art === "rahmen") {
      const fach = parseInt(tr.m[1] || tr.m[2] || tr.m[3], 10);
      if (fach >= 1 && fach <= 5) aktionen.push({ art: "position", key: "rahmen" + fach, anzahl: Math.round(n) });
      ctx = null;
      return;
    }
    if (mu.art === "position") {
      aktionen.push({ art: "position", key: mu.key, anzahl: Math.round(n) * (mu.faktor || 1), annahme: mu.annahme });
      ctx = null;
    }
  });
  pruefeRest(t.slice(pos));
  return { aktionen, unbekannt, text: t.trim() };
}

function diktatPositionsName(key) {
  return positionNachKey(key).b;
}

// Lesbare Vorschau-Zeilen
function diktatVorschau(ergebnis) {
  const zeilen = [];
  for (const a of ergebnis.aktionen) {
    if (a.art === "schaltung") {
      const t = schaltungTyp(a.typ);
      const teile = [];
      if (a.schaltstellen) teile.push(`${a.schaltstellen} ${t.stellenEinheit || "Schaltstellen"}`);
      if (a.melderArt) teile.push(`${a.melderAnzahl || 1}× ${melderArt(a.melderArt).b}`);
      if (a.knxArt) teile.push(a.knxArt);
      for (const x of BAU_AUSLAESSE) if (a.auslaesse[x.key]) teile.push(`${a.auslaesse[x.key]}× ${x.b}`);
      for (const m of a.stripes) teile.push(`LED-Stripe ${String(m).replace(".", ",")} m`);
      zeilen.push({ text: `${t.b}${teile.length ? ": " + teile.join(", ") : ""}`, hinweis: a.angenommen ? "Schaltungsart nicht genannt – Ausschaltung angenommen" : "" });
    } else if (a.art === "position") {
      zeilen.push({ text: `${a.anzahl}× ${diktatPositionsName(a.key)}`, hinweis: a.annahme || "" });
    } else if (a.art === "rollo") {
      const bd = a.bedienung === "keine" ? "ohne Schalter/Taster" : `mit ${a.bedienAnzahl}× ${a.bedienung === "schalter" ? "Schalter" : "Taster"}`;
      zeilen.push({ text: `${a.anzahl}× Rollo ${bd}` });
    } else if (a.art === "melder") {
      zeilen.push({ text: `${a.anzahl}× ${komponentenTyp(MELDER_TYPEN, a.typ).b}` });
    } else if (a.art === "knx") {
      const typ = komponentenTyp(KNX_TYPEN, a.typ);
      let zusatz = "";
      if (a.fach) zusatz = " " + a.fach;
      if (a.variante) zusatz = ", " + a.variante;
      if (a.typ === "pille" && a.tasterAnzahl) zusatz = ` mit ${a.tasterAnzahl}× ${a.ausfuehrung || "Taster"}`;
      zeilen.push({ text: `${a.anzahl}× ${typ.b}${zusatz}` });
    }
  }
  return zeilen;
}

// Übernimmt das Ergebnis in den Raum
function wendeDiktatAn(raum, ergebnis) {
  migriereRaum(raum);
  for (const a of ergebnis.aktionen) {
    if (a.art === "schaltung") {
      const t = schaltungTyp(a.typ);
      const s = { id: neueId(), typ: t.key, schaltstellen: Math.max(t.min, a.schaltstellen || t.min), wand: 0, decke: 0, steckdose: 0, strahler: 0, bemerkung: "", stripes: [] };
      if (t.melder) Object.assign(s, { melderArt: a.melderArt || "praesenz", melderAnzahl: a.melderAnzahl || 1, melderTyp: "", melderNr: "" });
      if (t.knx) s.knxArt = a.knxArt || "Schalten";
      for (const x of BAU_AUSLAESSE) s[x.key] = a.auslaesse[x.key] || 0;
      s.stripes = a.stripes.map((m) => ({ id: neueId(), meter: m, typ: "", nr: "" }));
      raum.schaltungen.push(s);
    } else if (a.art === "position") {
      raum.positionen[a.key] = (raum.positionen[a.key] || 0) + a.anzahl;
    } else if (a.art === "rollo") {
      raum.rollos.push(Object.assign(neuesRollo(a.anzahl, a.bedienung), { bedienAnzahl: a.bedienAnzahl || 1 }));
    } else if (a.art === "melder") {
      raum.melder.push(neueKomponente(komponentenTyp(MELDER_TYPEN, a.typ), { anzahl: a.anzahl }));
    } else if (a.art === "knx") {
      const werte = { anzahl: a.anzahl };
      if (a.fach) werte.fach = a.fach;
      if (a.variante) werte.variante = a.variante;
      if (a.typ === "pille") { werte.ausfuehrung = a.ausfuehrung || "Taster"; werte.tasterAnzahl = a.tasterAnzahl || 0; }
      raum.knx.push(neueKomponente(komponentenTyp(KNX_TYPEN, a.typ), werte));
    }
  }
}

/* ---------- Oberfläche im Raum ---------- */

function baueDiktatKarte(etage, raum) {
  const karte = document.createElement("details");
  karte.className = "section-card diktat-karte";
  karte.open = true;
  karte.innerHTML = `
    <summary><span>🎤 Diktat</span></summary>
    <textarea class="diktat-text" rows="3" placeholder="Ins Feld tippen, dann auf der Tastatur das Mikrofon antippen und sprechen, z. B.: 6 Steckdosen, 2 Cat 2-fach, Wechselschaltung mit 2 Deckenauslässen, Ausschaltung mit 4 Strahlern, Rollo mit Taster"></textarea>
    <div class="action-bar">
      <button type="button" class="btn btn-secondary diktat-auswerten" disabled>Auswerten</button>
      <button type="button" class="btn-danger-text diktat-leeren" hidden>Leeren</button>
    </div>
    <div class="diktat-vorschau" hidden></div>`;
  const ta = karte.querySelector(".diktat-text");
  const btnAus = karte.querySelector(".diktat-auswerten");
  const btnLeer = karte.querySelector(".diktat-leeren");
  const vorschau = karte.querySelector(".diktat-vorschau");
  const aktualisiere = () => {
    btnAus.disabled = !ta.value.trim();
    btnLeer.hidden = !ta.value.trim();
  };
  ta.addEventListener("input", () => { aktualisiere(); vorschau.hidden = true; });
  btnLeer.addEventListener("click", () => { ta.value = ""; vorschau.hidden = true; aktualisiere(); });
  btnAus.addEventListener("click", () => {
    const erg = werteDiktatAus(ta.value);
    const zeilen = diktatVorschau(erg);
    vorschau.hidden = false;
    vorschau.innerHTML = "";
    if (!zeilen.length) {
      vorschau.innerHTML = `<p class="hint">Nichts erkannt. Kurz und als Aufzählung sprechen, z. B. „3 Steckdosen, Ausschaltung mit 1 Deckenauslass“.</p>`;
      return;
    }
    const titel = document.createElement("div");
    titel.className = "kategorie-titel-klein";
    titel.textContent = "Erkannt – wird zum Raum hinzugefügt:";
    vorschau.appendChild(titel);
    const ul = document.createElement("ul");
    ul.className = "diktat-liste";
    for (const z of zeilen) {
      const li = document.createElement("li");
      li.textContent = "✓ " + z.text;
      if (z.hinweis) {
        const s = document.createElement("small");
        s.textContent = z.hinweis;
        li.appendChild(s);
      }
      ul.appendChild(li);
    }
    vorschau.appendChild(ul);
    if (erg.unbekannt.length) {
      const p = document.createElement("p");
      p.className = "diktat-unbekannt";
      p.textContent = "Nicht verstanden (bitte von Hand eintragen): " + erg.unbekannt.join(" · ");
      vorschau.appendChild(p);
    }
    const bar = document.createElement("div");
    bar.className = "action-bar";
    bar.innerHTML = `<button type="button" class="btn btn-primary">Übernehmen</button><button type="button" class="btn-danger-text">Verwerfen</button>`;
    bar.querySelector(".btn-primary").addEventListener("click", () => {
      wendeDiktatAn(raum, erg);
      autosave();
      const y = window.scrollY;
      oeffneRaum(etage, raum);
      window.scrollTo(0, y);
      const k = document.querySelector(".diktat-karte .diktat-vorschau");
      if (k) { k.hidden = false; k.innerHTML = `<p class="hint">✓ ${zeilen.length} Eintr${zeilen.length === 1 ? "ag" : "äge"} übernommen. Typen (z. B. Strahler) jetzt unten aus der Liste wählen.</p>`; }
    });
    bar.querySelector(".btn-danger-text").addEventListener("click", () => { vorschau.hidden = true; });
    vorschau.appendChild(bar);
  });
  return karte;
}
