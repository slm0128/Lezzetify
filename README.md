# Lezzetify

Ein Rezept-Manager mit Nutzerkonten, Wochenplanung, Einkaufsliste, Community-Rezepten und Nährwertsuche.

## Funktionen

* Registrierung und Anmeldung; Passwörter werden mit bcrypt gehasht.
* Eigene Rezepte anlegen, bearbeiten und löschen.
* Rezepte für bestimmte Tage einplanen und Zutaten als Einkaufsliste ansehen.
* Rezepte und Favoriten pro Nutzer dauerhaft speichern.
* Rezepte freiwillig mit der Community teilen.
* Open-Food-Facts-Suche für Nährwerte. Die Produktdaten sind gemeinschaftlich gepflegt; Werte können fehlen oder abweichen.

## Architektur

* **Frontend:** HTML, CSS, Bootstrap und Vanilla JavaScript; wird von einem eigenen Nginx-Container ausgeliefert.
* **API-Service:** Node.js/Express für Authentifizierung, Rezepte, Favoriten und Essenspläne.
* **Nährwert-Service:** separater Node.js-Worker; die API sendet Suchanfragen über RabbitMQ und erhält Antworten über eine temporäre Reply-Queue.
* **Datenbank:** PostgreSQL in einem eigenen Container. Nutzer, Rezepte, Favoriten, Nährwert-Produkte und Essenspläne bleiben über Neustarts hinweg erhalten.
* **Message Broker:** RabbitMQ.

## Mit Docker Compose starten

Voraussetzungen: Docker Desktop mit laufender Docker Engine und Docker Compose.

1. `.env.example` nach `.env` kopieren.
2. `POSTGRES_PASSWORD`, `RABBITMQ_DEFAULT_PASS` und `JWT_SECRET` in `.env` durch eigene Werte ersetzen. Für die Passwörter im Compose-URL-Format nur URL-sichere Zeichen verwenden. Der JWT-Schlüssel muss mindestens 32 zufällige Bytes enthalten; erzeugen lässt er sich zum Beispiel mit `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
3. Im Projektverzeichnis starten:

   ```powershell
   docker compose up --build
   ```

4. Die Anwendung unter <http://localhost:8000> öffnen. Die API ist unter <http://localhost:3000> erreichbar. RabbitMQ Management ist unter <http://localhost:15672> verfügbar; dort gelten die Zugangsdaten aus `.env`.

Compose wartet auf die Healthchecks von PostgreSQL und RabbitMQ, bevor die API beziehungsweise der Worker starten. Die API und der Nährwert-Worker besitzen eigene Healthchecks. PostgreSQL- und RabbitMQ-Daten liegen in benannten Docker-Volumes.

Zum Stoppen `Ctrl+C`, danach `docker compose down`. Die Datenvolumes bleiben dabei erhalten. Ein bewusstes `docker compose down -v` löscht die gespeicherten Daten.

## Entwicklung ohne Container

Das Backend setzt eine erreichbare PostgreSQL- und RabbitMQ-Instanz sowie dieselben Umgebungsvariablen wie oben voraus. Mit `npm ci` im Ordner `backend` werden die Abhängigkeiten installiert; `npm start` startet die API, `node nutrition-worker.js` separat den Worker. `.env` wird aus dem Projektstamm geladen und gehört nicht ins Git-Repository.

## Authentifizierung und Konfiguration

JWTs sind auf den Algorithmus HS256 festgelegt, laufen nach einer Stunde ab und werden mit einem verpflichtenden Umgebungsvariablen-Schlüssel signiert. Der API-Start schlägt fehl, wenn `JWT_SECRET` fehlt oder weniger als 32 Bytes hat. Passwörter müssen mindestens 12 Zeichen und höchstens 72 Bytes umfassen; Registrierungs- und Login-Versuche sind begrenzt. Zugangsdaten und Schlüssel gehören ausschließlich in die ignorierte `.env`-Datei, nicht in den Quellcode.

Die Nährwertsuche nutzt Open Food Facts ohne API-Schlüssel. Produktdaten werden mit Quellenangabe angezeigt und unterliegen der Open Database License (ODbL). Open Food Facts enthält vor allem verpackte Produkte.
