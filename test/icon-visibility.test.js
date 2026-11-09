// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import { hideMagnifiedIcon, showMagnifiedIcon } from '../icon-visibility.js';

function createEntry(initialOpacity = 255)
{
    const operations = [];
    const source = {
        opacity: initialOpacity,
        reactive: true,
        visible: true,
        get_opacity() { return this.opacity; },
        set_opacity(value)
        {
            this.opacity = value;
            operations.push(`source opacity ${value}`);
        },
    };
    const overlay = {
        visible: false,
        show() { this.visible = true; operations.push('clone show'); },
        hide() { this.visible = false; operations.push('clone hide'); },
    };
    return { entry: { source, overlay, originalOpacity: null }, operations };
}

test('hover hides only the original paint, leaving input actor active', () =>
{
    const { entry, operations } = createEntry();
    showMagnifiedIcon(entry);
    assert.equal(entry.source.opacity, 0);
    assert.equal(entry.source.visible, true);
    assert.equal(entry.source.reactive, true);
    assert.equal(entry.overlay.visible, true);
    assert.deepEqual(operations, ['clone show', 'source opacity 0']);
});

test('hover exit restores existing opacity and hides clone', () =>
{
    const { entry, operations } = createEntry(137);
    showMagnifiedIcon(entry);
    hideMagnifiedIcon(entry);
    assert.equal(entry.source.opacity, 137);
    assert.equal(entry.overlay.visible, false);
    assert.equal(entry.originalOpacity, null);
    assert.deepEqual(operations, [
        'clone show', 'source opacity 0', 'source opacity 137', 'clone hide',
    ]);
});

test('repeated motion events do not overwrite saved opacity', () =>
{
    const { entry, operations } = createEntry(220);
    showMagnifiedIcon(entry);
    showMagnifiedIcon(entry);
    showMagnifiedIcon(entry);
    hideMagnifiedIcon(entry);
    assert.equal(entry.source.opacity, 220);
    assert.equal(operations.filter((v) => v === 'source opacity 0').length, 1);
});

test('repeated hide is safe and keeps original opacity', () =>
{
    const { entry } = createEntry(210);
    hideMagnifiedIcon(entry);
    showMagnifiedIcon(entry);
    hideMagnifiedIcon(entry);
    hideMagnifiedIcon(entry);
    assert.equal(entry.source.opacity, 210);
    assert.equal(entry.overlay.visible, false);
});

test('preexisting zero opacity remains zero after restoration', () =>
{
    const { entry } = createEntry(0);
    showMagnifiedIcon(entry);
    hideMagnifiedIcon(entry);
    assert.equal(entry.source.opacity, 0);
});
