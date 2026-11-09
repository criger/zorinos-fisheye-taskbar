// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('icon lifecycle, instant exit and launch-only bounce without polling', () =>
{
    let signalId = 0;
    class Emitter
    {
        constructor()
        {
            this.signals = new Map();
        }
        connect(type, cb)
        {
            const id = ++signalId;
            this.signals.set(id, { type, cb });
            return id;
        }
        disconnect(id)
        {
            this.signals.delete(id);
        }
        emit(type, ...args)
        {
            for (const signal of this.signals.values())
            {
                if (signal.type === type)
                {
                    signal.cb(this, ...args);
                }
            }
        }
    }

    class Actor extends Emitter
    {
        constructor(x = 0, y = 0, w = 32, h = 32)
        {
            super();
            Object.assign(this, { x, y, w, h, visible: true, opacity: 255 });
        }
        get_stage() { return {}; }
        get_transformed_position() { return [this.x, this.y]; }
        get_transformed_size() { return [this.w, this.h]; }
        get_size() { return [this.w, this.h]; }
        get_opacity() { return this.opacity; }
        set_opacity(value) { this.opacity = value; }
    }

    class Clone extends Actor
    {
        constructor({ source })
        {
            super();
            this.source = source;
            this.visible = false;
            this.bounceSteps = 0;
        }
        show() { this.visible = true; }
        hide() { this.visible = false; }
        set_position(x, y) { this.x = x; this.y = y; }
        set_size(w, h) { this.w = w; this.h = h; }
        set_pivot_point() {}
        set_scale() {}
        set_icon_size(size) { this.w = size; this.h = size; }
        set_translation() {}
        remove_all_transitions() {}
        ease(params)
        {
            this.bounceSteps++;
            params.onComplete();
        }
        destroy() { this.destroyed = true; }
    }

    const stage = new Emitter();
    const overview = new Emitter();
    const layoutManager = new Emitter();
    const appSystem = new Emitter();
    const box = new Emitter();
    const panelActor = new Actor(0, 980, 800, 65);
    const app = {
        state: 0,
        get_state() { return this.state; },
        create_icon_texture(size)
        {
            const actor = new Clone({ source: null });
            actor.set_size(size, size);
            actor.hd = true;
            return actor;
        },
    };
    const source = new Actor(90, 995);
    const icon = new Actor(87, 992, 40, 40);
    icon.app = app;
    icon.icon = { _iconBin: source };
    let icons = [icon];

    const panel = {
        panel: panelActor,
        geom: { position: 1, vertical: false },
        taskbar: { _box: box, _getAppIcons: () => icons },
    };
    const manager = new Emitter();
    manager.panels = [panel];
    overview.visible = false;

    let pointer = [400, 200];
    const idle = [];
    const GLib = {
        PRIORITY_DEFAULT_IDLE: 0,
        SOURCE_REMOVE: false,
        Source: { remove() {} },
        idle_add(_priority, callback)
        {
            idle.push(callback);
            return idle.length;
        },
        timeout_add()
        {
            throw new Error('Recurring polling must never be used');
        },
        get_monotonic_time() { return 1000; },
    };
    const Clutter = {
        Clone,
        EventType: { MOTION: 1, ENTER: 2, LEAVE: 3, BUTTON_PRESS: 4, BUTTON_RELEASE: 5 },
        EVENT_PROPAGATE: false,
        AnimationMode: { EASE_OUT_QUAD: 1, EASE_IN_QUAD: 2 },
    };
    const Shell = {
        AppSystem: { get_default: () => appSystem },
        AppState: { STOPPED: 0, STARTING: 1, RUNNING: 2 },
    };
    const St = { Side: { TOP: 0, BOTTOM: 1, LEFT: 2, RIGHT: 3 } };
    const Main = {
        layoutManager,
        overview,
        uiGroup: { add_child() {} },
    };
    const shellGlobal = {
        stage,
        zorinTaskbar: manager,
        get_pointer: () => pointer,
    };

    const settings = new Emitter();
    settings.get_int = (key) => key === 'influence-radius' ? 120 : 14;
    let zoom = 0.5;
    settings.get_double = () => zoom;
    let useHD = true;
    settings.get_boolean = (key) =>
        key === 'high-resolution-icons' ? useHD : true;
    class Extension
    {
        getSettings() { return settings; }
    }

    const raw = readFileSync(new URL('../extension.js', import.meta.url), 'utf8');
    const sourceCode = raw.replace(/^import .*;\s*$/gm, '')
        .replace(/^export default /gm, '');
    const magnification = readFileSync(
        new URL('../magnification.js', import.meta.url), 'utf8')
        .replace(/^export /gm, '');
    const iconVisibility = readFileSync(
        new URL('../icon-visibility.js', import.meta.url), 'utf8')
        .replace(/^export /gm, '');
    const launchBounce = readFileSync(
        new URL('../launch-bounce.js', import.meta.url), 'utf8')
        .replace(/^export /gm, '');
    const iconGeometry = readFileSync(
        new URL('../icon-geometry.js', import.meta.url), 'utf8')
        .replace(/^export /gm, '');
    const iconRendering = readFileSync(
        new URL('../icon-rendering.js', import.meta.url), 'utf8')
        .replace(/^export /gm, '');

    const functions = new Function(
        magnification + '\n' + iconVisibility + '\n' +
        launchBounce + '\n' + iconGeometry + '\n' + iconRendering + '\nreturn {' +
        'magnificationFrame, hideMagnifiedIcon, showMagnifiedIcon, ' +
        'isStoppedClick, isFreshLaunch, bounceOffset, pointInsideActor, ' +
        'clonePlacement, highResolutionSize, highResolutionPlacement};')();

    const ExtensionType = new Function(
        'Clutter', 'GLib', 'Shell', 'St', 'Main', 'Extension', 'global',
        ...Object.keys(functions),
        sourceCode + '\nreturn ZorinFisheyeExtension;')(
        Clutter, GLib, Shell, St, Main, Extension, shellGlobal,
        ...Object.values(functions));

    const extension = new ExtensionType();
    extension.enable();
    assert.equal(extension._entries.size, 1);
    assert.equal(idle.length, 0);

    pointer = [100, 1010];
    stage.emit('captured-event', { type: () => Clutter.EventType.MOTION });
    assert.equal(source.opacity, 0);
    const hoverClone = extension._entries.get(source).overlay;
    assert.equal(extension._entries.get(source).highResolution, true);
    assert.equal(hoverClone.hd, true);
    assert.ok(hoverClone.w >= source.w * 2,
        'HD mode must request at least a 2x texture');

    zoom = 0;
    stage.emit('captured-event', { type: () => Clutter.EventType.MOTION });
    assert.equal(source.opacity, 255, '1x must paint native Zorin icon');
    assert.equal(hoverClone.visible, false, '1x must not draw clone');
    zoom = 0.5;

    // Switching in preferences is possible without leaving GNOME Shell.
    useHD = false;
    settings.emit('changed');
    assert.equal(extension._entries.get(source).highResolution, false);
    assert.equal(extension._entries.get(source).overlay.source, source);
    assert.equal(hoverClone.destroyed, true);

    useHD = true;
    settings.emit('changed');
    assert.equal(extension._entries.get(source).highResolution, true);
    assert.equal(extension._entries.get(source).overlay.hd, true);

    pointer = [100, 800];
    stage.emit('captured-event', { type: () => Clutter.EventType.MOTION });
    assert.equal(source.opacity, 255, 'first movement outside must restore');

    pointer = [100, 1010];
    stage.emit('captured-event', { type: () => Clutter.EventType.MOTION });
    panelActor.emit('leave-event', { get_coords: () => [100, 800] });
    assert.equal(source.opacity, 255, 'panel leave must restore without timer');

    const second = new Actor(140, 995);
    const secondApp = { state: 0, get_state() { return this.state; } };
    const secondIcon = new Actor(136, 992, 40, 40);
    secondIcon.app = secondApp;
    secondIcon.icon = { _iconBin: second };
    icons.push(secondIcon);
    box.emit('child-added', secondIcon);
    assert.equal(idle.length, 1);
    idle.shift()();
    assert.equal(extension._entries.size, 2);

    const press = {
        type: () => Clutter.EventType.BUTTON_PRESS,
        get_button: () => 1,
        get_source: () => null,
        get_coords: () => [100, 1010],
    };
    const release = {
        type: () => Clutter.EventType.BUTTON_RELEASE,
        get_button: () => 1,
        get_source: () => null,
        get_coords: () => [100, 1010],
    };
    const clone = extension._entries.get(source).overlay;
    stage.emit('captured-event', press);
    assert.equal(clone.bounceSteps, 0, 'press alone must not bounce');
    stage.emit('captured-event', release);
    assert.equal(clone.bounceSteps, 4,
        'a completed left-click on stopped app starts bounce');

    app.state = Shell.AppState.RUNNING;
    stage.emit('captured-event', press);
    stage.emit('captured-event', release);
    assert.equal(clone.bounceSteps, 4, 'running app must not bounce');

    app.state = Shell.AppState.STOPPED;
    stage.emit('captured-event', press);
    stage.emit('captured-event', {
        type: () => Clutter.EventType.BUTTON_RELEASE,
        get_button: () => 1,
        get_source: () => null,
        get_coords: () => [150, 1010],
    });
    assert.equal(clone.bounceSteps, 4,
        'releasing over another actor must not bounce');

    icons = [icon];
    box.emit('child-removed', secondIcon);
    idle.shift()();
    assert.equal(extension._entries.size, 1);
    extension.disable();
    assert.equal(source.opacity, 255);
    assert.equal(clone.destroyed, true);
});
