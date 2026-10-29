// Elemente aus dem HTML auswählen
const API_BASE_URL = 'http://localhost:3000';
const loginForm = document.querySelector('#login-form');
const errorMessage = document.querySelector('#error-message');
const authHeading = document.querySelector('#auth-heading');

document.querySelectorAll('#authTabs [data-bs-toggle="tab"]').forEach((tab) => {
    tab.addEventListener('shown.bs.tab', (event) => {
        authHeading.textContent = event.target.id === 'register-tab' ? 'Willkommen!' : 'Willkommen zurück!';
    });
});

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
        const submitButton = loginForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Wird angemeldet …';

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
        } catch {
            // Falls der Backend-Server gar nicht läuft oder nicht erreichbar ist
            if (errorMessage) {
                errorMessage.textContent = 'Verbindung zum Server fehlgeschlagen.';
                errorMessage.style.display = 'block';
            }
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Einloggen';
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
    const submitButton = registerForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Konto wird erstellt …';

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
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                localStorage.setItem('email', data.user.email);
                window.location.href = 'dashboard.html';
            }
        } catch {
            registerMessage.textContent = 'Verbindung zum Server fehlgeschlagen.';
            registerMessage.className = 'alert alert-danger py-2 small';
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Konto erstellen';
        }
  });
}

document.querySelectorAll('[data-password-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
        const passwordInput = document.getElementById(button.dataset.passwordToggle);
        const isPasswordVisible = passwordInput.type === 'text';
        passwordInput.type = isPasswordVisible ? 'password' : 'text';
        button.setAttribute('aria-pressed', String(!isPasswordVisible));
        button.setAttribute('aria-label', isPasswordVisible ? 'Passwort anzeigen' : 'Passwort verbergen');
        button.innerHTML = `<i class="far ${isPasswordVisible ? 'fa-eye' : 'fa-eye-slash'}" aria-hidden="true"></i>`;
    });
});