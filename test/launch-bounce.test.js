// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    isStoppedClick,
    isFreshLaunch,
    bounceOffset,
} from '../launch-bounce.js';

test('only primary click on a stopped app queues a launch', () =>
{
    assert.equal(isStoppedClick(1, 0, 0), true);
    assert.equal(isStoppedClick(1, 2, 0), false);
    assert.equal(isStoppedClick(2, 0, 0), false);
});

test('stale or reversed launch events never bounce', () =>
{
    assert.equal(isFreshLaunch(10, 11, 3000000), true);
    assert.equal(isFreshLaunch(10, 3000010, 3000000), true);
    assert.equal(isFreshLaunch(10, 3000011, 3000000), false);
    assert.equal(isFreshLaunch(11, 10, 3000000), false);
});

test('bounce always moves away from its panel edge', () =>
{
    assert.deepEqual(bounceOffset(0, 12, 0, 2, 3), { x: 0, y: 12 });
    assert.deepEqual(bounceOffset(2, 12, 0, 2, 3), { x: 12, y: 0 });
    assert.deepEqual(bounceOffset(3, 12, 0, 2, 3), { x: -12, y: 0 });
    assert.deepEqual(bounceOffset(1, 12, 0, 2, 3), { x: 0, y: -12 });
});
