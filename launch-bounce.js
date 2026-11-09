// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Cristhian Gertner

// Only primary clicks on stopped apps are candidates for a launch bounce.
export function isStoppedClick(button, state, stoppedState)
{
    return button === 1 && state === stoppedState;
}

// Timestamps are GLib monotonic microseconds. Ignore stale launches.
export function isFreshLaunch(pressedAt, now, maxAge)
{
    return Number.isFinite(pressedAt) &&
        Number.isFinite(now) &&
        now >= pressedAt &&
        now - pressedAt <= maxAge;
}

// Move away from the panel edge, without changing Zorin's panel geometry.
export function bounceOffset(side, distance, top, left, right)
{
    if (side === top)
    {
        return { x: 0, y: distance };
    }

    if (side === left)
    {
        return { x: distance, y: 0 };
    }

    if (side === right)
    {
        return { x: -distance, y: 0 };
    }

    return { x: 0, y: -distance };
}
