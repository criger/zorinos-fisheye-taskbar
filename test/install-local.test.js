// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

test('local installer includes all root GNOME JavaScript modules', () =>
{
    const root = new URL('../', import.meta.url);
    const installer = readFileSync(new URL('../scripts/install-local.sh',
        import.meta.url), 'utf8');

    for (const module of readdirSync(root).filter(name => name.endsWith('.js')))
    {
        const command = 'install -m 644 "${ROOT}/' + module +
            '" "${TARGET}/"';
        assert.ok(installer.includes(command),
            module + ' must be copied by install-local.sh');
    }
});
