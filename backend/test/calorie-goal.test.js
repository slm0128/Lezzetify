const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateCalorieGoal } = require('../calorie-goal');

const profile = {
    gender: 'female',
    age: 30,
    heightCm: 170,
    weightKg: 65,
    activityLevel: 'moderately_active',
    goal: 'maintain'
};

test('calculates Mifflin-St. Jeor maintenance and weight-loss targets', () => {
    const maintenance = calculateCalorieGoal(profile);
    assert.equal(maintenance.maintenanceCalories, 2172);
    assert.equal(maintenance.targetCalories, 2172);

    const weightLoss = calculateCalorieGoal({ ...profile, goal: 'lose' });
    assert.equal(weightLoss.targetCalories, 1672);
});

test('uses the male formula constant and applies the weight-gain adjustment', () => {
    const result = calculateCalorieGoal({
        ...profile,
        gender: 'male',
        goal: 'gain'
    });

    assert.equal(result.maintenanceCalories, 2430);
    assert.equal(result.targetCalories, 2930);
});

test('does not return a negative target for a large weight-loss adjustment', () => {
    const result = calculateCalorieGoal({
        ...profile,
        age: 100,
        heightCm: 100,
        weightKg: 30,
        activityLevel: 'sedentary',
        goal: 'lose'
    });

    assert.equal(result.targetCalories, 0);
});

test('rejects unsupported formula values and out-of-range profile data', () => {
    assert.throws(() => calculateCalorieGoal({ ...profile, gender: 'other' }), { status: 400 });
    assert.throws(() => calculateCalorieGoal({ ...profile, age: 17 }), { status: 400 });
    assert.throws(() => calculateCalorieGoal({ ...profile, heightCm: 251 }), { status: 400 });
    assert.throws(() => calculateCalorieGoal({ ...profile, weightKg: 29 }), { status: 400 });
    assert.throws(() => calculateCalorieGoal({ ...profile, activityLevel: 'unknown' }), { status: 400 });
    assert.throws(() => calculateCalorieGoal({ ...profile, goal: 'unknown' }), { status: 400 });
});
