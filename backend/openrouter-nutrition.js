const { createHash } = require('crypto');

const RECIPE_NUTRIENT_LIMITS = {
    kcal: 2500,
    protein: 300,
    carbohydrates: 300,
    fat: 300,
    fiber: 100,
    salt: 50
};
const RATE_LIMIT_RETRIES = 2;
const MAX_RETRY_AFTER_MS = 3000;
const FREE_FALLBACK_MODELS = ['google/gemma-4-31b-it:free', 'openrouter/free'];

function getRetryDelay(response, attempt) {
    const retryAfter = response.headers?.get?.('retry-after');
    if (retryAfter) {
        const seconds = Number(retryAfter);
        const retryAt = Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(retryAfter);
        const delay = retryAt - Date.now();
        return Number.isFinite(delay) && delay >= 0 && delay <= MAX_RETRY_AFTER_MS ? delay : null;
    }
    return 1000 * (2 ** attempt);
}

async function fetchWithRateLimitRetry(fetchImpl, url, requestOptions, sleep) {
    for (let attempt = 0; ; attempt++) {
        const response = await fetchImpl(url, requestOptions);
        if (response.status !== 429 || attempt >= RATE_LIMIT_RETRIES) {
            return response;
        }
        const delay = getRetryDelay(response, attempt);
        if (delay === null) {
            return response;
        }
        await sleep(delay);
    }
}

function parseNutritionResponse(content) {
    let data;
    try {
        data = JSON.parse(content);
    } catch (error) {
        throw new Error('OpenRouter returned invalid JSON.');
    }

    const nutrients = data?.nutrition;
    if (!nutrients || typeof nutrients !== 'object' || Array.isArray(nutrients)) {
        throw new Error('OpenRouter returned an invalid nutrition profile.');
    }

    const normalizedNutrients = {};
    for (const [name, maximum] of Object.entries(RECIPE_NUTRIENT_LIMITS)) {
        const value = nutrients[name];
        if (value !== null && (typeof value !== 'number' || !Number.isFinite(value)
            || value < 0 || value > maximum)) {
            throw new Error(`OpenRouter returned an invalid ${name} value.`);
        }
        normalizedNutrients[name] = value;
    }

    return normalizedNutrients;
}

async function estimateOpenRouterRecipe(recipe, options = {}) {
    const apiKey = options.apiKey || process.env.OPENROUTER_API_KEY;
    const model = options.model || process.env.OPENROUTER_MODEL;
    const fetchImpl = options.fetchImpl || fetch;
    const sleep = options.sleep || ((delay) => new Promise((resolve) => setTimeout(resolve, delay)));
    if (!apiKey || !model) {
        throw new Error('OPENROUTER_API_KEY and OPENROUTER_MODEL must be configured.');
    }
    if (model !== 'openrouter/free' && !model.endsWith(':free')) {
        throw new Error('OPENROUTER_MODEL must use a :free model to prevent paid requests.');
    }

    const models = [model, ...FREE_FALLBACK_MODELS.filter((fallback) => fallback !== model)];

    const response = await fetchWithRateLimitRetry(fetchImpl, 'https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:8000',
            'X-Title': 'Lezzetify'
        },
        body: JSON.stringify({
            models,
            temperature: 0.1,
            max_tokens: 500,
            reasoning: { effort: 'none', exclude: true },
            response_format: { type: 'json_object' },
            provider: { max_price: { prompt: 0, completion: 0 } },
            messages: [
                {
                    role: 'system',
                    content: 'Schätze die ungefähren Nährwerte pro Portion für das folgende Rezept. Berücksichtige alle Zutaten und ihre Mengen und teile die Gesamtmenge durch die Anzahl der Portionen. Nutze plausible Küchenmengen, wenn Angaben fehlen. Gib ausschließlich gültiges JSON aus, exakt in dieser Form: {"nutrition":{"kcal":0,"protein":0,"carbohydrates":0,"fat":0,"fiber":0,"salt":0}}. Alle Werte sind Zahlen pro Portion, nicht pro 100 g. Keine Erklärung, keine Zwischenschritte, kein Markdown.'
                },
                {
                    role: 'user',
                    content: JSON.stringify({
                        title: recipe.title,
                        servings: recipe.servings,
                        ingredients: recipe.ingredients
                    })
                }
            ]
        }),
        signal: AbortSignal.timeout(20000)
    }, sleep);

    if (!response.ok) {
        let providerMessage;
        try {
            const data = await response.json();
            if (typeof data?.error?.message === 'string') {
                providerMessage = data.error.message.slice(0, 300);
            }
        } catch {
            providerMessage = undefined;
        }
        const error = new Error(
            `OpenRouter returned HTTP ${response.status}${providerMessage ? `: ${providerMessage}` : '.'}`
        );
        error.statusCode = response.status;
        throw error;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
        throw new Error('OpenRouter returned no nutrition estimate.');
    }
    return {
        nutrition: parseNutritionResponse(content),
        cacheKey: `recipe:${createHash('sha256')
            .update(`${model}\0${JSON.stringify(recipe).toLocaleLowerCase('de-DE')}`)
            .digest('hex')}`
    };
}

module.exports = { estimateOpenRouterRecipe, parseNutritionResponse };
