const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const { createHash, randomBytes, randomUUID } = require('crypto');
const bcrypt = require('bcrypt');
const cors = require('cors');
const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const defaultCommunityRecipes = require('./community-recipes');
const { initializeDatabase, pool } = require('./db');
const { createNutritionRpc } = require('./nutrition-rpc');
const { createCalendarFeed, getCalendarToday } = require('./calendar-feed');
const { HttpError, validateRecipePayload } = require('./recipe-validation');

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:8000';
const CALENDAR_PUBLIC_URL = (process.env.CALENDAR_PUBLIC_URL || 'http://localhost:3000').replace(/\/+$/, '');
const CALENDAR_TIMEZONE = process.env.CALENDAR_TIMEZONE || 'Europe/Berlin';
const app = express();
let nutritionRpc;

if (!JWT_SECRET || Buffer.byteLength(JWT_SECRET) < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes of random data.');
}
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json({ limit: '5mb' }));
app.use((req, res, next) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        req.body = {};
    }
    next();
});

function normalizeFavorites(favorites) {
    return {
        recipes: Array.isArray(favorites?.recipes) ? favorites.recipes : [],
        community: Array.isArray(favorites?.community) ? favorites.community : []
    };
}

function toCommunityRecipe(row) {
    const recipe = row.data;
    return {
        ...recipe,
        id: row.community_id,
        ingredients: [...recipe.ingredients],
        instructions: recipe.instructions.split('\n').map((step) => step.trim()).filter(Boolean),
        addedByName: recipe.createdByName,
        creatorType: 'user'
    };
}

function createSharedCommunityRecipe(recipe, communityId) {
    return {
        ...recipe,
        id: communityId,
        ingredients: [...recipe.ingredients],
        instructions: recipe.instructions.split('\n').map((step) => step.trim()).filter(Boolean),
        addedByName: recipe.createdByName,
        creatorType: 'user'
    };
}

async function findCommunityRecipe(id, client = pool) {
    const builtin = defaultCommunityRecipes.find((recipe) => recipe.id === id);
    if (builtin) {
        return {
            ...builtin,
            ingredients: [...builtin.ingredients],
            instructions: [...builtin.instructions],
            addedByName: 'Lezzetify',
            creatorType: 'lezzetify'
        };
    }
    if (!UUID_PATTERN.test(id)) {
        return null;
    }

    const result = await client.query(
        'SELECT community_id, data FROM recipes WHERE community_id = $1 AND is_shared = TRUE',
        [id]
    );
    return result.rows[0] ? toCommunityRecipe(result.rows[0]) : null;
}

async function removeFavoriteForAllUsers(type, id, client) {
    const users = await client.query('SELECT id, favorites FROM users');
    for (const user of users.rows) {
        const favorites = normalizeFavorites(user.favorites);
        favorites[type] = favorites[type].filter((favoriteId) => favoriteId !== id);
        await client.query('UPDATE users SET favorites = $1::jsonb WHERE id = $2', [
            JSON.stringify(favorites),
            user.id
        ]);
    }
}

