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
    const dashboardToast = document.querySelector('#dashboard-toast');
    const dashboardToastIcon = document.querySelector('#dashboard-toast-icon');
    const dashboardToastTitle = document.querySelector('#dashboard-toast-title');
    const dashboardToastMessage = document.querySelector('#dashboard-toast-message');
    const dashboardToastProgress = document.querySelector('.dashboard-toast-progress');
    const userName = document.querySelector('#user-name');
    const openFavoritesButton = document.querySelector('#open-favorites-button');
    const favoriteCollection = document.querySelector('#favorite-collection');
    const favoriteRecipeList = document.querySelector('#favorite-recipe-list');
    const favoriteSearch = document.querySelector('#favorite-search');
    const favoriteEmptyState = document.querySelector('#favorite-empty-state');
    const favoriteNoResults = document.querySelector('#favorite-no-results');
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
    const communityRecipeTitle = document.querySelector('#community-recipe-title');
    const recipeDetailsContent = document.querySelector('#recipe-detail-content');
    const recipeDetailsTitle = document.querySelector('#recipe-detail-modal-title');
    const recipeImageInput = document.querySelector('#recipe-image');
    const recipeImagePreview = document.querySelector('#recipe-image-preview');
    const recipes = [];
    let communityRecipes = [];
    let mealPlans = [];
    let activeFavoriteFilter = 'all';
    let activeCommunityRecipe = null;
    let favorites = { recipes: [], community: [] };
    let recipeImageData = null;
    let editingRecipeId = null;
    const nutritionEstimates = new Map();
    const pendingNutritionEstimates = new Map();
    let nutritionRequestQueue = Promise.resolve();
    let nutritionFailureMessageShown = false;
    let dashboardToastTimeout;
    let dashboardToastHideTimeout;

    let savedUser = {};
    try {
        savedUser = JSON.parse(localStorage.getItem('user') || '{}');
    } catch (error) {
        savedUser = {};
    }
    const emailName = (localStorage.getItem('email') || '').split('@')[0];
    userName.textContent = savedUser.name || emailName || 'Chefkoch';

    function showMessage(message, isSuccess = false) {
        showToast(message, isSuccess
            ? { title: 'Erfolgreich' }
            : { title: 'Fehler', icon: 'fa-exclamation-circle', variant: 'error' });
    }

    function dismissDashboardToast() {
        window.clearTimeout(dashboardToastTimeout);
        window.clearTimeout(dashboardToastHideTimeout);
        dashboardToast.classList.remove('is-visible');
        dashboardToastHideTimeout = window.setTimeout(() => {
            dashboardToast.hidden = true;
        }, 220);
    }

    function showToast(message, { title = 'Gespeichert', icon = 'fa-check', variant = 'success' } = {}) {
        window.clearTimeout(dashboardToastTimeout);
        window.clearTimeout(dashboardToastHideTimeout);
        dashboardToast.classList.toggle('is-error', variant === 'error');
        dashboardToast.setAttribute('role', variant === 'error' ? 'alert' : 'status');
        dashboardToast.setAttribute('aria-live', variant === 'error' ? 'assertive' : 'polite');
        dashboardToastTitle.textContent = title;
        dashboardToastMessage.textContent = message;
        dashboardToastIcon.querySelector('i').className = `fas ${icon}`;
        dashboardToast.hidden = false;
        dashboardToast.classList.remove('is-visible');
        dashboardToastProgress.style.animation = 'none';
        void dashboardToastProgress.offsetWidth;
        dashboardToastProgress.style.animation = '';
        window.requestAnimationFrame(() => dashboardToast.classList.add('is-visible'));
        dashboardToastTimeout = window.setTimeout(dismissDashboardToast, 4800);
    }

    function requestConfirmation({ title, message, confirmLabel, tone = 'danger', icon = 'fa-trash-alt' }) {
        const modalElement = document.querySelector('#confirmationModal');
        const titleElement = document.querySelector('#confirmation-modal-title');
        const messageElement = document.querySelector('#confirmation-modal-message');
        const iconElement = document.querySelector('#confirmation-modal-icon');
        const confirmButton = document.querySelector('#confirmation-accept-button');
        const modal = bootstrap.Modal.getOrCreateInstance(modalElement);

        titleElement.textContent = title;
        messageElement.textContent = message;
        iconElement.className = `confirmation-modal-icon${tone === 'warning' ? ' is-warning' : ''}`;
        iconElement.querySelector('i').className = `fas ${icon}`;
        confirmButton.textContent = confirmLabel;
        confirmButton.className = `btn rounded-pill px-4 confirmation-modal-accept is-${tone}`;

        return new Promise((resolve) => {
            let confirmed = false;
            const finish = () => {
                confirmButton.removeEventListener('click', accept);
                confirmButton.disabled = false;
                resolve(confirmed);
            };
            const accept = () => {
                confirmed = true;
                confirmButton.disabled = true;
                modal.hide();
            };

            confirmButton.addEventListener('click', accept);
            modalElement.addEventListener('hidden.bs.modal', finish, { once: true });
            modal.show();
        });
    }

    function updateFavoriteCount() {
        document.querySelector('#favorite-count').textContent = String(favorites.recipes.length + favorites.community.length);
        renderFavoriteRecipes();
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
            if (estimate?.error) {
                const retryButton = document.createElement('button');
                retryButton.type = 'button';
                retryButton.className = 'btn btn-sm btn-outline-secondary mt-2';
                retryButton.textContent = 'Erneut versuchen';
                retryButton.addEventListener('click', () => {
                    nutritionEstimates.delete(key);
                    void requestNutritionEstimate(recipe);
                });
                section.append(retryButton);
            }
        }
        return section;
    }

    function refreshRecipeNutritionDisplays() {
        renderRecipeList();
        renderCommunityRecipes();
        renderFavoriteRecipes();
        refreshRecipeDetailNutrition(communityRecipeDetails, activeCommunityRecipe);
        const activeRecipe = recipes.find((recipe) => recipe.id === recipeDetailsContent.dataset.recipeId);
        refreshRecipeDetailNutrition(recipeDetailsContent, activeRecipe);
        updateCalendarNutritionTotal();
    }

    function refreshRecipeDetailNutrition(container, recipe) {
        if (!recipe) {
            return;
        }
        const existing = container.querySelector('[data-recipe-nutrition-key]');
        if (existing) {
            existing.replaceWith(createRecipeNutritionDisplay(recipe));
        }
        const calories = container.querySelector('[data-community-nutrition-kcal]');
        if (calories) {
            const kcal = getRecipeCalories(recipe);
            calories.textContent = kcal === null
                ? 'Wird berechnet'
                : `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(kcal)} kcal`;
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

    function createRecipeCardCover(recipe) {
        if (recipe.image) {
            const image = document.createElement('img');
            image.className = 'card-img-top recipe-img';
            image.src = recipe.image;
            image.alt = recipe.title;
            image.loading = 'lazy';
            return image;
        }

        const cover = document.createElement('div');
        cover.className = 'recipe-img recipe-cover-placeholder';
        cover.setAttribute('role', 'img');
        cover.setAttribute('aria-label', `Kein Bild für ${recipe.title}`);
        const icon = document.createElement('i');
        icon.className = 'fas fa-utensils';
        icon.setAttribute('aria-hidden', 'true');
        cover.append(icon);
        return cover;
    }

    async function requestNutritionEstimate(recipe) {
        const key = getNutritionEstimateKey(recipe);
        if (nutritionEstimates.has(key)) {
            return nutritionEstimates.get(key);
        }
        if (pendingNutritionEstimates.has(key)) {
            return pendingNutritionEstimates.get(key);
        }

        const request = nutritionRequestQueue.then(async () => {
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
        });
        nutritionRequestQueue = request.then(() => undefined, (error) => {
            console.error('Unexpected nutrition request queue failure:', error);
        });
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
        for (const [index, recipe] of uniqueRecipes.entries()) {
            const estimate = await requestNutritionEstimate(recipe);
            const providerLimitError = estimate.error && (
                estimate.error?.includes('HTTP 402')
                || estimate.error?.includes('HTTP 429')
                || estimate.error?.includes('Zu viele Nährwertanfragen')
            );
            if (providerLimitError) {
                uniqueRecipes.slice(index + 1).forEach((remainingRecipe) => {
                    nutritionEstimates.set(getNutritionEstimateKey(remainingRecipe), { error: estimate.error });
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
        const cover = document.createElement('div');
        cover.className = 'community-card-cover';
        const image = createRecipeCardCover(recipe);
        cover.append(image);
        const category = document.createElement('span');
        category.className = 'community-card-category';
        category.textContent = recipe.shareWithCommunity ? 'Mit Community geteilt' : 'Privates Rezept';
        cover.append(category);
        const favoriteButton = createFavoriteButton('recipes', recipe.id);
        favoriteButton.className = 'community-card-favorite';
        favoriteButton.setAttribute('aria-label', favorites.recipes.includes(recipe.id)
            ? 'Aus Favoriten entfernen'
            : 'Zu Favoriten hinzufügen');
        favoriteButton.title = favoriteButton.getAttribute('aria-label');
        favoriteButton.replaceChildren();
        const heart = document.createElement('i');
        heart.className = favorites.recipes.includes(recipe.id) ? 'fas fa-heart' : 'far fa-heart';
        heart.setAttribute('aria-hidden', 'true');
        const favoriteLabel = document.createElement('span');
        favoriteLabel.className = 'visually-hidden';
        favoriteLabel.textContent = favoriteButton.getAttribute('aria-label');
        favoriteButton.append(heart, favoriteLabel);
        cover.append(favoriteButton);

        const body = document.createElement('div');
        body.className = 'card-body community-card-body collection-card-body d-flex flex-column';
        const title = document.createElement('h3');
        title.className = 'card-title community-card-title fw-bold';
        title.textContent = recipe.title;
        body.append(title);
        const description = document.createElement('p');
        description.className = 'card-text community-card-description text-muted flex-grow-1';
        description.textContent = recipe.description || 'Dein Rezept, jederzeit griffbereit.';
        body.append(description);

        const metadata = document.createElement('div');
        metadata.className = 'community-card-meta';
        const time = document.createElement('span');
        time.className = 'community-card-stat';
        const timeIcon = document.createElement('i');
        timeIcon.className = 'far fa-clock';
        timeIcon.setAttribute('aria-hidden', 'true');
        time.append(timeIcon, recipe.prepTime ? `${recipe.prepTime} Min.` : 'Zeit offen');
        const calories = document.createElement('span');
        calories.className = 'community-card-stat';
        const caloriesIcon = document.createElement('i');
        caloriesIcon.className = 'fas fa-fire';
        caloriesIcon.setAttribute('aria-hidden', 'true');
        const kcal = getRecipeCalories(recipe);
        calories.append(caloriesIcon, kcal === null
            ? 'Nährwerte folgen'
            : `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(kcal)} kcal`);
        metadata.append(time, calories);
        body.append(metadata);

        const actions = document.createElement('div');
        actions.className = 'collection-card-actions';
        const detailsButton = document.createElement('button');
        detailsButton.type = 'button';
        detailsButton.className = 'btn btn-primary-custom community-card-open-button';
        detailsButton.dataset.recipeDetailsId = recipe.id;
        const detailsIcon = document.createElement('i');
        detailsIcon.className = 'fas fa-book-open';
        detailsIcon.setAttribute('aria-hidden', 'true');
        const detailsLabel = document.createElement('span');
        detailsLabel.textContent = 'Rezept ansehen';
        const detailsArrow = document.createElement('i');
        detailsArrow.className = 'fas fa-arrow-right';
        detailsArrow.setAttribute('aria-hidden', 'true');
        detailsButton.append(detailsIcon, detailsLabel, detailsArrow);
        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'btn btn-outline-primary collection-card-icon-button';
        editButton.setAttribute('aria-label', `„${recipe.title}“ bearbeiten`);
        editButton.title = 'Bearbeiten';
        const editIcon = document.createElement('i');
        editIcon.className = 'fas fa-pen';
        editIcon.setAttribute('aria-hidden', 'true');
        editButton.append(editIcon);
        editButton.addEventListener('click', () => {
            if (favoriteCollection.classList.contains('show')) {
                hideFavoritesView(() => editRecipe(recipe));
                return;
            }
            editRecipe(recipe);
        });
        actions.append(detailsButton, editButton);

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'btn btn-outline-danger collection-card-icon-button';
        deleteButton.setAttribute('aria-label', `„${recipe.title}“ löschen`);
        deleteButton.title = 'Löschen';
        const deleteIcon = document.createElement('i');
        deleteIcon.className = 'fas fa-trash-alt';
        deleteIcon.setAttribute('aria-hidden', 'true');
        deleteButton.append(deleteIcon);
        deleteButton.addEventListener('click', () => {
            if (favoriteCollection.classList.contains('show')) {
                hideFavoritesView(() => {
                    void deleteRecipe(recipe, deleteButton);
                });
                return;
            }
            void deleteRecipe(recipe, deleteButton);
        });
        actions.append(deleteButton);
        body.append(actions);

        card.append(cover, body);
        column.append(card);
        return column;
    }

    function openNewRecipeModal() {
        recipeForm.reset();
        editingRecipeId = null;
        recipeImageData = null;
        recipeImagePreview.removeAttribute('src');
        recipeImagePreview.hidden = true;
        document.querySelector('#recipe-modal-title').textContent = 'Neues Rezept';
        document.querySelector('#save-recipe-button').innerHTML = '<i class="fas fa-save me-2" aria-hidden="true"></i>Rezept speichern';
        bootstrap.Modal.getOrCreateInstance(document.querySelector('#createRecipeModal')).show();
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

        document.querySelector('#recipe-modal-title').textContent = 'Rezept bearbeiten';
        document.querySelector('#save-recipe-button').innerHTML = '<i class="fas fa-save me-2" aria-hidden="true"></i>Änderungen speichern';
        bootstrap.Modal.getOrCreateInstance(document.querySelector('#createRecipeModal')).show();
    }

    async function deleteRecipe(recipe, button) {
        const confirmed = await requestConfirmation({
            title: 'Rezept wirklich löschen?',
            message: `„${recipe.title}“ und alle dazugehörigen Einträge im Wochenplan werden gelöscht. Diese Aktion lässt sich nicht rückgängig machen.`,
            confirmLabel: 'Rezept löschen'
        });
        if (!confirmed) {
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
            if (document.querySelector('#recipeDetailsModal').classList.contains('show')) {
                bootstrap.Modal.getOrCreateInstance(document.querySelector('#recipeDetailsModal')).hide();
            }
            showToast(`„${recipe.title}“ wurde gelöscht.`, {
                title: 'Rezept gelöscht',
                icon: 'fa-trash-alt'
            });
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

    function createCommunityDetailFavoriteButton(recipeId) {
        return createRecipeDetailFavoriteButton('community', recipeId);
    }

    function createRecipeDetailFavoriteButton(type, recipeId) {
        const isFavorite = favorites[type].includes(recipeId);
        const button = createFavoriteButton(type, recipeId);
        button.className = 'btn btn-outline-danger community-detail-favorite';
        button.setAttribute('aria-pressed', String(isFavorite));
        button.replaceChildren();
        const icon = document.createElement('i');
        icon.className = isFavorite ? 'fas fa-heart' : 'far fa-heart';
        icon.setAttribute('aria-hidden', 'true');
        button.append(icon, document.createTextNode(isFavorite ? ' In Favoriten' : ' Zu Favoriten'));
        return button;
    }

    function appendRecipeDetailStats(container, recipe) {
        const stats = document.createElement('div');
        stats.className = 'community-detail-stats';
        [
            ['far fa-clock', 'Zubereitungszeit', recipe.prepTime ? `${recipe.prepTime} Min.` : 'Nicht angegeben'],
            ['fas fa-utensils', 'Portionen', String(recipe.servings || 1)],
            ['fas fa-fire', 'Energie / Portion', getRecipeCalories(recipe) === null
                ? 'Wird berechnet'
                : `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(getRecipeCalories(recipe))} kcal`]
        ].forEach(([iconClass, label, value]) => {
            const stat = document.createElement('div');
            stat.className = 'community-detail-stat';
            const icon = document.createElement('i');
            icon.className = iconClass;
            icon.setAttribute('aria-hidden', 'true');
            const copy = document.createElement('span');
            const statLabel = document.createElement('small');
            statLabel.textContent = label;
            const statValue = document.createElement('strong');
            statValue.textContent = value;
            if (label === 'Energie / Portion') {
                statValue.dataset.communityNutritionKcal = '';
            }
            copy.append(statLabel, statValue);
            stat.append(icon, copy);
            stats.append(stat);
        });
        container.append(stats);
    }

    function appendRecipeDetailSections(container, recipe) {
        const ingredientsSection = document.createElement('section');
        ingredientsSection.className = 'community-detail-section';
        const ingredientsHeading = document.createElement('h3');
        ingredientsHeading.textContent = 'Zutaten';
        const ingredientsSubtitle = document.createElement('p');
        ingredientsSubtitle.className = 'community-detail-section-note';
        ingredientsSubtitle.textContent = `Alles für ${recipe.servings || 1} Portionen`;
        ingredientsSection.append(
            ingredientsHeading,
            ingredientsSubtitle,
            createCommunityIngredients(recipe)
        );
        container.append(ingredientsSection);

        const instructions = Array.isArray(recipe.instructions)
            ? recipe.instructions
            : String(recipe.instructions || '').split('\n').map((step) => step.trim()).filter(Boolean);
        if (instructions.length > 0) {
            const instructionsSection = document.createElement('section');
            instructionsSection.className = 'community-detail-section community-detail-instructions';
            const instructionsHeading = document.createElement('h3');
            instructionsHeading.textContent = 'Zubereitung';
            const instructionsList = document.createElement('ol');
            instructionsList.className = 'community-instruction-list';
            instructions.forEach((instruction) => {
                const item = document.createElement('li');
                item.textContent = instruction;
                instructionsList.append(item);
            });
            instructionsSection.append(instructionsHeading, instructionsList);
            container.append(instructionsSection);
        }

        const nutrition = createRecipeNutritionDisplay(recipe);
        nutrition.classList.add('community-detail-nutrition');
        container.append(nutrition);
    }

    function createRecipeDetailIntro(recipe, { community = false } = {}) {
        const intro = document.createElement('div');
        intro.className = 'community-detail-intro';
        const title = document.createElement('h2');
        title.className = 'community-detail-title';
        title.textContent = recipe.title;
        const author = document.createElement('p');
        author.className = 'community-detail-author';
        const authorIcon = document.createElement('i');
        authorIcon.className = 'fas fa-user-circle';
        authorIcon.setAttribute('aria-hidden', 'true');
        const authorLabel = community
            ? recipe.creatorType === 'user'
                ? ` Geteilt von ${recipe.addedByName}`
                : ` Von ${recipe.addedByName || 'Lezzetify'}`
            : ' Dein Rezept';
        author.append(authorIcon, document.createTextNode(authorLabel));
        intro.append(title, author);

        if (recipe.description) {
            const description = document.createElement('p');
            description.className = 'community-detail-description';
            description.textContent = recipe.description;
            intro.append(description);
        }
        return intro;
    }

    async function openRecipeDetails(recipe) {
        recipeDetailsContent.dataset.recipeId = recipe.id;
        recipeDetailsContent.replaceChildren();
        recipeDetailsTitle.textContent = `Rezeptdetails: ${recipe.title}`;

        const detail = document.createElement('article');
        detail.className = 'community-recipe-detail';
        const hero = document.createElement('div');
        hero.className = 'community-detail-hero';
        const image = createRecipeCardCover(recipe);
        image.classList.add('community-detail-image');
        if (image instanceof HTMLImageElement) {
            image.loading = 'eager';
        }
        hero.append(image);
        const category = document.createElement('span');
        category.className = 'community-detail-category';
        category.textContent = recipe.shareWithCommunity ? 'Mit Community geteilt' : 'Privates Rezept';
        hero.append(category);
        detail.append(hero);

        const content = document.createElement('div');
        content.className = 'community-detail-content';
        content.append(createRecipeDetailIntro(recipe));
        appendRecipeDetailStats(content, recipe);

        const actions = document.createElement('div');
        actions.className = 'community-detail-actions';
        actions.append(createRecipeDetailFavoriteButton('recipes', recipe.id));
        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'btn btn-outline-primary community-detail-edit';
        const editIcon = document.createElement('i');
        editIcon.className = 'fas fa-pen';
        editIcon.setAttribute('aria-hidden', 'true');
        editButton.append(editIcon, document.createTextNode(' Bearbeiten'));
        editButton.addEventListener('click', () => {
            const modalElement = document.querySelector('#recipeDetailsModal');
            modalElement.addEventListener('hidden.bs.modal', () => editRecipe(recipe), { once: true });
            bootstrap.Modal.getOrCreateInstance(modalElement).hide();
        });
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'btn btn-outline-danger community-detail-delete';
        const deleteIcon = document.createElement('i');
        deleteIcon.className = 'fas fa-trash-alt';
        deleteIcon.setAttribute('aria-hidden', 'true');
        deleteButton.append(deleteIcon, document.createTextNode(' Löschen'));
        deleteButton.addEventListener('click', () => {
            const modalElement = document.querySelector('#recipeDetailsModal');
            deleteButton.disabled = true;
            modalElement.addEventListener('hidden.bs.modal', () => {
                void deleteRecipe(recipe, deleteButton);
            }, { once: true });
            bootstrap.Modal.getOrCreateInstance(modalElement).hide();
        });
        actions.append(editButton, deleteButton);
        content.append(actions);
        appendRecipeDetailSections(content, recipe);
        detail.append(content);
        recipeDetailsContent.append(detail);

        const modal = bootstrap.Modal.getOrCreateInstance(document.querySelector('#recipeDetailsModal'));
        modal.show();
        void requestNutritionEstimate(recipe);
    }

    function createCommunityRecipeCard(recipe) {
        const column = document.createElement('div');
        column.className = 'col-12 col-md-6 col-xl-4';
        const card = document.createElement('article');
        card.className = 'card h-100 border-0 shadow-sm recipe-card community-recipe-card';

        const cover = document.createElement('div');
        cover.className = 'community-card-cover';
        const image = createRecipeCardCover(recipe);
        cover.append(image);
        const category = document.createElement('span');
        category.className = 'community-card-category';
        category.textContent = recipe.category || 'Community-Rezept';
        cover.append(category);
        const favoriteButton = createFavoriteButton('community', recipe.id);
        favoriteButton.className = 'community-card-favorite';
        favoriteButton.setAttribute('aria-label', favorites.community.includes(recipe.id)
            ? 'Aus Favoriten entfernen'
            : 'Zu Favoriten hinzufügen');
        favoriteButton.title = favoriteButton.getAttribute('aria-label');
        favoriteButton.replaceChildren();
        const heart = document.createElement('i');
        heart.className = favorites.community.includes(recipe.id) ? 'fas fa-heart' : 'far fa-heart';
        heart.setAttribute('aria-hidden', 'true');
        const favoriteLabel = document.createElement('span');
        favoriteLabel.className = 'visually-hidden';
        favoriteLabel.textContent = favoriteButton.getAttribute('aria-label');
        favoriteButton.append(heart, favoriteLabel);
        cover.append(favoriteButton);

        const body = document.createElement('div');
        body.className = 'card-body community-card-body d-flex flex-column';
        const title = document.createElement('h3');
        title.className = 'card-title community-card-title fw-bold';
        title.textContent = recipe.title;
        const description = document.createElement('p');
        description.className = 'card-text community-card-description text-muted flex-grow-1';
        description.textContent = recipe.description || 'Ein Rezept aus der Lezzetify-Community.';
        const metadata = document.createElement('div');
        metadata.className = 'community-card-meta';

        const time = document.createElement('span');
        time.className = 'community-card-stat';
        const timeIcon = document.createElement('i');
        timeIcon.className = 'far fa-clock';
        timeIcon.setAttribute('aria-hidden', 'true');
        time.append(timeIcon, recipe.prepTime ? `${recipe.prepTime} Min.` : 'Zeit offen');
        const calories = document.createElement('span');
        calories.className = 'community-card-stat';
        const caloriesIcon = document.createElement('i');
        caloriesIcon.className = 'fas fa-fire';
        caloriesIcon.setAttribute('aria-hidden', 'true');
        const kcal = getRecipeCalories(recipe);
        calories.append(caloriesIcon, kcal === null
            ? 'Nährwerte folgen'
            : `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(kcal)} kcal`);
        metadata.append(time, calories);

        const author = document.createElement('p');
        author.className = 'community-card-author small text-muted';
        const authorIcon = document.createElement('i');
        authorIcon.className = 'fas fa-user-circle';
        authorIcon.setAttribute('aria-hidden', 'true');
        author.append(authorIcon, document.createTextNode(recipe.creatorType === 'user'
            ? ` ${recipe.addedByName}`
            : ` ${recipe.addedByName || 'Lezzetify'}`));
        const detailsButton = document.createElement('button');
        detailsButton.type = 'button';
        detailsButton.className = 'btn btn-primary-custom community-card-open-button mt-auto';
        detailsButton.dataset.communityRecipeId = recipe.id;
        const detailsIcon = document.createElement('i');
        detailsIcon.className = 'fas fa-book-open';
        detailsIcon.setAttribute('aria-hidden', 'true');
        const detailsLabel = document.createElement('span');
        detailsLabel.textContent = 'Rezept ansehen';
        const detailsArrow = document.createElement('i');
        detailsArrow.className = 'fas fa-arrow-right';
        detailsArrow.setAttribute('aria-hidden', 'true');
        detailsButton.append(detailsIcon, detailsLabel, detailsArrow);
        const saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.className = 'btn btn-outline-primary community-card-save-button';
        saveButton.dataset.saveCommunityRecipeId = recipe.id;
        const alreadySaved = recipes.some((entry) => entry.sourceCommunityId === recipe.id);
        const saveIcon = document.createElement('i');
        saveIcon.className = alreadySaved ? 'fas fa-check' : 'far fa-bookmark';
        saveIcon.setAttribute('aria-hidden', 'true');
        saveButton.append(saveIcon, document.createTextNode(
            alreadySaved ? ' In deiner Sammlung' : ' Merken'
        ));
        saveButton.disabled = alreadySaved;
        const actions = document.createElement('div');
        actions.className = 'community-card-actions';
        actions.append(detailsButton, saveButton);
        body.append(title, description, metadata, author, actions);
        card.append(cover, body);
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
        renderFavoriteRecipes();
    }

    function renderFavoriteRecipes() {
        const searchTerm = favoriteSearch.value.trim().toLocaleLowerCase('de-DE');
        const allFavorites = [
            ...recipes
                .filter((recipe) => favorites.recipes.includes(recipe.id))
                .map((recipe) => ({ recipe, type: 'recipes' })),
            ...communityRecipes
                .filter((recipe) => favorites.community.includes(recipe.id))
                .map((recipe) => ({ recipe, type: 'community' }))
        ];
        const visibleFavorites = allFavorites.filter(({ recipe, type }) => {
            const matchesFilter = activeFavoriteFilter === 'all' || activeFavoriteFilter === type;
            const searchableText = [
                recipe.title,
                recipe.description,
                recipe.category,
                recipe.addedByName,
                ...(recipe.ingredients || [])
            ].filter(Boolean).join(' ').toLocaleLowerCase('de-DE');
            return matchesFilter && searchableText.includes(searchTerm);
        });

        favoriteRecipeList.replaceChildren(...visibleFavorites.map(({ recipe, type }) => (
            type === 'recipes' ? createRecipeCard(recipe) : createCommunityRecipeCard(recipe)
        )));

        const countLabel = document.querySelector('#favorite-view-count');
        countLabel.textContent = `${visibleFavorites.length} ${visibleFavorites.length === 1 ? 'Rezept' : 'Rezepte'}`;
        const hasSavedFavorites = favorites.recipes.length + favorites.community.length > 0;
        favoriteEmptyState.hidden = hasSavedFavorites;
        favoriteNoResults.hidden = visibleFavorites.length > 0 || !hasSavedFavorites;
    }

    function openFavoritesView() {
        renderFavoriteRecipes();
        bootstrap.Modal.getOrCreateInstance(favoriteCollection).show();
    }

    function hideFavoritesView(onHidden) {
        favoriteCollection.addEventListener('hidden.bs.modal', onHidden, { once: true });
        bootstrap.Modal.getOrCreateInstance(favoriteCollection).hide();
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
                    favoriteButton.replaceWith(type === 'community'
                        ? createCommunityDetailFavoriteButton(recipeId)
                        : createFavoriteButton(type, recipeId));
                }
            });
            recipeDetailsContent.querySelectorAll('[data-favorite-type]').forEach((favoriteButton) => {
                if (favoriteButton.dataset.favoriteId === recipeId) {
                    favoriteButton.replaceWith(createRecipeDetailFavoriteButton(type, recipeId));
                }
            });
            const recipeTitle = type === 'community'
                ? communityRecipes.find((recipe) => recipe.id === recipeId)?.title
                : recipes.find((recipe) => recipe.id === recipeId)?.title;
            showToast(
                data.favorited
                    ? `„${recipeTitle || 'Rezept'}“ wurde zu deinen Favoriten hinzugefügt.`
                    : `„${recipeTitle || 'Rezept'}“ wurde aus deinen Favoriten entfernt.`,
                {
                    title: data.favorited ? 'In Favoriten gespeichert' : 'Aus Favoriten entfernt',
                    icon: data.favorited ? 'fa-heart' : 'fa-heart-broken'
                }
            );
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
            await readResponse(response, 'Community-Rezept konnte nicht gespeichert werden.');
            const alreadySaved = response.status === 200;
            const recipeTitle = communityRecipes.find((recipe) => recipe.id === recipeId)?.title || 'Das Rezept';
            showToast(
                alreadySaved
                    ? `„${recipeTitle}“ ist bereits in deiner Sammlung.`
                    : `„${recipeTitle}“ wurde zu deinen Rezepten hinzugefügt.`,
                {
                    title: alreadySaved ? 'Schon vorgemerkt' : 'Rezept gespeichert',
                    icon: alreadySaved ? 'fa-bookmark' : 'fa-check'
                }
            );
            communityRecipeDetails.querySelectorAll('[data-save-community-recipe-id]').forEach((saveButton) => {
                if (saveButton.dataset.saveCommunityRecipeId === recipeId) {
                    saveButton.disabled = true;
                    saveButton.replaceChildren();
                    const icon = document.createElement('i');
                    icon.className = 'fas fa-check';
                    icon.setAttribute('aria-hidden', 'true');
                    saveButton.append(icon, document.createTextNode(' Bereits in deiner Sammlung'));
                }
            });
            await loadRecipes();
            renderCommunityRecipes();
        } catch (error) {
            showMessage(error.message || 'Community-Rezept konnte nicht gespeichert werden.');
            button.disabled = false;
        }
    }

    function createCommunityIngredients(recipe) {
        const list = document.createElement('ul');
        list.className = 'community-ingredient-list';
        recipe.ingredients.forEach((ingredient) => {
            const item = document.createElement('li');
            const marker = document.createElement('i');
            marker.className = 'fas fa-check';
            marker.setAttribute('aria-hidden', 'true');
            const label = document.createElement('span');
            label.textContent = ingredient;
            item.append(marker, label);
            list.append(item);
        });
        return list;
    }

    async function openCommunityRecipe(recipeId) {
        activeCommunityRecipe = null;
        communityRecipeDetails.replaceChildren();
        communityRecipeTitle.textContent = 'Community-Rezept wird geladen';
        const loading = document.createElement('p');
        loading.className = 'community-detail-loading';
        loading.textContent = 'Rezept wird geladen …';
        communityRecipeDetails.append(loading);
        const modal = bootstrap.Modal.getOrCreateInstance(document.querySelector('#communityRecipeModal'));
        modal.show();
        try {
            const response = await apiRequest(`/api/community/recipes/${encodeURIComponent(recipeId)}`);
            const recipe = await readResponse(response, 'Community-Rezept konnte nicht geladen werden.');
            activeCommunityRecipe = recipe;
            communityRecipeTitle.textContent = `Rezeptdetails: ${recipe.title}`;
            communityRecipeDetails.replaceChildren();

            const detail = document.createElement('article');
            detail.className = 'community-recipe-detail';
            const hero = document.createElement('div');
            hero.className = 'community-detail-hero';
            const image = createRecipeCardCover(recipe);
            image.classList.add('community-detail-image');
            if (image instanceof HTMLImageElement) {
                image.loading = 'eager';
            }
            hero.append(image);
            const category = document.createElement('span');
            category.className = 'community-detail-category';
            category.textContent = recipe.category || 'Community-Rezept';
            hero.append(category);
            detail.append(hero);

            const content = document.createElement('div');
            content.className = 'community-detail-content';
            const intro = document.createElement('div');
            intro.className = 'community-detail-intro';
            const title = document.createElement('h2');
            title.className = 'community-detail-title';
            title.textContent = recipe.title;
            const author = document.createElement('p');
            author.className = 'community-detail-author';
            const authorIcon = document.createElement('i');
            authorIcon.className = 'fas fa-user-circle';
            authorIcon.setAttribute('aria-hidden', 'true');
            author.append(authorIcon, document.createTextNode(recipe.creatorType === 'user'
                ? ` Geteilt von ${recipe.addedByName}`
                : ` Von ${recipe.addedByName || 'Lezzetify'}`));
            const description = document.createElement('p');
            description.className = 'community-detail-description';
            description.textContent = recipe.description || '';
            intro.append(title, author);
            if (recipe.description) {
                intro.append(description);
            }
            content.append(intro);

            const stats = document.createElement('div');
            stats.className = 'community-detail-stats';
            [
                ['far fa-clock', 'Zubereitungszeit', recipe.prepTime ? `${recipe.prepTime} Min.` : 'Nicht angegeben'],
                ['fas fa-utensils', 'Portionen', String(recipe.servings || 1)],
                ['fas fa-fire', 'Energie / Portion', getRecipeCalories(recipe) === null
                    ? 'Wird berechnet'
                    : `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(getRecipeCalories(recipe))} kcal`]
            ].forEach(([iconClass, label, value]) => {
                const stat = document.createElement('div');
                stat.className = 'community-detail-stat';
                const icon = document.createElement('i');
                icon.className = iconClass;
                icon.setAttribute('aria-hidden', 'true');
                const copy = document.createElement('span');
                const statLabel = document.createElement('small');
                statLabel.textContent = label;
                const statValue = document.createElement('strong');
                statValue.textContent = value;
                if (label === 'Energie / Portion') {
                    statValue.dataset.communityNutritionKcal = '';
                }
                copy.append(statLabel, statValue);
                stat.append(icon, copy);
                stats.append(stat);
            });
            content.append(stats);

            const actionBar = document.createElement('div');
            actionBar.className = 'community-detail-actions';
            const favoriteButton = createCommunityDetailFavoriteButton(recipe.id);
            const saveButton = document.createElement('button');
            saveButton.type = 'button';
            saveButton.className = 'btn btn-primary-custom community-detail-save';
            saveButton.dataset.saveCommunityRecipeId = recipe.id;
            const alreadySaved = recipes.some((entry) => entry.sourceCommunityId === recipe.id);
            const saveIcon = document.createElement('i');
            saveIcon.className = alreadySaved ? 'fas fa-check' : 'far fa-bookmark';
            saveIcon.setAttribute('aria-hidden', 'true');
            saveButton.append(saveIcon, document.createTextNode(
                alreadySaved ? ' Bereits in deiner Sammlung' : ' Zu meinen Rezepten'
            ));
            saveButton.disabled = alreadySaved;
            actionBar.append(favoriteButton, saveButton);
            content.append(actionBar);

            const ingredientsSection = document.createElement('section');
            ingredientsSection.className = 'community-detail-section';
            const ingredientsHeading = document.createElement('h3');
            ingredientsHeading.textContent = 'Zutaten';
            const ingredientsSubtitle = document.createElement('p');
            ingredientsSubtitle.className = 'community-detail-section-note';
            ingredientsSubtitle.textContent = `Alles für ${recipe.servings || 1} Portionen`;
            ingredientsSection.append(
                ingredientsHeading,
                ingredientsSubtitle,
                createCommunityIngredients(recipe)
            );
            content.append(ingredientsSection);

            const instructionsSection = document.createElement('section');
            instructionsSection.className = 'community-detail-section community-detail-instructions';
            const instructionsHeading = document.createElement('h3');
            instructionsHeading.textContent = 'Zubereitung';
            const instructionsList = document.createElement('ol');
            instructionsList.className = 'community-instruction-list';
            const instructions = Array.isArray(recipe.instructions)
                ? recipe.instructions
                : String(recipe.instructions || '').split('\n').map((step) => step.trim()).filter(Boolean);
            instructions.forEach((instruction) => {
                const item = document.createElement('li');
                item.textContent = instruction;
                instructionsList.append(item);
            });
            instructionsSection.append(instructionsHeading, instructionsList);
            content.append(instructionsSection);

            const nutrition = createRecipeNutritionDisplay(recipe);
            nutrition.classList.add('community-detail-nutrition');
            content.append(nutrition);
            detail.append(content);
            communityRecipeDetails.append(detail);
            void requestNutritionEstimate(recipe);
        } catch (error) {
            communityRecipeTitle.textContent = 'Community-Rezept';
            communityRecipeDetails.replaceChildren();
            showMessage(error.message || 'Community-Rezept konnte nicht geladen werden.');
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
            renderFavoriteRecipes();
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

    function updateCalendarNutritionTotal() {
        const calorieTotal = document.querySelector('#plan-calorie-total');
        if (!calorieTotal) {
            return;
        }

        const selectedDate = planViewDate.value || getLocalDateString();
        const selectedDayPlans = mealPlans.filter((plan) => plan.date === selectedDate);
        const label = calorieTotal.querySelector('span');
        let totalCalories = 0;
        let unavailableCount = 0;
        let pendingCount = 0;
        selectedDayPlans.forEach((plan) => {
            const recipe = recipes.find((entry) => entry.id === plan.recipeId);
            if (!recipe) {
                unavailableCount += 1;
                return;
            }

            const caloriesPerServing = getRecipeCalories(recipe);
            if (caloriesPerServing === null) {
                const key = getNutritionEstimateKey(recipe);
                if (pendingNutritionEstimates.has(key) || !nutritionEstimates.has(key)) {
                    pendingCount += 1;
                } else {
                    unavailableCount += 1;
                }
                return;
            }
            totalCalories += caloriesPerServing * (Number(recipe.servings) || 1);
        });

        const numberFormatter = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
        calorieTotal.classList.toggle('is-unavailable', unavailableCount > 0 && pendingCount === 0);
        if (pendingCount > 0) {
            label.textContent = 'Kalorien werden berechnet …';
        } else if (unavailableCount > 0) {
            label.textContent = totalCalories > 0
                ? `Kalorien am Tag: mind. ${numberFormatter.format(totalCalories)} kcal`
                : 'Kalorien nicht verfügbar';
        } else {
            label.textContent = `Kalorien am Tag: ${numberFormatter.format(totalCalories)} kcal`;
        }
        calorieTotal.title = unavailableCount > 0
            ? 'Für mindestens ein Gericht ist keine Nährwertschätzung verfügbar.'
            : 'Geschätzte Gesamtkalorien für alle Portionen am ausgewählten Tag.';
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
        document.querySelector('#plan-range-label').textContent = rangeLabel;
        const visibleCount = document.querySelector('#plan-visible-count');
        const visibleCountLabel = visibleCount.querySelector('span');
        visibleCountLabel.textContent = `${selectedPlans.length} ${selectedPlans.length === 1 ? 'Gericht' : 'Gerichte'}`;
        visibleCount.classList.toggle('has-plans', selectedPlans.length > 0);
        updateCalendarNutritionTotal();

        const calendarDays = [];
        const currentDate = new Date(`${range.start}T00:00:00`);
        const endDate = new Date(`${range.end}T00:00:00`);
        while (currentDate <= endDate) {
            const dateString = getLocalDateString(currentDate);
            const dayPlans = selectedPlans.filter((plan) => plan.date === dateString);
            const day = document.createElement('section');
            day.className = `meal-calendar-day${dateString === getLocalDateString() ? ' is-today' : ''}${dayPlans.length ? ' has-meals' : ''}`;
            day.dataset.mealCount = String(dayPlans.length);
            day.setAttribute('role', 'listitem');

            const heading = document.createElement('button');
            heading.type = 'button';
            heading.className = 'meal-calendar-heading';
            heading.dataset.calendarDate = dateString;
            heading.setAttribute(
                'aria-label',
                planPeriod.value === 'week'
                    ? `Tagesansicht für ${weekdayFormatter.format(currentDate)}, ${dateFormatter.format(currentDate)} mit ${dayPlans.length} geplanten ${dayPlans.length === 1 ? 'Gericht' : 'Gerichten'} anzeigen`
                    : `${weekdayFormatter.format(currentDate)}, ${dateFormatter.format(currentDate)}`
            );
            heading.disabled = planPeriod.value === 'day';
            const weekday = document.createElement('span');
            weekday.className = 'meal-calendar-weekday';
            weekday.textContent = weekdayFormatter.format(currentDate);
            const date = document.createElement('time');
            date.dateTime = dateString;
            date.textContent = dateFormatter.format(currentDate);
            heading.append(weekday, date);
            const dayCount = document.createElement('span');
            dayCount.className = `meal-calendar-day-count${dayPlans.length ? ' has-meals' : ''}`;
            dayCount.textContent = dayPlans.length
                ? `${dayPlans.length} ${dayPlans.length === 1 ? 'Gericht' : 'Gerichte'}`
                : 'Frei';
            heading.append(dayCount);

            const mealList = document.createElement('div');
            mealList.className = 'meal-calendar-meal-list';
            const visiblePlans = planPeriod.value === 'week' ? dayPlans.slice(0, 2) : dayPlans;
            mealList.append(...visiblePlans.map(createMealPlanEvent));
            day.append(heading);

            if (dayPlans.length === 0) {
                const emptyDay = document.createElement('p');
                emptyDay.className = 'meal-calendar-empty';
                emptyDay.textContent = planPeriod.value === 'day'
                    ? 'Für diesen Tag ist noch nichts geplant.'
                    : 'Noch nichts geplant';
                day.append(emptyDay);
            } else {
                day.append(mealList);
                if (planPeriod.value === 'week' && dayPlans.length > visiblePlans.length) {
                    const moreButton = document.createElement('button');
                    moreButton.type = 'button';
                    moreButton.className = 'meal-calendar-more';
                    moreButton.dataset.calendarDate = dateString;
                    moreButton.textContent = `Alle ${dayPlans.length} Gerichte ansehen`;
                    const arrow = document.createElement('i');
                    arrow.className = 'fas fa-arrow-right';
                    arrow.setAttribute('aria-hidden', 'true');
                    moreButton.append(arrow);
                    day.append(moreButton);
                }
            }
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

    function createMealPlanEvent(plan) {
        const recipe = recipes.find((entry) => entry.id === plan.recipeId);
        const meal = document.createElement('article');
        meal.className = 'meal-calendar-event';
        const title = document.createElement('strong');
        title.className = 'meal-calendar-event-title';
        title.textContent = recipe ? recipe.title : 'Rezept nicht mehr verfügbar';
        title.title = title.textContent;
        meal.append(title);

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'meal-calendar-remove';
        removeButton.dataset.planId = plan.id;
        removeButton.setAttribute('aria-label', `${recipe ? recipe.title : 'Gericht'} aus dem Plan entfernen`);
        removeButton.title = 'Aus dem Plan entfernen';
        const removeIcon = document.createElement('i');
        removeIcon.className = 'fas fa-times';
        removeIcon.setAttribute('aria-hidden', 'true');
        removeButton.append(removeIcon);
        meal.append(removeButton);
        return meal;
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
            showMessage(error.message || 'Kalender-Einstellungen konnten nicht geladen werden.');
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
            calendarSettingsStatus.textContent = '';
            calendarSettingsStatus.className = 'small';
            showToast(data.message, { title: 'Einkaufstag gespeichert', icon: 'fa-calendar-check' });
        } catch (error) {
            calendarSettingsStatus.textContent = '';
            calendarSettingsStatus.className = 'small';
            showMessage(error.message || 'Einkaufstag konnte nicht gespeichert werden.');
        } finally {
            saveButton.disabled = false;
        }
    });

    document.querySelector('#copy-calendar-link').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(calendarFeedUrl.value);
            calendarSettingsStatus.textContent = '';
            calendarSettingsStatus.className = 'small';
            showToast('iCal-Link wurde kopiert.', { title: 'Link kopiert', icon: 'fa-link' });
        } catch (error) {
            calendarSettingsStatus.textContent = '';
            calendarSettingsStatus.className = 'small';
            showMessage('Der Link konnte nicht kopiert werden. Markiere ihn und kopiere ihn manuell.');
        }
    });

    document.querySelector('#rotate-calendar-link').addEventListener('click', async (event) => {
        const confirmed = await requestConfirmation({
            title: 'Kalender-Link erneuern?',
            message: 'Der aktuelle Link wird ungültig. Kalender-Apps, die ihn bereits verwenden, können danach nicht mehr synchronisieren.',
            confirmLabel: 'Link erneuern',
            tone: 'warning',
            icon: 'fa-sync-alt'
        });
        if (!confirmed) {
            return;
        }
        const button = event.currentTarget;
        button.disabled = true;
        calendarSettingsStatus.textContent = '';
        try {
            const response = await apiRequest('/api/calendar/settings/rotate-link', { method: 'POST' });
            const settings = await readResponse(response, 'Kalender-Link konnte nicht erneuert werden.');
            showCalendarFeedUrl(settings.feedUrl);
            calendarSettingsStatus.textContent = '';
            calendarSettingsStatus.className = 'small';
            showToast(settings.message, { title: 'Kalender-Link erneuert', icon: 'fa-calendar-check' });
        } catch (error) {
            calendarSettingsStatus.textContent = '';
            calendarSettingsStatus.className = 'small';
            showMessage(error.message || 'Kalender-Link konnte nicht erneuert werden.');
        } finally {
            button.disabled = false;
        }
    });

    document.querySelector('#collection-new-recipe-button').addEventListener('click', openNewRecipeModal);

    openFavoritesButton.addEventListener('click', openFavoritesView);
    favoriteCollection.addEventListener('shown.bs.modal', () => {
        openFavoritesButton.setAttribute('aria-expanded', 'true');
        favoriteSearch.focus();
    });
    favoriteCollection.addEventListener('hidden.bs.modal', () => {
        openFavoritesButton.setAttribute('aria-expanded', 'false');
    });
    document.querySelector('#favorite-discover-link').addEventListener('click', (event) => {
        event.preventDefault();
        hideFavoritesView(() => {
            document.querySelector('#community-collection').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
    favoriteSearch.addEventListener('input', renderFavoriteRecipes);
    document.querySelector('.favorite-filter-group').addEventListener('click', (event) => {
        const filterButton = event.target.closest('[data-favorite-filter]');
        if (!filterButton) {
            return;
        }
        activeFavoriteFilter = filterButton.dataset.favoriteFilter;
        document.querySelectorAll('[data-favorite-filter]').forEach((button) => {
            const isActive = button === filterButton;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
        });
        renderFavoriteRecipes();
    });
    favoriteRecipeList.addEventListener('click', (event) => {
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
        const communityButton = event.target.closest('[data-community-recipe-id]');
        if (communityButton) {
            hideFavoritesView(() => {
                void openCommunityRecipe(communityButton.dataset.communityRecipeId);
            });
            return;
        }
        const detailsButton = event.target.closest('[data-recipe-details-id]');
        if (detailsButton) {
            const recipe = recipes.find((entry) => entry.id === detailsButton.dataset.recipeDetailsId);
            if (recipe) {
                hideFavoritesView(() => {
                    void openRecipeDetails(recipe);
                });
            }
        }
    });

    recipeSearch.addEventListener('input', renderRecipeList);
    recipeSort.addEventListener('change', renderRecipeList);

    recipeForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const saveButton = document.querySelector('#save-recipe-button');
        const formData = new FormData(recipeForm);
        const recipeTitle = formData.get('title').trim();
        const wasEditing = Boolean(editingRecipeId);
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
            showToast(
                wasEditing
                    ? `„${recipeTitle}“ wurde aktualisiert.`
                    : `„${recipeTitle}“ wurde zu deiner Sammlung hinzugefügt.`,
                {
                    title: wasEditing ? 'Änderungen gespeichert' : 'Rezept gespeichert',
                    icon: wasEditing ? 'fa-pen' : 'fa-check'
                }
            );
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
            return;
        }
        const detailsButton = event.target.closest('[data-recipe-details-id]');
        if (detailsButton) {
            const recipe = recipes.find((entry) => entry.id === detailsButton.dataset.recipeDetailsId);
            if (recipe) {
                void openRecipeDetails(recipe);
            }
        }
    });
    recipeDetailsContent.addEventListener('click', (event) => {
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
            planDate.value = dayButton.dataset.calendarDate;
            renderPlanView();
            return;
        }

        const removeButton = event.target.closest('[data-plan-id]');
        if (!removeButton) {
            return;
        }
        const confirmed = await requestConfirmation({
            title: 'Gericht aus dem Plan entfernen?',
            message: 'Das Gericht wird aus deinem Wochenplan und der dazugehörigen Einkaufsliste entfernt. Dein Rezept bleibt gespeichert.',
            confirmLabel: 'Gericht entfernen'
        });
        if (!confirmed) {
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

    document.querySelector('#logout-button').addEventListener('click', async () => {
        const confirmed = await requestConfirmation({
            title: 'Möchtest du dich abmelden?',
            message: 'Bist du sicher, dass du Lezzetify jetzt verlassen möchtest?',
            confirmLabel: 'Abmelden',
            tone: 'warning',
            icon: 'fa-sign-out-alt'
        });
        if (!confirmed) {
            return;
        }

        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('email');
        window.location.replace('index.html');
    });

    document.querySelector('#dashboard-toast-close').addEventListener('click', dismissDashboardToast);

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
