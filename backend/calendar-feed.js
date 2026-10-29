function toDateString(date) {
    return date.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
    const date = new Date(`${dateString}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return toDateString(date);
}

function getCalendarToday(now = new Date(), timezone = 'Europe/Berlin') {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function escapeIcsText(value) {
    return String(value || '')
        .replace(/\\/g, '\\\\')
        .replace(/\r?\n/g, '\\n')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;');
}

function formatIcsDate(dateString) {
    return dateString.replace(/-/g, '');
}

function foldIcsLine(line) {
    const folded = [];
    let current = '';
    let bytes = 0;
    for (const character of line) {
        const characterBytes = Buffer.byteLength(character, 'utf8');
        if (bytes + characterBytes > 75) {
            folded.push(current);
            current = ` ${character}`;
            bytes = 1 + characterBytes;
        } else {
            current += character;
            bytes += characterBytes;
        }
    }
    folded.push(current);
    return folded;
}

function createEvent({ uid, date, summary, description, stamp }) {
    return [
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${formatIcsDate(date)}`,
        `DTEND;VALUE=DATE:${formatIcsDate(addDays(date, 1))}`,
        `SUMMARY:${escapeIcsText(summary)}`,
        `DESCRIPTION:${escapeIcsText(description)}`,
        'END:VEVENT'
    ];
}

function createCalendarFeed({ plans, shoppingWeekday, now = new Date(), timezone = 'Europe/Berlin' }) {
    const today = getCalendarToday(now, timezone);
    const horizon = addDays(today, 370);
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const events = [];
    const upcomingPlans = plans
        .filter((plan) => plan.date >= today && plan.date <= horizon)
        .sort((first, second) => first.date.localeCompare(second.date));

    for (const plan of upcomingPlans) {
        events.push(...createEvent({
            uid: `meal-${plan.id}@lezzetify`,
            date: plan.date,
            summary: `Kochen: ${plan.title}`,
            description: (Array.isArray(plan.ingredients) ? plan.ingredients : []).join('\n'),
            stamp
        }));
    }

    let shoppingDate = today;
    const dayOfWeek = new Date(`${today}T00:00:00.000Z`).getUTCDay();
    shoppingDate = addDays(today, (shoppingWeekday - dayOfWeek + 7) % 7);
    while (shoppingDate <= horizon) {
        const periodEnd = addDays(shoppingDate, 7);
        const shoppingPlans = upcomingPlans.filter((plan) => plan.date > shoppingDate && plan.date <= periodEnd);
        if (shoppingPlans.length > 0) {
            const ingredients = new Map();
            shoppingPlans.forEach((plan) => {
                (Array.isArray(plan.ingredients) ? plan.ingredients : []).forEach((ingredient) => {
                    if (typeof ingredient !== 'string' || !ingredient.trim()) {
                        return;
                    }
                    const normalized = ingredient.trim().toLocaleLowerCase('de-DE');
                    const existing = ingredients.get(normalized);
                    if (existing) {
                        existing.count += 1;
                    } else {
                        ingredients.set(normalized, { name: ingredient.trim(), count: 1 });
                    }
                });
            });
            const ingredientLines = [...ingredients.values()]
                .sort((first, second) => first.name.localeCompare(second.name, 'de'))
                .map(({ name, count }) => `- ${name}${count > 1 ? ` (in ${count} Gerichten)` : ''}`);
            const mealLines = shoppingPlans.map((plan) => `- ${plan.title} (${plan.date})`);
            events.push(...createEvent({
                uid: `shopping-${shoppingDate}@lezzetify`,
                date: shoppingDate,
                summary: 'Einkaufsliste für geplante Gerichte',
                description: [
                    `Geplante Gerichte vom ${addDays(shoppingDate, 1)} bis ${periodEnd}:`,
                    ...mealLines,
                    '',
                    'Zutaten:',
                    ...(ingredientLines.length ? ingredientLines : ['- Keine Zutaten angegeben'])
                ].join('\n'),
                stamp
            }));
        }
        shoppingDate = addDays(shoppingDate, 7);
    }

    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Lezzetify//Meal Planner//DE',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:Lezzetify Essensplan',
        'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
        'X-PUBLISHED-TTL:PT1H',
        ...events,
        'END:VCALENDAR',
        ''
    ];
    return lines.flatMap(foldIcsLine).join('\r\n');
}

module.exports = { createCalendarFeed, escapeIcsText, foldIcsLine, getCalendarToday };
