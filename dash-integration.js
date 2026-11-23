// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Cristhian Gertner
//
// Adapter for Zorin Dash (Zorin OS 18, version 110).
// No changes to Zorin Dash or GNOME Shell internals are required.
// Discovery runs on lifecycle refreshes, NEVER on every pointer movement.

function isDockDash(actor)
{
    return actor && actor._box &&
        typeof actor.getAppIcons === 'function' &&
        Number.isInteger(actor._position) &&
        typeof actor._isHorizontal === 'boolean';
}

// Zorin Dash sets overview.controls.dash to its main DockDash.
// Reading this reference on motion helps detect layout changes promptly.
export function getActiveDash(Main)
{
    const controlsDash = Main.overview?._overview?.controls?.dash;
    if (isDockDash(controlsDash))
        return controlsDash;

    const dummyModeDash = Main.overview?.dash;
    return isDockDash(dummyModeDash) ? dummyModeDash : null;
}

// DockedDash owns a DockDash through its .dash property, a few ancestors
// above it. Use the outer dock for hit-testing and leave/visibility events.
function findDockContainer(dash)
{
    let actor = dash;
    for (let depth = 0; actor && depth < 32; depth++)
    {
        if (actor !== dash && actor.dash === dash)
            return actor;
        actor = actor.get_parent?.() ?? null;
    }

    return dash;
}

function findDockDashes(root)
{
    if (!root?.get_children)
        return [];

    const dashes = [];
    const stack = [root];
    const visited = new Set();
    // Clutter's actor tree may be large. Keep traversal bounded and only
    // perform it during refresh, not on motion.
    while (stack.length && visited.size < 20000)
    {
        const actor = stack.pop();
        if (!actor || visited.has(actor))
            continue;
        visited.add(actor);

        if (actor.get_name?.() === 'dash' && isDockDash(actor))
            dashes.push(actor);

        for (const child of actor.get_children?.() ?? [])
            stack.push(child);
    }

    return dashes;
}

/**
 * Present Zorin Dash in the shape already consumed by Fisheye's Taskbar code:
 *   panel.panel, panel.geom, panel.taskbar._box,
 *   panel.taskbar._getAppIcons(), panel.taskbar.iconSize.
 * Cached adapters preserve identity across repeated refreshes.
 */
export function findZorinDashPanels(Main, cache)
{
    const dashes = findDockDashes(Main.uiGroup);
    const mainDash = getActiveDash(Main);
    if (mainDash && !dashes.includes(mainDash))
        dashes.push(mainDash);

    const present = new Set(dashes);
    for (const oldDash of cache.keys())
    {
        if (!present.has(oldDash))
            cache.delete(oldDash);
    }

    return dashes.map(dash =>
    {
        let panel = cache.get(dash);
        if (!panel)
        {
            panel = {
                panel: null,
                geom: null,
                taskbar: {
                    _box: dash._box,
                    _getAppIcons: () => dash.getAppIcons(),
                    get iconSize() { return dash.iconSize; },
                },
            };
            cache.set(dash, panel);
        }

        panel.panel = findDockContainer(dash);
        panel.geom = {
            vertical: !dash._isHorizontal,
            position: dash._position,
        };
        panel.taskbar._box = dash._box;
        return panel;
    });
}
