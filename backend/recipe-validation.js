class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function validateRecipePayload(body) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const ingredients = Array.isArray(body.ingredients)
        ? body.ingredients.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
        : [];
    const instructions = typeof body.instructions === 'string' ? body.instructions.trim() : '';
    const prepTime = Number(body.prepTime);
    const servings = Number(body.servings);
    const image = body.image === undefined ? null : body.image;

    if (!title || title.length > 100 || ingredients.length === 0 || ingredients.length > 100
        || ingredients.some((item) => item.length > 200)) {
        throw new HttpError(400, 'Bitte gib einen Rezeptnamen und 1 bis 100 gültige Zutaten an.');
    }
    if (description.length > 240 || instructions.length > 10000) {
        throw new HttpError(400, 'Beschreibung oder Zubereitung ist zu lang.');
    }
    if (body.prepTime !== null && body.prepTime !== undefined && body.prepTime !== ''
        && (!Number.isInteger(prepTime) || prepTime < 1 || prepTime > 1440)) {
        throw new HttpError(400, 'Die Zubereitungszeit muss zwischen 1 und 1440 Minuten liegen.');
    }
    if (!Number.isInteger(servings) || servings < 1 || servings > 100) {
        throw new HttpError(400, 'Die Portionszahl muss zwischen 1 und 100 liegen.');
    }
    if (image !== null && (typeof image !== 'string'
        || !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(image)
        || Buffer.from(image.slice(image.indexOf(',') + 1), 'base64').length > 3 * 1024 * 1024)) {
        throw new HttpError(400, 'Das Cover muss ein gültiges Bild mit höchstens 3 MB sein.');
    }

    return {
        title,
        description,
        ingredients,
        instructions,
        prepTime: Number.isInteger(prepTime) && prepTime > 0 ? prepTime : null,
        servings,
        image,
        shareWithCommunity: body.shareWithCommunity === true
    };
}

module.exports = { HttpError, validateRecipePayload };
