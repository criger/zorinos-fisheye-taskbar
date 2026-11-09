#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UUID="zorin-fisheye@criger.github.io"
TARGET="${HOME}/.local/share/gnome-shell/extensions/${UUID}"

command -v glib-compile-schemas >/dev/null ||
{
    echo "Missing glib-compile-schemas (install libglib2.0-bin)." >&2
    exit 1
}

mkdir -p "${TARGET}/schemas"
install -m 644 "${ROOT}/metadata.json" "${TARGET}/"
install -m 644 "${ROOT}/extension.js" "${TARGET}/"
install -m 644 "${ROOT}/magnification.js" "${TARGET}/"
install -m 644 "${ROOT}/icon-visibility.js" "${TARGET}/"
install -m 644 "${ROOT}/launch-bounce.js" "${TARGET}/"
install -m 644 "${ROOT}/icon-geometry.js" "${TARGET}/"
install -m 644 "${ROOT}/icon-rendering.js" "${TARGET}/"
install -m 644 "${ROOT}/pixel-scaling.js" "${TARGET}/"
install -m 644 "${ROOT}/hidef-aa.js" "${TARGET}/"
install -m 644 "${ROOT}/tooltip-position.js" "${TARGET}/"
install -m 644 "${ROOT}/icon-overrides.js" "${TARGET}/"
install -m 644 "${ROOT}/icon-preferences.js" "${TARGET}/"
install -m 644 "${ROOT}/icon-table-layout.js" "${TARGET}/"
install -m 644 "${ROOT}/prefs.js" "${TARGET}/"
install -m 644 "${ROOT}/schemas/org.gnome.shell.extensions.zorinfisheye.gschema.xml" "${TARGET}/schemas/"
glib-compile-schemas --strict "${TARGET}/schemas"

echo "Installed locally in ${TARGET}."
echo "Log out and back in if GNOME has not discovered/reloaded the extension."
echo "Then run: gnome-extensions enable ${UUID}"
echo "Disable alternative docks; keep zorin-taskbar@zorinos.com enabled."
