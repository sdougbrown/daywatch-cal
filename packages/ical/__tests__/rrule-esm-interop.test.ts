import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const distEntry = fileURLToPath(new URL('../dist/index.js', import.meta.url));

/**
 * Vitest's module transform masks the ESM/CJS named-export interop for `rrule`,
 * so the failure only shows when the built package runs under plain Node ESM
 * (ECMAScript modules; the CJS interop path @daywatch/mcp loads). This drives the built artifact in a child
 * process to catch that.
 */
function runNode(script: string): Promise<string> {
  return execFileAsync(process.execPath, ['--input-type=module', '-e', script]).then(
    (result) => result.stdout,
  );
}

describe('built package under plain Node ESM', () => {
  it('expands an RRULE with INTERVAL > 1', async () => {
    expect(existsSync(distEntry), 'build @daywatch/ical first (`yarn build`)').toBe(true);
    const stdout = await runNode(`
        import { parseICS } from ${JSON.stringify(distEntry)};
        const ics = [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//repro//EN',
          'BEGIN:VEVENT',
          'UID:repro-1@example.com',
          'DTSTART:20261104T100000Z',
          'DTEND:20261104T110000Z',
          'SUMMARY:Biweekly meeting',
          'RRULE:FREQ=WEEKLY;INTERVAL=2',
          'END:VEVENT',
          'END:VCALENDAR',
        ].join('\\r\\n');
        const ranges = parseICS(ics, {
          from: new Date('2026-11-01T00:00:00Z'),
          to: new Date('2026-11-30T00:00:00Z'),
        });
        console.log(JSON.stringify(ranges));
      `);

    const ranges = JSON.parse(stdout);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].dates).toEqual(['2026-11-04', '2026-11-18']);
  });
});
