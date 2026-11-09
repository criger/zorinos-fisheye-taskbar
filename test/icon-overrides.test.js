// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeTaskbarApps,
    iconOverrideFor,
    appRowsToVariant,
    appRowsFromVariant,
} from '../icon-overrides.js';

test('live taskbar list preserves order and removes duplicate desktop IDs', () =>
{
    const input = [
        { id: 'firefox.desktop', name: 'Firefox', icon: 'firefox', size: 32 },
        { id: 'firefox.desktop', name: 'Firefox again', icon: 'foo', size: 48 },
        { id: 'chrome-app.desktop', name: 'ChatGPT', icon: '/tmp/chatgpt.png', size: 48 },
    ];
    assert.deepEqual(normalizeTaskbarApps(input).map(x => x.name),
        ['Firefox', 'ChatGPT']);
    assert.deepEqual(appRowsFromVariant(appRowsToVariant(input)),
        normalizeTaskbarApps(input));
});

test('bad catalog records cannot inject invisible rows', () =>
{
    const rows = normalizeTaskbarApps([
        null, {}, { id: '', name: 'blank' },
        { id: ' app.desktop ', size: -20 },
    ]);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
        id: 'app.desktop', name: 'app.desktop', icon: '', size: 32,
    });
});

test('overrides are keyed by exact application ID and require absolute paths', () =>
{
    const paths = {
        'chatgpt.desktop': '/home/user/icons/chatgpt.svg',
        'firefox.desktop': 'icons/firefox.png',
    };
    assert.equal(iconOverrideFor('chatgpt.desktop', paths),
        '/home/user/icons/chatgpt.svg');
    assert.equal(iconOverrideFor('firefox.desktop', paths), '');
    assert.equal(iconOverrideFor('unknown.desktop', paths), '');
    assert.equal(iconOverrideFor('__proto__', paths), '');
});
