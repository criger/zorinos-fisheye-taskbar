// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Cristhian Gertner

// Deterministic fallback if legacy GSettings contains both enabled.
export function renderingMode(pixelPerfect, hiDefAA)
{
    if (pixelPerfect)
        return 'pixel-perfect';

    return hiDefAA ? 'hidef-aa' : 'standard';
}

export function aaBufferFactor(requested)
{
    return Number.isInteger(requested) && requested >= 1 && requested <= 3
        ? requested : 1;
}
