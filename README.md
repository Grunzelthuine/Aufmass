# Material-Aufmaß App

Web-App (HTML/JS, PWA) zur Erfassung von Materialaufmaßen auf Baustellen –
Kunde/Baustelle, Datum, Arbeitsbeschreibung und Materialliste (aus Ihrer
DATANORM-Artikelliste oder frei eingetragen), Export als PDF.

## Funktionen

- Kundendaten, Ansprechpartner, Adresse, Baustelle/Bauvorhaben, Datum, Arbeitsbeschreibung
- Material aus drei Quellen:
  - **Aus Liste**: Volltextsuche über den Materialstamm aus Ihrer DATANORM-Datei
    (`materials-chunks/`, aktuell ca. 1,24 Mio. Artikel mit Artikelnummer,
    Bezeichnung und Einheit – bewusst **ohne Preise**)
  - **Standardmaterial**: nach Kategorie durchsuchbare, kuratierte Liste
    typischer Elektro-Standardartikel (`standardmaterial.json`, aktuell 194
    Positionen in 12 Kategorien) – ohne Suchbegriff wird die komplette Liste
    gruppiert nach Kategorie angezeigt, zum Durchstöbern
  - **Freitext** mit Bezeichnung, Menge und Einheit
- Menge bei bereits hinzugefügtem Material direkt anpassbar: Plus-/Minus-
  Buttons für schnelle Schritte von 1, bei Positionen mit Einheit „m“
  zusätzlich ein Zusatzfeld, um eine weitere Länge draufzuaddieren (z. B.
  25 m + noch 10 m eintippen → 35 m), ohne selbst rechnen zu müssen
- Beliebig viele Aufmaße werden lokal auf dem Gerät gespeichert (localStorage),
  automatisches Speichern bei jeder Änderung
- PDF-Export je Aufmaß (Kundendaten, Datum, Arbeitsbeschreibung, Materialliste
  mit Pos., Bezeichnung, Art.-Nr., Menge, Einheit) – **keine Preise, keine
  Gesamtsumme**
- Funktioniert als installierte PWA vom Homescreen, auch offline auf der
  Baustelle (Service Worker cached App + Materialstamm)
- Erkennt neue, deployte Versionen automatisch und zeigt einen Hinweis
  „Neue Version verfügbar“ mit Button zum Aktualisieren (siehe unten)
- PDF-Dateiname: `Aufmass_<Kunde>_<aktuelles Datum>.pdf` (das Datum ist der
  Export-Zeitpunkt, nicht das im Formular gewählte Aufmaß-Datum)
- **Packlisten**: eigener Bereich auf der Übersichtsseite (eigenes „+“ neben
  „Packlisten“), unabhängig von den Aufmaßen. Eine Packliste hat eine freie
  Bezeichnung (z. B. „Baustelle Müller / KW38“) und ein Datum und greift auf
  dieselben drei Materialquellen zu wie ein Aufmaß (Aus Liste, Standardmaterial,
  Freitext) – inklusive der Mengen-Plus-/Minus-Buttons und der „+m“-Zusatzeingabe.
  Jede Position lässt sich über einen Haken abhaken, sobald sie in den Bulli
  gepackt wurde; abgehakte Positionen wandern in einen einklappbaren Bereich
  „Bereits gepackt“ statt gelöscht zu werden, lassen sich also jederzeit wieder
  zurückholen. Packlisten werden wie Aufmaße automatisch lokal gespeichert,
  haben aber keinen eigenen PDF-Export.

## Struktur

```
index.html      Oberfläche
style.css       Design
app.js          Logik (Formulare, Speicherung, PDF-Export)
manifest.json   PWA-Manifest
sw.js           Service Worker (Offline-Cache)
materials-chunks/      Materialstamm "Aus Liste", aus Ihrer DATANORM-Datei erzeugt
                       (mehrere Dateien, siehe unten)
standardmaterial.json  Materialstamm "Standardmaterial", aus der Excel-Liste erzeugt
icons/          App-Icons
vendor/         jsPDF + jsPDF-AutoTable (lokal eingebunden, für Offline-PDF-Export)
tools/datanorm_to_json.py         Skript zum (Neu-)Erzeugen von materials-chunks/ aus einer DATANORM-Datei
tools/standardmaterial_to_json.py Skript zum (Neu-)Erzeugen von standardmaterial.json aus der Excel-Liste
```

### Warum `materials-chunks/` statt einer einzelnen `materials.json`

