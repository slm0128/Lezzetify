const { Pool } = require('pg');

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
            date DATE NOT NULL
        );
        CREATE INDEX IF NOT EXISTS meal_plans_user_date ON meal_plans (user_id, date);

        CREATE TABLE IF NOT EXISTS nutrition_estimates (
            code TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            nutrients JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        UPDATE recipes
        SET data = data - 'nutritionIngredients'
        WHERE data ? 'nutritionIngredients';

        DROP TABLE IF EXISTS nutrition_products;
    `);
}

module.exports = { pool, initializeDatabase };
