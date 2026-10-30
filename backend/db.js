const { Pool } = require('pg');
const { randomBytes } = require('crypto');

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be configured.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on('error', (error) => {
    console.error('Unexpected PostgreSQL pool error:', error);
});

async function initializeDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY,
            name VARCHAR(40) NOT NULL,
            email TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            favorites JSONB NOT NULL DEFAULT '{"recipes":[],"community":[]}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE users ADD COLUMN IF NOT EXISTS calendar_feed_token TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS shopping_list_weekday SMALLINT NOT NULL DEFAULT 6;
        CREATE UNIQUE INDEX IF NOT EXISTS users_calendar_feed_token_unique
            ON users (calendar_feed_token) WHERE calendar_feed_token IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (LOWER(email));

        CREATE TABLE IF NOT EXISTS recipes (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            data JSONB NOT NULL,
            is_shared BOOLEAN NOT NULL DEFAULT FALSE,
            community_id UUID UNIQUE,
            source_community_id TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT recipes_community_id_matches_share
                CHECK ((is_shared AND community_id IS NOT NULL) OR (NOT is_shared AND community_id IS NULL))
        );
        CREATE INDEX IF NOT EXISTS recipes_user_id_created_at ON recipes (user_id, created_at);
        CREATE INDEX IF NOT EXISTS recipes_shared_community_id ON recipes (community_id) WHERE is_shared;

        CREATE TABLE IF NOT EXISTS meal_plans (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
            date DATE NOT NULL,
            servings INTEGER NOT NULL DEFAULT 1 CHECK (servings BETWEEN 1 AND 100)
        );
        ALTER TABLE meal_plans ADD COLUMN IF NOT EXISTS servings INTEGER;
        UPDATE meal_plans mp
        SET servings = COALESCE(NULLIF(r.data->>'servings', '')::integer, 1)
        FROM recipes r
        WHERE mp.recipe_id = r.id AND mp.servings IS NULL;
        ALTER TABLE meal_plans ALTER COLUMN servings SET DEFAULT 1;
        ALTER TABLE meal_plans ALTER COLUMN servings SET NOT NULL;
        CREATE INDEX IF NOT EXISTS meal_plans_user_date ON meal_plans (user_id, date);

        CREATE TABLE IF NOT EXISTS nutrition_estimates (
            code TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            nutrients JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS calorie_goals (
            user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            gender TEXT NOT NULL CHECK (gender IN ('female', 'male')),
            age SMALLINT NOT NULL CHECK (age BETWEEN 18 AND 100),
            height_cm NUMERIC(5, 1) NOT NULL CHECK (height_cm BETWEEN 100 AND 250),
            weight_kg NUMERIC(5, 1) NOT NULL CHECK (weight_kg BETWEEN 30 AND 350),
            activity_level TEXT NOT NULL CHECK (activity_level IN (
                'sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extra_active'
            )),
            goal TEXT NOT NULL CHECK (goal IN ('lose', 'maintain', 'gain')),
            maintenance_calories INTEGER NOT NULL CHECK (maintenance_calories >= 0),
            target_calories INTEGER NOT NULL CHECK (target_calories >= 0),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        UPDATE recipes
        SET data = data - 'nutritionIngredients'
        WHERE data ? 'nutritionIngredients';

    `);

    const usersWithoutFeedToken = await pool.query(
        'SELECT id FROM users WHERE calendar_feed_token IS NULL'
    );
    for (const user of usersWithoutFeedToken.rows) {
        await pool.query(
            'UPDATE users SET calendar_feed_token = $1 WHERE id = $2 AND calendar_feed_token IS NULL',
            [randomBytes(32).toString('base64url'), user.id]
        );
    }
}

module.exports = { pool, initializeDatabase };
