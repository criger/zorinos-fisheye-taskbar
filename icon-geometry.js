// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Cristhian Gertner

// Keep the clone's allocation equal to the original source allocation.
// Clutter.Clone scales the source to its own allocation; passing the
// transformed stage size as that allocation can introduce a second scaling.
export function clonePlacement(
{
    x, y, width, height,
    nativeWidth, nativeHeight,
    scale, pivotX, pivotY,
    resourceScale = 1,
})
{
    if (nativeWidth <= 0 || nativeHeight <= 0)
    {
        return null;
    }

    const magnifiedWidth = width * scale;
    const magnifiedHeight = height * scale;
    const pixelScale = Number.isFinite(resourceScale) && resourceScale > 0
        ? resourceScale : 1;
    const snap = (v) => Math.round(v * pixelScale) / pixelScale;

    return {
        x: snap(x + (width - magnifiedWidth) * pivotX),
        y: snap(y + (height - magnifiedHeight) * pivotY),
        width: nativeWidth,
        height: nativeHeight,
        scaleX: magnifiedWidth / nativeWidth,
        scaleY: magnifiedHeight / nativeHeight,
    };
}
