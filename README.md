# Zorin Taskbar Fisheye

An experimental **macOS-style fisheye magnification effect for Zorin OS's existing Windows-style taskbar**.

**By Cristhian Gertner.** Independent community project; not an official Zorin OS or GNOME extension.

## Why?

Zorin's built-in taskbar already handles window previews, pinned and running apps, dragging between windows, multiple monitors and full-width sizing. Replacing that taskbar with a dock just to get magnification can break these behaviors.

The goal is to **keep the native taskbar** and add only a visual effect. We must not change the reserved panel height or take over input handling.

## Status

**v0.1 — experimental, but successfully tested on Zorin OS 18 / GNOME 46.** The author reports that fisheye magnification works on all Zorin desktop layouts tested with a bottom-positioned taskbar, including layouts that do not resemble Windows. The left-side **vertical** layout is a known limitation: magnification did not work there in the initial test.

These are firsthand desktop observations, not a complete compatibility or regression test.

## Expected behavior

- Zorin Taskbar retains responsibility for clicks, drag-and-drop, previews, app management and window switching.
- Icons nearest the pointer grow; nearby icons grow less, using a cosine falloff.
- An input-transparent Clutter clone draws above the taskbar to avoid clipping the magnified icons.
- No replacement taskbar, new autohide behavior or reserved-screen-area changes.
- Initial target: GNOME Shell 46 with Zorin Taskbar, including Zorin's bottom-positioned layout presets.

**Known limitations:** Magnification did not work with the left-side vertical taskbar layout in the initial Zorin test. The prototype draws a magnified visual overlay but does not reposition neighboring native icons; they may overlap while enlarged. Zorin Taskbar's internal actor structure is not a stable public API. Different scaling, multi-monitor setups, X11/Wayland, drag-and-drop and autohide still need systematic regression testing.

## Local installation (Zorin OS 18)

You can test this without publishing to the GNOME Extensions store.

1. **Disable any other dock extensions** you may have enabled (for example MacOS Dock or Dash2Dock Animated), but **keep Zorin's built-in Taskbar enabled**. You can use any of the Zorin layout presets tested with a taskbar along the bottom; the left-side vertical layout is not working yet.
2. Clone this repository and run the installer:

   ```bash
   cd ~
   git clone https://github.com/criger/zorinos-fisheye-taskbar.git
   cd zorinos-fisheye-taskbar
   bash scripts/install-local.sh
   ```

3. If GNOME does not discover the newly installed extension immediately, log out and back in. Then enable it:

   ```bash
   gnome-extensions enable zorin-fisheye@criger.github.io
   ```

   You can also enable it from Extension Manager once it appears in your installed extensions.

4. To turn off only the magnification effect (without removing Zorin Taskbar), run:

   ```bash
   gnome-extensions disable zorin-fisheye@criger.github.io
   ```

**Wayland:** Do not restart GNOME Shell with `Alt+F2 → r`. Log out and in instead.

## Configuration

The initial prototype provides GSettings keys, not yet a graphical preferences dialog:

```bash
SCHEMA="$HOME/.local/share/gnome-shell/extensions/zorin-fisheye@criger.github.io/schemas"
KEY="org.gnome.shell.extensions.zorinfisheye"

gsettings --schemadir "$SCHEMA" get "$KEY" magnification
gsettings --schemadir "$SCHEMA" get "$KEY" influence-radius

# Examples:
gsettings --schemadir "$SCHEMA" set "$KEY" magnification 0.85
gsettings --schemadir "$SCHEMA" set "$KEY" influence-radius 140
```

Magnification `0.75` means up to 175% icon size. Radius is measured in GNOME logical pixels.

## Development

No runtime packages or Node dependencies are required. The extension runs as GJS inside GNOME Shell. Pure JavaScript math can be tested using Node:

```bash
npm run check
```

The schema can be checked on Zorin with:

```bash
glib-compile-schemas --strict --dry-run schemas
```

Use `bash scripts/install-local.sh` for local iteration. If loading fails, look at GNOME Shell logs:

```bash
journalctl --user -b | grep -i 'zorin-fisheye'
```

### Manual testing

**Observed on Zorin OS 18:** fisheye works with the tested bottom-positioned Zorin taskbar layouts, including non-Windows-style layouts. The left-side vertical layout did not magnify icons.

**Additional regression tests still needed:**

- Internal/external displays with different resolutions/scaling.
- Full-width original taskbar and unchanged normal panel height.
- Click, window previews, pinned/running apps and right-click menus.
- Drag-and-drop from one window to another via native taskbar.
- Disable/re-enable without residual behavior or visuals.
- Monitor changes, logout/login, overview, fullscreen and autohide.

Please report findings including Zorin, GNOME, display scale and session type.

## Attribution and licensing

Copyright © 2026 **Cristhian Gertner**.

Licensed under **GNU GPL v3** (see [LICENSE](LICENSE)). Copyright and license notices must be retained in redistributed copies. Attribution in documentation is appreciated. Contact the copyright holder if you need a separate licensing arrangement.

Zorin OS and GNOME are trademarks of their owners; this project is not affiliated with them.
