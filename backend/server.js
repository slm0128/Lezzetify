require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken'); // <-- Nur jsonwebtoken oben importiert

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret'; // <-- Backslashes entfernt

// Express Middleware (vom Prof vorgegeben)
app.use(cors());
app.use(express.json()); // Parsed JSON-Request-Bodies

// Vorübergehender Speicher im RAM
const users = [];

// 1. Registrierung
app.post('/api/register', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'E-Mail und Passwort sind erforderlich' });
    }

    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
        return res.status(400).json({ error: 'Benutzer existiert bereits' });
    }

    // Passwort hashen (Salt-Runden: 10)
    const passwordHash = await bcrypt.hash(password, 10);
    
    const newUser = { id: Date.now(), email, passwordHash };
    users.push(newUser);

    res.status(201).json({ message: 'Nutzer erfolgreich registriert!' });
});

// 2. Login-Route
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    // Validierung
    if (!email || !password) {
        return res.status(400).json({ error: 'E-Mail und Passwort eingeben' });
    }

    // Nutzer suchen
    const user = users.find(u => u.email === email);
    if (!user) {
        return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    }

    // Passwort vergleichen
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
        return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    }

    // JWT erstellen (nutzt jetzt die jwt Variable von ganz oben)
    const token = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: '2h' }
    );

    res.status(200).json({ 
        message: 'Login erfolgreich', 
        token, 
        user: { id: user.id, email: user.email } 
    });
});

app.listen(PORT, () => {
    console.log(`Lezzetify-Backend läuft auf http://localhost:${PORT}`);
});