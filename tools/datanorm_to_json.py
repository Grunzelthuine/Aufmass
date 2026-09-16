#!/usr/bin/env python3
"""
Wandelt eine DATANORM-4.0-Datei (Hauptsatzdatei, z. B. "Datanorm.001" oder
"DATANORM.001") in den Materialstamm für die "Aus Liste"-Suche der
Material-Aufmaß-App um.

Verwendung:
    python3 datanorm_to_json.py /pfad/zu/Datanorm.001 /pfad/zu/ausgabeordner

Erzeugt im Ausgabeordner:
    materials-manifest.json      Übersicht: Version, Anzahl, Liste der Chunks
    materials-chunk-0001.json    Artikel-Chunks (je ca. 150.000 Artikel)
    materials-chunk-0002.json
    ...

Hinweise:
- Es wird nur die Hauptdatei (A-Sätze) ausgewertet: Artikelnummer, Kurztext 1+2
  und Mengeneinheit. Preise werden bewusst NICHT übernommen (die App zeigt
  keine Preise und keine Summen an) – eine DatPreis.xxx-Datei wird daher nicht
  benötigt.
- Encoding: DATANORM-Dateien sind i. d. R. in CP850 (DOS/westeuropäisch)
  kodiert. Falls die Ausgabe kaputte Umlaute zeigt, hier die Kodierung anpassen.
- Warum mehrere Chunk-Dateien statt einer materials.json wie früher: bei sehr
  großen Vollsortiment-Katalogen (mehrere hunderttausend bis über eine Million
  Artikel) würde eine einzelne JSON-Datei zu groß für GitHub (Limit 100 MB pro
  Datei) und zu langsam zum Laden auf dem iPhone. Die App liest die Chunks
  daher einmalig ein und baut daraus eine lokale IndexedDB-Datenbank auf dem
  Gerät auf; danach werden die Chunk-Dateien nicht mehr benötigt.
- Die "version" im Manifest ist ein Hash über den gesamten Artikelbestand.
  Ändert sich der Bestand (neue DATANORM-Datei), ändert sich automatisch auch
  die Version, und die App erkennt beim nächsten Start, dass sie ihre lokale
  Datenbank aktualisieren muss.
- Wenn ein neuer Artikelstamm vom Großhändler kommt: einfach dieses Skript
  erneut mit der neuen Datanorm-Datei ausführen, die alten
  materials-manifest.json / materials-chunk-*.json in der App durch die neuen
  ersetzen, und danach die CACHE_VERSION in sw.js hochzählen.
"""
import hashlib
import json
import os
import sys

ARTIKEL_PRO_CHUNK = 150_000


def parse(path, encoding="cp850"):
    artikel = []
    with open(path, "r", encoding=encoding, errors="replace") as f:
        for line in f:
            line = line.rstrip("\r\n")
            if not line or line[0] != "A":
                continue
            p = line.split(";")
            if len(p) < 9:
                continue
            nr = p[2].strip()
            txt1 = p[4].strip()
            txt2 = p[5].strip()
            einheit = p[8].strip() or "ST"
            bezeichnung = (txt1 + (" " + txt2 if txt2 else "")).strip()
            if not nr or not bezeichnung:
                continue
            artikel.append({"n": nr, "b": bezeichnung, "e": einheit})
    return artikel


def schreibe_chunks(artikel, zielordner):
    os.makedirs(zielordner, exist_ok=True)

    # Version = Hash über den gesamten (sortierten) Artikelbestand, damit sich
    # die Version bei jeder inhaltlichen Änderung ändert (neue/andere Artikel).
    hasher = hashlib.sha256()
    for a in artikel:
        hasher.update(f"{a['n']}\x1f{a['b']}\x1f{a['e']}\n".encode("utf-8"))
    version = hasher.hexdigest()[:16]

    chunk_dateien = []
    anzahl_chunks = max(1, (len(artikel) + ARTIKEL_PRO_CHUNK - 1) // ARTIKEL_PRO_CHUNK)
    for i in range(anzahl_chunks):
        start = i * ARTIKEL_PRO_CHUNK
        ende = start + ARTIKEL_PRO_CHUNK
        teil = artikel[start:ende]
        dateiname = f"materials-chunk-{i + 1:04d}.json"
        pfad = os.path.join(zielordner, dateiname)
        with open(pfad, "w", encoding="utf-8") as out:
            json.dump(teil, out, ensure_ascii=False, separators=(",", ":"))
        groesse_mb = os.path.getsize(pfad) / (1024 * 1024)
        print(f"  {dateiname}: {len(teil)} Artikel, {groesse_mb:.1f} MB")
        chunk_dateien.append(dateiname)

    manifest = {
        "version": version,
        "count": len(artikel),
        "chunks": chunk_dateien,
    }
    manifest_pfad = os.path.join(zielordner, "materials-manifest.json")
    with open(manifest_pfad, "w", encoding="utf-8") as out:
        json.dump(manifest, out, ensure_ascii=False, indent=2)

    return manifest


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    quelle, zielordner = sys.argv[1], sys.argv[2]
    artikel = parse(quelle)
    if not artikel:
        sys.exit("Keine Artikel (A-Sätze) in der Datei gefunden – Encoding/Format prüfen.")
    manifest = schreibe_chunks(artikel, zielordner)
    print(f"\n{manifest['count']} Artikel in {len(manifest['chunks'])} Chunk(s) geschrieben nach {zielordner}")
    print(f"Version: {manifest['version']}")


if __name__ == "__main__":
    main()
