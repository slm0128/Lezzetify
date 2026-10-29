# Lezzetify

Ein Rezept-Manager mit Nutzerkonten, Wochenplanung, Einkaufsliste, Community-Rezepten und automatischen Nährwertschätzungen.

## Funktionen

* Registrierung und Anmeldung; Passwörter werden mit bcrypt gehasht.
* Eigene Rezepte anlegen, bearbeiten und löschen.
* Rezepte für bestimmte Tage einplanen und Zutaten als Einkaufsliste ansehen.
* Essensplan als privaten iCal-Kalender abonnieren; der wöchentliche Einkaufstermin mit Einkaufsliste ist auf einen Wochentag konfigurierbar.
* Rezepte und Favoriten pro Nutzer dauerhaft speichern.
* Rezepte freiwillig mit der Community teilen.
* Automatische KI-Nährwertschätzungen pro Portion für eigene und Community-Rezepte.

## Architektur

* **Frontend:** HTML, CSS, Bootstrap und Vanilla JavaScript; wird von einem eigenen Nginx-Container ausgeliefert.
* **API-Service:** Node.js/Express für Authentifizierung, Rezepte, Favoriten und Essenspläne.
* **Nährwert-Service:** separater Node.js-Worker; die API sendet Rezeptschätzungen über RabbitMQ und erhält KI-Ergebnisse von OpenRouter über eine temporäre Reply-Queue.
* **Datenbank:** PostgreSQL in einem eigenen Container. Nutzer, Rezepte, Favoriten, Nährwertschätzungen und Essenspläne bleiben über Neustarts hinweg erhalten.
* **Message Broker:** RabbitMQ.

## Mit Docker Compose starten

Voraussetzungen: Docker Desktop mit laufender Docker Engine und Docker Compose.

1. `.env.example` nach `.env` kopieren.
2. `POSTGRES_PASSWORD`, `RABBITMQ_DEFAULT_PASS` und `JWT_SECRET` in `.env` durch eigene Werte ersetzen. Trage dort außerdem deinen OpenRouter-API-Schlüssel als `OPENROUTER_API_KEY` und ein kostenloses Modell mit `:free`-Suffix als `OPENROUTER_MODEL` ein. Standardmäßig wird `google/gemma-4-26b-a4b-it:free` verwendet; OpenRouter erhält zusätzlich `google/gemma-4-31b-it:free` und den kostenlosen Router `openrouter/free` als Fallbacks. Die Anfrage setzt außerdem einen maximalen Preis von null für Ein- und Ausgabe-Tokens. Das Backend weist kostenpflichtige Modell-IDs zurück; so kann die Anwendung keine kostenpflichtige Modellvariante verwenden. Free-Modelle können trotzdem zeitweise ausgelastet sein oder Nutzungslimits haben. Für die Passwörter im Compose-URL-Format nur URL-sichere Zeichen verwenden. Der JWT-Schlüssel muss mindestens 32 zufällige Bytes enthalten; erzeugen lässt er sich zum Beispiel mit `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
3. Im Projektverzeichnis starten:

   ```powershell
   docker compose up --build
   ```

4. Die Anwendung unter <http://localhost:8000> öffnen. Die API ist unter <http://localhost:3000> erreichbar. RabbitMQ Management ist unter <http://localhost:15672> verfügbar; dort gelten die Zugangsdaten aus `.env`.

Im Wochenplan kannst du den Einkaufstag einstellen und den Kalender mit dem `webcal`-Button abonnieren. Alternativ lässt sich der private iCal-Link kopieren. Der Feed enthält geplante Gerichte und einen Einkaufstermin am gewählten Wochentag mit den Zutaten der geplanten Gerichte für die folgenden sieben Tage. `CALENDAR_TIMEZONE` steuert, wann der nächste Einkaufstag. beginnt (Standard: `Europe/Berlin`). Der Link funktioniert wie ein Passwort: Teile ihn nur mit Personen, die deinen Essensplan sehen dürfen. Über **Link erneuern** kannst du den Zugriff des bisherigen Links widerrufen. Für einen von anderen Geräten erreichbaren Feed muss `CALENDAR_PUBLIC_URL` in `.env` auf die öffentlich erreichbare Basis-URL der API gesetzt werden (lokal: `http://localhost:3000`).

Optional kann ein lokales Testkonto mit `TEST_USER_ENABLED=true`, `TEST_USER_NAME`, `TEST_USER_EMAIL` und `TEST_USER_PASSWORD` in `.env` beim API-Start angelegt werden. Bereits existierende E-Mail-Adressen werden nicht überschrieben. Das Konto wird nur erstellt, wenn es noch fehlt. Verwende diese Option nicht in öffentlich erreichbaren oder produktiven Umgebungen; das Testkonto umgeht bei der erstmaligen Anlage die Mindestlänge der normalen Registrierung.

Compose wartet auf die Healthchecks von PostgreSQL und RabbitMQ, bevor die API beziehungsweise der Worker starten. Die API und der Nährwert-Worker besitzen eigene Healthchecks. PostgreSQL- und RabbitMQ-Daten liegen in benannten Docker-Volumes.

Zum Stoppen `Ctrl+C`, danach `docker compose down`. Die Datenvolumes bleiben dabei erhalten. Ein bewusstes `docker compose down -v` löscht die gespeicherten Daten.

## Entwicklung ohne Container

Das Backend setzt eine erreichbare PostgreSQL- und RabbitMQ-Instanz sowie dieselben Umgebungsvariablen wie oben voraus. Mit `npm ci` im Ordner `backend` werden die Abhängigkeiten installiert; `npm start` startet die API, `node nutrition-worker.js` separat den Worker. `.env` wird aus dem Projektstamm geladen und gehört nicht ins Git-Repository.

## Authentifizierung und Konfiguration

JWTs sind auf den Algorithmus HS256 festgelegt, laufen nach einer Stunde ab und werden mit einem verpflichtenden Umgebungsvariablen-Schlüssel signiert. Der API-Start schlägt fehl, wenn `JWT_SECRET` fehlt oder weniger als 32 Bytes hat. Passwörter müssen mindestens 12 Zeichen und höchstens 72 Bytes umfassen; Registrierungs- und Login-Versuche sind begrenzt. Zugangsdaten und Schlüssel gehören ausschließlich in die ignorierte `.env`-Datei, nicht in den Quellcode.

Die Nährwertangaben werden beim Laden der eigenen und Community-Rezepte automatisch pro Portion über kostenlose OpenRouter-Modelle geschätzt und in den Rezeptkarten, Details und Essensplänen angezeigt. Die Werte sind keine verifizierten Produktdaten und können ungenau sein. Der OpenRouter-Schlüssel wird nur an den Nährwert-Worker übergeben und darf nicht im Frontend oder in Git abgelegt werden. Kostenlose Modelle können Rate-Limits oder vorübergehende Provider-Ausfälle haben; in diesem Fall wird das konfigurierte kostenlose Fallback versucht.
