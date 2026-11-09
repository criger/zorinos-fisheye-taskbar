// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Cristhian Gertner

/**
 * Strict integer magnification: choose 1× or 2× only.
 * With NEAREST filtering, every original source pixel is duplicated
 * into a 2×2 block at 2×. This is intentionally a stepped effect.
 */
export function pixelPerfectScale(requested)
{
    return Number.isFinite(requested) && requested >= 1.5 ? 2 : 1;
}

/**
 * Reuse the actual already-loaded Clutter.Content from St.Icon's
 * texture child. No icon theme lookup or alternative PNG size is made.
 *
 * GNOME 46 St.Icon owns an icon_texture child carrying the content.
 * A custom icon actor can differ, so return null to allow a fallback.
 */
export function findOriginalIconContent(iconBin)
{
    const root = iconBin?.get_child?.() ?? iconBin?.child;

    if (!root)
    {
        return null;
    }

    const queue = [root];
    let inspected = 0;

    while (queue.length && inspected < 32)
    {
        const actor = queue.shift();
        inspected++;

        const content = actor?.get_content?.();

        if (content)
        {
            return content;
        }

        for (const child of actor?.get_children?.() ?? [])
        {
            queue.push(child);
        }
    }

    return null;
}
