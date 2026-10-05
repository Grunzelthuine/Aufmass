# Cloud-Sync einrichten (einmalig, ca. 10 Minuten)

## 1. Projekt anlegen
1. https://console.firebase.google.com öffnen, mit deinem Google-Konto anmelden.
2. **Projekt erstellen**, Name z. B. `aufmass-app`. Google Analytics kannst du **deaktivieren**.

## 2. Anmeldung per E-Mail aktivieren
1. Links **Authentication** → **Jetzt starten**.
2. Reiter **Anmeldemethode** → **E-Mail/Passwort** → aktivieren → **Speichern**.

## 3. Datenbank anlegen
1. Links **Firestore Database** → **Datenbank erstellen**.
2. Standort **europe-west3 (Frankfurt)** wählen.
3. **Produktionsmodus** wählen → erstellen.
4. Reiter **Regeln**: den kompletten Inhalt durch den Inhalt der Datei `firestore.rules` ersetzen → **Veröffentlichen**.
   (Damit kann jeder Benutzer nur seine eigenen Daten lesen/schreiben.)

## 4. Web-App registrieren und Konfiguration eintragen
1. Zahnrad oben links → **Projekteinstellungen** → Reiter **Allgemein** → unten bei „Meine Apps“ das **Web-Symbol `</>`**.
2. App-Name z. B. `Aufmass`, „Firebase Hosting“ **nicht** ankreuzen → **App registrieren**.
3. Es erscheint ein Block `const firebaseConfig = { apiKey: ..., authDomain: ..., ... }`.
4. In der Datei `firebase-config.js` die Zeile `window.FIREBASE_CONFIG = null;` ersetzen durch
   `window.FIREBASE_CONFIG = { ...die Werte aus dem Block... };`
   (oder die Werte an Claude schicken, dann wird die Datei fertig geliefert).

## 5. Hochladen und anmelden
1. Alle Dateien (inkl. Ordner `vendor/` mit den drei neuen Firebase-Dateien) in den lokalen Git-Klon kopieren, Commit, Push.
2. In der App oben auf **☁ Cloud-Sync** tippen → beim ersten Mal **Neues Konto** (E-Mail + Passwort), auf weiteren Geräten **Anmelden** mit denselben Daten.
3. Kollegen legen sich in der App ihr eigenes Konto an und sehen nur ihre eigenen Daten.

## Optional
- Wenn alle Konten angelegt sind, kann unter Authentication → Einstellungen → Benutzeraktionen die Registrierung neuer Konten abgeschaltet werden (dann legst du neue Konten in der Konsole unter „Benutzer“ an).
- Kosten: Für diesen Umfang reicht der kostenlose Spark-Tarif.
