// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { tooltipPosition } from '../tooltip-position.js';

const base = {
    x: 100, y: 900, width: 32, height: 32,
    labelWidth: 120, labelHeight: 28,
    gap: 10, pivotX: 0.5, pivotY: 1,
    monitor: { x: 0, y: 0, width: 1000, height: 1000 },
};

test('bottom tooltip clears a 1.75x icon instead of its native panel slot', () =>
{
    const p = tooltipPosition({ ...base, side: 'bottom', scale: 1.75 });
    assert.deepEqual(p, { x: 56, y: 838 });
    assert.ok(p.y + base.labelHeight + base.gap <=
        base.y + base.height * (1 - 1.75));
});

test('tooltip clears a strict 2x icon with the same label actor', () =>
{
    assert.deepEqual(tooltipPosition({ ...base, side: 'bottom', scale: 2 }),
        { x: 56, y: 830 });
});

test('top tooltip is placed below the enlarged icon', () =>
{
    const p = tooltipPosition({
        ...base, side: 'top', pivotY: 0, scale: 2,
        monitor: { x: 0, y: 0, width: 1000, height: 1200 },
    });
    assert.deepEqual(p, { x: 56, y: 974 });
});

test('left and right taskbars offset label away from the expanded icon', () =>
{
    const left = tooltipPosition({
        ...base, side: 'left', pivotX: 0, pivotY: 0.5, scale: 2,
    });
    const right = tooltipPosition({
        ...base, side: 'right', pivotX: 1, pivotY: 0.5, scale: 2,
    });
    assert.deepEqual(left, { x: 174, y: 902 });
    assert.deepEqual(right, { x: 4, y: 902 });
});

test('clamp tooltip to a secondary monitor, never beyond its boundary', () =>
{
    const p = tooltipPosition({
        ...base, x: 1930, y: 900, scale: 2,
        monitor: { x: 1920, y: 0, width: 1920, height: 1080 },
    });
    assert.ok(p.x >= 1924);
    assert.ok(p.x + base.labelWidth <= 3836);
});

test('invalid or unallocated icon or label returns null', () =>
{
    assert.equal(tooltipPosition({ ...base, scale: 0 }), null);
    assert.equal(tooltipPosition({ ...base, scale: 2, labelHeight: 0 }), null);
});
