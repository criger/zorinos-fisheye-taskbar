// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Cristhian Gertner

/**
 * GNOME Shell paints a Clutter.Clone with its own paint opacity, even when
 * the source has zero opacity. Keep the source actor visible/mapped and
 * interactive so Zorin retains click, drag/drop and tooltip handling.
 */
export function showMagnifiedIcon(entry)
{
    if (entry.originalOpacity === null)
    {
        entry.originalOpacity = entry.source.get_opacity();
        entry.clone.show();
        entry.source.set_opacity(0);
    }
}

/** Restore the exact previous opacity before hiding the clone. */
export function hideMagnifiedIcon(entry)
{
    if (entry.originalOpacity !== null)
    {
        entry.source.set_opacity(entry.originalOpacity);
        entry.originalOpacity = null;
    }

    entry.clone.hide();
}
