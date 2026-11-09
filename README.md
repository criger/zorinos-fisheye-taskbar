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
- By default, request a **2× (or larger when configured) high-resolution app icon** using `Shell.App.create_icon_texture`. This restores the sharper rendering tested earlier, but apps may provide different artwork at different sizes.
- If the exact Zorin icon appearance matters more than sharpness, disable **High-resolution icons** in preferences to use a non-reactive `Clutter.Clone` of the native icon instead.
- The visual overlay is prepared when icons are added to the taskbar, never loaded on every mouse movement. HD textures are scaled **down** into their intended footprint; the original-icon fallback uses native allocation. At exactly 1×, only Zorin's original icon is painted.
- Child-added/removed and panel-created signals replace the former 700 ms polling. Leaving the taskbar restores the original icon immediately.
- On a completed primary-button click on a **stopped** application, the icon queues the bounce in a GLib idle callback, *after* the native button handler has completed. No icon paint-opacity changes occur during the click event; visual changes start only in the idle callback. It is a suspected fix for a busy cursor lingering over the taskbar until the user clicks empty panel space, pending a real Zorin test. An independent HD/pixel-content overlay can finish bouncing if Zorin replaces the launcher before that callback. The extension listens to Zorin's app icon `captured-event`, `button-press-event`, `button-release-event` and `clicked` signals directly, instead of relying on the global stage event's nullable source actor or hit-testing. Independent HD overlays can finish bouncing even if Zorin replaces the launcher. Already-running apps do not bounce; this indicates a launch attempt, not proof of successful startup.
- A settings window is available from the extension's preferences button in Extension Manager.
- No replacement taskbar, new autohide behavior or reserved-screen-area changes.
- Initial target: GNOME Shell 46 with Zorin Taskbar, including Zorin's bottom-positioned layout presets.

**Known limitations:** Magnification did not work with the left-side vertical taskbar layout in the initial Zorin test. The new event-driven behavior, launch bounce and preferences UI are experimental and require an actual Zorin/GNOME Shell 46 regression test. The prototype draws a magnified visual overlay but does not reposition neighboring native icons; they may overlap while enlarged. Zorin Taskbar's internal actor structure is not a stable public API. Different scaling, multi-monitor setups, X11/Wayland, drag-and-drop and autohide still need systematic regression testing.

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

**Testing the current bugfix branch from an existing clone:**

```bash
cd ~/zorinos-fisheye-taskbar
git fetch origin
git switch fix/pixel-perfect-and-launch-cursor
git pull --ff-only origin fix/pixel-perfect-and-launch-cursor
npm run check
gnome-extensions disable zorin-fisheye@criger.github.io
bash scripts/install-local.sh
```

Log out and in on GNOME/Wayland to load the changed extension module.

**Previous (merged) feature branch instructions, retained for reference:**

```bash
cd ~/zorinos-fisheye-taskbar
git fetch origin
git switch fix/duplicate-hover-icon
git pull --ff-only origin fix/duplicate-hover-icon
gnome-extensions disable zorin-fisheye@criger.github.io
bash scripts/install-local.sh
```

Log out and back in to reload GNOME Shell's extension code, then enable it using the command above.

**Wayland:** Do not restart GNOME Shell with `Alt+F2 → r`. Log out and in instead.

## Per-app icon selection (new experimental UI)

**Extension Manager → Settings → Taskbar application icons** displays the actual
pinned/running application icons in Zorin Taskbar as a two-column list:

| Application name | Icon path |
| --- | --- |
| Name from the taskbar application | Current icon file path (when resolvable), editable field, **…** browse button and **Reset** button |

Selecting a local image file updates both the **normal taskbar icon** and its
**enlarged fisheye rendering**, without changing the `.desktop` file or replacing
the taskbar. Supported image types depend on the local GTK/GNOME installation;
PNG, SVG, WebP, JPEG and ICO are accepted when supported. You can paste an
absolute path into the field and press Enter. Reset removes the override.

**Important:** A small or non-square source image can look distorted/blurry when
enlarged. Prefer vector SVG or square PNG at least 128×128 (ideally 256×256).

The visible list is published by the running GNOME Shell extension through a
compact, event-driven GSettings snapshot. The preferences window runs in a
different process, so it does not introspect GNOME Shell itself. A changed
taskbar icon list automatically refreshes the table. Overridden icon paths are
saved by **desktop application ID**, and remain configured if an app is
temporarily absent from the taskbar.

