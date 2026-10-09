# 🍲 Lezzetify (Work in Progress)

> Ein moderner Rezept-Manager mit integriertem Wochenplaner und asynchroner Nährwertberechnung. 
> *Dieses Projekt befindet sich aktuell in der Entwicklung für das Modul Webprogrammierung & Verteilte Systeme.*

## 🎯 Geplante Kernfunktionen

* **Nutzerverwaltung:** Authentifizierung für mehrere User zur Verwaltung eigener, privater Daten (Rezepte und Pläne).
* **Rezept-Management (CRUD):** Anlegen, Bearbeiten, Ansehen und Löschen von eigenen Rezepten inklusive Zutatenlisten und Mengenangaben.
* **Wochenplaner:** Interaktive Zuweisung der gespeicherten Rezepte zu spezifischen Wochentagen.
* **Asynchrone Nährwertberechnung:** Ein isolierter Node.js-Worker-Service berechnet im Hintergrund automatisch die Makronährstoffe der angelegten Rezepte.

## 🏗 Architektur-Konzept & Tech-Stack

Die Anwendung wird nach einer Microservice-Architektur aufgebaut:

* **Frontend:** JS-Framework (Auswahl ausstehend)
* **Backend:** Mehrere Node.js-Services (Main-API für CRUD & Auth, separater Worker-Service für externe APIs)
* **Message Queue:** Asynchrone Kommunikation zwischen den Services via **RabbitMQ** (oder Kafka).
* **Datenbank:** Eigenständige Datenbank-Container (z.B. PostgreSQL oder MongoDB).
* **Infrastruktur:** Lokales Setup vollständig über Docker (`docker-compose`).

## 🚀 Aktueller Stand

Das Repository wurde initialisiert. Die genaue Projektstruktur und die ersten Microservices befinden sich aktuell im Aufbau.
