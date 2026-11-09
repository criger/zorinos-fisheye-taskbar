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
import { isStoppedClick, isFreshLaunch, bounceOffset, pointInsideActor } from './launch-bounce.js';
import { highResolutionSize, highResolutionPlacement, shouldUseHighResolution } from './icon-rendering.js';
import { clonePlacement } from './icon-geometry.js';
import { pixelPerfectScale, findOriginalIconContent } from './pixel-scaling.js';

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
        this._orphanBounces = new Set();
        this._panels = new Map();
        this._signals = [];
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
                    if (entry.bouncing || entry.bouncePending)
                    {
                        this._cancelBounce(entry);
                        hideMagnifiedIcon(entry);
                    }
                }

                for (const entry of this._orphanBounces)
                {
                    this._cancelBounce(entry);
                    entry.overlay.destroy();
                }

                this._orphanBounces.clear();
            }

            // Rebuild only when render mode changes; HD textures were
            // loaded when the icon was discovered, not during hover.
            this._refreshIcons();
            this._renderCurrentPointer();
        });

        this._connect(Main.layoutManager, 'monitors-changed',
            () => this._scheduleRefresh());

        this._connect(Main.overview, 'showing',
            () => this._hideAll(true));

        this._connect(global.stage, 'captured-event', (_stage, event) =>
        {
            if (event.type() === Clutter.EventType.MOTION ||
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
            this._unwatchIcon(entry);
            entry.overlay.destroy();
        }

        for (const entry of this._orphanBounces)
        {
            this._cancelBounce(entry);
            entry.overlay.destroy();
        }

        this._orphanBounces.clear();
        this._entries.clear();
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

    _makeOverlay(appIcon, source, panel)
    {
        const pixelPerfect = this._settings.get_boolean('pixel-perfect-icons');
        const preferHighResolution = !pixelPerfect && shouldUseHighResolution(
            appIcon.app?.get_id?.(),
            this._settings.get_boolean('high-resolution-icons'),
            this._settings.get_string('native-icon-apps'));
        const renderPreference = pixelPerfect ? 'pixel-perfect'
            : preferHighResolution ? 'hd' : 'original';
        let overlay = null;
        let highResolution = false;
        let pixelContent = false;
        let textureSize = 0;

        if (pixelPerfect)
        {
            // GNOME Shell 46's St.Icon paints a child ClutterActor with
            // the exact loaded image content. Share that *same object*,
            // rather than asking the icon theme for a different PNG size.
            const content = findOriginalIconContent(source);

            if (content)
            {
                overlay = new Clutter.Actor(
                {
                    content,
                    reactive: false,
                    visible: false,
                });

                overlay.set_content_scaling_filters(
                    Clutter.ScalingFilter.NEAREST,
                    Clutter.ScalingFilter.NEAREST);
                pixelContent = true;
            }
        }

        if (!overlay && preferHighResolution && source.get_stage())
        {
            const [width, height] = source.get_transformed_size();
            textureSize = highResolutionSize(
                Math.max(width, height, panel.taskbar.iconSize || 1),
                1 + this._settings.get_double('magnification'));

            try
            {
                // Restore the proven sharp method from commit 173f9ed.
                // It can choose a different size-dependent app icon asset.
                overlay = appIcon.app?.create_icon_texture?.(textureSize) ?? null;
                highResolution = Boolean(overlay);
            }
            catch (error)
            {
                console.warn('[Zorin Fisheye] HD icon unavailable:', error);
            }
        }

        if (!overlay)
        {
            overlay = new Clutter.Clone(
            {
                source,
                reactive: false,
                visible: false,
            });
        }

        overlay.reactive = false;

        if (highResolution)
        {
            overlay.set_size(textureSize, textureSize);
        }
        else if (pixelPerfect && !pixelContent)
        {
            // Custom icon actor with no extractable texture. This fallback
            // retains original artwork, but Clutter.Clone may still sample
            // smoothly because its source is an actor tree, not Content.
            overlay.magnification_filter = Clutter.ScalingFilter.NEAREST;
            overlay.minification_filter = Clutter.ScalingFilter.NEAREST;
            overlay.offscreen_redirect = Clutter.OffscreenRedirect.NEVER;
        }

        overlay.hide();
        Main.uiGroup.add_child(overlay);

        return {
            overlay,
            highResolution,
            textureSize,
            renderPreference,
            pixelPerfect,
            pixelContent,
        };
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

                    if (existing.appIcon !== appIcon)
                    {
                        this._unwatchIcon(existing);
                        existing.appIcon = appIcon;
                        this._watchIcon(existing);
                    }

                    const pixelPerfect = this._settings.get_boolean(
                        'pixel-perfect-icons');
                    const preferHD = !pixelPerfect && shouldUseHighResolution(
                        appIcon.app?.get_id?.(),
                        this._settings.get_boolean('high-resolution-icons'),
                        this._settings.get_string('native-icon-apps'));
                    const renderPreference = pixelPerfect ? 'pixel-perfect'
                        : preferHD ? 'hd' : 'original';

                    // If a texture becomes available later, replace the
                    // experimental clone fallback with true pixel content.
                    const liveContent = pixelPerfect
                        ? findOriginalIconContent(source) : null;
                    const contentReady = pixelPerfect &&
                        !existing.pixelContent && Boolean(liveContent);
                    const contentChanged = pixelPerfect &&
                        existing.pixelContent &&
                        existing.overlay.get_content?.() !== liveContent;

                    if (!existing.bouncing && !existing.bouncePending &&
                        (existing.renderPreference !== renderPreference ||
                         contentReady || contentChanged))
                    {
                        hideMagnifiedIcon(existing);
                        existing.overlay.destroy();
                        Object.assign(existing,
                            this._makeOverlay(appIcon, source, panel));
                    }
                    else if (existing.highResolution && !existing.bouncing &&
                             !existing.bouncePending)
                    {
                        // Changing the maximum zoom may require a larger
                        // texture; do not reload icons on every mouse event.
                        const [w, h] = source.get_transformed_size();
                        const size = highResolutionSize(
                            Math.max(w, h, panel.taskbar.iconSize || 1),
                            1 + this._settings.get_double('magnification'));
                        if (size > existing.textureSize)
                        {
                            existing.overlay.set_icon_size(size);
                            existing.overlay.set_size(size, size);
                            existing.textureSize = size;
                        }
                    }

                    continue;
                }

                const entry =
                {
                    panel, appIcon, source,
                    ...this._makeOverlay(appIcon, source, panel),
                    originalOpacity: null,
                    bouncing: false,
                };

                this._entries.set(source, entry);
                this._watchIcon(entry);
            }
        }

        for (const [source, entry] of this._entries)
        {
            if (!discovered.has(source))
            {
                this._unwatchIcon(entry);

                if ((entry.bouncing || entry.bouncePending) &&
                    (entry.highResolution || entry.pixelContent))
                {
                    // A launcher may disappear before our deferred bounce.
                    // Keep the independent HD/pixel-content actor until done.
                    // The independent St.Icon can finish bouncing, even
                    // after Zorin replaces its original actor.
                    if (entry.originalOpacity !== null)
                    {
                        try
                        {
                            source.set_opacity(entry.originalOpacity);
                        }
                        catch (error)
                        {
                            // Source actor may already be destroyed.
                        }

                        entry.originalOpacity = null;
                    }

                    this._orphanBounces.add(entry);
                }
                else
                {
                    this._cancelBounce(entry);
                    hideMagnifiedIcon(entry);
                    entry.overlay.destroy();
                }

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

                const scale = entry.pixelPerfect
                    ? pixelPerfectScale(scales[index])
                    : scales[index];

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
        if (entry.highResolution)
        {
            const placement = highResolutionPlacement(
            {
                x, y, width, height, scale, pivotX, pivotY,
                textureSize: entry.textureSize,
            });
            entry.overlay.set_pivot_point(0, 0);
            entry.overlay.set_position(placement.x, placement.y);
            entry.overlay.set_scale(placement.scaleX, placement.scaleY);
            return true;
        }

        // Pixel-content or exact-original clone: native allocation avoids
        // a second transform when displaying the source-sized texture.
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
            if (entry.bouncing || entry.bouncePending)
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

    _watchIcon(entry)
    {
        const appIcon = entry.appIcon;
        entry.iconSignals = [];

        // St.Icon creates/replaces its inner image-content child when a
        // texture finishes loading or the icon theme changes. Refresh the
        // shared-content overlay on those native actor events, no polling.
        const iconActor = entry.source.get_child?.() ??
            entry.source.child;

        if (iconActor)
        {
            this._connect(iconActor, 'child-added',
                () => this._scheduleRefresh(), entry.iconSignals);
            this._connect(iconActor, 'child-removed',
                () => this._scheduleRefresh(), entry.iconSignals);
        }

        entry.launchArmed = false;
        entry.launchPressed = false;
        entry.launchPressedAt = 0;

        const press = (event) =>
        {
            entry.launchPressed = true;
            entry.launchArmed = this._settings.get_boolean('bounce-enabled') &&
                isStoppedClick(event.get_button(),
                    appIcon.app.get_state(), Shell.AppState.STOPPED);
            entry.launchPressedAt = GLib.get_monotonic_time();

            if (entry.launchArmed)
            {
                console.log('[Zorin Fisheye] Launch press armed: ' +
                    (appIcon.app?.get_id?.() ?? 'unknown-app'));
            }
        };

        const release = (event) =>
        {
            const [x, y] = event.get_coords?.() ?? global.get_pointer();
            const [actorX, actorY] = appIcon.get_transformed_position();
            const [width, height] = appIcon.get_transformed_size();
            const releasedInside = pointInsideActor(
                x, y, actorX, actorY, width, height);

            const launch = releasedInside && entry.launchArmed &&
                event.get_button() === 1 &&
                !appIcon.isDragged &&
                isFreshLaunch(entry.launchPressedAt,
                    GLib.get_monotonic_time(), CLICK_WINDOW_US);

            entry.launchArmed = false;

            if (launch && this._settings.get_boolean('bounce-enabled'))
            {
                this._startLaunchBounce(entry, 'button-release');
            }
        };

        // Capture on the *actual icon actor* before the St.Button class
        // handles activation. The regular actor signals are fallbacks for
        // GNOME/Zorin configurations with a different capture path.
        this._connect(appIcon, 'captured-event', (_actor, event) =>
        {
            if (event.type() === Clutter.EventType.BUTTON_PRESS)
            {
                press(event);
            }
            else if (event.type() === Clutter.EventType.BUTTON_RELEASE)
            {
                release(event);
            }

            return Clutter.EVENT_PROPAGATE;
        }, entry.iconSignals);

        this._connect(appIcon, 'button-press-event', (_actor, event) =>
        {
            // Do not overwrite a capture-handler's STOPPED observation
            // with a potentially already changed application state.
            if (!entry.launchPressed)
            {
                press(event);
            }

            return Clutter.EVENT_PROPAGATE;
        }, entry.iconSignals);

        this._connect(appIcon, 'button-release-event', (_actor, event) =>
        {
            if (entry.launchArmed)
            {
                release(event);
            }

            return Clutter.EVENT_PROPAGATE;
        }, entry.iconSignals);

        // Keyboard activation / GNOME variants which don't deliver a
        // matching mouse-release still emit St.Button.clicked.
        this._connect(appIcon, 'clicked', () =>
        {
            if (entry.bouncing || entry.bouncePending ||
                !this._settings.get_boolean('bounce-enabled'))
            {
                entry.launchPressed = false;
                entry.launchArmed = false;
                return;
            }

            const launch = entry.launchPressed
                ? entry.launchArmed
                : appIcon.app.get_state() === Shell.AppState.STOPPED;

            entry.launchPressed = false;
            entry.launchArmed = false;

            if (launch && !appIcon.isDragged)
            {
                this._startLaunchBounce(entry, 'clicked');
            }
        }, entry.iconSignals);
    }

    _unwatchIcon(entry)
    {
        if (entry.iconSignals)
        {
            this._disconnectSignals(entry.iconSignals);
            entry.iconSignals = null;
        }
    }

    _startLaunchBounce(entry, signalName)
    {
        if (this._entries?.get(entry.source) !== entry ||
            entry.bouncing || entry.bouncePending ||
            !entry.source.get_stage())
        {
            return;
        }

        // Save geometry before Zorin potentially replaces its launcher.
        const [x, y] = entry.source.get_transformed_position();
        const [width, height] = entry.source.get_transformed_size();

        if (width <= 0 || height <= 0)
        {
            return;
        }

        entry.bounceGeometry = { x, y, width, height };
        entry.bouncePending = true;

        // Do not change the native icon's opacity, hover or pressed state
        // during the click event. Only the scheduled idle will touch visuals.
        // This preserves Zorin's click dispatch and startup feedback.
        console.log('[Zorin Fisheye] Launch bounce queued after click: ' +
            signalName + ': ' +
            (entry.appIcon?.app?.get_id?.() ?? 'unknown-app'));

        entry.bounceIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () =>
        {
            entry.bounceIdleId = 0;

            if (!entry.bouncePending || !this._entries)
            {
                return GLib.SOURCE_REMOVE;
            }

            entry.bouncePending = false;
            const geometry = entry.bounceGeometry;
            entry.bounceGeometry = null;

            if (this._entries.get(entry.source) !== entry &&
                !this._orphanBounces.has(entry))
            {
                return GLib.SOURCE_REMOVE;
            }

            this._bounce(entry, geometry);
            return GLib.SOURCE_REMOVE;
        });
    }

    _cancelBounce(entry)
    {
        if (entry.bounceIdleId)
        {
            GLib.Source.remove(entry.bounceIdleId);
            entry.bounceIdleId = 0;
        }

        entry.bouncePending = false;
        entry.bounceGeometry = null;

        if (!entry.bouncing)
        {
            return;
        }

        entry.bouncing = false;
        entry.overlay.remove_all_transitions();
        entry.overlay.set_translation(0, 0, 0);
    }

    _bounce(entry, savedGeometry = null)
    {
        const orphan = this._orphanBounces.has(entry);

        if (entry.bouncing || (!orphan && !entry.source.get_stage()) ||
            Main.overview.visible)
        {
            console.warn('[Zorin Fisheye] Bounce skipped: icon not staged, ' +
                'animation active or overview visible');

            if (orphan)
            {
                this._cancelBounce(entry);
                entry.overlay.destroy();
                this._orphanBounces.delete(entry);
            }

            return;
        }

        const { x, y, width, height } = savedGeometry ??
            (() =>
            {
                const [px, py] = entry.source.get_transformed_position();
                const [w, h] = entry.source.get_transformed_size();
                return { x: px, y: py, width: w, height: h };
            })();

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

        if (orphan)
        {
            // Source no longer exists. Animate independent HD/Content actor.
            entry.overlay.show();
        }
        else
        {
            showMagnifiedIcon(entry);
        }

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
            const tracked = this._entries?.get(entry.source) === entry;
            const orphan = this._orphanBounces?.has(entry);

            if ((!tracked && !orphan) || !entry.bouncing)
            {
                return;
            }

            if (index === steps.length)
            {
                this._cancelBounce(entry);

                if (orphan)
                {
                    entry.overlay.destroy();
                    this._orphanBounces.delete(entry);
                }
                else
                {
                    hideMagnifiedIcon(entry);
                    this._renderCurrentPointer();
                }

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
