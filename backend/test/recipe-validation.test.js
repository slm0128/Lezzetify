const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRecipePayload } = require('../recipe-validation');

test('accepts and normalizes a valid recipe', () => {
    const recipe = validateRecipePayload({
        title: '  Menemen  ',
        ingredients: ['  2 Eier ', '', ' Tomaten '],
        instructions: '  Eier braten.  ',
        prepTime: 25,
        servings: 2
    });

    assert.deepEqual(recipe, {
        title: 'Menemen',
        description: '',
        ingredients: ['2 Eier', 'Tomaten'],
        instructions: 'Eier braten.',
        prepTime: 25,
        servings: 2,
        image: null,
        shareWithCommunity: false
    });
});

test('only explicitly enabling community sharing makes a recipe public', () => {
    const privateRecipe = validateRecipePayload({
        title: 'Privat',
        ingredients: ['Tomate'],
        servings: 1
    });
    const sharedRecipe = validateRecipePayload({
        title: 'Geteilt',
        ingredients: ['Tomate'],
        servings: 1,
        shareWithCommunity: true
    });
    const stringValueRecipe = validateRecipePayload({
        title: 'Nicht explizit geteilt',
        ingredients: ['Tomate'],
        servings: 1,
        shareWithCommunity: 'true'
    });

    assert.equal(privateRecipe.shareWithCommunity, false);
    assert.equal(sharedRecipe.shareWithCommunity, true);
    assert.equal(stringValueRecipe.shareWithCommunity, false);
});

test('rejects a recipe without ingredients', () => {
    assert.throws(
        () => validateRecipePayload({ title: 'Menemen', ingredients: [], servings: 2 }),
        { status: 400 }
    );
});

test('rejects out-of-range servings and preparation time', () => {
    assert.throws(
        () => validateRecipePayload({ title: 'Menemen', ingredients: ['Eier'], prepTime: 1441, servings: 2 }),
        { status: 400 }
    );
    assert.throws(
        () => validateRecipePayload({ title: 'Menemen', ingredients: ['Eier'], servings: 101 }),
        { status: 400 }
    );
});

test('rejects unsupported or oversized recipe images', () => {
    assert.throws(
        () => validateRecipePayload({
            title: 'Menemen',
            ingredients: ['Eier'],
            servings: 2,
            image: 'data:image/svg+xml;base64,PHN2Zz4='
        }),
        { status: 400 }
    );
    assert.throws(
        () => validateRecipePayload({
            title: 'Menemen',
            ingredients: ['Eier'],
            servings: 2,
            image: `data:image/png;base64,${Buffer.alloc(3 * 1024 * 1024 + 1).toString('base64')}`
        }),
        { status: 400 }
    );
});
