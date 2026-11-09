// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { highResolutionSize, highResolutionPlacement } from '../icon-rendering.js';

test('larger icon textures are requested', () =>
{
    assert.equal(highResolutionSize(32, 1.75), 64);
    assert.equal(highResolutionSize(40, 2.5), 100);
    assert.equal(highResolutionSize(0, 2), 1);
});

test('unreasonable magnification stays bounded', () =>
{
    assert.equal(highResolutionSize(32, 999), 96);
    assert.equal(highResolutionSize(32, Number.NaN), 64);
});

test('bottom-positioned icon remains centered and bottom-anchored', () =>
{
    const p = highResolutionPlacement(
    {
        x: 100, y: 900, width: 32, height: 32, scale: 1.75,
        pivotX: 0.5, pivotY: 1, textureSize: 64,
    });
    assert.deepEqual(p, { x: 88, y: 876, scaleX: 0.875, scaleY: 0.875 });
});

test('top and left positions preserve the source anchor', () =>
{
    const top = highResolutionPlacement(
    {
        x: 100, y: 40, width: 32, height: 32, scale: 1.5,
        pivotX: 0.5, pivotY: 0, textureSize: 64,
    });
    assert.equal(top.x, 92);
    assert.equal(top.y, 40);
    const left = highResolutionPlacement(
    {
        x: 0, y: 80, width: 32, height: 32, scale: 1.5,
        pivotX: 0, pivotY: 0.5, textureSize: 64,
    });
    assert.equal(left.x, 0);
    assert.equal(left.y, 72);
});
