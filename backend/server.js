const express = require('express');
const { randomUUID } = require('crypto');
const bcrypt = require('bcrypt'); // Für die Passwort-Verschlüsselung
const cors = require('cors');     // Falls dein Frontend auf einem anderen Port läuft
const jwt = require('jsonwebtoken'); // Für das Generieren der Login-Tokens
const defaultCommunityRecipes = require('./community-recipes');

const app = express();
app.use(express.json());
app.use(cors({
    origin: 'http://localhost:8000'
}));
const PORT = process.env.PORT || 3000;
const nutritionSearchCache = new Map();
const nutritionProducts = new Map();
const communityRecipes = defaultCommunityRecipes.map((recipe) => ({
    ...recipe,
    ingredients: [...recipe.ingredients],
    instructions: [...recipe.instructions],
    nutritionIngredients: [...recipe.nutritionIngredients],
    addedByName: 'Lezzetify',
    creatorType: 'lezzetify'
}));

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
        const { name, email, password } = req.body;

        if (typeof name !== 'string' || !name.trim() || name.trim().length > 40
            || typeof email !== 'string' || !email.trim()
            || typeof password !== 'string' || !password) {
            return res.status(400).json({ error: 'Benutzername, E-Mail und Passwort sind erforderlich.' });
        }

        // 1. Prüfen, ob der Benutzer schon existiert
        const existingUser = users.find(user => user.email === email.trim());
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
            name: name.trim(),
            email: email.trim(),
            password: hashedPassword,  // Nur das verschlüsselte Passwort speichern!
            recipes: [],
            mealPlans: []
        };

        users.push(newUser); // In unser Array speichern

        console.log('Aktuelle Benutzer in der DB:', users); // Zur Kontrolle in der Konsole

        const token = jwt.sign(
            { userId: newUser.id, email: newUser.email },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.status(201).json({
            message: 'Benutzer erfolgreich angelegt!',
            token,
            user: { id: newUser.id, name: newUser.name, email: newUser.email }
        });

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

        res.json({
            message: 'Erfolgreich eingeloggt!',
            token,
            user: { id: user.id, name: user.name, email: user.email }
        });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Login.' });
    }

});

function authenticateToken(req, res, next) {
    const authorization = req.headers.authorization;
    const token = authorization && authorization.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Anmeldung erforderlich.' });
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        const user = users.find((entry) => entry.id === payload.userId);
        if (!user) {
            return res.status(401).json({ error: 'Sitzung ungültig. Bitte erneut anmelden.' });
        }
        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Sitzung ungültig oder abgelaufen.' });
    }
}

app.get('/api/recipes', authenticateToken, (req, res) => {
    res.json(req.user.recipes);
});

app.get('/api/community/recipes', authenticateToken, (req, res) => {
    res.json(communityRecipes);
});

app.get('/api/community/recipes/:id', authenticateToken, (req, res) => {
    const recipe = communityRecipes.find((entry) => entry.id === req.params.id);
    if (!recipe) {
        return res.status(404).json({ error: 'Community-Rezept wurde nicht gefunden.' });
    }
    res.json(recipe);
});

app.post('/api/recipes', authenticateToken, (req, res) => {
    const { title, description = '', ingredients, instructions = '', prepTime, servings, nutritionIngredients, shareWithCommunity } = req.body;
    const cleanIngredients = Array.isArray(ingredients)
        ? ingredients.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
        : [];
    const cleanNutritionIngredients = Array.isArray(nutritionIngredients)
        ? nutritionIngredients.flatMap((entry) => {
            if (!entry || typeof entry.ingredient !== 'string' || typeof entry.productName !== 'string') {
                return [];
            }
            const verifiedProduct = typeof entry.productCode === 'string'
                ? nutritionProducts.get(entry.productCode)
                : null;
            if (!verifiedProduct) {
                return [];
            }
            const amountGrams = Number(entry.amountGrams);
            return [{
                ingredient: entry.ingredient.trim(),
                amountGrams: Number.isFinite(amountGrams) && amountGrams > 0 ? amountGrams : null,
                productName: verifiedProduct.name,
                productCode: entry.productCode,
                nutrients: { ...verifiedProduct.nutrients }
            }];
        })
        : [];
    const servingsCount = Number(servings);

    if (typeof title !== 'string' || !title.trim() || cleanIngredients.length === 0) {
        return res.status(400).json({ error: 'Rezeptname und mindestens eine Zutat sind erforderlich.' });
    }

    const recipe = {
        id: Date.now().toString(),
        title: title.trim(),
        description: typeof description === 'string' ? description.trim() : '',
        ingredients: cleanIngredients,
        instructions: typeof instructions === 'string' ? instructions.trim() : '',
        prepTime: Number.isFinite(Number(prepTime)) && Number(prepTime) > 0 ? Number(prepTime) : null,
        servings: Number.isInteger(servingsCount) && servingsCount > 0 && servingsCount <= 100 ? servingsCount : 1,
        nutritionIngredients: cleanNutritionIngredients,
        category: 'Community-Rezept',
        image: null,
        createdByName: req.user.name
    };

    req.user.recipes.push(recipe);
    let communityRecipe = null;
    if (shareWithCommunity === true) {
        communityRecipe = {
            ...recipe,
            id: randomUUID(),
            ingredients: [...recipe.ingredients],
            instructions: recipe.instructions.split('\n').map((step) => step.trim()).filter(Boolean),
            addedByName: req.user.name,
            creatorType: 'user'
        };
        communityRecipes.push(communityRecipe);
    }
    res.status(201).json({
        message: shareWithCommunity === true
            ? 'Rezept gespeichert und zur Community hinzugefügt.'
            : 'Rezept gespeichert.',
        recipe,
        communityRecipe
    });
});

