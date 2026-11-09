// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Cristhian Gertner

// Prefer a larger icon texture, then scale down to its display footprint.
export function highResolutionSize(baseSize, maximumScale)
{
    if (!Number.isFinite(baseSize) || baseSize <= 0)
        return 1;

    const factor = Number.isFinite(maximumScale)
        ? Math.max(2, Math.min(3, maximumScale))
        : 2;

    return Math.ceil(baseSize * factor);
}

// Match the original Clutter.Clone's pivot placement with a separate St.Icon.
export function highResolutionPlacement(
{
    x, y, width, height, scale, pivotX, pivotY, textureSize,
})
{
    const drawWidth = width * scale;
    const drawHeight = height * scale;

    return {
        x: x + (width - drawWidth) * pivotX,
        y: y + (height - drawHeight) * pivotY,
        scaleX: drawWidth / textureSize,
        scaleY: drawHeight / textureSize,
    };
}

// The application may expose different PNG artwork in different sizes.
// Exceptions are app desktop IDs, optionally written without '.desktop'.
export function shouldUseHighResolution(appId, enabled, nativeIconApps)
{
    if (!enabled)
    {
        return false;
    }

    const normalize = (id) => id.trim().replace(/\.desktop$/i, '');
    const target = normalize(String(appId ?? ''));

    return !String(nativeIconApps ?? '')
        .split(/[\n,;]+/)
        .map(normalize)
        .filter(Boolean)
        .includes(target);
}