async function ensureLocalTestUser() {
    if (process.env.TEST_USER_ENABLED !== 'true') {
        return;
    }

    const name = process.env.TEST_USER_NAME;
    const email = process.env.TEST_USER_EMAIL?.trim().toLowerCase();
    const password = process.env.TEST_USER_PASSWORD;
    if (!name || name.length > 40 || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        || !password || Buffer.byteLength(password) > 72) {
        throw new Error('TEST_USER_ENABLED requires a valid TEST_USER_NAME, TEST_USER_EMAIL and TEST_USER_PASSWORD (max 72 bytes).');
    }

    const existing = await pool.query(
        'SELECT id FROM users WHERE LOWER(email) = $1',
        [email]
    );
    if (existing.rows[0]) {
        return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query(
        `INSERT INTO users (id, name, email, password_hash, calendar_feed_token)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), name.trim(), email, passwordHash, randomBytes(32).toString('base64url')]
    );
    console.log('Configured local test account is ready.');
}

const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Zu viele Versuche. Bitte warte 15 Minuten und versuche es erneut.' }
});

const nutritionRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 100,
    keyGenerator: (req) => req.user.id,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Zu viele Nährwertanfragen. Bitte warte eine Stunde und versuche es erneut.' }
});

app.get('/', (req, res) => {
    res.json({ message: 'Lezzetify-Backend läuft.' });
});

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        if (!nutritionRpc?.isConnected()) {
            throw new Error('RabbitMQ ist nicht verbunden.');
        }
        res.json({ status: 'healthy' });
    } catch (error) {
        console.error('Health check failed:', error.message);
        res.status(503).json({ status: 'unhealthy' });
    }
});

app.post('/api/register', authRateLimit, async (req, res) => {
    const { name, email, password } = req.body;
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!cleanName || cleanName.length > 40 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
        || cleanEmail.length > 254 || typeof password !== 'string'
        || password.length < 12 || Buffer.byteLength(password) > 72) {
        throw new HttpError(400, 'Bitte gib einen Namen, eine gültige E-Mail und ein Passwort mit 12 bis 72 Bytes an.');
    }

    const userId = randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);
    try {
        await pool.query(
            `INSERT INTO users (id, name, email, password_hash, calendar_feed_token)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, cleanName, cleanEmail, passwordHash, randomBytes(32).toString('base64url')]
        );
    } catch (error) {
        if (error.code === '23505') {
            throw new HttpError(409, 'Ein Benutzer mit dieser E-Mail existiert bereits.');
        }
        throw error;
    }

    const token = jwt.sign(
        { userId },
        JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '1h', issuer: 'lezzetify' }
    );
    res.status(201).json({
        message: 'Benutzer erfolgreich angelegt!',
        token,
        user: { id: userId, name: cleanName, email: cleanEmail }
    });
});

app.post('/api/login', authRateLimit, async (req, res) => {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const result = await pool.query(
        'SELECT id, name, email, password_hash FROM users WHERE LOWER(email) = $1',
        [email]
    );
    const user = result.rows[0];
    if (!user || !await bcrypt.compare(password, user.password_hash)) {
        throw new HttpError(401, 'Ungültige Anmeldedaten.');
    }

    const token = jwt.sign(
        { userId: user.id },
        JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '1h', issuer: 'lezzetify' }
    );
    res.json({
        message: 'Erfolgreich eingeloggt!',
        token,
        user: { id: user.id, name: user.name, email: user.email }
    });
});

async function authenticateToken(req, res, next) {
    const authorization = req.headers.authorization;
    const [scheme, token] = typeof authorization === 'string' ? authorization.split(' ') : [];
    if (scheme !== 'Bearer' || !token) {
        throw new HttpError(401, 'Anmeldung erforderlich.');
    }

    let payload;
    try {
        payload = jwt.verify(token, JWT_SECRET, {
            algorithms: ['HS256'],
            issuer: 'lezzetify'
        });
    } catch (error) {
        throw new HttpError(401, 'Sitzung ungültig oder abgelaufen.');
    }

    const result = await pool.query(
        'SELECT id, name, email, favorites FROM users WHERE id = $1',
        [payload.userId]
    );
    if (!result.rows[0]) {
        throw new HttpError(401, 'Sitzung ungültig. Bitte erneut anmelden.');
    }
    req.user = result.rows[0];
    next();
}

app.get('/api/recipes', authenticateToken, async (req, res) => {
    const result = await pool.query(
        'SELECT data FROM recipes WHERE user_id = $1 ORDER BY created_at, id',
        [req.user.id]
    );
    res.json(result.rows.map((row) => row.data));
});

app.get('/api/recipes/:id', authenticateToken, async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) {
        throw new HttpError(404, 'Rezept wurde nicht gefunden.');
    }
    const result = await pool.query(
        'SELECT data FROM recipes WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
    );
    if (!result.rows[0]) {
        throw new HttpError(404, 'Rezept wurde nicht gefunden.');
    }
    res.json(result.rows[0].data);
});

