# Material-Aufmaß App

Web-App (HTML/JS, PWA) zur Erfassung von Materialaufmaßen auf Baustellen –
Kunde/Baustelle, Datum, Arbeitsbeschreibung und Materialliste (aus Ihrer
DATANORM-Artikelliste oder frei eingetragen), Export als PDF.

## Funktionen

- Kundendaten, Ansprechpartner, Adresse, Baustelle/Bauvorhaben, Datum, Arbeitsbeschreibung
- Material entweder
  - **aus Liste**: Suche über den Materialstamm aus Ihrer DATANORM-Datei
    (`materials.json`, aktuell ca. 16.500 Artikel mit Artikelnummer,
    Bezeichnung und Einheit – bewusst **ohne Preise**), oder
  - **als Freitext** mit Bezeichnung, Menge und Einheit
- Beliebig viele Aufmaße werden lokal auf dem Gerät gespeichert (localStorage),
  automatisches Speichern bei jeder Änderung
- PDF-Export je Aufmaß (Kundendaten, Datum, Arbeitsbeschreibung, Materialliste
  mit Pos., Bezeichnung, Art.-Nr., Menge, Einheit) – **keine Preise, keine
  Gesamtsumme**
- Funktioniert als installierte PWA vom Homescreen, auch offline auf der
  Baustelle (Service Worker cached App + Materialstamm)

## Struktur

```
index.html      Oberfläche
style.css       Design
app.js          Logik (Formulare, Speicherung, PDF-Export)
manifest.json   PWA-Manifest
sw.js           Service Worker (Offline-Cache)
materials.json  Materialstamm, aus Ihrer DATANORM-Datei erzeugt
icons/          App-Icons
vendor/         jsPDF + jsPDF-AutoTable (lokal eingebunden, für Offline-PDF-Export)
tools/datanorm_to_json.py   Skript zum (Neu-)Erzeugen von materials.json aus einer DATANORM-Datei
```

## Materialstamm aktualisieren

Wenn Sie eine neue DATANORM-Datei von Ihrem Großhändler bekommen:

```
python3 tools/datanorm_to_json.py Datanorm.001 materials.json
```

Danach in `sw.js` die `CACHE_VERSION` hochzählen (z. B. `aufmass-v2`), damit
bereits installierte Apps die neue Datei laden, statt die alte aus dem
Offline-Cache zu behalten.

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
- iOS/Safari öffnet ein per `doc.save()` erzeugtes PDF ggf. in einem neuen Tab
  statt es direkt herunterzuladen – von dort lässt es sich über „Teilen“
  speichern oder versenden.
