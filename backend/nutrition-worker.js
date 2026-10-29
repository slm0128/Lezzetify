const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const amqp = require('amqplib');
const express = require('express');
const { estimateOpenRouterRecipe } = require('./openrouter-nutrition');

const QUEUE_NAME = 'nutrition.recipe-estimate';
const PORT = Number(process.env.HEALTH_PORT || 3001);
const cache = new Map();
let rabbitConnected = false;

function getProviderErrorMessage(statusCode, providerMessage) {
    let message;
    switch (statusCode) {
        case 400:
            message = 'OpenRouter hat die Anfrage mit HTTP 400 abgelehnt. Prüfe, ob das Modell das JSON-Antwortformat unterstützt.';
            break;
        case 401:
            message = 'OpenRouter hat die Anfrage mit HTTP 401 abgelehnt. Prüfe den OPENROUTER_API_KEY.';
            break;
        case 402:
            message = 'OpenRouter hat die Anfrage mit HTTP 402 abgelehnt. Prüfe dein OpenRouter-Guthaben und den Modellzugriff.';
            break;
        case 403:
            message = 'OpenRouter hat die Anfrage mit HTTP 403 abgelehnt. Prüfe den Zugriff und das Ausgabenlimit deines API-Schlüssels.';
            break;
        case 404:
            message = 'OpenRouter hat die Anfrage mit HTTP 404 abgelehnt. Prüfe die Modell-ID in OPENROUTER_MODEL.';
            break;
        case 429:
            message = 'OpenRouter hat die Anfrage mit HTTP 429 limitiert. Bitte warte kurz oder prüfe das Anfragelimit deines Modells.';
            break;
        default:
            message = statusCode
                ? `Die Nährwertschätzung wurde von OpenRouter mit HTTP ${statusCode} abgelehnt.`
                : 'Die Nährwertschätzung ist gerade nicht verfügbar.';
    }
    return providerMessage ? `${message} Details: ${providerMessage}` : message;
}

async function estimateRecipe(recipe) {
    const cacheKey = JSON.stringify({
        model: process.env.OPENROUTER_MODEL,
        title: recipe.title,
        ingredients: recipe.ingredients,
        servings: recipe.servings
    }).toLocaleLowerCase('de-DE');
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return { nutrition: cached.nutrition };
    }

    const estimate = await estimateOpenRouterRecipe(recipe);
    if (cache.size >= 500) {
        cache.delete(cache.keys().next().value);
    }
    cache.set(cacheKey, { nutrition: estimate.nutrition, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
    return estimate;
}

async function startWorker() {
    if (!process.env.RABBITMQ_URL) {
        throw new Error('RABBITMQ_URL must be configured.');
    }
    if (!process.env.OPENROUTER_API_KEY || !process.env.OPENROUTER_MODEL) {
        throw new Error('OPENROUTER_API_KEY and OPENROUTER_MODEL must be configured.');
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
            const request = JSON.parse(message.content.toString());
            let result;
            if (request.type === 'recipe') {
                const recipe = request.recipe;
                if (!recipe || typeof recipe.title !== 'string' || !recipe.title.trim()
                    || !Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0
                    || recipe.ingredients.length > 100 || !Number.isInteger(recipe.servings)
                    || recipe.servings < 1 || recipe.servings > 100
                    || recipe.ingredients.some((item) => typeof item !== 'string'
                        || !item.trim() || item.length > 200)) {
                    throw new Error('Ungültiges Rezept für die Nährwertschätzung.');
                }
                result = await estimateRecipe(recipe);
            } else {
                throw new Error('Unbekannte Nährwertanfrage.');
            }

            channel.sendToQueue(message.properties.replyTo, Buffer.from(JSON.stringify(result)), {
                correlationId: message.properties.correlationId,
                contentType: 'application/json'
            });
        } catch (error) {
            console.error('Recipe nutrition estimate failed:', error.message);
            if (message.properties.replyTo && message.properties.correlationId) {
                channel.sendToQueue(message.properties.replyTo, Buffer.from(JSON.stringify({
                    error: getProviderErrorMessage(error.statusCode, error.message),
                    statusCode: error.statusCode || null
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
