// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Cristhian Gertner

export function condensedIconPath(path, maximum = 62)
{
    const full = String(path ?? '');

    if (!full)
        return 'Theme / resource icon';

    if (full.length <= maximum)
        return full;

    const parts = full.split('/').filter(Boolean);
    const filename = parts[parts.length - 1] ?? '';
    const prefix = full.startsWith('/usr/share/icons/')
        ? '/usr/share/icons/'
        : full.startsWith('/home/') && parts.length >= 3
            ? '/home/' + parts[1] + '/'
            : '/' + parts.slice(0, 2).join('/') + '/';
    const available = Math.max(8, maximum - prefix.length - 2);
    const tail = filename.length <= available
        ? filename
        : filename.slice(0, Math.max(4, available - 10)) +
            '…' + filename.slice(-Math.min(9, available - 5));

    return prefix + '…/' + tail;
}

export function scrollArrowVisibility(value, lower, upper, pageSize)
{
    if (![value, lower, upper, pageSize].every(Number.isFinite) ||
        pageSize <= 0)
    {
        return { up: false, down: false };
    }

    const overflowing = upper - lower > pageSize + 1;

    return {
        up: overflowing && value > lower + 1,
        down: overflowing && value + pageSize < upper - 1,
    };
}