Some themed, embedded, symbolic or generated icons have **no normal filesystem
path**. In that case the field is empty with a placeholder, and the user can
still browse for a replacement. GTK's themed-icon lookup chooses a path at
the app's nominal taskbar size; the actual texture chosen by GNOME Shell can
differ by screen scale or icon theme. Existing `native-icon-apps` exceptions
continue to work for applications without a custom icon path.

**Scope:** Overrides affect icons while Zorin Taskbar Fisheye is enabled.
Disabling the extension restores the original icons. This does not globally
change icons in menus, other docks or the applications' own desktop files.

## Configuration

Open **Extension Manager → Installed → Zorin Taskbar Fisheye → Settings** (the gear icon) to adjust:

- Maximum icon magnification (1× to 2×).
- High-resolution icon rendering (default on). Turn it off globally to preserve the exact native artwork.
- **Pixel-perfect 2×** (**HIGHLY EXPERIMENTAL**, default off): take the actual **already loaded `Clutter.Content`** from Zorin's `St.Icon` texture child, draw that *same content object* in a separate actor with `NEAREST` sampling, and snap fisheye scales to strictly 1× or 2×. No high-resolution icon-size lookup or alternate PNG is performed, so the Chrome application's original background should remain intact. If a custom icon actor exposes no content, fall back to `Clutter.Clone` (which may still be blurry). Pixel-perfect creates a stepped rather than fluid magnification; it must be visually tested on GNOME 46. It overrides the HD switch and per-app exceptions while enabled.
- Native icon exceptions: specify app desktop IDs separated by commas to keep the original appearance for **only those apps**. This is useful when Chrome installed an opaque small PNG but a transparent large PNG. Such exceptions may look softer when enlarged; to get both HD sharpness and the same background, the application's high-resolution source asset must be corrected.
- Influence radius (20–300 logical pixels).
- Whether stopped applications bounce on launch.
- Bounce height (4–40 logical pixels).

Changes are stored in GSettings and applied without restarting the extension. The existing keys can still be changed from the terminal:

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
- Hover then move the pointer outside the taskbar: the icon should revert **immediately**, not after 700 ms.
- Add and remove running applications: icon clones must be created and destroyed without background polling.
- Launch a **stopped** application from the taskbar: bounce should start just **after** native mouse click processing. Click an already-running app, or drag/release outside, and verify no bounce.
- **Tooltip collision fix:** Zorin places its label relative to the native icon slot, while fisheye icons extend above it. We listen to the native label's show notification, defer repositioning until Zorin sets its position, and keep it a short gap above the visual icon while respecting monitor edges. The original Zorin label text, animations, hover timing and visibility remain owned by Zorin.
- Check the mouse cursor after each launch: it must not keep a busy spinner when returning to the taskbar. If it persists, test with bounce disabled, then inspect `journalctl --user -b --no-pager | grep -F '[Zorin Fisheye]' | tail -30`. GNOME also legitimately shows a startup busy cursor until activation is complete, so do not indiscriminately override `Meta.Cursor`.
- Test Pixel-perfect 2× on/off, especially ChatGPT Chrome app white background, against HD mode. Pixel-perfect is a deliberately stepped 1×/2× mode, not a smooth fisheye interpolation.
- If bounce still fails, immediately inspect the extension's own event traces with `journalctl --user -b --no-pager | grep -F '[Zorin Fisheye]' | tail -30`. A `Launch press armed` line means the icon received the event; `Launch bounce from` means animation was requested; `Bounce skipped` points to a missing source actor/overview state.
- Open preferences from Extension Manager and change zoom, influence radius, bounce toggle and height.
- Verify native HD icons appear sharper again at 1.5× or 2×. Compare Chrome-app icon backgrounds with HD on/off: Chrome may have different PNG artwork at 32×32 and 128×128. To preserve only the ChatGPT Chrome app's white background without disabling HD globally, add its desktop ID (`chrome-cadlkienfkclaiaibeoongdcgmdikeeg-Default.desktop`) under native icon exceptions in preferences.
- At magnification 0.00 (1×), the untouched Zorin icon should remain visible and the overlay should be hidden.

Please report findings including Zorin, GNOME, display scale and session type.

## Attribution and licensing

Copyright © 2026 **Cristhian Gertner**.

Licensed under **GNU GPL v3** (see [LICENSE](LICENSE)). Copyright and license notices must be retained in redistributed copies. Attribution in documentation is appreciated. Contact the copyright holder if you need a separate licensing arrangement.

Zorin OS and GNOME are trademarks of their owners; this project is not affiliated with them.
