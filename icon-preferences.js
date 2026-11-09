// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Cristhian Gertner

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';

import {
    appRowsFromVariant, iconOverrideFor,
} from './icon-overrides.js';
import { condensedIconPath, scrollArrowVisibility } from './icon-table-layout.js';

// The preferences UI runs OUTSIDE GNOME Shell. GSettings supplies the
// extension's event-driven snapshot of actual visible taskbar apps.

function giconFromSerialized(serialized)
{
    if (!serialized)
        return null;

    try
    {
        return Gio.icon_new_for_string(serialized);
    }
    catch (error)
    {
        return null;
    }
}

function defaultIconPath(row)
{
    const icon = giconFromSerialized(row.icon);

    if (!icon)
        return '';

    const file = icon.get_file?.();

    if (file?.get_path?.())
        return file.get_path();

    try
    {
        const display = Gdk.Display.get_default();
        if (!display)
            return '';

        const theme = Gtk.IconTheme.get_for_display(display);
        const resolved = theme.lookup_by_gicon(icon, row.size, 1,
            Gtk.TextDirection.NONE, Gtk.IconLookupFlags.NONE);

        // Theme and resource icons do not always have a filesystem path.
        return resolved?.get_file?.()?.get_path?.() ?? '';
    }
    catch (error)
    {
        return '';
    }
}

function imageFileError(path)
{
    if (!GLib.path_is_absolute(path))
        return 'Use an absolute file path (starting with /).';

    const file = Gio.File.new_for_path(path);

    if (!file.query_exists(null))
        return 'That icon file does not exist.';

    try
    {
        const info = file.query_info(
            'standard::type,standard::content-type',
            Gio.FileQueryInfoFlags.NONE, null);

        if (info.get_file_type() !== Gio.FileType.REGULAR)
            return 'Choose a regular image file.';

        const type = info.get_content_type() ?? '';

        if (!type.startsWith('image/') &&
            !['application/x-ico', 'application/ico'].includes(type))
        {
            return 'Choose an image file, for example PNG, SVG or WebP.';
        }
    }
    catch (error)
    {
        return 'Cannot read the selected icon file.';
    }

    return '';
}

