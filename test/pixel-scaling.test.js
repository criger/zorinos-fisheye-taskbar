// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { pixelPerfectScale, findOriginalIconContent } from '../pixel-scaling.js';

test('pixel-perfect magnification never uses fractional scale', () =>
{
    for (const [input, expected] of [
        [1, 1], [1.01, 1], [1.49, 1],
        [1.5, 2], [1.75, 2], [2, 2], [2.5, 2],
        [Number.NaN, 1], [Infinity, 1], [-1, 1],
    ])
    {
        assert.equal(pixelPerfectScale(input), expected);
    }
});

test('use exact already loaded inner St.Icon texture, not another size variant', () =>
{
    const pixels = { png: 'white-background' };
    const textureActor = { get_content: () => pixels };
    const icon = {
        get_content: () => null,
        get_children: () => [textureActor],
    };
    const originalBin = { get_child: () => icon };
    assert.equal(findOriginalIconContent(originalBin), pixels);
    assert.equal(findOriginalIconContent({ get_child: () => null }), null);
});

test('custom icons without accessible content can use clone fallback', () =>
{
    const originalBin = {
        get_child: () => ({ get_children: () => [] }),
    };
    assert.equal(findOriginalIconContent(originalBin), null);
});
