// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Cristhian Gertner

/**
 * Position Zorin's existing tooltip outside the icon's VISUAL footprint,
 * which can be much larger than its unchanged native panel allocation.
 * Coordinates and dimensions are stage-space logical pixels.
 */
export function tooltipPosition(
{
    side, x, y, width, height, scale,
    labelWidth, labelHeight, pivotX, pivotY,
    monitor = null, gap = 10,
})
{
    const values = [x, y, width, height, scale, labelWidth, labelHeight,
        pivotX, pivotY, gap];

    if (!values.every(Number.isFinite) ||
        width <= 0 || height <= 0 ||
        labelWidth <= 0 || labelHeight <= 0 || scale <= 0)
    {
        return null;
    }

    const visualX = x + (width - width * scale) * pivotX;
    const visualY = y + (height - height * scale) * pivotY;
    const visualWidth = width * scale;
    const visualHeight = height * scale;

    let lx = x + (width - labelWidth) / 2;
    let ly = visualY - labelHeight - gap;

    switch (side)
    {
        case 'top':
            ly = visualY + visualHeight + gap;
            break;
        case 'left':
            lx = visualX + visualWidth + gap;
            ly = y + (height - labelHeight) / 2;
            break;
        case 'right':
            lx = visualX - labelWidth - gap;
            ly = y + (height - labelHeight) / 2;
            break;
        default:
            // Bottom taskbar: keep the label above the enlarged icon.
            break;
    }

    if (monitor && [monitor.x, monitor.y, monitor.width, monitor.height]
        .every(Number.isFinite))
    {
        const padding = 4;
        lx = Math.max(monitor.x + padding,
            Math.min(lx, monitor.x + monitor.width - labelWidth - padding));
        ly = Math.max(monitor.y + padding,
            Math.min(ly, monitor.y + monitor.height - labelHeight - padding));
    }

    return { x: Math.round(lx), y: Math.round(ly) };
}
