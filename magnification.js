// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Cristhian Gertner

/**
 * Compute visual scale from pointer proximity without altering icon allocation.
 * Coordinates and radius are expressed in GNOME logical pixels.
 */
export function magnificationAt(distance, radius, strength)
{
    if (!Number.isFinite(distance) ||
        !Number.isFinite(radius) ||
        !Number.isFinite(strength) ||
        radius <= 0 ||
        strength <= 0)
    {
        return 1;
    }

    const normalizedDistance = Math.abs(distance) / radius;

    if (normalizedDistance >= 1)
    {
        return 1;
    }

    const falloff = (1 + Math.cos(Math.PI * normalizedDistance)) / 2;

    return 1 + strength * falloff;
}

/**
 * The same curve works for horizontal and vertical taskbars.
 * Supply pointer/centers on the taskbar's main axis.
 */
export function magnificationFrame(centers, pointer, radius, strength)
{
    return centers.map((center) =>
        magnificationAt(pointer - center, radius, strength));
}
