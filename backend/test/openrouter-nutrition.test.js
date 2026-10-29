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
    const model = 'google/gemma-4-26b-a4b-it:free';
    const result = await estimateOpenRouterRecipe(recipe, {
        apiKey: 'test-key',
        model,
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

    assert.deepEqual(requestBody.models, [
        'google/gemma-4-26b-a4b-it:free',
        'google/gemma-4-31b-it:free',
        'openrouter/free'
    ]);
    assert.ok(requestBody.models.every((modelId) => modelId === 'openrouter/free' || modelId.endsWith(':free')));
    assert.deepEqual(requestBody.provider.max_price, { prompt: 0, completion: 0 });
    assert.deepEqual(requestBody.reasoning, { effort: 'none', exclude: true });
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
        model: 'google/gemma-4-26b-a4b-it:free',
        fetchImpl: async () => ({
            ok: false,
            status: 402,
            json: async () => ({ error: { message: 'Insufficient credits' } })
        })
    }), (error) => error.statusCode === 402
        && /HTTP 402/.test(error.message)
        && /Insufficient credits/.test(error.message));

    await assert.rejects(estimateOpenRouterRecipe(recipe, {
        apiKey: '',
        model: '',
        fetchImpl: async () => { throw new Error('must not fetch'); }
    }), /must be configured/);

    await assert.rejects(estimateOpenRouterRecipe(recipe, {
        apiKey: 'test-key',
        model: 'google/gemini-2.5-flash',
        fetchImpl: async () => { throw new Error('must not fetch'); }
    }), /must use a :free model/);
});

test('retries rate-limited requests with backoff', async () => {
    let requestCount = 0;
    const delays = [];
    const result = await estimateOpenRouterRecipe({
        title: 'Tomatensuppe',
        servings: 2,
        ingredients: ['Tomaten']
    }, {
        apiKey: 'test-key',
        model: 'google/gemma-4-26b-a4b-it:free',
        fetchImpl: async () => {
            requestCount++;
            if (requestCount < 3) {
                return { ok: false, status: 429, headers: { get: () => null } };
            }
            return {
                ok: true,
                status: 200,
                json: async () => ({ choices: [{ message: { content: JSON.stringify({ nutrition }) } }] })
            };
        },
        sleep: async (delay) => delays.push(delay)
    });

    assert.equal(requestCount, 3);
    assert.deepEqual(delays, [1000, 2000]);
    assert.deepEqual(result.nutrition, nutrition);
});
