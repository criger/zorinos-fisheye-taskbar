// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Cristhian Gertner

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { magnificationFrame } from './magnification.js';
import { hideMagnifiedIcon, showMagnifiedIcon } from './icon-visibility.js';

const REFRESH_INTERVAL_MS = 700;
const EDGE_TOLERANCE_PX = 48;
const MIN_VISIBLE_MAGNIFICATION = 1.01;

/**
 * A presentation-only overlay. All mouse, drag/drop, activation, previews,
 * panel sizing and window management remain owned by Zorin Taskbar.
 *
 * Zorin's taskbar scrollview clips its children. Clones in Main.uiGroup can
 * extend beyond that viewport without changing its struts or input region.
 */
export default class ZorinFisheyeExtension extends Extension
{
    enable()
    {
        this._entries = new Map();
        this._settings = this.getSettings();
        this._settingsId = this._settings.connect(
            'changed',
            () => this._renderCurrentPointer());

        this._stageId = global.stage.connect(
            'captured-event',
            (_stage, event) =>
            {
                if (event.type() === Clutter.EventType.MOTION)
                {
                    this._renderCurrentPointer();
                }

                // Never intercept input needed by Zorin's existing taskbar.
                return Clutter.EVENT_PROPAGATE;
            });

        this._refreshId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            REFRESH_INTERVAL_MS,
            () =>
            {
                this._refreshIcons();
                this._renderCurrentPointer();
                return GLib.SOURCE_CONTINUE;
            });

        this._refreshIcons();
        this._renderCurrentPointer();
    }

    disable()
    {
        if (this._refreshId)
        {
            GLib.Source.remove(this._refreshId);
            this._refreshId = 0;
        }

        if (this._stageId)
        {
            global.stage.disconnect(this._stageId);
            this._stageId = 0;
        }

        if (this._settingsId)
        {
            this._settings.disconnect(this._settingsId);
            this._settingsId = 0;
        }

        // Restore the native icons before removing our presentation clones.
        this._hideAll();

        for (const entry of this._entries.values())
        {
            entry.clone.destroy();
        }

        this._entries.clear();
        this._entries = null;
        this._settings = null;
    }

    _refreshIcons()
    {
        // Zorin Taskbar provides its current panels through this global.
        // This is an internal integration, not a stable GNOME API.
        const panels = global.zorinTaskbar?.panels ?? [];
        const discovered = new Map();

        for (const panel of panels)
        {
            const appIcons = panel.taskbar?._getAppIcons?.() ?? [];

            for (const appIcon of appIcons)
            {
                // Target only the visual icon, not the reactive event actor.
                const source = appIcon.icon?._iconBin;

                if (!source || !source.get_stage())
                {
                    continue;
                }

                discovered.set(source, panel);

                const existing = this._entries.get(source);

                if (existing)
                {
                    existing.panel = panel;
                    continue;
                }

                const clone = new Clutter.Clone(
                {
                    source,
                    reactive: false,
                    visible: false,
                });

                Main.uiGroup.add_child(clone);

                this._entries.set(source,
                {
                    panel,
                    source,
                    clone,
                    originalOpacity: null,
                });
            }
        }

        for (const [source, entry] of this._entries)
        {
            if (!discovered.has(source))
            {
                hideMagnifiedIcon(entry);
                entry.clone.destroy();
                this._entries.delete(source);
            }
        }
    }

    _renderCurrentPointer()
    {
        if (!this._entries)
        {
            return;
        }

        if (Main.overview.visible)
        {
            this._hideAll();
            return;
        }

        const [pointerX, pointerY] = global.get_pointer();
        const radius = this._settings.get_int('influence-radius');
        const strength = this._settings.get_double('magnification');
        const panels = new Set(
            [...this._entries.values()].map((entry) => entry.panel));

        for (const panel of panels)
        {
            const entries = [...this._entries.values()].filter(
                (entry) => entry.panel === panel);

            if (!panel.panel?.visible || !panel.panel.get_stage())
            {
                this._hide(entries);
                continue;
            }

            const [panelX, panelY] = panel.panel.get_transformed_position();
            const [panelWidth, panelHeight] = panel.panel.get_transformed_size();

            if (pointerX < panelX - EDGE_TOLERANCE_PX ||
                pointerX > panelX + panelWidth + EDGE_TOLERANCE_PX ||
                pointerY < panelY - EDGE_TOLERANCE_PX ||
                pointerY > panelY + panelHeight + EDGE_TOLERANCE_PX)
            {
                this._hide(entries);
                continue;
            }

            const vertical = Boolean(panel.geom?.vertical);
            const geometry = [];

            for (const entry of entries)
            {
                if (!entry.source.get_stage())
                {
                    hideMagnifiedIcon(entry);
                    continue;
                }

                const [x, y] = entry.source.get_transformed_position();
                const [width, height] = entry.source.get_transformed_size();

                if (width <= 0 || height <= 0)
                {
                    hideMagnifiedIcon(entry);
                    continue;
                }

                geometry.push(
                {
                    entry,
                    x,
                    y,
                    width,
                    height,
                    center: vertical ? y + height / 2 : x + width / 2,
                });
            }

            const pointerAxis = vertical ? pointerY : pointerX;
            const scales = magnificationFrame(
                geometry.map((item) => item.center),
                pointerAxis,
                radius,
                strength);

            geometry.forEach((item, index) =>
            {
                const { entry, x, y, width, height } = item;
                const scale = scales[index];

                if (scale < MIN_VISIBLE_MAGNIFICATION)
                {
                    hideMagnifiedIcon(entry);
                    return;
                }

                const side = panel.geom?.position;
                const pivotX = vertical ? (side === St.Side.RIGHT ? 1 : 0) : 0.5;
                const pivotY = vertical ? 0.5 : (side === St.Side.TOP ? 0 : 1);

                entry.clone.set_pivot_point(pivotX, pivotY);
                entry.clone.set_position(x, y);
                entry.clone.set_size(width, height);
                entry.clone.set_scale(scale, scale);
                showMagnifiedIcon(entry);
            });
        }
    }

    _hide(entries)
    {
        for (const entry of entries)
        {
            hideMagnifiedIcon(entry);
        }
    }

    _hideAll()
    {
        this._hide(this._entries.values());
    }
}
