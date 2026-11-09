// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Cristhian Gertner

// The live taskbar is in GNOME Shell and preferences run in another process.
// Only short, non-sensitive app metadata crosses that boundary through
// GSettings. These helpers intentionally have no GJS dependencies.

export function normalizeTaskbarApps(items)
{
    if (!Array.isArray(items))
        return [];

    const seen = new Set();
    const result = [];

    for (const item of items)
    {
        const id = String(item?.id ?? '').trim();

        if (!id || seen.has(id))
            continue;

        seen.add(id);
        result.push({
            id,
            name: String(item?.name ?? id).trim() || id,
            icon: String(item?.icon ?? ''),
            size: Number.isInteger(item?.size) && item.size > 0
                ? item.size : 32,
        });
    }

    return result;
}

export function iconOverrideFor(appId, map)
{
    if (typeof appId !== 'string' || !map ||
        typeof map !== 'object' ||
        !Object.prototype.hasOwnProperty.call(map, appId))
    {
        return '';
    }

    const path = map[appId];
    return typeof path === 'string' && path.startsWith('/') ? path : '';
}

export function appRowsToVariant(rows)
{
    return normalizeTaskbarApps(rows).map(row =>
        [row.id, row.name, row.icon, row.size]);
}

export function appRowsFromVariant(rows)
{
    if (!Array.isArray(rows))
        return [];

    return normalizeTaskbarApps(rows.map(item => ({
        id: item?.[0], name: item?.[1],
        icon: item?.[2], size: item?.[3],
    })));
}
