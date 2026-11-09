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

    const scroll = new Gtk.ScrolledWindow(
    {
        hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        min_content_height: 180,
        max_content_height: 420,
        hexpand: true,
    });
    content.append(scroll);

    const grid = new Gtk.Grid(
    {
        row_spacing: 8,
        column_spacing: 12,
        hexpand: true,
        margin_top: 8,
        margin_bottom: 8,
    });
    scroll.set_child(grid);

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

    const header = (label, column) =>
    {
        const text = new Gtk.Label(
        {
            label,
            xalign: 0,
            css_classes: ['heading'],
            margin_bottom: 4,
        });
        grid.attach(text, column, 0, 1, 1);
    };

    const rebuild = () =>
    {
        for (let child = grid.get_first_child(); child;)
        {
            const next = child.get_next_sibling();
            grid.remove(child);
            child = next;
        }

        header('Application name', 0);
        header('Icon path', 1);

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
            grid.attach(empty, 0, 1, 2, 1);
            return;
        }

        apps.forEach((app, index) =>
        {
            const row = index + 1;
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

            const pathEntry = new Gtk.Entry(
            {
                text: displayedPath,
                placeholder_text: 'Theme/resource icon — choose a local file',
                hexpand: true,
                width_chars: 44,
                tooltip_text: displayedPath ||
                    'This icon is embedded or theme-based; no ordinary file path is available.',
            });

            // Users can also paste an absolute path and press Enter.
            pathEntry.connect('activate', () =>
                setOverride(app.id, pathEntry.get_text(), originalPath,
                    pathEntry));
            pathEntry.connect('notify::has-focus', () =>
            {
                if (!pathEntry.has_focus &&
                    pathEntry.get_text() !== displayedPath)
                {
                    setOverride(app.id, pathEntry.get_text(),
                        originalPath, pathEntry);
                }
            });

            iconCell.append(pathEntry);

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

    window.set_default_size(990, 730);
    rebuild();
}
