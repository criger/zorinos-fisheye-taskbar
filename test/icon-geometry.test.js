// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { clonePlacement } from '../icon-geometry.js';

test('at 1x the clone has exactly the source allocation', () =>
{
    const p = clonePlacement(
    {
        x: 100, y: 900, width: 32, height: 32,
        nativeWidth: 32, nativeHeight: 32,
        scale: 1, pivotX: 0.5, pivotY: 1,
    });
    assert.deepEqual(p,
    {
        x: 100, y: 900, width: 32, height: 32,
        scaleX: 1, scaleY: 1,
    });
});

test('a parent transform is represented by clone transform, not allocation', () =>
{
    const p = clonePlacement(
    {
        x: 100, y: 900, width: 48, height: 48,
        nativeWidth: 32, nativeHeight: 32,
        scale: 1, pivotX: 0.5, pivotY: 1,
    });
    assert.deepEqual(p,
    {
        x: 100, y: 900, width: 32, height: 32,
        scaleX: 1.5, scaleY: 1.5,
    });
});

test('a 2x enlargement uses one transform and exact bottom anchor', () =>
{
    const p = clonePlacement(
    {
        x: 100, y: 900, width: 32, height: 32,
        nativeWidth: 32, nativeHeight: 32,
        scale: 2, pivotX: 0.5, pivotY: 1,
    });
    assert.deepEqual(p,
    {
        x: 84, y: 868, width: 32, height: 32,
        scaleX: 2, scaleY: 2,
    });
});

test('snap the overlay position to the actual device-pixel grid', () =>
{
    const p = clonePlacement(
    {
        x: 100.3, y: 899.7, width: 32, height: 32,
        nativeWidth: 32, nativeHeight: 32,
        scale: 1, pivotX: 0.5, pivotY: 1, resourceScale: 2,
    });
    assert.equal(p.x, 100.5);
    assert.equal(p.y, 899.5);
});

test('invalid source allocation cannot be painted', () =>
{
    assert.equal(clonePlacement(
    {
        x: 0, y: 0, width: 32, height: 32,
        nativeWidth: 0, nativeHeight: 32,
        scale: 1, pivotX: 0, pivotY: 0,
    }), null);
});
