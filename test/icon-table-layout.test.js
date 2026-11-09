// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    condensedIconPath,
    scrollArrowVisibility,
} from '../icon-table-layout.js';

test('short icon paths remain fully visible', () =>
{
    assert.equal(condensedIconPath('/usr/share/icons/firefox.svg'),
        '/usr/share/icons/firefox.svg');
    assert.equal(condensedIconPath(''), 'Theme / resource icon');
});

test('long theme and home paths preserve root and filename', () =>
{
    const system = '/usr/share/icons/Zorin/32x32/apps/very-long-app-icon.svg';
    assert.equal(condensedIconPath(system, 46),
        '/usr/share/icons/…/very-long-app-icon.svg');

    const home = '/home/criger/.local/share/icons/hicolor/256x256/apps/github.png';
    assert.equal(condensedIconPath(home, 40),
        '/home/criger/…/github.png');
});

test('extremely long filenames are truncated but bounded', () =>
{
    const path = '/usr/share/icons/verylongdirname/some-icon-name-with-many-characters-64x64.png';
    assert.ok(condensedIconPath(path, 42).length <= 42);
    assert.ok(condensedIconPath(path, 42).endsWith('.png'));
});

test('arrows describe whether content remains above or below', () =>
{
    assert.deepEqual(scrollArrowVisibility(0, 0, 1000, 350),
        { up: false, down: true });
    assert.deepEqual(scrollArrowVisibility(400, 0, 1000, 350),
        { up: true, down: true });
    assert.deepEqual(scrollArrowVisibility(650, 0, 1000, 350),
        { up: true, down: false });
    assert.deepEqual(scrollArrowVisibility(0, 0, 200, 350),
        { up: false, down: false });
    assert.deepEqual(scrollArrowVisibility(0, 0, 0, 0),
        { up: false, down: false });
});
