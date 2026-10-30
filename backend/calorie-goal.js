const { HttpError } = require('./recipe-validation');

const ACTIVITY_FACTORS = {
    sedentary: 1.2,
    lightly_active: 1.375,
    moderately_active: 1.55,
    very_active: 1.725,
    extra_active: 1.9
};

const GOAL_ADJUSTMENTS = {
    lose: -500,
    maintain: 0,
    gain: 500
};

function calculateCalorieGoal(body) {
    const gender = body.gender;
    const age = Number(body.age);
    const heightCm = Number(body.heightCm);
    const weightKg = Number(body.weightKg);
    const activityLevel = body.activityLevel;
    const goal = body.goal;

    if (!['female', 'male'].includes(gender)
        || !Number.isInteger(age) || age < 18 || age > 100
        || !Number.isFinite(heightCm) || heightCm < 100 || heightCm > 250
        || !Number.isFinite(weightKg) || weightKg < 30 || weightKg > 350
        || !Object.hasOwn(ACTIVITY_FACTORS, activityLevel)
        || !Object.hasOwn(GOAL_ADJUSTMENTS, goal)) {
        throw new HttpError(400, 'Bitte prüfe Geschlecht, Alter, Größe, Gewicht, Aktivität und Ziel.');
    }

    const basalMetabolicRate = 10 * weightKg + 6.25 * heightCm - 5 * age
        + (gender === 'male' ? 5 : -161);
    const maintenanceCalories = Math.round(basalMetabolicRate * ACTIVITY_FACTORS[activityLevel]);
    const targetCalories = Math.max(0, maintenanceCalories + GOAL_ADJUSTMENTS[goal]);

    return {
        gender,
        age,
        heightCm,
        weightKg,
        activityLevel,
        goal,
        maintenanceCalories,
        targetCalories
    };
}

module.exports = { calculateCalorieGoal };