export function addTaskbarIconTable(page, window, settings)
{
    const group = new Adw.PreferencesGroup(
    {
        title: 'Taskbar application icons',
        description: 'Application name | Icon path. Change an icon for the ' +
            'taskbar AND its enlarged fisheye version. Changes apply immediately.',
    });
    page.add(group);

    const content = new Gtk.Box(
    {
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 10,
        hexpand: true,
        vexpand: true,
    });
    group.add(content);

    const warning = new Gtk.Label(
    {
        label: 'Icon dimensions matter: very small or unusual image sizes ' +
            'can cause blurry or strange scaling. Prefer SVG or square ' +
            'PNG images of at least 128 × 128 pixels.',
        wrap: true,
        xalign: 0,
        css_classes: ['dim-label'],
    });
    content.append(warning);

    const headers = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL, spacing: 12,
        hexpand: true, margin_top: 10, margin_start: 6,
    });
    headers.append(new Gtk.Label({
        label: 'Application name', xalign: 0,
        width_request: 230, css_classes: ['heading'],
    }));
    headers.append(new Gtk.Label({
        label: 'Icon path — click to view or edit full path',
        xalign: 0, hexpand: true, css_classes: ['heading'],
    }));
    content.append(headers);

    const upSpace = new Gtk.Box({
        height_request: 30, halign: Gtk.Align.CENTER,
    });
    const upButton = new Gtk.Button({
        label: '↑ More applications above', visible: false,
    });
    upSpace.append(upButton);
    content.append(upSpace);

    const scroll = new Gtk.ScrolledWindow({
        hscrollbar_policy: Gtk.PolicyType.NEVER,
        vscrollbar_policy: Gtk.PolicyType.ALWAYS,
        overlay_scrolling: false,
        propagate_natural_height: true,
        min_content_height: 390,
        max_content_height: 640,
        hexpand: true, vexpand: true,
    });
    content.append(scroll);
    const grid = new Gtk.Grid({
        row_spacing: 8, column_spacing: 12,
        hexpand: true,
        margin_top: 8, margin_bottom: 8,
        margin_start: 6, margin_end: 6,
    });
    scroll.set_child(grid);

    const downSpace = new Gtk.Box({
        height_request: 30, halign: Gtk.Align.CENTER,
    });
    const downButton = new Gtk.Button({
        label: '↓ More applications below', visible: false,
    });
    downSpace.append(downButton);
    content.append(downSpace);

    const adjustment = scroll.get_vadjustment();
    const updateArrows = () => {
        const { up, down } = scrollArrowVisibility(
            adjustment.get_value(), adjustment.get_lower(),
            adjustment.get_upper(), adjustment.get_page_size());
        upButton.set_visible(up);
        downButton.set_visible(down);
    };
    const moveRows = direction => {
        const distance = Math.max(70, adjustment.get_page_size() * 0.75);
        adjustment.set_value(adjustment.get_value() + direction * distance);
    };
    upButton.connect('clicked', () => moveRows(-1));
    downButton.connect('clicked', () => moveRows(1));
    adjustment.connect('changed', updateArrows);
    adjustment.connect('value-changed', updateArrows);
    scroll.connect('map', updateArrows);

    const status = new Gtk.Label(
    {
        label: '',
        xalign: 0,
        wrap: true,
        visible: false,
    });
    content.append(status);

    const showError = message =>
    {
        status.set_label(message);
        status.set_visible(Boolean(message));
    };

    const setOverride = (appId, requested, originalPath, entry) =>
    {
        const path = requested.trim();
        const overrides = {
            ...settings.get_value('icon-overrides').deep_unpack(),
        };

        // Empty path or original path means: use the application's own icon.
        if (!path || (originalPath && path === originalPath))
        {
            delete overrides[appId];
        }
        else
        {
            const error = imageFileError(path);
            if (error)
            {
                entry.add_css_class('error');
                showError(error);
                return false;
            }

            overrides[appId] = path;
        }

        entry.remove_css_class('error');
        showError('');
        settings.set_value('icon-overrides',
            new GLib.Variant('a{ss}', overrides));
        return true;
    };

    const chooseFile = (app, currentPath, originalPath, entry) =>
    {
        const dialog = new Gtk.FileDialog(
        {
            title: 'Choose icon for ' + app.name,
            modal: true,
        });

        const filter = new Gtk.FileFilter();
        filter.set_name('Image files (PNG, SVG, WebP, JPEG, ICO)');
        for (const mime of [
            'image/png', 'image/svg+xml', 'image/webp',
            'image/jpeg', 'image/x-icon', 'image/vnd.microsoft.icon',
        ])
        {
            filter.add_mime_type(mime);
        }
        dialog.set_default_filter(filter);

        if (currentPath && GLib.path_is_absolute(currentPath) &&
            GLib.file_test(currentPath, GLib.FileTest.IS_REGULAR))
        {
            dialog.set_initial_file(Gio.File.new_for_path(currentPath));
        }

        dialog.open(window, null, (picker, result) =>
        {
            let file = null;
            try
            {
                file = picker.open_finish(result);
            }
            catch (error)
            {
                // Closing/cancelling the file picker is not an error.
                return;
            }

            const path = file?.get_path?.();

            if (!path)
            {
                showError('Only local icon files with a filesystem path are supported.');
                return;
            }

            entry.set_text(path);
            setOverride(app.id, path, originalPath, entry);
        });
    };

    const rebuild = () =>
    {
        const previousScroll = adjustment.get_value();
        for (let child = grid.get_first_child(); child;)
        {
            const next = child.get_next_sibling();
            grid.remove(child);
            child = next;
        }

        const apps = appRowsFromVariant(
            settings.get_value('taskbar-apps').deep_unpack());
        const overrides = settings.get_value(
            'icon-overrides').deep_unpack();

        if (apps.length === 0)
        {
            const empty = new Gtk.Label(
            {
                label: 'No taskbar applications detected. Keep Zorin ' +
                    'Taskbar Fisheye enabled, then open preferences again.',
                xalign: 0,
                wrap: true,
                css_classes: ['dim-label'],
            });
            grid.attach(empty, 0, 0, 2, 1);
            updateArrows();
            return;
        }

        apps.forEach((app, index) =>
        {
            const row = index;
            const originalPath = defaultIconPath(app);
            const savedPath = iconOverrideFor(app.id, overrides);
            const displayedPath = savedPath || originalPath;

            const nameCell = new Gtk.Box(
            {
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 8,
                width_request: 230,
            });

            const image = new Gtk.Image(
            {
                pixel_size: 24,
                icon_name: 'application-x-executable',
            });
            const icon = savedPath
                ? new Gio.FileIcon(
                {
                    file: Gio.File.new_for_path(savedPath),
                })
                : giconFromSerialized(app.icon);

            if (icon)
                image.set_from_gicon(icon);
            nameCell.append(image);

            const name = new Gtk.Label(
            {
                label: app.name,
                xalign: 0,
                hexpand: true,
                ellipsize: Pango.EllipsizeMode.END,
                tooltip_text: app.id,
            });
            nameCell.append(name);
            grid.attach(nameCell, 0, row, 1, 1);

            const iconCell = new Gtk.Box(
            {
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 5,
                hexpand: true,
            });

            // Compact preview prevents the column from being widened by a
            // long filesystem path. Click it to edit the COMPLETE path.
            const pathCell = new Gtk.Stack({ hexpand: true });
            const pathLabel = new Gtk.Label({
                label: condensedIconPath(displayedPath),
                xalign: 0, hexpand: true,
                ellipsize: Pango.EllipsizeMode.MIDDLE,
                tooltip_text: displayedPath ||
                    'Theme/resource icon without a local file path',
            });
            const pathPreview = new Gtk.Button({
                child: pathLabel, hexpand: true,
                tooltip_text: displayedPath ||
                    'Click to enter an icon file path',
                css_classes: ['flat'],
            });
            const pathEntry = new Gtk.Entry({
                text: displayedPath,
                placeholder_text: 'Enter the full local icon path',
                hexpand: true, width_chars: 42,
                tooltip_text: 'Full path. Enter: save. Escape: cancel.',
            });
            pathCell.add_named(pathPreview, 'preview');
            pathCell.add_named(pathEntry, 'edit');
            pathCell.set_visible_child_name('preview');

            pathPreview.connect('clicked', () => {
                pathCell.set_visible_child_name('edit');
                pathEntry.grab_focus();
                pathEntry.select_region(0, -1);
            });
            pathEntry.connect('activate', () => {
                if (setOverride(app.id, pathEntry.get_text(),
                    originalPath, pathEntry))
                {
                    pathCell.set_visible_child_name('preview');
                }
            });
            const keys = new Gtk.EventControllerKey();
            keys.connect('key-pressed', (_controller, keyval) => {
                if (keyval !== Gdk.KEY_Escape)
                    return false;

                pathEntry.set_text(displayedPath);
                pathCell.set_visible_child_name('preview');
                return true;
            });
            pathEntry.add_controller(keys);
            iconCell.append(pathCell);

            const browse = new Gtk.Button(
            {
                label: '…',
                tooltip_text: 'Browse for a custom icon file',
            });
            browse.connect('clicked', () =>
                chooseFile(app, pathEntry.get_text(), originalPath,
                    pathEntry));
            iconCell.append(browse);

            const reset = new Gtk.Button(
            {
                icon_name: 'edit-clear-symbolic',
                tooltip_text: 'Restore the application’s original icon',
            });
            reset.connect('clicked', () =>
            {
                pathEntry.set_text(originalPath);
                setOverride(app.id, '', originalPath, pathEntry);
            });
            iconCell.append(reset);

            grid.attach(iconCell, 1, row, 1, 1);
        });

        // GSettings updates must not jump the user back to the first row.
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            adjustment.set_value(Math.min(previousScroll,
                Math.max(adjustment.get_lower(),
                    adjustment.get_upper() - adjustment.get_page_size())));
            updateArrows();
            return GLib.SOURCE_REMOVE;
        });
    };

    const signals = [
        settings.connect('changed::taskbar-apps', rebuild),
        settings.connect('changed::icon-overrides', rebuild),
    ];
    window.connect('close-request', () =>
    {
        for (const signal of signals)
            settings.disconnect(signal);

        return false;
    });

    window.set_default_size(1160, 820);
    rebuild();
}