app.put('/api/recipes/:id', authenticateToken, async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) {
        throw new HttpError(404, 'Rezept wurde nicht gefunden.');
    }
    const fields = validateRecipePayload(req.body);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            'SELECT data, is_shared, community_id FROM recipes WHERE id = $1 AND user_id = $2 FOR UPDATE',
            [req.params.id, req.user.id]
        );
        const existing = result.rows[0];
        if (!existing) {
            throw new HttpError(404, 'Rezept wurde nicht gefunden.');
        }

        const image = fields.image === null ? existing.data.image || null : fields.image;
        const share = fields.shareWithCommunity;
        const recipe = {
            ...existing.data,
            ...fields,
            image,
            category: share
                ? 'Community-Rezept'
                : existing.data.sourceCommunityId
                    ? existing.data.category || 'Community-Rezept'
                    : 'Eigenes Rezept',
            createdByName: req.user.name,
            shareWithCommunity: share
        };
        const communityId = share ? existing.community_id || randomUUID() : null;

        await client.query(
            'UPDATE recipes SET data = $1::jsonb, is_shared = $2, community_id = $3 WHERE id = $4 AND user_id = $5',
            [JSON.stringify(recipe), share, communityId, req.params.id, req.user.id]
        );
        if (existing.community_id && !share) {
            await removeFavoriteForAllUsers('community', existing.community_id, client);
        }
        await client.query('COMMIT');
        res.json({
            message: share ? 'Rezept wurde aktualisiert und ist in der Community sichtbar.' : 'Rezept wurde aktualisiert.',
            recipe,
            communityRecipe: share ? createSharedCommunityRecipe(recipe, communityId) : null
        });
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
});

app.delete('/api/recipes/:id', authenticateToken, async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) {
        throw new HttpError(404, 'Rezept wurde nicht gefunden.');
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            'SELECT community_id, user_id FROM recipes WHERE id = $1 AND user_id = $2 FOR UPDATE',
            [req.params.id, req.user.id]
        );
        const recipe = result.rows[0];
        if (!recipe) {
            throw new HttpError(404, 'Rezept wurde nicht gefunden.');
        }

        await client.query('DELETE FROM recipes WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        const userResult = await client.query('SELECT favorites FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
        const favorites = normalizeFavorites(userResult.rows[0].favorites);
        favorites.recipes = favorites.recipes.filter((id) => id !== req.params.id);
        await client.query('UPDATE users SET favorites = $1::jsonb WHERE id = $2', [
            JSON.stringify(favorites),
            req.user.id
        ]);
        if (recipe.community_id) {
            await removeFavoriteForAllUsers('community', recipe.community_id, client);
        }
        await client.query('COMMIT');
        res.status(204).end();
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
});

app.get('/api/community/recipes', authenticateToken, async (req, res) => {
    const result = await pool.query(
        'SELECT community_id, data FROM recipes WHERE is_shared = TRUE ORDER BY created_at, id'
    );
    res.json([
        ...defaultCommunityRecipes.map((recipe) => ({
            ...recipe,
            ingredients: [...recipe.ingredients],
            instructions: [...recipe.instructions],
            addedByName: 'Lezzetify',
            creatorType: 'lezzetify'
        })),
        ...result.rows.map(toCommunityRecipe)
    ]);
});

app.get('/api/community/recipes/:id', authenticateToken, async (req, res) => {
    const recipe = await findCommunityRecipe(req.params.id);
    if (!recipe) {
        throw new HttpError(404, 'Community-Rezept wurde nicht gefunden.');
    }
    res.json(recipe);
});

app.get('/api/favorites', authenticateToken, (req, res) => {
    res.json(normalizeFavorites(req.user.favorites));
});

