const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createCalendarFeed,
    escapeIcsText,
    foldIcsLine,
    getCalendarToday
} = require('../calendar-feed');

const now = new Date('2026-10-29T12:30:00.000Z');

test('escapes iCalendar text values', () => {
    assert.equal(escapeIcsText('A,B;C\\D\nE'), 'A\\,B\\;C\\\\D\\nE');
});

test('folds long calendar lines without exceeding the RFC byte limit', () => {
    const folded = foldIcsLine(`SUMMARY:${'ä'.repeat(50)}`);
    assert.ok(folded.length > 1);
    assert.ok(folded.every((line) => Buffer.byteLength(line, 'utf8') <= 75));
    assert.ok(folded.slice(1).every((line) => line.startsWith(' ')));
});

test('uses the configured timezone when selecting the next shopping weekday', () => {
    assert.equal(getCalendarToday(new Date('2026-10-29T23:30:00.000Z')), '2026-10-30');
});

test('creates meal and weekly shopping events on the selected weekday', () => {
    const feed = createCalendarFeed({
        now,
        shoppingWeekday: 6,
        plans: [
            {
                id: 'meal-1',
                date: '2026-11-03',
                title: 'Linsensuppe, klassisch',
                ingredients: ['Linsen', 'Zwiebel']
            },
            {
                id: 'meal-2',
                date: '2026-11-05',
                title: 'Gemüsesuppe',
                ingredients: ['Zwiebel', 'Karotten']
            }
        ]
    });
    const unfoldedFeed = feed.replace(/\r\n[ \t]/g, '');

    assert.match(feed, /BEGIN:VCALENDAR\r\nVERSION:2\.0/);
    assert.match(unfoldedFeed, /UID:meal-meal-1@lezzetify\r\nDTSTAMP:20261029T123000Z\r\nDTSTART;VALUE=DATE:20261103/);
    assert.match(unfoldedFeed, /SUMMARY:Kochen: Linsensuppe\\, klassisch/);
    assert.match(unfoldedFeed, /UID:shopping-2026-10-31@lezzetify[\s\S]*DTSTART;VALUE=DATE:20261031/);
    assert.match(unfoldedFeed, /Zutaten:\\n- Karotten\\n- Linsen\\n- Zwiebel \(in 2 Gerichten\)/);
    assert.match(unfoldedFeed, /Geplante Gerichte vom 2026-11-01 bis 2026-11-07:/);
    assert.match(feed, /END:VCALENDAR\r\n$/);
});

test('does not add shopping appointments when no meals are planned in the feed horizon', () => {
    const feed = createCalendarFeed({
        now,
        shoppingWeekday: 6,
        plans: [{
            id: 'old-meal',
            date: '2026-10-28',
            title: 'Past meal',
            ingredients: ['Old ingredient']
        }]
    });

    assert.doesNotMatch(feed, /SUMMARY:Einkaufsliste/);
    assert.doesNotMatch(feed, /SUMMARY:Kochen:/);
});
