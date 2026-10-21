const API_BASE_URL = 'http://localhost:3000';
const token = localStorage.getItem('token');

if (!token) {
    window.location.replace('login.html');
} else {
    const recipeForm = document.querySelector('#recipe-form');
    const recipeList = document.querySelector('#recipe-list');
    const emptyState = document.querySelector('#empty-state');
    const recipeCount = document.querySelector('#recipe-count');
    const dashboardMessage = document.querySelector('#dashboard-message');
    const userName = document.querySelector('#user-name');
    const planForm = document.querySelector('#plan-form');
    const planRecipe = document.querySelector('#plan-recipe');
    const planDate = document.querySelector('#plan-date');
    const planCalendar = document.querySelector('#meal-plan-calendar');
    const planEmptyState = document.querySelector('#plan-empty-state');
    const planViewDate = document.querySelector('#plan-view-date');
    const planPeriod = document.querySelector('#plan-period');
    const shoppingList = document.querySelector('#shopping-list');
    const shoppingEmptyState = document.querySelector('#shopping-empty-state');
    const ingredientsInput = document.querySelector('#recipe-ingredients');
    const nutritionStatus = document.querySelector('#nutrition-status');
    const nutritionResults = document.querySelector('#nutrition-results');
    const communityRecipeList = document.querySelector('#community-recipe-list');
    const communitySearch = document.querySelector('#community-search');
    const communityEmptyState = document.querySelector('#community-empty-state');
    const communityRecipeDetails = document.querySelector('#community-recipe-details');
    const recipeImageInput = document.querySelector('#recipe-image');
    const recipeImagePreview = document.querySelector('#recipe-image-preview');
    const recipes = [];
    let communityRecipes = [];
    let mealPlans = [];
    let nutritionSearchItems = [];
    let activeCommunityRecipe = null;
    let favorites = { recipes: [], community: [] };
    let recipeImageData = null;
    const communityNutritionSelections = new Map();

    let savedUser = {};
    try {
        savedUser = JSON.parse(localStorage.getItem('user') || '{}');
    } catch (error) {
        savedUser = {};
    }
    const emailName = (localStorage.getItem('email') || '').split('@')[0];
    userName.textContent = savedUser.name || emailName || 'Chefkoch';

    function showMessage(message, isSuccess = false) {
        dashboardMessage.textContent = message;
        dashboardMessage.className = `alert ${isSuccess ? 'alert-success' : 'alert-danger'}`;
    }

    function updateFavoriteCount() {
        document.querySelector('#favorite-count').textContent = String(favorites.recipes.length + favorites.community.length);
    }

    function getLocalDateString(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    async function apiRequest(path, options = {}) {
        const response = await fetch(`${API_BASE_URL}${path}`, {
            ...options,
            headers: {
                ...options.headers,
                Authorization: `Bearer ${token}`
            }
        });
        if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            localStorage.removeItem('email');
            window.location.replace('login.html');
            throw new Error('Sitzung abgelaufen. Bitte erneut anmelden.');
        }
        return response;
    }

    async function readResponse(response, fallbackMessage) {
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || fallbackMessage);
        }
        return data;
    }

    function getNutritionSummary(entries, servings = 1) {
        const measurableEntries = entries.filter((entry) => Number(entry.amountGrams) > 0);
        const nutrients = ['kcal', 'protein', 'carbohydrates', 'fat', 'fiber', 'salt'];
        const totals = Object.fromEntries(nutrients.map((nutrient) => {
            const hasAllValues = measurableEntries.length > 0
                && measurableEntries.every((entry) => entry.nutrients[nutrient] !== null
                    && entry.nutrients[nutrient] !== undefined
                    && Number.isFinite(Number(entry.nutrients[nutrient])));
            const total = hasAllValues
                ? measurableEntries.reduce((sum, entry) => sum + entry.amountGrams * entry.nutrients[nutrient] / 100, 0)
                : null;
            return [nutrient, total === null ? null : total / servings];
        }));
        return { totals, measurableCount: measurableEntries.length };
    }

    function formatNutritionValue(value, suffix = 'g') {
        if (value === null) {
            return 'nicht verfügbar';
        }
        return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(value)} ${suffix}`;
    }

    function createNutritionSummary(entries, totalIngredients, servings, className = '') {
        const container = document.createElement('div');
        container.className = className;
        const { totals, measurableCount } = getNutritionSummary(entries, servings);
        if (measurableCount === 0) {
            if (entries.length === 0) {
                container.textContent = 'Für eine Berechnung fehlen bestätigte Produkte mit Mengenangaben in g.';
                return container;
            }
            const heading = document.createElement('strong');
            heading.textContent = 'Nährwerte je 100 g (Mengenangabe in g fehlt für die Rezeptberechnung):';
            const productList = createNutritionProductList(entries);
            container.append(heading, productList);
            appendNutritionAttribution(container);
            return container;
        }
        const heading = document.createElement('strong');
        heading.textContent = `Geschätzte Nährwerte pro Portion (${measurableCount} von ${totalIngredients} Zutaten mit Mengenangabe):`;
        const values = document.createElement('p');
        values.className = 'mb-0';
        values.textContent = [
            `Energie: ${formatNutritionValue(totals.kcal, 'kcal')}`,
            `Eiweiß: ${formatNutritionValue(totals.protein)}`,
            `Kohlenhydrate: ${formatNutritionValue(totals.carbohydrates)}`,
            `Fett: ${formatNutritionValue(totals.fat)}`,
            `Ballaststoffe: ${formatNutritionValue(totals.fiber)}`,
            `Salz: ${formatNutritionValue(totals.salt)}`
        ].join(' · ');
        container.append(heading, values);
        if (measurableCount < totalIngredients) {
            const note = document.createElement('small');
            note.className = 'd-block text-muted mt-1';
            note.textContent = 'Zutaten ohne bestätigte Mengenangabe in g sind nicht in der Berechnung enthalten.';
            container.append(note);
        }
        const unmeasuredEntries = entries.filter((entry) => !(Number(entry.amountGrams) > 0));
        if (unmeasuredEntries.length > 0) {
            const unmeasuredHeading = document.createElement('strong');
            unmeasuredHeading.className = 'd-block mt-2';
            unmeasuredHeading.textContent = 'Weitere bestätigte Zutaten je 100 g:';
            container.append(unmeasuredHeading, createNutritionProductList(unmeasuredEntries));
        }
        appendNutritionAttribution(container);
        return container;
    }

    function createNutritionProductList(entries) {
        const productList = document.createElement('ul');
        productList.className = 'mb-1';
        entries.forEach((entry) => {
            const item = document.createElement('li');
            const nutrients = entry.nutrients;
            item.textContent = `${entry.productName}: ${formatNutritionValue(nutrients.kcal, 'kcal')}, Eiweiß ${formatNutritionValue(nutrients.protein)}, Kohlenhydrate ${formatNutritionValue(nutrients.carbohydrates)}, Fett ${formatNutritionValue(nutrients.fat)}, Ballaststoffe ${formatNutritionValue(nutrients.fiber)}, Salz ${formatNutritionValue(nutrients.salt)}`;
            productList.append(item);
        });
        return productList;
    }

    function appendNutritionAttribution(container) {
        const attribution = document.createElement('small');
        attribution.className = 'd-block text-muted mt-1';
        attribution.append('Produktdaten: ');
        const sourceLink = document.createElement('a');
        sourceLink.href = 'https://world.openfoodfacts.org/';
        sourceLink.target = '_blank';
        sourceLink.rel = 'noopener noreferrer';
        sourceLink.textContent = 'Open Food Facts';
        attribution.append(sourceLink, ' (ODbL)');
        container.append(attribution);
    }

    function createRecipeCard(recipe) {
        const column = document.createElement('div');
        column.className = 'col-12 col-md-6 col-xl-4';
        const card = document.createElement('article');
        card.className = 'card h-100 border-0 shadow-sm recipe-card recipe-dashboard-card';
        const image = document.createElement('img');
        image.className = 'card-img-top recipe-img';
        image.src = recipe.image || 'images/essen.jpg';
        image.alt = recipe.title;
        image.loading = 'lazy';
        const body = document.createElement('div');
        body.className = 'card-body d-flex flex-column';
        const category = document.createElement('span');
        category.className = 'badge bg-warning text-dark align-self-start mb-2';
        category.textContent = 'Mein Rezept';
        const favoriteButton = createFavoriteButton('recipes', recipe.id);
        const title = document.createElement('h3');
        title.className = 'card-title fw-bold';
        title.textContent = recipe.title;
        body.append(category, favoriteButton, title);

        if (recipe.description) {
            const description = document.createElement('p');
            description.className = 'card-text text-muted';
            description.textContent = recipe.description;
            body.append(description);
        }

        const metadata = document.createElement('div');
        metadata.className = 'd-flex justify-content-between text-muted small my-2 gap-2';
        const time = document.createElement('span');
        time.innerHTML = '<i class="far fa-clock me-1" aria-hidden="true"></i>';
        time.append(recipe.prepTime ? `${recipe.prepTime} Min.` : 'Zeit offen');
        const calories = document.createElement('span');
        calories.innerHTML = '<i class="fas fa-fire me-1" aria-hidden="true"></i>';
        const kcal = getRecipeCalories(recipe);
        calories.append(kcal === null
            ? 'Nährwerte offen'
            : ` ${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(kcal)} kcal / Portion`);
        metadata.append(time, calories);
        body.append(metadata);

        const ingredients = document.createElement('p');
        ingredients.className = 'recipe-ingredients small';
        ingredients.textContent = `Zutaten: ${recipe.ingredients.join(', ')}`;
        body.append(ingredients);

        if (Array.isArray(recipe.nutritionIngredients) && recipe.nutritionIngredients.length > 0) {
            body.append(createNutritionSummary(
                recipe.nutritionIngredients,
                recipe.ingredients.length,
                recipe.servings || 1,
                'recipe-nutrition'
            ));
        }

        if (recipe.instructions) {
            const instructions = document.createElement('details');
            instructions.className = 'recipe-instructions mt-3';
            const summary = document.createElement('summary');
            summary.textContent = 'Zubereitung anzeigen';
            const text = document.createElement('p');
            text.textContent = recipe.instructions;
            instructions.append(summary, text);
            body.append(instructions);
        }

        card.append(image, body);
        column.append(card);
        return column;
    }

    function getRecipeCalories(recipe) {
        const entries = recipe.nutritionIngredients || [];
        if (entries.length < recipe.ingredients.length || entries.some((entry) => !(Number(entry.amountGrams) > 0))) {
            return null;
        }
        const { totals } = getNutritionSummary(entries, recipe.servings || 1);
        return totals.kcal;
    }

    function createFavoriteButton(type, recipeId) {
        const isFavorite = (favorites[type] || []).includes(recipeId);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `btn btn-sm ${isFavorite ? 'btn-danger' : 'btn-outline-danger'} recipe-favorite-button align-self-start mb-2`;
        button.dataset.favoriteType = type;
        button.dataset.favoriteId = recipeId;
        button.setAttribute('aria-pressed', String(isFavorite));
        button.textContent = isFavorite ? '♥ Favorit' : '♡ Als Favorit';
        return button;
    }

    function createCommunityRecipeCard(recipe) {
        const column = document.createElement('div');
        column.className = 'col-12 col-md-6 col-xl-4';
        const card = document.createElement('article');
        card.className = 'card h-100 border-0 shadow-sm recipe-card community-recipe-card';

        const image = document.createElement('img');
        image.className = 'card-img-top recipe-img';
        image.src = recipe.image || 'images/essen.jpg';
        image.alt = recipe.title;
        image.loading = 'lazy';

        const body = document.createElement('div');
        body.className = 'card-body d-flex flex-column';
        const category = document.createElement('span');
        category.className = 'badge bg-warning text-dark align-self-start mb-2';
        category.textContent = recipe.category || 'Community-Rezept';
        const title = document.createElement('h3');
        title.className = 'card-title fw-bold';
        title.textContent = recipe.title;
        const description = document.createElement('p');
        description.className = 'card-text text-muted flex-grow-1';
        description.textContent = recipe.description || 'Ein Rezept aus der Lezzetify-Community.';
        const metadata = document.createElement('div');
        metadata.className = 'd-flex justify-content-between text-muted small my-3 gap-2';

        const time = document.createElement('span');
        time.innerHTML = '<i class="far fa-clock me-1" aria-hidden="true"></i>';
        time.append(recipe.prepTime ? ` ${recipe.prepTime} Min.` : ' Zeit offen');
        const calories = document.createElement('span');
        calories.innerHTML = '<i class="fas fa-fire me-1" aria-hidden="true"></i>';
        const kcal = getRecipeCalories(recipe);
        calories.append(kcal === null
            ? ' Nährwerte via Open Food Facts'
            : ` ${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(kcal)} kcal / Portion`);
        metadata.append(time, calories);

        const author = document.createElement('p');
        author.className = 'small text-muted mb-3';
        author.textContent = recipe.creatorType === 'user'
            ? `Hinzugefügt von ${recipe.addedByName}`
            : `Erstellt von ${recipe.addedByName || 'Lezzetify'}`;
        const detailsButton = document.createElement('button');
        detailsButton.type = 'button';
        detailsButton.className = 'btn btn-primary-custom w-100 mt-auto';
        detailsButton.dataset.communityRecipeId = recipe.id;
        detailsButton.textContent = 'Rezept ansehen';

        const favoriteButton = createFavoriteButton('community', recipe.id);
        favoriteButton.classList.add('w-100');
        const saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.className = 'btn btn-outline-primary w-100 mt-2';
        saveButton.dataset.saveCommunityRecipeId = recipe.id;
        const alreadySaved = recipes.some((entry) => entry.sourceCommunityId === recipe.id);
        saveButton.textContent = alreadySaved ? 'Bereits in meinen Rezepten' : 'Zu meinen Rezepten hinzufügen';
        saveButton.disabled = alreadySaved;
        body.append(category, title, description, metadata, author, favoriteButton, detailsButton, saveButton);
        card.append(image, body);
        column.append(card);
        return column;
    }

    function renderCommunityRecipes() {
        const searchTerm = communitySearch.value.trim().toLocaleLowerCase('de-DE');
        const filteredRecipes = communityRecipes.filter((recipe) => (
            `${recipe.title} ${recipe.description} ${recipe.category} ${recipe.addedByName}`
                .toLocaleLowerCase('de-DE')
                .includes(searchTerm)
        ));
        communityRecipeList.replaceChildren(...filteredRecipes.map(createCommunityRecipeCard));
        communityEmptyState.hidden = filteredRecipes.length > 0;
    }

    async function loadCommunityRecipes() {
        try {
            const response = await apiRequest('/api/community/recipes');
            communityRecipes = await readResponse(response, 'Community-Rezepte konnten nicht geladen werden.');
            renderCommunityRecipes();
        } catch (error) {
            showMessage(error.message || 'Community-Rezepte konnten nicht geladen werden.');
        }
    }

    async function loadFavorites() {
        try {
            const response = await apiRequest('/api/favorites');
            favorites = await readResponse(response, 'Favoriten konnten nicht geladen werden.');
            updateFavoriteCount();
            recipeList.replaceChildren(...recipes.map(createRecipeCard));
            renderCommunityRecipes();
        } catch (error) {
            showMessage(error.message || 'Favoriten konnten nicht geladen werden.');
        }
    }

    async function toggleFavorite(type, recipeId, button) {
        button.disabled = true;
        try {
            const response = await apiRequest('/api/favorites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, recipeId })
            });
            const data = await readResponse(response, 'Favorit konnte nicht gespeichert werden.');
            favorites = data.favorites;
            updateFavoriteCount();
            recipeList.replaceChildren(...recipes.map(createRecipeCard));
            renderCommunityRecipes();
            communityRecipeDetails.querySelectorAll('[data-favorite-type]').forEach((favoriteButton) => {
                if (favoriteButton.dataset.favoriteId === recipeId) {
                    favoriteButton.replaceWith(createFavoriteButton(type, recipeId));
                }
            });
            showMessage(data.favorited ? 'Rezept wurde zu deinen Favoriten hinzugefügt.' : 'Rezept wurde aus deinen Favoriten entfernt.', true);
        } catch (error) {
            showMessage(error.message || 'Favorit konnte nicht gespeichert werden.');
            button.disabled = false;
        }
    }

    async function saveCommunityRecipe(recipeId, button) {
        button.disabled = true;
        try {
            const response = await apiRequest(`/api/recipes/from-community/${encodeURIComponent(recipeId)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nutritionIngredients: communityRecipes.find((recipe) => recipe.id === recipeId)?.nutritionIngredients || []
                })
            });
            const data = await readResponse(response, 'Community-Rezept konnte nicht gespeichert werden.');
            showMessage(data.message || 'Rezept wurde zu deiner Sammlung hinzugefügt.', true);
            await loadRecipes();
            renderCommunityRecipes();
        } catch (error) {
            showMessage(error.message || 'Community-Rezept konnte nicht gespeichert werden.');
            button.disabled = false;
        }
    }

    function createCommunityIngredients(recipe) {
        const heading = document.createElement('h3');
        heading.className = 'h5 fw-bold mt-4';
        heading.textContent = `Zutaten für ${recipe.servings || 1} Portionen`;
        const list = document.createElement('ul');
        list.className = 'community-ingredient-list';
        recipe.ingredients.forEach((ingredient) => {
            const item = document.createElement('li');
            item.textContent = ingredient;
            list.append(item);
        });
        return [heading, list];
    }

    function renderCommunityNutrition(recipe, selections, statusText = '') {
        const section = document.createElement('section');
        section.className = 'community-nutrition';
        const heading = document.createElement('h3');
        heading.className = 'h5 fw-bold mt-4';
        heading.textContent = 'Nährwerte von Open Food Facts';
        const help = document.createElement('p');
        help.className = 'text-muted small';
        help.textContent = 'Prüfe den passenden Treffer für jede Zutat. Mengen werden nur bei Angaben in g in die Nährwerte pro Portion eingerechnet.';
        const searchButton = document.createElement('button');
        searchButton.type = 'button';
        searchButton.className = 'btn btn-outline-secondary btn-sm mb-2';
        searchButton.textContent = 'Nährwerte suchen';
        searchButton.addEventListener('click', () => searchCommunityNutrition(recipe, section, searchButton));
        const status = document.createElement('p');
        status.className = 'small text-muted mb-2';
        status.setAttribute('role', 'status');
        status.textContent = statusText;
        const results = document.createElement('div');
        results.className = 'community-nutrition-results';
        const hasSelection = selections.some((item) => item.selectedProductIndex !== null);
        if (hasSelection) {
            results.append(createNutritionSummary(
                getSelectedNutritionEntries(selections),
                recipe.ingredients.length,
                recipe.servings || 1,
                'nutrition-summary-content'
            ));
        }
        selections.forEach((item, itemIndex) => {
            const group = document.createElement('div');
            group.className = 'nutrition-search-result';
            const label = document.createElement('label');
            label.className = 'form-label fw-bold mb-1';
            label.htmlFor = `community-nutrition-${itemIndex}`;
            label.textContent = item.original;
            const select = document.createElement('select');
            select.className = 'form-select form-select-sm';
            select.id = label.htmlFor;
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = item.products.length
                ? 'Passendes Produkt auswählen'
                : item.productsLoaded ? 'Keine passenden Produkte mit Nährwerten gefunden' : 'Nährwerte noch nicht gesucht';
            select.append(placeholder);
            item.products.forEach((product, productIndex) => {
                const option = document.createElement('option');
                option.value = String(productIndex);
                option.textContent = `${product.name}${product.brand ? ` – ${product.brand}` : ''} (${formatNutritionValue(product.nutrients.kcal, 'kcal / 100 g')})`;
                select.append(option);
            });
            select.value = item.selectedProductIndex === null ? '' : String(item.selectedProductIndex);
            select.addEventListener('change', () => {
                item.selectedProductIndex = select.value === '' ? null : Number(select.value);
                const updatedEntries = getSelectedNutritionEntries(selections);
                recipe.nutritionIngredients = updatedEntries;
                const communityCardRecipe = communityRecipes.find((entry) => entry.id === recipe.id);
                if (communityCardRecipe) {
                    communityCardRecipe.nutritionIngredients = updatedEntries;
                }
                renderCommunityRecipes();
                const summary = createNutritionSummary(
                    updatedEntries,
                    recipe.ingredients.length,
                    recipe.servings || 1,
                    'nutrition-summary-content'
                );
                const existingSummary = results.querySelector('.nutrition-summary-content');
                if (existingSummary) {
                    existingSummary.replaceWith(summary);
                } else if (updatedEntries.length > 0) {
                    results.prepend(summary);
                }
            });
            group.append(label, select);
            results.append(group);
        });
        if (!hasSelection && selections.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'small text-muted';
            empty.textContent = 'Nährwerte für dieses Rezept wurden noch nicht gesucht.';
            results.append(empty);
        }
        section.append(heading, help, searchButton, status, results);
        return section;
    }

    function getSelectedNutritionEntries(selections) {
        return selections.flatMap((item) => {
            if (item.selectedProductIndex === null) {
                return [];
            }
            const product = item.products[item.selectedProductIndex];
            return product ? [{
                ingredient: item.original,
                amountGrams: item.amountGrams,
                productName: product.name,
                productCode: product.code,
                nutrients: product.nutrients
            }] : [];
        });
    }

    async function searchCommunityNutrition(recipe, section, button) {
        const status = section.querySelector('[role="status"]');
        button.disabled = true;
        status.textContent = 'Suche passende deutsche Produktdaten bei Open Food Facts …';
        const selections = recipe.ingredients.slice(0, 20).map((original) => ({
            original,
            ...parseIngredientForNutrition(original),
            products: [],
            productsLoaded: false,
            selectedProductIndex: null
        }));
        const failedSearches = [];
        let nextIndex = 0;
        async function searchNextIngredient() {
            while (nextIndex < selections.length) {
                const index = nextIndex;
                nextIndex += 1;
                const item = selections[index];
                try {
                    const response = await apiRequest(`/api/nutrition/search?q=${encodeURIComponent(item.name)}`);
                    const data = await readResponse(response, `Nährwerte für „${item.name}“ konnten nicht gesucht werden.`);
                    item.products = data.products;
                    item.productsLoaded = true;
                } catch (error) {
                    failedSearches.push(`${item.name}: ${error.message}`);
                }
            }
        }
        try {
            await Promise.all(Array.from({ length: Math.min(3, selections.length) }, searchNextIngredient));
            if (activeCommunityRecipe?.id !== recipe.id) {
                return;
            }
            const savedSelections = communityNutritionSelections.get(recipe.id) || new Map();
            selections.forEach((item) => {
                const saved = Array.isArray(savedSelections)
                    ? savedSelections.find((entry) => entry.original === item.original)
                    : null;
                const savedProduct = saved && saved.selectedProductIndex !== null
                    ? saved.products[saved.selectedProductIndex]
                    : null;
                const savedIndex = savedProduct
                    ? item.products.findIndex((product) => product.code === savedProduct.code)
                    : -1;
                item.selectedProductIndex = savedIndex >= 0 ? savedIndex : null;
            });
            communityNutritionSelections.set(recipe.id, selections);
            section.replaceWith(renderCommunityNutrition(
                recipe,
                selections,
                failedSearches.length
                    ? `${failedSearches.length} Zutat(en) konnten nicht gesucht werden. Bitte versuche es erneut.`
                    : 'Treffer auswählen, um die Nährwerte zu berechnen.'
            ));
            if (failedSearches.length) {
                showMessage(`Nährwertsuche teilweise fehlgeschlagen: ${failedSearches.join('; ')}`);
            }
        } finally {
            button.disabled = false;
        }
    }

    async function openCommunityRecipe(recipeId) {
        communityRecipeDetails.replaceChildren();
        const loading = document.createElement('p');
        loading.className = 'text-muted';
        loading.textContent = 'Rezept wird geladen …';
        communityRecipeDetails.append(loading);
        const modal = bootstrap.Modal.getOrCreateInstance(document.querySelector('#communityRecipeModal'));
        modal.show();
        try {
            const response = await apiRequest(`/api/community/recipes/${encodeURIComponent(recipeId)}`);
            const recipe = await readResponse(response, 'Community-Rezept konnte nicht geladen werden.');
            activeCommunityRecipe = recipe;
            communityRecipeDetails.replaceChildren();

            if (recipe.image) {
                const image = document.createElement('img');
                image.className = 'community-detail-image mb-3';
                image.src = recipe.image;
                image.alt = recipe.title;
                communityRecipeDetails.append(image);
            }
            const category = document.createElement('span');
            category.className = 'badge bg-warning text-dark mb-2';
            category.textContent = recipe.category || 'Community-Rezept';
            const title = document.createElement('h2');
            title.className = 'h3 fw-bold';
            title.id = 'community-recipe-title';
            title.textContent = recipe.title;
            const description = document.createElement('p');
            description.className = 'text-muted';
            description.textContent = recipe.description || '';
            const author = document.createElement('p');
            author.className = 'small text-muted';
            author.textContent = recipe.creatorType === 'user'
                ? `Hinzugefügt von ${recipe.addedByName}`
                : `Erstellt von ${recipe.addedByName || 'Lezzetify'}`;
            const metadata = document.createElement('p');
            metadata.className = 'small text-muted';
            metadata.textContent = `${recipe.prepTime ? `${recipe.prepTime} Min.` : 'Zubereitungszeit nicht angegeben'} · ${recipe.servings || 1} Portionen`;
            communityRecipeDetails.append(category, title, description, author, metadata);
            const actionBar = document.createElement('div');
            actionBar.className = 'd-flex flex-column flex-sm-row gap-2 mt-3';
            const favoriteButton = createFavoriteButton('community', recipe.id);
            favoriteButton.classList.remove('align-self-start', 'mb-2');
            const saveButton = document.createElement('button');
            saveButton.type = 'button';
            saveButton.className = 'btn btn-outline-primary';
            saveButton.dataset.saveCommunityRecipeId = recipe.id;
            const alreadySaved = recipes.some((entry) => entry.sourceCommunityId === recipe.id);
            saveButton.textContent = alreadySaved ? 'Bereits in meinen Rezepten' : 'Zu meinen Rezepten hinzufügen';
            saveButton.disabled = alreadySaved;
            actionBar.append(favoriteButton, saveButton);
            communityRecipeDetails.append(actionBar);
            communityRecipeDetails.append(...createCommunityIngredients(recipe));

            const instructionsHeading = document.createElement('h3');
            instructionsHeading.className = 'h5 fw-bold mt-4';
            instructionsHeading.textContent = 'Zubereitung';
            const instructionsList = document.createElement('ol');
            const instructions = Array.isArray(recipe.instructions)
                ? recipe.instructions
                : String(recipe.instructions || '').split('\n').map((step) => step.trim()).filter(Boolean);
            instructions.forEach((instruction) => {
                const item = document.createElement('li');
                item.textContent = instruction;
                instructionsList.append(item);
            });
            communityRecipeDetails.append(instructionsHeading, instructionsList);

            let savedSelections = communityNutritionSelections.get(recipe.id);
            if (!savedSelections) {
                savedSelections = (recipe.nutritionIngredients || []).map((entry) => ({
                    original: entry.ingredient,
                    name: parseIngredientForNutrition(entry.ingredient).name,
                    amountGrams: entry.amountGrams,
                    products: [{
                        name: entry.productName,
                        brand: '',
                        code: entry.productCode,
                        nutrients: entry.nutrients
                    }],
                    productsLoaded: true,
                    selectedProductIndex: 0
                }));
                communityNutritionSelections.set(recipe.id, savedSelections);
            }
            communityRecipeDetails.append(renderCommunityNutrition(recipe, savedSelections));
        } catch (error) {
            communityRecipeDetails.replaceChildren();
            const message = document.createElement('p');
            message.className = 'alert alert-danger';
            message.textContent = error.message || 'Community-Rezept konnte nicht geladen werden.';
            communityRecipeDetails.append(message);
        }
    }

    function parseIngredientForNutrition(line) {
        const cleanLine = line
            .replace(/\([^)]*\)/g, ' ')
            .replace(/\boptional\b/gi, '')
            .replace(/\s+oder\s+.+$/i, '')
            .replace(/^saft\s+(?:einer?\s+)?/i, '')
            .replace(/\s+/g, ' ')
            .trim();
        const amountPattern = '(\\d+(?:[.,]\\d+)?|1\\/2|½)';
        const massMatch = cleanLine.match(new RegExp(`^${amountPattern}\\s*(kg|g|gramm|mg)\\s+(.+)$`, 'i'));
        if (massMatch) {
            const amount = massMatch[1] === '½' || massMatch[1] === '1/2'
                ? 0.5
                : Number(massMatch[1].replace(',', '.'));
            const unit = massMatch[2].toLocaleLowerCase('de-DE');
            const amountGrams = unit === 'kg' ? amount * 1000 : unit === 'mg' ? amount / 1000 : amount;
            return { name: normalizeNutritionSearchTerm(massMatch[3]), amountGrams: amountGrams > 0 ? amountGrams : null };
        }
        const quantityMatch = cleanLine.match(new RegExp(`^${amountPattern}\\s*(?:ml|l|liter|el|esslöffel|tl|teelöffel|stk|stück|stücke|tasse|tassen|bund|prise|päckchen|packung)?\\s+(.+)$`, 'i'));
        return {
            name: normalizeNutritionSearchTerm(quantityMatch ? quantityMatch[1] : cleanLine),
            amountGrams: null
        };
    }

    function normalizeNutritionSearchTerm(value) {
        return value
            .replace(/^(?:kleine|kleiner|kleinen|reife|reifer|reife[nr]?|feste|fester|festen|grüne|grüner|grünen|rote|roter|roten|frische|frischer|frischen|glatte|glatter|glatten|getrocknete|getrockneter|gemischtes|gutes|guter|schwarzer|schwarzen|gut abgetropfter)\s+/i, '')
            .replace(/\s+(?:zum servieren|zum garnieren)$/i, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function updateNutritionPreview() {
        if (nutritionSearchItems.length === 0) {
            return;
        }
        const selectedEntries = nutritionSearchItems.flatMap((item) => {
            if (item.selectedProductIndex === null) {
                return [];
            }
            const product = item.products[item.selectedProductIndex];
            if (!product) {
                return [];
            }
            return [{
                ingredient: item.original,
                amountGrams: item.amountGrams,
                productName: product.name,
                productCode: product.code,
                nutrients: product.nutrients
            }];
        });
        let summary = nutritionResults.querySelector('#nutrition-summary');
        if (!summary) {
            summary = document.createElement('div');
            summary.id = 'nutrition-summary';
            nutritionResults.append(summary);
        }
        summary.replaceChildren(createNutritionSummary(
            selectedEntries,
            nutritionSearchItems.length,
            Number(document.querySelector('#recipe-servings').value) || 1,
            'nutrition-summary-content'
        ));
    }

    function renderNutritionSearchResults() {
        nutritionResults.replaceChildren();
        nutritionSearchItems.forEach((item, itemIndex) => {
            const group = document.createElement('div');
            group.className = 'nutrition-search-result';
            const label = document.createElement('label');
            label.className = 'form-label fw-bold mb-1';
            label.htmlFor = `nutrition-product-${itemIndex}`;
            label.textContent = item.original;
            const select = document.createElement('select');
            select.className = 'form-select form-select-sm';
            select.id = label.htmlFor;
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = item.products.length ? 'Passendes Produkt auswählen' : 'Keine passenden Produkte gefunden';
            select.append(placeholder);
            item.products.forEach((product, productIndex) => {
                const option = document.createElement('option');
                option.value = String(productIndex);
                const brand = product.brand ? ` – ${product.brand}` : '';
                option.textContent = `${product.name}${brand} (${formatNutritionValue(product.nutrients.kcal, 'kcal / 100 g')})`;
                select.append(option);
            });
            select.disabled = item.products.length === 0;
            select.addEventListener('change', () => {
                item.selectedProductIndex = select.value === '' ? null : Number(select.value);
                updateNutritionPreview();
            });
            group.append(label, select);
            nutritionResults.append(group);
        });
        updateNutritionPreview();
    }

    async function searchIngredientNutrition() {
        const lines = ingredientsInput.value.split('\n').map((line) => line.trim()).filter(Boolean);
        if (lines.length === 0) {
            nutritionStatus.textContent = 'Trage zuerst Zutaten ein.';
            nutritionResults.replaceChildren();
            nutritionSearchItems = [];
            return;
        }
        if (lines.length > 20) {
            nutritionStatus.textContent = 'Bitte suche höchstens 20 Zutaten gleichzeitig.';
            return;
        }

        const searchButton = document.querySelector('#search-nutrition-button');
        searchButton.disabled = true;
        nutritionResults.replaceChildren();
        nutritionSearchItems = lines.map((original) => ({
            original,
            ...parseIngredientForNutrition(original),
            products: [],
            selectedProductIndex: null
        }));
        try {
            for (let index = 0; index < nutritionSearchItems.length; index += 1) {
                const item = nutritionSearchItems[index];
                nutritionStatus.textContent = `Suche Zutat ${index + 1} von ${nutritionSearchItems.length}: ${item.name}`;
                const response = await apiRequest(`/api/nutrition/search?q=${encodeURIComponent(item.name)}`);
                const data = await readResponse(response, `Nährwerte für „${item.name}“ konnten nicht gesucht werden.`);
                item.products = data.products;
            }
            renderNutritionSearchResults();
            nutritionStatus.textContent = 'Wähle für jede Zutat den passenden Treffer aus. Für die Berechnung wird die Menge in g benötigt.';
        } catch (error) {
            nutritionStatus.textContent = error.message || 'Nährwertsuche fehlgeschlagen.';
        } finally {
            searchButton.disabled = false;
        }
    }

    function updateRecipeOptions() {
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = recipes.length ? 'Rezept auswählen' : 'Zuerst ein Rezept speichern';
        planRecipe.replaceChildren(placeholder);
        recipes.forEach((recipe) => {
            const option = document.createElement('option');
            option.value = recipe.id;
            option.textContent = recipe.title;
            planRecipe.append(option);
        });
        document.querySelector('#save-plan-button').disabled = recipes.length === 0;
    }

    async function loadRecipes() {
        try {
            const response = await apiRequest('/api/recipes');
            const data = await readResponse(response, 'Rezepte konnten nicht geladen werden.');
            recipes.splice(0, recipes.length, ...data);
            recipeList.replaceChildren(...data.map(createRecipeCard));
            emptyState.hidden = data.length > 0;
            recipeCount.textContent = `${data.length} ${data.length === 1 ? 'Rezept' : 'Rezepte'}`;
            updateRecipeOptions();
            renderPlanView();
            renderCommunityRecipes();
        } catch (error) {
            showMessage(error.message || 'Verbindung zum Server fehlgeschlagen.');
        }
    }

    function getSelectedRange() {
        const viewDate = planViewDate.value || getLocalDateString();
        const selectedDate = new Date(`${viewDate}T00:00:00`);
        if (planPeriod.value === 'day') {
            return { start: viewDate, end: viewDate };
        }
        const start = new Date(selectedDate);
        const daysSinceMonday = (start.getDay() + 6) % 7;
        start.setDate(start.getDate() - daysSinceMonday);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        return { start: getLocalDateString(start), end: getLocalDateString(end) };
    }

    function renderPlanView() {
        const range = getSelectedRange();
        const selectedPlans = mealPlans
            .filter((plan) => plan.date >= range.start && plan.date <= range.end)
            .sort((first, second) => first.date.localeCompare(second.date));
        const dateFormatter = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const weekdayFormatter = new Intl.DateTimeFormat('de-DE', { weekday: 'long' });
        const rangeLabel = range.start === range.end
            ? dateFormatter.format(new Date(`${range.start}T00:00:00`))
            : `${dateFormatter.format(new Date(`${range.start}T00:00:00`))} – ${dateFormatter.format(new Date(`${range.end}T00:00:00`))}`;
        document.querySelector('#plan-range-label').textContent = `(${rangeLabel})`;

        const calendarDays = [];
        const currentDate = new Date(`${range.start}T00:00:00`);
        const endDate = new Date(`${range.end}T00:00:00`);
        while (currentDate <= endDate) {
            const dateString = getLocalDateString(currentDate);
            const day = document.createElement('section');
            day.className = `meal-calendar-day${dateString === getLocalDateString() ? ' is-today' : ''}`;
            day.setAttribute('role', 'listitem');

            const heading = document.createElement('h4');
            heading.className = 'meal-calendar-heading';
            const weekday = document.createElement('span');
            weekday.textContent = weekdayFormatter.format(currentDate);
            const date = document.createElement('time');
            date.dateTime = dateString;
            date.textContent = dateFormatter.format(currentDate);
            heading.append(weekday, date);

            const dayPlans = selectedPlans.filter((plan) => plan.date === dateString);
            const meals = dayPlans.map((plan) => {
                const recipe = recipes.find((entry) => entry.id === plan.recipeId);
                const meal = document.createElement('article');
                meal.className = 'meal-calendar-event';
                const title = document.createElement('strong');
                title.className = 'd-block';
                title.textContent = recipe ? recipe.title : 'Rezept nicht mehr verfügbar';
                meal.append(title);

                if (recipe && Array.isArray(recipe.nutritionIngredients) && recipe.nutritionIngredients.length > 0) {
                    meal.append(createNutritionSummary(
                        recipe.nutritionIngredients,
                        recipe.ingredients.length,
                        recipe.servings || 1,
                        'plan-nutrition'
                    ));
                } else {
                    const nutritionNote = document.createElement('p');
                    nutritionNote.className = 'plan-nutrition mb-0';
                    nutritionNote.textContent = 'Nährwerte nicht verfügbar.';
                    meal.append(nutritionNote);
                }

                const removeButton = document.createElement('button');
                removeButton.type = 'button';
                removeButton.className = 'btn btn-sm btn-outline-danger mt-2';
                removeButton.dataset.planId = plan.id;
                removeButton.setAttribute('aria-label', `${recipe ? recipe.title : 'Gericht'} aus dem Plan entfernen`);
                removeButton.textContent = 'Entfernen';
                meal.append(removeButton);
                return meal;
            });

            if (meals.length === 0) {
                const emptyDay = document.createElement('p');
                emptyDay.className = 'meal-calendar-empty';
                emptyDay.textContent = 'Kein Gericht geplant';
                meals.push(emptyDay);
            }
            day.append(heading, ...meals);
            calendarDays.push(day);
            currentDate.setDate(currentDate.getDate() + 1);
        }
        planCalendar.classList.toggle('is-week', planPeriod.value === 'week');
        planCalendar.classList.toggle('is-day', planPeriod.value === 'day');
        planCalendar.replaceChildren(...calendarDays);
        planEmptyState.hidden = selectedPlans.length > 0;

        const ingredients = new Map();
        selectedPlans.forEach((plan) => {
            const recipe = recipes.find((entry) => entry.id === plan.recipeId);
            if (!recipe) {
                return;
            }
            recipe.ingredients.forEach((ingredient) => {
                const cleanIngredient = ingredient.trim();
                const normalizedIngredient = cleanIngredient.toLocaleLowerCase('de-DE');
                if (cleanIngredient) {
                    const existingIngredient = ingredients.get(normalizedIngredient);
                    if (existingIngredient) {
                        existingIngredient.count += 1;
                    } else {
                        ingredients.set(normalizedIngredient, { ingredient: cleanIngredient, count: 1 });
                    }
                }
            });
        });
        const shoppingItems = [...ingredients.values()].sort((first, second) => first.ingredient.localeCompare(second.ingredient, 'de'));
        shoppingList.replaceChildren(...shoppingItems.map(({ ingredient, count }) => {
            const item = document.createElement('li');
            item.textContent = count > 1 ? `${ingredient} (in ${count} geplanten Gerichten)` : ingredient;
            return item;
        }));
        shoppingEmptyState.hidden = shoppingItems.length > 0;

        const currentWeekStart = getSelectedRangeForDate(new Date());
        document.querySelector('#planned-count').textContent = String(
            mealPlans.filter((plan) => plan.date >= currentWeekStart.start && plan.date <= currentWeekStart.end).length
        );
    }

    function getSelectedRangeForDate(date) {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        return { start: getLocalDateString(start), end: getLocalDateString(end) };
    }

    async function loadPlans() {
        try {
            const response = await apiRequest('/api/plans');
            mealPlans = await readResponse(response, 'Essensplan konnte nicht geladen werden.');
            renderPlanView();
        } catch (error) {
            showMessage(error.message || 'Verbindung zum Server fehlgeschlagen.');
        }
    }

    recipeForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const saveButton = document.querySelector('#save-recipe-button');
        const formData = new FormData(recipeForm);
        const ingredients = formData.get('ingredients').split('\n').map((item) => item.trim()).filter(Boolean);
        saveButton.disabled = true;

        try {
            const response = await apiRequest('/api/recipes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: formData.get('title').trim(),
                    description: formData.get('description').trim(),
                    ingredients,
                    instructions: formData.get('instructions').trim(),
                    prepTime: Number(formData.get('prepTime')) || null,
                    servings: Number(formData.get('servings')) || 1,
                    image: recipeImageData,
                    nutritionIngredients: nutritionSearchItems.flatMap((item) => {
                        if (item.selectedProductIndex === null) {
                            return [];
                        }
                        const product = item.products[item.selectedProductIndex];
                        return product ? [{
                            ingredient: item.original,
                            amountGrams: item.amountGrams,
                            productName: product.name,
                            productCode: product.code,
                            nutrients: product.nutrients
                        }] : [];
                    }),
                    shareWithCommunity: document.querySelector('#share-recipe-with-community').checked
                })
            });
            const data = await readResponse(response, 'Rezept konnte nicht gespeichert werden.');

            recipeForm.reset();
            recipeImageData = null;
            recipeImagePreview.removeAttribute('src');
            recipeImagePreview.hidden = true;
            nutritionSearchItems = [];
            nutritionStatus.textContent = '';
            nutritionResults.replaceChildren();
            bootstrap.Modal.getOrCreateInstance(document.querySelector('#createRecipeModal')).hide();
            showMessage(data.message || 'Rezept wurde gespeichert.', true);
            await loadRecipes();
            if (data.communityRecipe) {
                await loadCommunityRecipes();
            }
        } catch (error) {
            showMessage(error.message || 'Verbindung zum Server fehlgeschlagen.');
        } finally {
            saveButton.disabled = false;
        }
    });

    document.querySelector('#search-nutrition-button').addEventListener('click', searchIngredientNutrition);
    recipeImageInput.addEventListener('change', () => {
        const [file] = recipeImageInput.files;
        recipeImageData = null;
        recipeImagePreview.hidden = true;
        recipeImagePreview.removeAttribute('src');
        if (!file) {
            return;
        }
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 3 * 1024 * 1024) {
            recipeImageInput.value = '';
            showMessage('Bitte wähle ein PNG-, JPG-, WebP- oder GIF-Bild mit höchstens 3 MB.');
            return;
        }
        const reader = new FileReader();
        reader.addEventListener('load', () => {
            if (typeof reader.result !== 'string') {
                showMessage('Das Rezept-Cover konnte nicht gelesen werden.');
                return;
            }
            recipeImageData = reader.result;
            recipeImagePreview.src = reader.result;
            recipeImagePreview.hidden = false;
        });
        reader.addEventListener('error', () => showMessage('Das Rezept-Cover konnte nicht gelesen werden.'));
        reader.readAsDataURL(file);
    });
    ingredientsInput.addEventListener('input', () => {
        nutritionSearchItems = [];
        nutritionStatus.textContent = '';
        nutritionResults.replaceChildren();
    });
    document.querySelector('#recipe-servings').addEventListener('input', updateNutritionPreview);
    communitySearch.addEventListener('input', renderCommunityRecipes);
    communityRecipeList.addEventListener('click', (event) => {
        const favoriteButton = event.target.closest('[data-favorite-type]');
        if (favoriteButton) {
            toggleFavorite(favoriteButton.dataset.favoriteType, favoriteButton.dataset.favoriteId, favoriteButton);
            return;
        }
        const saveButton = event.target.closest('[data-save-community-recipe-id]');
        if (saveButton) {
            saveCommunityRecipe(saveButton.dataset.saveCommunityRecipeId, saveButton);
            return;
        }
        const recipeButton = event.target.closest('[data-community-recipe-id]');
        if (recipeButton) {
            openCommunityRecipe(recipeButton.dataset.communityRecipeId);
        }
    });
    recipeList.addEventListener('click', (event) => {
        const favoriteButton = event.target.closest('[data-favorite-type]');
        if (favoriteButton) {
            toggleFavorite(favoriteButton.dataset.favoriteType, favoriteButton.dataset.favoriteId, favoriteButton);
        }
    });
    communityRecipeDetails.addEventListener('click', (event) => {
        const favoriteButton = event.target.closest('[data-favorite-type]');
        if (favoriteButton) {
            toggleFavorite(favoriteButton.dataset.favoriteType, favoriteButton.dataset.favoriteId, favoriteButton);
            return;
        }
        const saveButton = event.target.closest('[data-save-community-recipe-id]');
        if (saveButton) {
            saveCommunityRecipe(saveButton.dataset.saveCommunityRecipeId, saveButton);
        }
    });

    planForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const saveButton = document.querySelector('#save-plan-button');
        saveButton.disabled = true;
        try {
            const response = await apiRequest('/api/plans', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recipeId: planRecipe.value, date: planDate.value })
            });
            await readResponse(response, 'Gericht konnte nicht eingeplant werden.');
            planRecipe.value = '';
            showMessage('Gericht wurde eingeplant.', true);
            await loadPlans();
        } catch (error) {
            showMessage(error.message || 'Verbindung zum Server fehlgeschlagen.');
        } finally {
            saveButton.disabled = recipes.length === 0;
        }
    });

    planCalendar.addEventListener('click', async (event) => {
        const removeButton = event.target.closest('[data-plan-id]');
        if (!removeButton) {
            return;
        }
        removeButton.disabled = true;
        try {
            const response = await apiRequest(`/api/plans/${encodeURIComponent(removeButton.dataset.planId)}`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Gericht konnte nicht entfernt werden.');
            }
            mealPlans = mealPlans.filter((plan) => plan.id !== removeButton.dataset.planId);
            renderPlanView();
            showMessage('Gericht wurde aus dem Plan entfernt.', true);
        } catch (error) {
            showMessage(error.message || 'Verbindung zum Server fehlgeschlagen.');
            removeButton.disabled = false;
        }
    });

    planViewDate.addEventListener('change', renderPlanView);
    planPeriod.addEventListener('change', renderPlanView);

    document.querySelector('#logout-button').addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('email');
        window.location.replace('login.html');
    });

    const today = getLocalDateString();
    planDate.value = today;
    planViewDate.value = today;
    renderPlanView();
    loadRecipes();
    loadPlans();
    loadCommunityRecipes();
    loadFavorites();
}