Ihr aktueller DATANORM-Vollsortiments-Katalog hat ca. 1,24 Millionen Artikel
(vorher, mit der kleineren Auswahlliste, waren es ca. 16.500). Als eine
einzelne JSON-Datei wären das über 100 MB – zu groß für eine einzelne Datei
bei GitHub (Limit: 100 MB pro Datei) und unnötig langsam beim ersten Laden.
Das Umwandlungs-Skript erzeugt deshalb mehrere kleinere Dateien
(`materials-chunk-0001.json` usw., je ca. 12 MB) plus eine
`materials-manifest.json` mit einer Versionsnummer. Die App lädt beim Start
alle Chunk-Dateien und hält sie wie zuvor als durchsuchbare Liste im
Speicher (Laden + Such-Index aufbauen dauert unter 3 Sekunden). Der Service
Worker cached die Chunk-Dateien wie jede andere Datei auch, sodass sie nur
beim allerersten Start bzw. nach einem neuen Artikelstamm tatsächlich übers
Netz geladen werden müssen – am besten also die erste Nutzung nach einem
Update im WLAN machen.

## Materialstamm aktualisieren

Wenn Sie eine neue DATANORM-Datei von Ihrem Großhändler bekommen:

```
python3 tools/datanorm_to_json.py Datanorm.001 materials-chunks
```

Das Skript überschreibt den Inhalt des Ordners `materials-chunks/` mit den
neuen Chunk-Dateien und einer neuen `materials-manifest.json` (samt neuer
Versionsnummer, damit die App die Änderung erkennt).

Wenn Sie die Standardmaterial-Liste (Excel) erweitert oder geändert haben:

```
python3 tools/standardmaterial_to_json.py Standardmaterial.xlsx standardmaterial.json
```

Danach jeweils in `sw.js` die `CACHE_VERSION` hochzählen (z. B. `aufmass-v7`),
damit bereits installierte Apps die neue Datei laden, statt die alte aus dem
Offline-Cache zu behalten.

## Update-Mechanismus

Bei jedem Deploy mit neuer `CACHE_VERSION` in `sw.js`:

1. Wenn jemand die App öffnet (oder sie aus dem Hintergrund wieder in den
   Vordergrund kommt), prüft die App im Hintergrund auf eine neue Version.
2. Sobald eine neue Version fertig heruntergeladen ist, erscheint unten der
   Hinweis „Neue Version verfügbar“ mit einem Button „Jetzt aktualisieren“.
3. Erst nach Klick auf diesen Button wird die neue Version aktiviert und die
   Seite einmal automatisch neu geladen – laufende Eingaben gehen dabei nicht
   verloren, da alles laufend automatisch in den gespeicherten Aufmaßen
   gesichert wird.

Ohne Klick bleibt die bisherige Version aktiv, bis der Nutzer aktualisiert –
so wird niemand mitten in der Eingabe überrascht.

## Hosting über GitHub Pages (wie Raumbuch- und Stundenzettel-App)

1. Neues Repository anlegen, z. B. `Aufmass-App` (Account: Grunzelthuine)
2. Alle Dateien aus diesem Ordner in das Repository hochladen (Struktur wie oben, `index.html` im Root)
3. In den Repository-Einstellungen unter **Pages** die Quelle auf den Branch
   mit den Dateien stellen (z. B. `main`, Ordner `/root`)
4. Die von GitHub angezeigte URL (z. B. `https://grunzelthuine.github.io/Aufmass-App/`)
   auf dem iPhone in Safari öffnen und über **Teilen → Zum Home-Bildschirm**
   als App installieren

## Hinweise

- Alle Daten bleiben lokal auf dem Gerät (kein Server, kein Login). Bei
  Gerätewechsel müssen die Aufmaße daher vorher als PDF gesichert werden –
  es gibt aktuell keine Cloud-Synchronisierung.
- Aus der DATANORM-Datei werden nur Artikelnummer, Bezeichnung und Einheit
  übernommen – Preise werden beim Einlesen bewusst nicht mit übernommen und
  tauchen weder in der App noch im PDF auf.
- Der komplette Materialstamm "Aus Liste" muss einmalig (bzw. nach jedem
  Update mit neuem Artikelstamm) komplett heruntergeladen werden (aktuell
  ca. 100 MB) – das sollte möglichst im WLAN passieren. Danach läuft die
  Suche auch offline auf der Baustelle, ohne dass die App die Daten erneut
  herunterladen muss.
- iOS/Safari öffnet ein per `doc.save()` erzeugtes PDF ggf. in einem neuen Tab
  statt es direkt herunterzuladen – von dort lässt es sich über „Teilen“
  speichern oder versenden.
