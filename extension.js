// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Cristhian Gertner

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { magnificationFrame } from './magnification.js';
import { hideMagnifiedIcon, showMagnifiedIcon } from './icon-visibility.js';
import { isStoppedClick, isFreshLaunch, bounceOffset } from './launch-bounce.js';
import { clonePlacement } from './icon-geometry.js';

const MIN_VISIBLE_MAGNIFICATION = 1.01;
const CLICK_WINDOW_US = 2_000_000;

/**
 * All interaction and panel geometry stay native to Zorin Taskbar.
 * Pre-create non-reactive Clutter clones of exactly the icons Zorin draws.
 */
export default class ZorinFisheyeExtension extends Extension
{
    enable()
    {
        this._entries = new Map();
        this._panels = new Map();
        this._signals = [];
        this._pendingLaunch = null;
        this._refreshIdleId = 0;
        this._manager = null;
        this._managerSignalId = 0;
        this._settings = this.getSettings();
        this._connect(this._settings, 'changed', () =>
        {
            if (!this._settings.get_boolean('bounce-enabled'))
            {
                for (const entry of this._entries.values())
                {
                    if (entry.bouncing)
                    {
                        this._cancelBounce(entry);
                        hideMagnifiedIcon(entry);
                    }
                }
            }

            this._renderCurrentPointer();
        });

        this._connect(Main.layoutManager, 'monitors-changed',
            () => this._scheduleRefresh());

        this._connect(Main.overview, 'showing',
            () => this._hideAll(true));

        this._connect(global.stage, 'captured-event', (_stage, event) =>
        {
            if (event.type() === Clutter.EventType.BUTTON_PRESS)
            {
                this._captureLaunch(event);
            }
            else if (event.type() === Clutter.EventType.BUTTON_RELEASE)
            {
                // Occurs before native click activation and potential
                // replacement of a pinned launcher with a running icon.
                this._completeLaunch(event);
            }
            else if (event.type() === Clutter.EventType.MOTION ||
                     event.type() === Clutter.EventType.ENTER ||
                     event.type() === Clutter.EventType.LEAVE)
            {
                // Restore native icons on the first motion beyond the panel.
                this._renderCurrentPointer();
            }

            return Clutter.EVENT_PROPAGATE;
        });

        this._refreshIcons();
        this._renderCurrentPointer();
    }

    disable()
    {
        if (this._refreshIdleId)
        {
            GLib.Source.remove(this._refreshIdleId);
            this._refreshIdleId = 0;
        }

        this._disconnectManager();
        this._disconnectPanels();
        this._disconnectSignals(this._signals);
        this._hideAll(true);

        for (const entry of this._entries.values())
        {
            entry.overlay.destroy();
        }

        this._entries.clear();
        this._pendingLaunch = null;
        this._entries = null;
        this._panels = null;
        this._settings = null;
    }

    _connect(object, signal, callback, into = this._signals)
    {
        const id = object.connect(signal, callback);
        into.push({ object, id });
    }

    _disconnectSignals(signals)
    {
        for (const { object, id } of signals)
        {
            try
            {
                object.disconnect(id);
            }
            catch (error)
            {
                // Zorin may have destroyed this actor during a panel reset.
            }
        }

        signals.length = 0;
    }

    _disconnectManager()
    {
        if (this._manager && this._managerSignalId)
        {
            try
            {
                this._manager.disconnect(this._managerSignalId);
            }
            catch (error)
            {
                // Zorin may already have been disabled.
            }
        }

        this._manager = null;
        this._managerSignalId = 0;
    }

    _ensureManager()
    {
        const manager = global.zorinTaskbar ?? null;

        if (manager === this._manager)
        {
            return;
        }

        this._disconnectManager();

        if (manager)
        {
            this._manager = manager;
            this._managerSignalId = manager.connect('panels-created',
                () => this._scheduleRefresh());
        }
    }

