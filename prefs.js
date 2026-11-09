// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Cristhian Gertner

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

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
            title: 'Pixel-perfect 2× (nearest-neighbor)',
            subtitle: 'Scale the original taskbar icon to 1× or 2× without blur. Overrides HD and native-icon exceptions. Magnification should be at least 0.50.',
        });
        magnification.add(pixelPerfectRow);
        settings.bind('pixel-perfect-icons', pixelPerfectRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        const nativeAppsRow = new Adw.EntryRow(
        {
            title: 'Apps keeping original icons (.desktop IDs)',
        });
        magnification.add(nativeAppsRow);
        settings.bind('native-icon-apps', nativeAppsRow, 'text',
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
    }
}
