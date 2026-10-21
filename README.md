# 🍲 Lezzetify (Work in Progress)

> Ein moderner Rezept-Manager mit integriertem Wochenplaner und asynchroner Nährwertberechnung. 
> *Dieses Projekt befindet sich aktuell in der Entwicklung für das Modul Webprogrammierung & Verteilte Systeme.*

## 🎯 Kernfunktionen

* **Nutzerverwaltung:** Registrierung und Anmeldung mit Benutzername; Rezepte und Essenspläne sind benutzerspezifisch.
* **Rezeptverwaltung:** Eigene Rezepte mit Zutaten, Beschreibung und Zubereitung speichern und ansehen.
* **Wochenplaner:** Rezepte einem Kochtag zuweisen und den Plan tage- oder wochenweise ansehen.
* **Einkaufsliste:** Zutaten der geplanten Gerichte für den ausgewählten Tag oder die Woche sammeln. Gleiche Zutaten werden zusammengefasst; Mengen werden nicht automatisch umgerechnet.
* **Nährwerte:** Deutsche Zutatenbegriffe können über Open Food Facts gesucht werden. Für belastbare Mengenberechnungen Zutaten mit Grammangabe eintragen und den passenden Produkttreffer auswählen. Die Datenbank ist gemeinschaftlich gepflegt; Werte können fehlen oder abweichen.
* **Community-Rezepte:** Vorgegebene Lezzetify-Rezepte und freiwillig geteilte Nutzerrezepte sind im Dashboard für alle angemeldeten Nutzer sichtbar. Rezeptdetails enthalten Zutaten, Zubereitung und Nährwerte aus bestätigten Open-Food-Facts-Treffern.
* **Geplant:** Asynchrone Nährwertberechnung über einen isolierten Node.js-Worker-Service.

## 🏗 Architektur-Konzept & Tech-Stack

Die Anwendung wird nach einer Microservice-Architektur aufgebaut:

* **Frontend:** HTML, CSS und Vanilla JavaScript. Gemeinsame Styles liegen in `library/css/global.css`; seitenbezogene Styles sind nach Seite in `styles/` getrennt. Die HTML-Seiten laden zuerst Bootstrap und die globalen Styles, danach ihre jeweilige Seiten-Datei.
* **Backend:** Node.js/Express-API für Authentifizierung, Rezepte und Essenspläne
* **Message Queue:** Asynchrone Kommunikation zwischen den Services via **RabbitMQ** (oder Kafka).
* **Datenbank:** Eigenständige Datenbank-Container (z.B. PostgreSQL oder MongoDB).
* **Infrastruktur:** Lokales Setup vollständig über Docker (`docker-compose`).

## 🚀 Aktueller Stand

Die Anwendung enthält aktuell eine einfache Frontend- und Backend-Implementierung. Nutzer, Rezepte und Essenspläne werden derzeit nur im Arbeitsspeicher gehalten und gehen beim Neustart des Backends verloren. Datenbank und weitere Services sind Teil des geplanten Ausbaus.

Die Nährwertsuche nutzt die Open Food Facts API ohne API-Schlüssel. Produktdaten werden gemäß Open Database License (ODbL) mit Quellenangabe angezeigt. Open Food Facts enthält vor allem verpackte Produkte; bei unverarbeiteten Zutaten kann es weniger oder keinen passenden Treffer geben.

Community-Rezepte, Nutzer, eigene Rezepte und Essenspläne werden aktuell nur im Arbeitsspeicher des Backend-Prozesses gehalten. Geteilte Rezepte sind deshalb für alle angemeldeten Konten auf demselben laufenden Server sichtbar, gehen aber beim Neustart des Backends verloren.
