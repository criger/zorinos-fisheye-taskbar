// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Cristhian Gertner

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { addTaskbarIconTable } from './icon-preferences.js';

export default class ZorinFisheyePreferences extends ExtensionPreferences
{
    fillPreferencesWindow(window)
    {
        const settings = this.getSettings();
        window._settings = settings;

        const page = new Adw.PreferencesPage(
        {
            title: 'Fisheye',
            icon_name: 'preferences-desktop-display-symbolic',
        });
        window.add(page);

        const magnification = new Adw.PreferencesGroup(
        {
            title: 'Icon magnification',
            description: 'Adjust the icons already displayed by Zorin Taskbar.',
        });
        page.add(magnification);

        const zoomRow = new Adw.SpinRow(
        {
            title: 'Maximum magnification',
            subtitle: '0.50 = 1.5× size; 1.00 = 2× size.',
            adjustment: new Gtk.Adjustment(
            {
                lower: 0,
                upper: 1,
                step_increment: 0.05,
                page_increment: 0.10,
            }),
            digits: 2,
        });
        magnification.add(zoomRow);
        settings.bind('magnification', zoomRow, 'value',
            Gio.SettingsBindFlags.DEFAULT);

        const highResolutionRow = new Adw.SwitchRow(
        {
            title: 'High-resolution icons',
            subtitle: 'Sharper magnification. Some apps use a different image or background at larger icon sizes.',
        });
        magnification.add(highResolutionRow);
        settings.bind('high-resolution-icons', highResolutionRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        const pixelPerfectRow = new Adw.SwitchRow(
        {
            title: 'Pixel-perfect 2× — HIGHLY EXPERIMENTAL',
            subtitle: 'Intentionally blocky on modern icons. Nearest-neighbor 1×/2× from the original pixels; overrides HD.',
        });
        magnification.add(pixelPerfectRow);
        settings.bind('pixel-perfect-icons', pixelPerfectRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        const radiusRow = new Adw.SpinRow(
        {
            title: 'Influence radius',
            subtitle: 'How many logical pixels influence nearby icons.',
            adjustment: new Gtk.Adjustment(
            {
                lower: 20,
                upper: 300,
                step_increment: 10,
                page_increment: 20,
            }),
            digits: 0,
        });
        magnification.add(radiusRow);
        radiusRow.set_value(settings.get_int('influence-radius'));
        radiusRow.connect('notify::value', () =>
        {
            settings.set_int('influence-radius',
                Math.round(radiusRow.get_value()));
        });

        const launching = new Adw.PreferencesGroup(
        {
            title: 'Application launch',
            description: 'Bounce only when starting a stopped application from the taskbar.',
        });
        page.add(launching);

        const bounceRow = new Adw.SwitchRow(
        {
            title: 'Bounce on launch',
            subtitle: 'Do not bounce when switching to an already running program.',
        });
        launching.add(bounceRow);
        settings.bind('bounce-enabled', bounceRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        const heightRow = new Adw.SpinRow(
        {
            title: 'Bounce height',
            subtitle: 'Maximum distance in logical pixels.',
            adjustment: new Gtk.Adjustment(
            {
                lower: 4,
                upper: 40,
                step_increment: 2,
                page_increment: 4,
            }),
            digits: 0,
        });
        launching.add(heightRow);
        heightRow.set_value(settings.get_int('bounce-height'));
        heightRow.connect('notify::value', () =>
        {
            settings.set_int('bounce-height',
                Math.round(heightRow.get_value()));
        });

        // The normal Adw.PreferencesPage has a ~600px Clamp, even if
        // PreferencesWindow is maximized. Keep controls compact, but give
        // the file-path table its own wider tab.
        const iconsPage = new Adw.PreferencesPage(
        {
            title: 'Icons',
            icon_name: 'applications-graphics-symbolic',
        });
        window.add(iconsPage);

        const widen = (widget) =>
        {
            if (!widget)
                return false;

            if (widget instanceof Adw.Clamp)
            {
                widget.set_maximum_size(1040);
                widget.set_tightening_threshold(1140);
                return true;
            }

            for (let child = widget.get_first_child?.(); child;
                child = child.get_next_sibling?.())
            {
                if (widen(child))
                    return true;
            }

            return false;
        };

        // AdwPreferencesPage's internal GtkScrolledWindow -> viewport ->
        // Adw.Clamp exists in libadwaita's public layout; do not alter
        // the clamp belonging to the regular Fisheye settings page.
        widen(iconsPage);
        iconsPage.connect('map', () => widen(iconsPage));
        addTaskbarIconTable(iconsPage, window, settings);
    }
}