    _scheduleRefresh()
    {
        if (this._refreshIdleId || !this._entries)
        {
            return;
        }

        // Zorin may move several children in one redisplay. Reconcile once.
        this._refreshIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () =>
        {
            this._refreshIdleId = 0;
            this._refreshIcons();
            this._renderCurrentPointer();
            return GLib.SOURCE_REMOVE;
        });
    }

    _disconnectPanels()
    {
        for (const record of this._panels.values())
        {
            this._disconnectSignals(record.signals);
        }

        this._panels.clear();
    }

    _syncPanels(panels)
    {
        const active = new Set(panels);

        for (const [panel, record] of this._panels)
        {
            if (!active.has(panel) || panel.taskbar?._box !== record.box)
            {
                this._disconnectSignals(record.signals);
                this._panels.delete(panel);
            }
        }

        for (const panel of panels)
        {
            if (this._panels.has(panel))
            {
                continue;
            }

            const box = panel.taskbar?._box;

            if (!box || !panel.panel)
            {
                continue;
            }

            const record = { box, signals: [] };
            this._connect(box, 'child-added',
                () => this._scheduleRefresh(), record.signals);
            this._connect(box, 'child-removed',
                () => this._scheduleRefresh(), record.signals);
            this._connect(panel.panel, 'leave-event', (_actor, event) =>
            {
                const [x, y] = event.get_coords();

                if (!this._insidePanel(panel, x, y))
                {
                    this._hidePanel(panel);
                }

                return Clutter.EVENT_PROPAGATE;
            }, record.signals);

            this._connect(panel.panel, 'notify::visible', () =>
            {
                if (!panel.panel.visible)
                {
                    this._hidePanel(panel);
                }
            }, record.signals);

            this._panels.set(panel, record);
        }
    }

    _refreshIcons()
    {
        if (!this._entries)
        {
            return;
        }

        this._ensureManager();
        const panels = this._manager?.panels ?? [];
        this._syncPanels(panels);
        const discovered = new Set();

        for (const panel of panels)
        {
            const appIcons = panel.taskbar?._getAppIcons?.() ?? [];

            for (const appIcon of appIcons)
            {
                const source = appIcon.icon?._iconBin;

                if (!source)
                {
                    continue;
                }

                discovered.add(source);
                const existing = this._entries.get(source);

                if (existing)
                {
                    existing.panel = panel;
                    existing.appIcon = appIcon;
                    continue;
                }

                // Source stays the original Zorin actor, so PNG differences
                // between the app's small/large variants cannot change color.
                const overlay = new Clutter.Clone(
                {
                    source,
                    reactive: false,
                    visible: false,
                });

                Main.uiGroup.add_child(overlay);
                this._entries.set(source,
                {
                    panel, appIcon, source, overlay,
                    originalOpacity: null,
                    bouncing: false,
                });
            }
        }

        for (const [source, entry] of this._entries)
        {
            if (!discovered.has(source))
            {
                this._cancelBounce(entry);
                hideMagnifiedIcon(entry);
                entry.overlay.destroy();
                this._entries.delete(source);
            }
        }
    }

    _insidePanel(panel, x, y)
    {
        if (!panel.panel?.visible || !panel.panel.get_stage())
        {
            return false;
        }

        const [px, py] = panel.panel.get_transformed_position();
        const [width, height] = panel.panel.get_transformed_size();

        return x >= px && x <= px + width &&
            y >= py && y <= py + height;
    }

    _renderCurrentPointer()
    {
        if (!this._entries)
        {
            return;
        }

        // A cheap identity check detects taskbar extension restarts without
        // polling its icon list on every movement.
        const previousManager = this._manager;
        this._ensureManager();

        if (previousManager !== this._manager)
        {
            this._scheduleRefresh();
        }

        if (!this._manager || Main.overview.visible)
        {
            this._hideAll(true);
            return;
        }

        const [pointerX, pointerY] = global.get_pointer();
        const panels = new Set(
            [...this._entries.values()].map((entry) => entry.panel));

        for (const panel of panels)
        {
            const entries = [...this._entries.values()].filter(
                (entry) => entry.panel === panel);

            if (!this._insidePanel(panel, pointerX, pointerY))
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
                    if (!entry.bouncing)
                    {
                        hideMagnifiedIcon(entry);
                    }

                    continue;
                }

                const [x, y] = entry.source.get_transformed_position();
                const [width, height] = entry.source.get_transformed_size();

                if (width <= 0 || height <= 0)
                {
                    if (!entry.bouncing)
                    {
                        hideMagnifiedIcon(entry);
                    }

                    continue;
                }

                geometry.push(
                {
                    entry, x, y, width, height,
                    center: vertical ? y + height / 2 : x + width / 2,
                });
            }

            const pointerAxis = vertical ? pointerY : pointerX;
            const scales = magnificationFrame(
                geometry.map((item) => item.center),
                pointerAxis,
                this._settings.get_int('influence-radius'),
                this._settings.get_double('magnification'));

            geometry.forEach((item, index) =>
            {
                const { entry, x, y, width, height } = item;

                if (entry.bouncing)
                {
                    return;
                }

                const scale = scales[index];

                if (scale < MIN_VISIBLE_MAGNIFICATION)
                {
                    hideMagnifiedIcon(entry);
                    return;
                }

                const side = panel.geom?.position;
                const pivotX = vertical ? (side === St.Side.RIGHT ? 1 : 0) : 0.5;
                const pivotY = vertical ? 0.5 : (side === St.Side.TOP ? 0 : 1);

                if (this._positionOverlay(entry, x, y, width, height, scale,
                    pivotX, pivotY))
                {
                    showMagnifiedIcon(entry);
                }
            });
        }
    }

    _positionOverlay(entry, x, y, width, height, scale, pivotX, pivotY)
    {
        // The source's *local* allocation is the clone's base size.
        // Its stage-transformed size belongs only in the outer transform.
        const [nativeWidth, nativeHeight] = entry.source.get_size();
        const placement = clonePlacement(
        {
            x, y, width, height, nativeWidth, nativeHeight,
            scale, pivotX, pivotY,
            resourceScale: entry.source.get_resource_scale?.() ?? 1,
        });

        if (!placement)
        {
            hideMagnifiedIcon(entry);
            return false;
        }

        entry.overlay.set_pivot_point(0, 0);
        entry.overlay.set_position(placement.x, placement.y);
        entry.overlay.set_size(placement.width, placement.height);
        entry.overlay.set_scale(placement.scaleX, placement.scaleY);
        return true;
    }

    _hidePanel(panel)
    {
        this._hide([...this._entries.values()].filter(
            (entry) => entry.panel === panel));
    }

    _hide(entries, force = false)
    {
        for (const entry of entries)
        {
            if (entry.bouncing)
            {
                if (!force)
                {
                    continue;
                }

                this._cancelBounce(entry);
            }

            hideMagnifiedIcon(entry);
        }
    }

    _hideAll(force = false)
    {
        this._hide(this._entries.values(), force);
    }

    _captureLaunch(event)
    {
        this._pendingLaunch = null;

        if (!this._settings.get_boolean('bounce-enabled') ||
            event.get_button() !== 1)
        {
            return;
        }

        const target = event.get_source();

        for (const entry of this._entries.values())
        {
            const app = entry.appIcon?.app;

            if (app && entry.appIcon.contains(target) &&
                isStoppedClick(1, app.get_state(), Shell.AppState.STOPPED))
            {
                this._pendingLaunch =
                {
                    entry,
                    appIcon: entry.appIcon,
                    pressedAt: GLib.get_monotonic_time(),
                };
                break;
            }
        }
    }

    _completeLaunch(event)
    {
        const candidate = this._pendingLaunch;
        this._pendingLaunch = null;

        if (!candidate || event.get_button() !== 1 ||
            !this._settings.get_boolean('bounce-enabled') ||
            candidate.appIcon.isDragged ||
            !candidate.appIcon.contains(event.get_source()) ||
            !isFreshLaunch(candidate.pressedAt,
                GLib.get_monotonic_time(), CLICK_WINDOW_US))
        {
            return;
        }

        // An attempt to activate a STOPPED app is a launch operation.
        // Animating on release rather than on app-state-changed is important:
        // Zorin can replace/destroy the launcher actor before the app emits
        // STARTING/RUNNING. Ordinary clicks on RUNNING apps never get here.
        if (this._entries.get(candidate.entry.source) === candidate.entry)
        {
            this._bounce(candidate.entry);
        }
    }

    _cancelBounce(entry)
    {
        if (!entry.bouncing)
        {
            return;
        }

        entry.bouncing = false;
        entry.overlay.remove_all_transitions();
        entry.overlay.set_translation(0, 0, 0);
    }

    _bounce(entry)
    {
        if (entry.bouncing || !entry.source.get_stage() ||
            Main.overview.visible)
        {
            return;
        }

        const [x, y] = entry.source.get_transformed_position();
        const [width, height] = entry.source.get_transformed_size();

        if (width <= 0 || height <= 0)
        {
            return;
        }

        // Reuse the same clone for hover and the launch animation.
        entry.bouncing = true;
        entry.overlay.remove_all_transitions();
        entry.overlay.set_translation(0, 0, 0);
        if (!this._positionOverlay(entry, x, y, width, height, 1, 0.5, 0.5))
        {
            entry.bouncing = false;
            return;
        }

        showMagnifiedIcon(entry);

        const amplitude = this._settings.get_int('bounce-height');
        const position = entry.panel.geom?.position;
        const steps =
        [
            { fraction: 1, duration: 130, mode: Clutter.AnimationMode.EASE_OUT_QUAD },
            { fraction: 0, duration: 160, mode: Clutter.AnimationMode.EASE_IN_QUAD },
            { fraction: 0.55, duration: 110, mode: Clutter.AnimationMode.EASE_OUT_QUAD },
            { fraction: 0, duration: 140, mode: Clutter.AnimationMode.EASE_IN_QUAD },
        ];

        const runStep = (index) =>
        {
            if (!this._entries || this._entries.get(entry.source) !== entry ||
                !entry.bouncing)
            {
                return;
            }

            if (index === steps.length)
            {
                this._cancelBounce(entry);
                hideMagnifiedIcon(entry);
                this._renderCurrentPointer();
                return;
            }

            const step = steps[index];
            const offset = bounceOffset(position, step.fraction * amplitude,
                St.Side.TOP, St.Side.LEFT, St.Side.RIGHT);

            entry.overlay.ease(
            {
                translation_x: offset.x,
                translation_y: offset.y,
                duration: step.duration,
                mode: step.mode,
                onComplete: () => runStep(index + 1),
            });
        };

        runStep(0);
    }
}
