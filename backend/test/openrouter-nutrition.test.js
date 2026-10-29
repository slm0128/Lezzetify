const test = require('node:test');
const assert = require('node:assert/strict');
const {
    estimateOpenRouterRecipe,
    parseNutritionResponse
} = require('../openrouter-nutrition');

const nutrition = {
    kcal: 120,
    protein: 4,
    carbohydrates: 16,
    fat: 4,
    fiber: 3,
    salt: 1
};

test('parses a complete non-negative nutrition profile', () => {
    assert.deepEqual(parseNutritionResponse(JSON.stringify({ nutrition })), nutrition);
});

test('rejects invalid JSON and out-of-range values', () => {
    assert.throws(() => parseNutritionResponse('not JSON'), /invalid JSON/i);
    assert.throws(() => parseNutritionResponse(JSON.stringify({
        nutrition: { ...nutrition, kcal: 2501 }
    })), /invalid kcal/i);
});

test('requests and returns a recipe estimate per serving', async () => {
    let requestBody;
    const recipe = {
        title: 'Tomatensuppe',
        servings: 2,
        ingredients: ['400 g Tomaten', '1 Zwiebel']
    };
    const result = await estimateOpenRouterRecipe(recipe, {
        apiKey: 'test-key',
        model: 'test/model',
        fetchImpl: async (url, options) => {
            requestBody = JSON.parse(options.body);
            assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
            assert.equal(options.headers.Authorization, 'Bearer test-key');
            return {
                ok: true,
                json: async () => ({
                    choices: [{
                        message: { content: JSON.stringify({ nutrition }) }
                    }]
                })
            };
        }
    });

    assert.equal(requestBody.model, 'test/model');
    assert.equal(requestBody.response_format.type, 'json_object');
    assert.deepEqual(JSON.parse(requestBody.messages[1].content), recipe);
    assert.deepEqual(result.nutrition, nutrition);
    assert.match(result.cacheKey, /^recipe:[a-f0-9]{64}$/);
});

test('reports failed OpenRouter responses and missing credentials', async () => {
    const recipe = {
        title: 'Tomatensuppe',
        servings: 2,
        ingredients: ['Tomaten']
    };
    await assert.rejects(estimateOpenRouterRecipe(recipe, {
        apiKey: 'test-key',
        model: 'test/model',
        fetchImpl: async () => ({ ok: false, status: 402 })
    }), (error) => error.statusCode === 402 && /HTTP 402/.test(error.message));

    await assert.rejects(estimateOpenRouterRecipe(recipe, {
        apiKey: '',
        model: '',
        fetchImpl: async () => { throw new Error('must not fetch'); }
    }), /must be configured/);
});
