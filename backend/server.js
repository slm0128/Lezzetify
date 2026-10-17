const express = require('express');
const bcrypt = require('bcrypt'); // Für die Passwort-Verschlüsselung
const cors = require('cors');     // Falls dein Frontend auf einem anderen Port läuft
const jwt = require('jsonwebtoken'); // Für das Generieren der Login-Tokens

const app = express();
app.use(express.json());
app.use(cors({
    origin: 'http://localhost:8000'
}));
const PORT = process.env.PORT || 3000;

// Geheimer Schlüssel für die Tokens (In Produktion in eine .env Datei auslagern!)
const JWT_SECRET = 'lezzetify_super_secret_key_123'; 

// Unsere "Datenbank" (Für Tests. In Produktion durch echte DB ersetzen!)
const users = [];

app.get('/', (req, res) => {
    res.json({ message: 'Lezzetify-Backend läuft.' });
});

// --- REGISTRIERUNG: Benutzer speichern ---
app.post('/api/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Prüfen, ob der Benutzer schon existiert
        const existingUser = users.find(user => user.email === email);
        if (existingUser) {
            return res.status(400).json({ error: 'Ein Benutzer mit dieser E-Mail existiert bereits.' });
        }

        // 2. Passwort verschlüsseln (Hashing)
        // Die Zahl "10" ist der "Salt-Round"-Wert (bestimmt die Komplexität)
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 3. Neuen Benutzer erstellen und speichern
        const newUser = {
            id: Date.now().toString(), // Erzeugt eine simple, eindeutige ID
            email: email,
            password: hashedPassword   // Nur das verschlüsselte Passwort speichern!
        };

        users.push(newUser); // In unser Array speichern

        console.log('Aktuelle Benutzer in der DB:', users); // Zur Kontrolle in der Konsole

        // 4. Erfolgsmeldung zurücksenden
        res.status(201).json({ message: 'Benutzer erfolgreich angelegt!' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Serverfehler bei der Registrierung.' });
    }
});

// 2. ANMELDUNG (Login)
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Benutzer finden
        const user = users.find(u => u.email === email);
        if (!user) {
            return res.status(400).json({ error: 'Ungültige Anmeldedaten.' });
        }

        // Passwort abgleichen
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ error: 'Ungültige Anmeldedaten.' });
        }

        // JWT Token erstellen (gültig für 1 Stunde)
        const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });

        res.json({ message: 'Erfolgreich eingeloggt!', token });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Login.' });
    }

});

app.get('/api/logintest', async (req, res) => {
    try {
        res.json({ message: 'Backend erreichbar.' });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Login.' });
    }

});

app.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});