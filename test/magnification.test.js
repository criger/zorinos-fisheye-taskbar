// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    magnificationAt,
    magnificationFrame,
} from '../magnification.js';

test('no scale outside the radius', () =>
{
    assert.equal(magnificationAt(120, 120, 0.75), 1);
    assert.equal(magnificationAt(121, 120, 0.75), 1);
    assert.equal(magnificationAt(-121, 120, 0.75), 1);
});

test('center gets maximum scale', () =>
{
    assert.equal(magnificationAt(0, 120, 0.75), 1.75);
});

test('falloff is symmetric and monotonic', () =>
{
    assert.equal(magnificationAt(30, 120, 0.75),
        magnificationAt(-30, 120, 0.75));
    assert.ok(magnificationAt(20, 120, 0.75) >
        magnificationAt(80, 120, 0.75));
});

test('invalid configuration never shrinks or breaks an icon', () =>
{
    for (const value of [0, -1, Number.NaN])
    {
        assert.equal(magnificationAt(0, value, 0.75), 1);
    }
    assert.equal(magnificationAt(0, 120, Number.NaN), 1);
    assert.equal(magnificationAt(0, 120, -1), 1);
});

test('neighbors magnify while distant icons remain unchanged', () =>
{
    const scales = magnificationFrame([0, 40, 80, 250], 40, 100, 0.75);
    assert.equal(scales[1], 1.75);
    assert.ok(scales[0] > 1);
    assert.equal(scales[0], scales[2]);
    assert.equal(scales[3], 1);
});