app.post('/api/favorites', authenticateToken, async (req, res) => {
    const { type, recipeId } = req.body;
    if (!['recipes', 'community'].includes(type) || typeof recipeId !== 'string') {
        throw new HttpError(400, 'Ungültiges Rezept für Favoriten.');
    }

    if (type === 'recipes') {
        if (!UUID_PATTERN.test(recipeId)) {
            throw new HttpError(404, 'Rezept wurde nicht gefunden.');
        }
        const recipe = await pool.query(
            'SELECT 1 FROM recipes WHERE id = $1 AND user_id = $2',
            [recipeId, req.user.id]
        );
        if (!recipe.rows[0]) {
            throw new HttpError(404, 'Rezept wurde nicht gefunden.');
        }
    } else if (!await findCommunityRecipe(recipeId)) {
        throw new HttpError(404, 'Rezept wurde nicht gefunden.');
    }

    const favorites = normalizeFavorites(req.user.favorites);
    const index = favorites[type].indexOf(recipeId);
    const favorited = index === -1;
    if (favorited) {
        favorites[type].push(recipeId);
    } else {
        favorites[type].splice(index, 1);
    }
    await pool.query('UPDATE users SET favorites = $1::jsonb WHERE id = $2', [
        JSON.stringify(favorites),
        req.user.id
    ]);
    res.json({ favorited, favorites });
});

app.post('/api/recipes/from-community/:id', authenticateToken, async (req, res) => {
    const communityRecipe = await findCommunityRecipe(req.params.id);
    if (!communityRecipe) {
        throw new HttpError(404, 'Community-Rezept wurde nicht gefunden.');
    }

    const existing = await pool.query(
        'SELECT data FROM recipes WHERE user_id = $1 AND source_community_id = $2',
        [req.user.id, communityRecipe.id]
    );
    if (existing.rows[0]) {
        return res.json({ message: 'Rezept ist bereits in deiner Sammlung.', recipe: existing.rows[0].data });
    }

    const recipe = {
        ...communityRecipe,
        id: randomUUID(),
        ingredients: [...communityRecipe.ingredients],
        instructions: Array.isArray(communityRecipe.instructions)
            ? communityRecipe.instructions.join('\n')
            : communityRecipe.instructions,
        createdByName: req.user.name,
        sourceCommunityId: communityRecipe.id,
        shareWithCommunity: false
    };
    await pool.query(
        'INSERT INTO recipes (id, user_id, data, source_community_id) VALUES ($1, $2, $3::jsonb, $4)',
        [recipe.id, req.user.id, JSON.stringify(recipe), communityRecipe.id]
    );
    res.status(201).json({ message: 'Rezept wurde zu deiner Sammlung hinzugefügt.', recipe });
});

app.post('/api/recipes', authenticateToken, async (req, res) => {
    const fields = validateRecipePayload(req.body);
    const recipe = {
        ...fields,
        id: randomUUID(),
        category: fields.shareWithCommunity ? 'Community-Rezept' : 'Eigenes Rezept',
        createdByName: req.user.name,
    };
    const share = fields.shareWithCommunity;
    const communityId = share ? randomUUID() : null;
    await pool.query(
        `INSERT INTO recipes (id, user_id, data, is_shared, community_id)
         VALUES ($1, $2, $3::jsonb, $4, $5)`,
        [recipe.id, req.user.id, JSON.stringify(recipe), share, communityId]
    );
    res.status(201).json({
        message: share ? 'Rezept gespeichert und zur Community hinzugefügt.' : 'Rezept gespeichert.',
        recipe,
        communityRecipe: share ? createSharedCommunityRecipe(recipe, communityId) : null
    });
});

