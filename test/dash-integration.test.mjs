// SPDX-License-Identifier: GPL-3.0-or-later
// Regression tests for the Zorin Dash v110 adapter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getActiveDash, findZorinDashPanels } from '../dash-integration.js';

class Actor
{
    constructor(name = '', children = [])
    {
        this.name = name;
        this.children = children;
        for (const child of children)
            child.parent = this;
    }
    get_name() { return this.name; }
    get_children() { return this.children; }
    get_parent() { return this.parent ?? null; }
}

function makeDock(position, horizontal, appIds)
{
    const box = new Actor('box');
    const dash = new Actor('dash');
    dash._box = box;
    dash._position = position;
    dash._isHorizontal = horizontal;
    dash.iconSize = 48;
    dash.getAppIcons = () => appIds.map(id => ({ app: { get_id: () => id } }));
    const wrapper = new Actor('wrapper', [dash]);
    const dock = new Actor('dock', [wrapper]);
    dock.dash = dash;
    return { dock, dash, box };
}

const LEFT = 2;
const RIGHT = 3;
const BOTTOM = 1;

test('discovers Zorin Dash v110 left dock and adapts icon lookup and orientation', () =>
{
    const { dock, dash, box } = makeDock(LEFT, false,
        ['firefox.desktop', 'code.desktop']);
    const Main = {
        uiGroup: new Actor('uiGroup', [dock]),
        overview: { _overview: { controls: { dash } } },
    };
    const cache = new Map();
    const panels = findZorinDashPanels(Main, cache);
    assert.equal(panels.length, 1);
    const panel = panels[0];
    assert.equal(panel.panel, dock);
    assert.deepEqual(panel.geom, { vertical: true, position: LEFT });
    assert.equal(panel.taskbar._box, box);
    assert.equal(panel.taskbar.iconSize, 48);
    assert.deepEqual(panel.taskbar._getAppIcons().map(i => i.app.get_id()),
        ['firefox.desktop', 'code.desktop']);
    assert.equal(getActiveDash(Main), dash);
    assert.equal(findZorinDashPanels(Main, cache)[0], panel);
});

test('follows right-to-bottom orientation change without replacing the adapter', () =>
{
    const { dock, dash } = makeDock(RIGHT, false, ['a']);
    const Main = { uiGroup: new Actor('uiGroup', [dock]), overview: {} };
    const cache = new Map();
    const panel = findZorinDashPanels(Main, cache)[0];
    assert.deepEqual(panel.geom, { vertical: true, position: RIGHT });
    dash._isHorizontal = true;
    dash._position = BOTTOM;
    assert.equal(findZorinDashPanels(Main, cache)[0], panel);
    assert.deepEqual(panel.geom, { vertical: false, position: BOTTOM });
});

test('finds multiple monitor docks and prunes destroyed docks from cache', () =>
{
    const first = makeDock(LEFT, false, ['a']);
    const second = makeDock(LEFT, false, ['b']);
    const root = new Actor('uiGroup', [first.dock, second.dock]);
    const Main = {
        uiGroup: root,
        overview: { _overview: { controls: { dash: first.dash } } },
    };
    const cache = new Map();
    assert.equal(findZorinDashPanels(Main, cache).length, 2);
    root.children = [first.dock];
    assert.equal(findZorinDashPanels(Main, cache).length, 1);
    assert.equal(cache.has(second.dash), false);
});

test('discovers overview dock before actor-tree traversal is available', () =>
{
    const { dash } = makeDock(LEFT, false, ['a']);
    const Main = {
        uiGroup: {},
        overview: { _overview: { controls: { dash } } },
    };
    assert.equal(findZorinDashPanels(Main, new Map()).length, 1);
});

test('ignores a stock GNOME Dash without Zorin Dash internal contract', () =>
{
    const stock = new Actor('dash');
    stock._box = new Actor('box');
    const Main = {
        uiGroup: new Actor('uiGroup', [stock]),
        overview: { _overview: { controls: { dash: stock } } },
    };
    assert.equal(getActiveDash(Main), null);
    assert.deepEqual(findZorinDashPanels(Main, new Map()), []);
});

test('supports the direct GNOME overview dash fallback', () =>
{
    const { dash } = makeDock(LEFT, false, ['a']);
    const Main = { uiGroup: null, overview: { dash } };
    assert.equal(getActiveDash(Main), dash);
    assert.equal(findZorinDashPanels(Main, new Map()).length, 1);
});
