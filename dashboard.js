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
    const userEmail = document.querySelector('#user-email');

    userEmail.textContent = localStorage.getItem('email') || 'Chefkoch';

    function showMessage(message, isSuccess = false) {
        dashboardMessage.textContent = message;
        dashboardMessage.className = `alert ${isSuccess ? 'alert-success' : 'alert-danger'}`;
    }

    function createRecipeCard(recipe) {
        const column = document.createElement('div');
        column.className = 'col-12';
        const card = document.createElement('article');
        card.className = 'card recipe-dashboard-card border-0 shadow-sm';
        const body = document.createElement('div');
        body.className = 'card-body';
        const header = document.createElement('div');
        header.className = 'd-flex justify-content-between align-items-start gap-3 mb-2';
        const title = document.createElement('h3');
        title.className = 'card-title';
        title.textContent = recipe.title;
        header.append(title);

        if (recipe.prepTime) {
            const time = document.createElement('span');
            time.className = 'recipe-time';
            time.innerHTML = '<i class="far fa-clock" aria-hidden="true"></i>';
            time.append(` ${recipe.prepTime} Min.`);
            header.append(time);
        }
        body.append(header);

        if (recipe.description) {
            const description = document.createElement('p');
            description.className = 'recipe-description';
            description.textContent = recipe.description;
            body.append(description);
        }

        const ingredients = document.createElement('p');
        ingredients.className = 'recipe-ingredients';
        ingredients.textContent = `Zutaten: ${recipe.ingredients.join(', ')}`;
        body.append(ingredients);

        if (recipe.instructions) {
            const instructions = document.createElement('details');
            instructions.className = 'recipe-instructions';
            const summary = document.createElement('summary');
            summary.textContent = 'Zubereitung anzeigen';
            const text = document.createElement('p');
            text.textContent = recipe.instructions;
            instructions.append(summary, text);
            body.append(instructions);
        }

        card.append(body);
        column.append(card);
        return column;
    }

    async function loadRecipes() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/recipes`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();

            if (response.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                localStorage.removeItem('email');
                window.location.replace('login.html');
                return;
            }
            if (!response.ok) {
                throw new Error(data.error || 'Rezepte konnten nicht geladen werden.');
            }

            recipeList.replaceChildren(...data.map(createRecipeCard));
            emptyState.hidden = data.length > 0;
            recipeCount.textContent = `${data.length} ${data.length === 1 ? 'Rezept' : 'Rezepte'}`;
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
            const response = await fetch(`${API_BASE_URL}/api/recipes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    title: formData.get('title').trim(),
                    description: formData.get('description').trim(),
                    ingredients,
                    instructions: formData.get('instructions').trim(),
                    prepTime: Number(formData.get('prepTime')) || null
                })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Rezept konnte nicht gespeichert werden.');
            }

            recipeForm.reset();
            showMessage('Rezept wurde gespeichert.', true);
            await loadRecipes();
        } catch (error) {
            showMessage(error.message || 'Verbindung zum Server fehlgeschlagen.');
        } finally {
            saveButton.disabled = false;
        }
    });

    document.querySelector('#logout-button').addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('email');
        window.location.replace('login.html');
    });

    loadRecipes();
}
