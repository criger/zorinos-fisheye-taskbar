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

// Clutter captured events sometimes have no source actor. Test stage-space
// coordinates against the program icon instead of contains(null).
export function pointInsideActor(x, y, actorX, actorY, width, height)
{
    return [x, y, actorX, actorY, width, height]
        .every(Number.isFinite) &&
        width > 0 && height > 0 &&
        x >= actorX && x <= actorX + width &&
        y >= actorY && y <= actorY + height;
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
