const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const amqp = require('amqplib');
const express = require('express');

const QUEUE_NAME = 'nutrition.search';
const PORT = Number(process.env.HEALTH_PORT || 3001);
const cache = new Map();
let rabbitConnected = false;

async function searchOpenFoodFacts(query) {
    const cacheKey = query.toLocaleLowerCase('de-DE');
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.products;
    }

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
        throw new Error(`Open Food Facts returned HTTP ${response.status}.`);
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
                    protein: readValue(nutriments.proteins_100g),
                    carbohydrates: readValue(nutriments.carbohydrates_100g),
                    fat: readValue(nutriments.fat_100g),
                    fiber: readValue(nutriments.fiber_100g),
                    salt: readValue(nutriments.salt_100g)
                }
            };
        })
        .filter(Boolean);

    if (cache.size >= 500) {
        cache.delete(cache.keys().next().value);
    }
    cache.set(cacheKey, { products, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
    return products;
}

async function startWorker() {
    if (!process.env.RABBITMQ_URL) {
        throw new Error('RABBITMQ_URL must be configured.');
    }

    const connection = await amqp.connect(process.env.RABBITMQ_URL);
    const channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    await channel.prefetch(5);
    await channel.consume(QUEUE_NAME, async (message) => {
        if (!message) {
            return;
        }

        try {
            const { query } = JSON.parse(message.content.toString());
            if (typeof query !== 'string' || !query.trim() || query.length > 80) {
                throw new Error('Ungültige Zutat für die Nährwertsuche.');
            }

            const products = await searchOpenFoodFacts(query.trim());
            channel.sendToQueue(message.properties.replyTo, Buffer.from(JSON.stringify({ products })), {
                correlationId: message.properties.correlationId,
                contentType: 'application/json'
            });
        } catch (error) {
            console.error('Nutrition search failed:', error.message);
            if (message.properties.replyTo && message.properties.correlationId) {
                channel.sendToQueue(message.properties.replyTo, Buffer.from(JSON.stringify({
                    error: 'Die Nährwertsuche ist gerade nicht verfügbar.'
                })), {
                    correlationId: message.properties.correlationId,
                    contentType: 'application/json'
                });
            }
        } finally {
            channel.ack(message);
        }
    });

    rabbitConnected = true;
    connection.on('error', (error) => {
        rabbitConnected = false;
        console.error('RabbitMQ connection error:', error.message);
    });
    connection.on('close', () => {
        rabbitConnected = false;
    });

    const healthApp = express();
    healthApp.get('/health', (req, res) => {
        if (!rabbitConnected) {
            return res.status(503).json({ status: 'unhealthy' });
        }
        res.json({ status: 'healthy' });
    });
    const server = healthApp.listen(PORT, () => {
        console.log(`Nutrition worker health endpoint listening on port ${PORT}`);
    });

    const shutdown = async () => {
        server.close();
        rabbitConnected = false;
        await Promise.allSettled([channel.close(), connection.close()]);
        process.exit(0);
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
}

startWorker().catch((error) => {
    console.error('Failed to start nutrition worker:', error);
    process.exit(1);
});