app.post('/api/nutrition/recipe-estimate', authenticateToken, nutritionRateLimit, async (req, res) => {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const ingredients = Array.isArray(req.body.ingredients)
        ? req.body.ingredients.map((ingredient) => typeof ingredient === 'string' ? ingredient.trim() : '')
        : [];
    const servings = Number(req.body.servings);
    if (!title || title.length > 100 || ingredients.length === 0 || ingredients.length > 100
        || ingredients.some((ingredient) => !ingredient || ingredient.length > 200)
        || !Number.isInteger(servings) || servings < 1 || servings > 100) {
        throw new HttpError(400, 'Rezeptdaten für die Nährwertschätzung sind ungültig.');
    }

    const recipe = { title, ingredients, servings };
    const cacheKey = `recipe:${createHash('sha256')
        .update(`${process.env.OPENROUTER_MODEL}\0${JSON.stringify(recipe).toLocaleLowerCase('de-DE')}`)
        .digest('hex')}`;
    const cached = await pool.query(
        'SELECT nutrients FROM nutrition_estimates WHERE code = $1',
        [cacheKey]
    );
    if (cached.rows[0]) {
        return res.json({
            nutrition: cached.rows[0].nutrients,
            source: 'OpenRouter',
            estimated: true
        });
    }

    let result;
    try {
        result = await nutritionRpc.estimateRecipe(recipe);
    } catch (error) {
        console.error('Recipe nutrition request failed:', error.message);
        if (error.statusCode === 402) {
            throw new HttpError(502, 'OpenRouter hat die Anfrage mit HTTP 402 abgelehnt. Prüfe Kontoguthaben und den Zugriff auf das Modell.');
        }
        throw new HttpError(502, 'Die Nährwertschätzung konnte nicht gestartet werden.');
    }
    if (result.error) {
        throw new HttpError(502, result.error);
    }
    if (!result.nutrition || typeof result.nutrition !== 'object') {
        throw new HttpError(502, 'Der Nährwert-Service hat ein ungültiges Ergebnis geliefert.');
    }

    await pool.query(
        `INSERT INTO nutrition_estimates (code, name, nutrients)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (code) DO UPDATE
         SET name = EXCLUDED.name, nutrients = EXCLUDED.nutrients, updated_at = NOW()`,
        [cacheKey, title, JSON.stringify(result.nutrition)]
    );
    res.json({
        nutrition: result.nutrition,
        source: 'OpenRouter',
        estimated: true
    });
});

app.get('/api/plans', authenticateToken, async (req, res) => {
    const result = await pool.query(
        `SELECT id, recipe_id AS "recipeId", TO_CHAR(date, 'YYYY-MM-DD') AS date
         FROM meal_plans WHERE user_id = $1 ORDER BY date, id`,
        [req.user.id]
    );
    res.json(result.rows);
});

app.post('/api/plans', authenticateToken, async (req, res) => {
    const { recipeId, date } = req.body;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
        || Number.isNaN(Date.parse(`${date}T00:00:00Z`))
        || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
        throw new HttpError(400, 'Bitte wähle ein gültiges Datum.');
    }
    if (typeof recipeId !== 'string' || !UUID_PATTERN.test(recipeId)) {
        throw new HttpError(400, 'Bitte wähle ein gültiges Rezept.');
    }
    const recipe = await pool.query(
        'SELECT 1 FROM recipes WHERE id = $1 AND user_id = $2',
        [recipeId, req.user.id]
    );
    if (!recipe.rows[0]) {
        throw new HttpError(400, 'Bitte wähle ein gültiges Rezept.');
    }

    const id = randomUUID();
    await pool.query(
        'INSERT INTO meal_plans (id, user_id, recipe_id, date) VALUES ($1, $2, $3, $4)',
        [id, req.user.id, recipeId, date]
    );
    res.status(201).json({ message: 'Gericht eingeplant.', plan: { id, recipeId, date } });
});

app.delete('/api/plans/:id', authenticateToken, async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) {
        throw new HttpError(404, 'Geplanter Eintrag wurde nicht gefunden.');
    }
    const result = await pool.query(
        'DELETE FROM meal_plans WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
    );
    if (result.rowCount === 0) {
        throw new HttpError(404, 'Geplanter Eintrag wurde nicht gefunden.');
    }
    res.status(204).end();
});

