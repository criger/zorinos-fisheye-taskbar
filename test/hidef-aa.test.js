// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderingMode, aaBufferFactor } from '../hidef-aa.js';

test('normal renderer is still the default', () =>
{
    assert.equal(renderingMode(false, false), 'standard');
});
test('original pixel modes are deterministically exclusive', () =>
{
    assert.equal(renderingMode(true, false), 'pixel-perfect');
    assert.equal(renderingMode(false, true), 'hidef-aa');
    assert.equal(renderingMode(true, true), 'pixel-perfect');
});
test('HiDef AA factors are restricted to 1-3x', () =>
{
    for (const [requested, expected] of [
        [1, 1], [2, 2], [3, 3], [0, 1], [4, 1],
        [1.5, 1], [Number.NaN, 1], [Infinity, 1],
    ])
        assert.equal(aaBufferFactor(requested), expected);
});
