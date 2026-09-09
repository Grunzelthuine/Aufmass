#!/usr/bin/env python3
"""
Wandelt eine DATANORM-4.0-Datei (Hauptsatzdatei, z. B. "Datanorm.001") in die
materials.json um, die von der Material-Aufmaß-App genutzt wird.

Verwendung:
    python3 datanorm_to_json.py /pfad/zu/Datanorm.001 /pfad/zu/materials.json

Hinweise:
- Es wird nur die Hauptdatei (A-Sätze) ausgewertet: Artikelnummer, Kurztext 1+2
  und Mengeneinheit. Preise werden bewusst NICHT übernommen (die App zeigt
  keine Preise und keine Summen an) – die DatPreis.xxx-Datei wird daher nicht
  benötigt.
- Encoding: DATANORM-Dateien sind i. d. R. in CP850 (DOS/westeuropäisch)
  kodiert. Falls die Ausgabe kaputte Umlaute zeigt, hier die Kodierung anpassen.
- Wenn ein neuer Artikelstamm vom Großhändler kommt: einfach diese Datei
  erneut mit dem neuen Datanorm.xxx ausführen und materials.json in der App
  ersetzen (danach die CACHE_VERSION in sw.js hochzählen, damit installierte
  Apps die neue Datei laden).
"""
import json
import sys


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


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    quelle, ziel = sys.argv[1], sys.argv[2]
    artikel = parse(quelle)
    with open(ziel, "w", encoding="utf-8") as out:
        json.dump(artikel, out, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(artikel)} Artikel geschrieben nach {ziel}")


if __name__ == "__main__":
    main()
