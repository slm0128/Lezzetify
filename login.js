// Elemente aus dem HTML auswählen
const loginForm = document.querySelector('#login-form');
const errorMessage = document.querySelector('#error-message');

if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
        // Standard-Neuladen der Seite durch das Formular verhindern
        event.preventDefault();
        
        // Alte Fehlermeldungen vor dem neuen Versuch ausblenden
        if (errorMessage) {
            errorMessage.style.display = 'none';
            errorMessage.textContent = '';
        }

        // Eingabewerte über die exakten HTML-IDs auslesen
        const email = document.querySelector('#loginEmail').value;
        const password = document.querySelector('#loginPassword').value;

        try {
            // POST-Anfrage an unser Node.js-Backend senden
            const response = await fetch('http://localhost:3000/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                // Bei Erfolg (Status 200): JWT-Token & User-Infos im Browser speichern
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                
                // Weiterleitung zur Hauptseite (Rezept-Manager)
                window.location.href = 'index.html';
            } else {
                // Bei Fehler (z. B. 401 Unauthorized): Fehlermeldung anzeigen
                if (errorMessage) {
                    errorMessage.textContent = data.error || 'Login fehlgeschlagen';
                    errorMessage.style.display = 'block';
                }
            }
        } catch (err) {
            // Falls der Backend-Server gar nicht läuft oder nicht erreichbar ist
            if (errorMessage) {
                errorMessage.textContent = 'Verbindung zum Server fehlgeschlagen.';
                errorMessage.style.display = 'block';
            }
        }
    });
}