app.get('/api/nutrition/search', authenticateToken, async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!query || query.length > 80) {
        return res.status(400).json({ error: 'Bitte gib eine Zutat mit höchstens 80 Zeichen ein.' });
    }

    const cacheKey = query.toLocaleLowerCase('de-DE');
    const cachedResults = nutritionSearchCache.get(cacheKey);
    if (cachedResults && cachedResults.expiresAt > Date.now()) {
        return res.json({ products: cachedResults.products, source: 'Open Food Facts' });
    }

    try {
        const url = new URL('https://world.openfoodfacts.org/api/v2/search');
        url.searchParams.set('search_terms', query);
        url.searchParams.set('fields', 'code,product_name,product_name_de,brands,nutriments');
        url.searchParams.set('page_size', '10');
        url.searchParams.set('lc', 'de');

        const response = await fetch(url, {
            headers: { 'User-Agent': 'Lezzetify/1.0 (German recipe nutrition lookup)' },
            signal: AbortSignal.timeout(8000)
        });
        if (!response.ok) {
            console.error(`Open Food Facts returned HTTP ${response.status} for a nutrition search.`);
            return res.status(502).json({ error: 'Die Nährwertsuche ist gerade nicht erreichbar.' });
        }

        const data = await response.json();
        const products = (Array.isArray(data.products) ? data.products : [])
            .map((product) => {
                const nutriments = product.nutriments || {};
                const readValue = (rawValue) => {
                    if (rawValue === null || rawValue === undefined || rawValue === '') {
                        return null;
                    }
                    const value = Number(rawValue);
                    return Number.isFinite(value) && value >= 0 ? value : null;
                };
                const kcalValue = readValue(nutriments['energy-kcal_100g']);
                const energyKj = readValue(nutriments['energy_100g']);
                const kcal = kcalValue !== null ? kcalValue : energyKj !== null ? energyKj / 4.184 : null;
                const readNutrient = (key) => {
                    return readValue(nutriments[`${key}_100g`]);
                };
                const productName = product.product_name_de || product.product_name;
                if (typeof productName !== 'string' || !productName.trim() || kcal === null) {
                    return null;
                }
                return {
                    code: typeof product.code === 'string' ? product.code : '',
                    name: productName.trim(),
                    brand: typeof product.brands === 'string' ? product.brands.trim() : '',
                    nutrients: {
                        kcal,
                        protein: readNutrient('proteins'),
                        carbohydrates: readNutrient('carbohydrates'),
                        fat: readNutrient('fat'),
                        fiber: readNutrient('fiber'),
                        salt: readNutrient('salt')
                    }
                };
            })
            .filter(Boolean);

        products.forEach((product) => {
            if (product.code) {
                if (nutritionProducts.size >= 5000 && !nutritionProducts.has(product.code)) {
                    nutritionProducts.delete(nutritionProducts.keys().next().value);
                }
                nutritionProducts.set(product.code, { name: product.name, nutrients: { ...product.nutrients } });
            }
        });
        if (nutritionSearchCache.size >= 500) {
            nutritionSearchCache.delete(nutritionSearchCache.keys().next().value);
        }
        nutritionSearchCache.set(cacheKey, { products, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
        res.json({ products, source: 'Open Food Facts' });
    } catch (error) {
        console.error('Open Food Facts nutrition search failed:', error.message);
        res.status(502).json({ error: 'Die Nährwertsuche ist fehlgeschlagen. Bitte versuche es später erneut.' });
    }
});

app.get('/api/plans', authenticateToken, (req, res) => {
    res.json(req.user.mealPlans);
});

app.post('/api/plans', authenticateToken, (req, res) => {
    const { recipeId, date } = req.body;
    const recipe = req.user.recipes.find((entry) => entry.id === recipeId);

    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
        || Number.isNaN(Date.parse(`${date}T00:00:00Z`))
        || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
        return res.status(400).json({ error: 'Bitte wähle ein gültiges Datum.' });
    }
    if (!recipe) {
        return res.status(400).json({ error: 'Bitte wähle ein gültiges Rezept.' });
    }

    const plan = { id: randomUUID(), recipeId, date };
    req.user.mealPlans.push(plan);
    res.status(201).json({ message: 'Gericht eingeplant.', plan });
});

app.delete('/api/plans/:id', authenticateToken, (req, res) => {
    const planIndex = req.user.mealPlans.findIndex((plan) => plan.id === req.params.id);
    if (planIndex === -1) {
        return res.status(404).json({ error: 'Geplanter Eintrag wurde nicht gefunden.' });
    }
    req.user.mealPlans.splice(planIndex, 1);
    res.status(204).end();
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