app.get('/api/calendar/settings', authenticateToken, async (req, res) => {
    const result = await pool.query(
        'SELECT calendar_feed_token, shopping_list_weekday FROM users WHERE id = $1',
        [req.user.id]
    );
    const user = result.rows[0];
    if (!user?.calendar_feed_token) {
        throw new HttpError(500, 'Der Kalender-Link konnte nicht erstellt werden.');
    }
    res.json({
        shoppingWeekday: user.shopping_list_weekday,
        feedUrl: `${CALENDAR_PUBLIC_URL}/api/calendar/${user.calendar_feed_token}.ics`
    });
});

app.put('/api/calendar/settings', authenticateToken, async (req, res) => {
    const weekday = req.body.shoppingWeekday;
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
        throw new HttpError(400, 'Bitte wähle einen gültigen Wochentag für den Einkauf.');
    }
    await pool.query(
        'UPDATE users SET shopping_list_weekday = $1 WHERE id = $2',
        [weekday, req.user.id]
    );
    res.json({ message: 'Kalender-Einstellungen wurden gespeichert.', shoppingWeekday: weekday });
});

app.post('/api/calendar/settings/rotate-link', authenticateToken, async (req, res) => {
    const token = randomBytes(32).toString('base64url');
    const result = await pool.query(
        `UPDATE users SET calendar_feed_token = $1
         WHERE id = $2 RETURNING shopping_list_weekday`,
        [token, req.user.id]
    );
    if (result.rowCount !== 1) {
        throw new HttpError(404, 'Benutzer wurde nicht gefunden.');
    }
    res.json({
        message: 'Der Kalender-Link wurde erneuert. Der bisherige Link ist nicht mehr gültig.',
        shoppingWeekday: result.rows[0].shopping_list_weekday,
        feedUrl: `${CALENDAR_PUBLIC_URL}/api/calendar/${token}.ics`
    });
});

app.get('/api/calendar/:token.ics', async (req, res) => {
    const token = req.params.token;
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
        throw new HttpError(404, 'Kalender wurde nicht gefunden.');
    }

    const userResult = await pool.query(
        'SELECT id, shopping_list_weekday FROM users WHERE calendar_feed_token = $1',
        [token]
    );
    const user = userResult.rows[0];
    if (!user) {
        throw new HttpError(404, 'Kalender wurde nicht gefunden.');
    }

    const plans = await pool.query(
        `SELECT mp.id::text AS id, TO_CHAR(mp.date, 'YYYY-MM-DD') AS date,
                r.data->>'title' AS title, r.data->'ingredients' AS ingredients
         FROM meal_plans mp
         JOIN recipes r ON r.id = mp.recipe_id
         WHERE mp.user_id = $1 AND mp.date BETWEEN $2::date AND $2::date + 370
         ORDER BY mp.date, mp.id`,
        [user.id, getCalendarToday(new Date(), CALENDAR_TIMEZONE)]
    );
    const feed = createCalendarFeed({
        plans: plans.rows,
        shoppingWeekday: user.shopping_list_weekday,
        timezone: CALENDAR_TIMEZONE
    });
    res.set({
        'Cache-Control': 'private, no-store',
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="lezzetify.ics"'
    });
    res.send(feed);
});

app.get('/api/logintest', (req, res) => {
    res.json({ message: 'Backend erreichbar.' });
});

app.use((req, res) => {
    res.status(404).json({ error: 'Endpunkt wurde nicht gefunden.' });
});

app.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
        return res.status(400).json({ error: 'Ungültiges JSON im Request.' });
    }
    if (error.status) {
        return res.status(error.status).json({ error: error.message });
    }
    console.error('Unhandled request error:', error);
    res.status(500).json({ error: 'Ein unerwarteter Serverfehler ist aufgetreten.' });
});

async function startServer() {
    await initializeDatabase();
    await ensureLocalTestUser();
    nutritionRpc = await createNutritionRpc();
    const server = app.listen(PORT, () => {
        console.log(`Lezzetify API listening on port ${PORT}`);
    });

    const shutdown = async () => {
        server.close(async () => {
            await Promise.allSettled([nutritionRpc.close(), pool.end()]);
            process.exit(0);
        });
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
}

startServer().catch((error) => {
    console.error('Failed to start Lezzetify API:', error);
    process.exit(1);
});
