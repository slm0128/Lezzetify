// Elemente aus dem HTML auswählen
const API_BASE_URL = 'http://localhost:3000';
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
            const response = await fetch(`${API_BASE_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                // Bei Erfolg (Status 200): JWT-Token & User-Infos im Browser speichern
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                localStorage.setItem('email', data.user.email);
                window.location.href = 'dashboard.html';
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

// Registrierungsformular und Statusmeldung auswählen
const registerForm = document.getElementById('register-form');
const registerMessage = document.getElementById('register-message');

if (registerForm) {
    registerForm.addEventListener('submit', async function(event) {
    event.preventDefault();

    const nameInput = document.getElementById('registerName').value.trim();
    const emailInput = document.getElementById('registerEmail').value;
    const passwordInput = document.getElementById('registerPassword').value;

        try {
            const response = await fetch(`${API_BASE_URL}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: nameInput, email: emailInput, password: passwordInput })
            });
            const data = await response.json();

            registerMessage.textContent = data.message || data.error || 'Registrierung fehlgeschlagen.';
            registerMessage.className = `alert py-2 small ${response.ok ? 'alert-success' : 'alert-danger'}`;

            if (response.ok) {
                registerForm.reset();
            }
        } catch (error) {
            registerMessage.textContent = 'Verbindung zum Server fehlgeschlagen.';
            registerMessage.className = 'alert alert-danger py-2 small';
        }
  });
}