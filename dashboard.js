const API_BASE_URL = 'http://localhost:3000';
const token = localStorage.getItem('token');

if (!token) {
    window.location.replace('login.html');
} else {
    const recipeForm = document.querySelector('#recipe-form');
    const recipeList = document.querySelector('#recipe-list');
    const emptyState = document.querySelector('#empty-state');
    const recipeSearch = document.querySelector('#recipe-search');
    const recipeSort = document.querySelector('#recipe-sort');
    const recipeNoResults = document.querySelector('#recipe-no-results');
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
    const calendarSettingsForm = document.querySelector('#calendar-settings-form');
    const shoppingWeekday = document.querySelector('#shopping-weekday');
    const calendarFeedUrl = document.querySelector('#calendar-feed-url');
    const subscribeCalendarLink = document.querySelector('#subscribe-calendar-link');
    const calendarSettingsStatus = document.querySelector('#calendar-settings-status');
    const shoppingList = document.querySelector('#shopping-list');
    const shoppingEmptyState = document.querySelector('#shopping-empty-state');
    const communityRecipeList = document.querySelector('#community-recipe-list');
    const communitySearch = document.querySelector('#community-search');
    const communityEmptyState = document.querySelector('#community-empty-state');
    const communityRecipeDetails = document.querySelector('#community-recipe-details');
    const recipeImageInput = document.querySelector('#recipe-image');
    const recipeImagePreview = document.querySelector('#recipe-image-preview');
    const recipes = [];
    let communityRecipes = [];
    let mealPlans = [];
    let activeCommunityRecipe = null;
    let favorites = { recipes: [], community: [] };
    let recipeImageData = null;
    let editingRecipeId = null;
    const nutritionEstimates = new Map();
    const pendingNutritionEstimates = new Map();
    let nutritionFailureMessageShown = false;

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

    function formatNutritionValue(value, suffix = 'g') {
        if (value === null) {
            return 'nicht verfügbar';
        }
        return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(value)} ${suffix}`;
    }

    function getNutritionEstimateKey(recipe) {
        return JSON.stringify({
            title: recipe.title.trim(),
            ingredients: recipe.ingredients,
            servings: recipe.servings || 1
        }).toLocaleLowerCase('de-DE');
    }

    function createRecipeNutritionDisplay(recipe) {
        const key = getNutritionEstimateKey(recipe);
        const estimate = nutritionEstimates.get(key);
        const section = document.createElement('section');
        section.className = 'recipe-nutrition mt-3';
        section.dataset.recipeNutritionKey = key;
        const heading = document.createElement('strong');
        heading.textContent = 'Geschätzte Nährwerte pro Portion';
        section.append(heading);

        if (estimate?.nutrition) {
            const values = document.createElement('div');
            values.className = 'recipe-nutrition-grid mt-2';
            [
                ['Energie', estimate.nutrition.kcal, 'kcal'],
                ['Eiweiß', estimate.nutrition.protein, 'g'],
                ['Kohlenhydrate', estimate.nutrition.carbohydrates, 'g'],
                ['Fett', estimate.nutrition.fat, 'g'],
                ['Ballaststoffe', estimate.nutrition.fiber, 'g'],
                ['Salz', estimate.nutrition.salt, 'g']
            ].forEach(([label, value, unit]) => {
                const item = document.createElement('div');
                const name = document.createElement('small');
                name.textContent = label;
                const amount = document.createElement('strong');
                amount.textContent = formatNutritionValue(value, unit);
                item.append(name, amount);
                values.append(item);
            });
            const source = document.createElement('small');
            source.className = 'd-block text-muted mt-1';
            source.textContent = 'KI-Schätzung via OpenRouter; Werte können abweichen.';
            section.append(values, source);
        } else {
            const status = document.createElement('p');
            status.className = `small mb-0 mt-1 ${estimate?.error ? 'text-danger' : 'text-muted'}`;
            status.textContent = estimate?.error || 'Wird automatisch berechnet …';
            section.append(status);
        }
        return section;
    }

    function refreshRecipeNutritionDisplays() {
        renderRecipeList();
        renderCommunityRecipes();
        if (activeCommunityRecipe) {
            const existing = communityRecipeDetails.querySelector('[data-recipe-nutrition-key]');
            if (existing) {
                existing.replaceWith(createRecipeNutritionDisplay(activeCommunityRecipe));
            }
        }
    }

    function renderRecipeList() {
        const searchTerm = recipeSearch.value.trim().toLocaleLowerCase('de-DE');
        const visibleRecipes = recipes
            .filter((recipe) => `${recipe.title} ${recipe.description || ''} ${(recipe.ingredients || []).join(' ')}`
                .toLocaleLowerCase('de-DE')
                .includes(searchTerm))
            .slice();

        if (recipeSort.value === 'title-asc') {
            visibleRecipes.sort((first, second) => first.title.localeCompare(second.title, 'de'));
        } else if (recipeSort.value === 'title-desc') {
            visibleRecipes.sort((first, second) => second.title.localeCompare(first.title, 'de'));
        } else if (recipeSort.value === 'prep-time') {
            visibleRecipes.sort((first, second) => {
                const firstTime = first.prepTime || Number.POSITIVE_INFINITY;
                const secondTime = second.prepTime || Number.POSITIVE_INFINITY;
                return firstTime - secondTime || first.title.localeCompare(second.title, 'de');
            });
        }

        recipeList.replaceChildren(...visibleRecipes.map(createRecipeCard));
        if (recipes.length === 0) {
            recipeList.append(emptyState);
        }
        emptyState.hidden = recipes.length > 0;
        recipeNoResults.hidden = recipes.length === 0 || visibleRecipes.length > 0;
    }

    async function requestNutritionEstimate(recipe) {
        const key = getNutritionEstimateKey(recipe);
        if (nutritionEstimates.has(key)) {
            return nutritionEstimates.get(key);
        }
        if (pendingNutritionEstimates.has(key)) {
            return pendingNutritionEstimates.get(key);
        }

        const request = (async () => {
            try {
                const response = await apiRequest('/api/nutrition/recipe-estimate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: recipe.title,
                        ingredients: recipe.ingredients,
                        servings: recipe.servings || 1
                    })
                });
                const data = await readResponse(response, 'Nährwerte konnten nicht berechnet werden.');
                const estimate = { nutrition: data.nutrition };
                nutritionEstimates.set(key, estimate);
                return estimate;
            } catch (error) {
                const estimate = { error: error.message || 'Nährwerte konnten nicht berechnet werden.' };
                nutritionEstimates.set(key, estimate);
                if (!nutritionFailureMessageShown) {
                    nutritionFailureMessageShown = true;
                    showMessage(`Automatische Nährwertschätzung fehlgeschlagen: ${estimate.error}`);
                }
                return estimate;
            } finally {
                pendingNutritionEstimates.delete(key);
                refreshRecipeNutritionDisplays();
            }
        })();
        pendingNutritionEstimates.set(key, request);
        return request;
    }

    async function requestNutritionEstimates(recipeListToEstimate) {
        const uniqueRecipes = [...new Map(recipeListToEstimate.map((recipe) => [
            getNutritionEstimateKey(recipe),
            recipe
        ])).values()].filter((recipe) => (
            !nutritionEstimates.has(getNutritionEstimateKey(recipe))
        ));
        for (let index = 0; index < uniqueRecipes.length; index += 2) {
            const batch = uniqueRecipes.slice(index, index + 2);
            const estimates = await Promise.all(batch.map(requestNutritionEstimate));
            const providerLimitError = estimates.find((estimate) => (
                estimate.error?.includes('HTTP 402')
                || estimate.error?.includes('HTTP 429')
                || estimate.error?.includes('Zu viele Nährwertanfragen')
            ));
            if (providerLimitError) {
                uniqueRecipes.slice(index + batch.length).forEach((recipe) => {
                    nutritionEstimates.set(getNutritionEstimateKey(recipe), { error: providerLimitError.error });
                });
                refreshRecipeNutritionDisplays();
                return;
            }
        }
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

        body.append(createRecipeNutritionDisplay(recipe));

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

        const actions = document.createElement('div');
        actions.className = 'd-flex gap-2 mt-auto pt-3';
        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'btn btn-outline-primary btn-sm';
        editButton.textContent = 'Bearbeiten';
        editButton.addEventListener('click', () => editRecipe(recipe));
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'btn btn-outline-danger btn-sm';
        deleteButton.textContent = 'Löschen';
        deleteButton.addEventListener('click', () => deleteRecipe(recipe, deleteButton));
        actions.append(editButton, deleteButton);
        body.append(actions);

        card.append(image, body);
        column.append(card);
        return column;
    }

    function editRecipe(recipe) {
        editingRecipeId = recipe.id;
        recipeForm.elements.title.value = recipe.title;
        recipeForm.elements.description.value = recipe.description || '';
        recipeForm.elements.ingredients.value = recipe.ingredients.join('\n');
        recipeForm.elements.instructions.value = recipe.instructions || '';
        recipeForm.elements.prepTime.value = recipe.prepTime || '';
        recipeForm.elements.servings.value = recipe.servings || 1;
        document.querySelector('#share-recipe-with-community').checked = recipe.shareWithCommunity === true;
        recipeImageData = null;
        recipeImageInput.value = '';
        if (recipe.image) {
            recipeImagePreview.src = recipe.image;
            recipeImagePreview.hidden = false;
        } else {
            recipeImagePreview.removeAttribute('src');
            recipeImagePreview.hidden = true;
        }

        document.querySelector('#createRecipeModalLabel').lastChild.textContent = 'Rezept bearbeiten';
        document.querySelector('#save-recipe-button').innerHTML = '<i class="fas fa-save me-2"></i>Änderungen speichern';
        bootstrap.Modal.getOrCreateInstance(document.querySelector('#createRecipeModal')).show();
    }

    async function deleteRecipe(recipe, button) {
        if (!window.confirm(`Möchtest du „${recipe.title}“ wirklich löschen? Zugehörige Planeinträge werden ebenfalls entfernt.`)) {
            return;
        }

        button.disabled = true;
        try {
            const response = await apiRequest(`/api/recipes/${encodeURIComponent(recipe.id)}`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Rezept konnte nicht gelöscht werden.');
            }
            showMessage('Rezept wurde gelöscht.', true);
            await Promise.all([loadRecipes(), loadPlans(), loadFavorites()]);
            if (recipe.shareWithCommunity) {
                await loadCommunityRecipes();
            }
        } catch (error) {
            showMessage(error.message || 'Verbindung zum Server fehlgeschlagen.');
            button.disabled = false;
        }
    }

    function getRecipeCalories(recipe) {
        const estimate = nutritionEstimates.get(getNutritionEstimateKey(recipe));
        return estimate?.nutrition?.kcal ?? null;
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
            ? ' Nährwerte werden geladen'
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
        body.append(category, title, description, metadata, createRecipeNutritionDisplay(recipe), author, favoriteButton, detailsButton, saveButton);
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
            void requestNutritionEstimates(communityRecipes);
        } catch (error) {
            showMessage(error.message || 'Community-Rezepte konnten nicht geladen werden.');
        }
    }

    async function loadFavorites() {
        try {
            const response = await apiRequest('/api/favorites');
            favorites = await readResponse(response, 'Favoriten konnten nicht geladen werden.');
            updateFavoriteCount();
            renderRecipeList();
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
            renderRecipeList();
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
                body: JSON.stringify({})
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

            communityRecipeDetails.append(createRecipeNutritionDisplay(recipe));
            void requestNutritionEstimate(recipe);
        } catch (error) {
            communityRecipeDetails.replaceChildren();
            const message = document.createElement('p');
            message.className = 'alert alert-danger';
            message.textContent = error.message || 'Community-Rezept konnte nicht geladen werden.';
            communityRecipeDetails.append(message);
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
            renderRecipeList();
            recipeCount.textContent = `${data.length} ${data.length === 1 ? 'Rezept' : 'Rezepte'}`;
            updateRecipeOptions();
            renderPlanView();
            renderCommunityRecipes();
            void requestNutritionEstimates(data);
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

            const heading = document.createElement('button');
            heading.type = 'button';
            heading.className = 'meal-calendar-heading';
            heading.dataset.calendarDate = dateString;
            heading.setAttribute(
                'aria-label',
                `Tagesansicht für ${weekdayFormatter.format(currentDate)}, ${dateFormatter.format(currentDate)} anzeigen`
            );
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

                if (recipe) {
                    meal.append(createRecipeNutritionDisplay(recipe));
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

    function showCalendarFeedUrl(url) {
        calendarFeedUrl.value = url;
        subscribeCalendarLink.href = url.replace(/^https?:/, 'webcal:');
    }

    async function loadCalendarSettings() {
        try {
            const response = await apiRequest('/api/calendar/settings');
            const settings = await readResponse(response, 'Kalender-Einstellungen konnten nicht geladen werden.');
            shoppingWeekday.value = String(settings.shoppingWeekday);
            showCalendarFeedUrl(settings.feedUrl);
        } catch (error) {
            calendarSettingsStatus.textContent = error.message || 'Kalender-Einstellungen konnten nicht geladen werden.';
            calendarSettingsStatus.className = 'small text-danger';
        }
    }

    calendarSettingsForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const saveButton = document.querySelector('#save-calendar-settings');
        saveButton.disabled = true;
        calendarSettingsStatus.textContent = '';
        try {
            const response = await apiRequest('/api/calendar/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shoppingWeekday: Number(shoppingWeekday.value) })
            });
            const data = await readResponse(response, 'Einkaufstag konnte nicht gespeichert werden.');
            calendarSettingsStatus.textContent = data.message;
            calendarSettingsStatus.className = 'small text-success';
        } catch (error) {
            calendarSettingsStatus.textContent = error.message || 'Einkaufstag konnte nicht gespeichert werden.';
            calendarSettingsStatus.className = 'small text-danger';
        } finally {
            saveButton.disabled = false;
        }
    });

    document.querySelector('#copy-calendar-link').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(calendarFeedUrl.value);
            calendarSettingsStatus.textContent = 'iCal-Link wurde kopiert.';
            calendarSettingsStatus.className = 'small text-success';
        } catch (error) {
            calendarSettingsStatus.textContent = 'Der Link konnte nicht kopiert werden. Markiere ihn und kopiere ihn manuell.';
            calendarSettingsStatus.className = 'small text-danger';
        }
    });

    document.querySelector('#rotate-calendar-link').addEventListener('click', async (event) => {
        if (!window.confirm('Den Kalender-Link erneuern? Der bisherige Link funktioniert danach nicht mehr.')) {
            return;
        }
        const button = event.currentTarget;
        button.disabled = true;
        calendarSettingsStatus.textContent = '';
        try {
            const response = await apiRequest('/api/calendar/settings/rotate-link', { method: 'POST' });
            const settings = await readResponse(response, 'Kalender-Link konnte nicht erneuert werden.');
            showCalendarFeedUrl(settings.feedUrl);
            calendarSettingsStatus.textContent = settings.message;
            calendarSettingsStatus.className = 'small text-success';
        } catch (error) {
            calendarSettingsStatus.textContent = error.message || 'Kalender-Link konnte nicht erneuert werden.';
            calendarSettingsStatus.className = 'small text-danger';
        } finally {
            button.disabled = false;
        }
    });

    document.querySelector('#new-recipe-button').addEventListener('click', () => {
        recipeForm.reset();
        editingRecipeId = null;
        recipeImageData = null;
        recipeImagePreview.removeAttribute('src');
        recipeImagePreview.hidden = true;
        document.querySelector('#createRecipeModalLabel').lastChild.textContent = 'Neues Rezept';
        document.querySelector('#save-recipe-button').innerHTML = '<i class="fas fa-save me-2"></i>Speichern';
        bootstrap.Modal.getOrCreateInstance(document.querySelector('#createRecipeModal')).show();
    });

    recipeSearch.addEventListener('input', renderRecipeList);
    recipeSort.addEventListener('change', renderRecipeList);

    recipeForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const saveButton = document.querySelector('#save-recipe-button');
        const formData = new FormData(recipeForm);
        const ingredients = formData.get('ingredients').split('\n').map((item) => item.trim()).filter(Boolean);
        saveButton.disabled = true;

        try {
            const response = await apiRequest(editingRecipeId
                ? `/api/recipes/${encodeURIComponent(editingRecipeId)}`
                : '/api/recipes', {
                method: editingRecipeId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: formData.get('title').trim(),
                    description: formData.get('description').trim(),
                    ingredients,
                    instructions: formData.get('instructions').trim(),
                    prepTime: Number(formData.get('prepTime')) || null,
                    servings: Number(formData.get('servings')) || 1,
                    image: recipeImageData,
                    shareWithCommunity: document.querySelector('#share-recipe-with-community').checked
                })
            });
            const data = await readResponse(response, 'Rezept konnte nicht gespeichert werden.');

            recipeForm.reset();
            editingRecipeId = null;
            recipeImageData = null;
            recipeImagePreview.removeAttribute('src');
            recipeImagePreview.hidden = true;
            bootstrap.Modal.getOrCreateInstance(document.querySelector('#createRecipeModal')).hide();
            showMessage(data.message || 'Rezept wurde gespeichert.', true);
            await loadRecipes();
            await loadCommunityRecipes();
        } catch (error) {
            showMessage(error.message || 'Verbindung zum Server fehlgeschlagen.');
        } finally {
            saveButton.disabled = false;
        }
    });

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
        const dayButton = event.target.closest('[data-calendar-date]');
        if (dayButton) {
            planPeriod.value = 'day';
            planViewDate.value = dayButton.dataset.calendarDate;
            renderPlanView();
            return;
        }

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
    document.querySelector('#plan-previous').addEventListener('click', () => {
        const date = new Date(`${planViewDate.value || getLocalDateString()}T00:00:00`);
        date.setDate(date.getDate() - (planPeriod.value === 'day' ? 1 : 7));
        planViewDate.value = getLocalDateString(date);
        renderPlanView();
    });
    document.querySelector('#plan-next').addEventListener('click', () => {
        const date = new Date(`${planViewDate.value || getLocalDateString()}T00:00:00`);
        date.setDate(date.getDate() + (planPeriod.value === 'day' ? 1 : 7));
        planViewDate.value = getLocalDateString(date);
        renderPlanView();
    });
    document.querySelector('#plan-today').addEventListener('click', () => {
        planViewDate.value = getLocalDateString();
        renderPlanView();
    });

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
    loadCalendarSettings();
}
