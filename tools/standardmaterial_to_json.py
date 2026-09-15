#!/usr/bin/env python3
"""
Wandelt die Excel-Liste "Standardmaterial" (3 Spalten: Kategorie, Bezeichnung,
Standard-Mengeneinheit) in die standardmaterial.json um, die der Tab
"Standardmaterial" in der Aufmaß-App nutzt.

Verwendung:
    python3 standardmaterial_to_json.py /pfad/zu/Standardmaterial.xlsx standardmaterial.json

Hinweise:
- Erwartet ein Arbeitsblatt mit Kopfzeile in Zeile 1 und den Spalten
  Kategorie, Bezeichnung, Standard-Mengeneinheit (Reihenfolge wie geliefert).
- Komplett leere Zeilen und exakte Duplikate (gleiche Kategorie + Bezeichnung,
  Groß-/Kleinschreibung ignoriert) werden übersprungen.
- Die App zeigt Positionen nach Kategorie gruppiert an. Falls dieselbe
  Kategorie an mehreren, nicht zusammenhängenden Stellen in der Excel-Datei
  auftaucht (z. B. nachträglich eingefügte Zeilen), werden alle Positionen
  dieser Kategorie hier zusammengeführt (erste Fundstelle bestimmt die
  Reihenfolge) – sonst würde die Kategorie in der App doppelt erscheinen.
- Nach dem Ersetzen von standardmaterial.json in der App die CACHE_VERSION in
  sw.js hochzählen, damit installierte Apps die neue Liste laden.
"""
import json
import sys
from collections import OrderedDict

try:
    import openpyxl
except ImportError:
    sys.exit("Bitte zuerst installieren: pip install openpyxl")


def parse(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.active
    seen = set()
    grouped = OrderedDict()  # Kategorie -> Liste von Positionen, in erster Fundstellen-Reihenfolge
    for row in ws.iter_rows(min_row=2, values_only=True):
        kat, bez, einheit = (row + (None, None, None))[:3]
        if not bez or not einheit:
            continue
        bez = str(bez).strip()
        kat = str(kat).strip() if kat else ""
        einheit = str(einheit).strip()
        key = (kat.lower(), bez.lower())
        if key in seen:
            continue
        seen.add(key)
        grouped.setdefault(kat, []).append({"k": kat, "b": bez, "e": einheit})
    return [item for gruppe in grouped.values() for item in gruppe]


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    quelle, ziel = sys.argv[1], sys.argv[2]
    items = parse(quelle)
    with open(ziel, "w", encoding="utf-8") as out:
        json.dump(items, out, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(items)} Positionen geschrieben nach {ziel}")


if __name__ == "__main__":
    main()
