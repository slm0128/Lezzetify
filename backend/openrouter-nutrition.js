const { createHash } = require('crypto');

const RECIPE_NUTRIENT_LIMITS = {
    kcal: 2500,
    protein: 300,
    carbohydrates: 300,
    fat: 300,
    fiber: 100,
    salt: 50
};

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
    if (!apiKey || !model) {
        throw new Error('OPENROUTER_API_KEY and OPENROUTER_MODEL must be configured.');
    }

    const response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:8000',
            'X-Title': 'Lezzetify'
        },
        body: JSON.stringify({
            model,
            temperature: 0.1,
            max_tokens: 300,
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content: 'Schätze die ungefähren Nährwerte pro Portion für das folgende Rezept. Berücksichtige alle Zutaten und die angegebenen Mengen. Wenn Einheiten oder Mengen unklar sind, nutze übliche Küchenmengen und behandle das Ergebnis als grobe Schätzung. Antworte ausschließlich als JSON-Objekt mit genau diesen sechs numerischen Feldern (oder null, wenn nicht sinnvoll schätzbar): {"nutrition":{"kcal":0,"protein":0,"carbohydrates":0,"fat":0,"fiber":0,"salt":0}}. Keine Angaben pro 100 g, sondern pro Portion. Gib keine Erklärung aus.'
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
    });

    if (!response.ok) {
        const error = new Error(`OpenRouter returned HTTP ${response.status}.`);
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
