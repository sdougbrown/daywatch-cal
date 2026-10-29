import { execFile, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const distEntry = fileURLToPath(new URL('../dist/index.js', import.meta.url));

/**
 * Vitest's module transform masks the ESM/CJS named-export interop for `rrule`,
 * so the failure only shows when the built package runs under plain Node ESM
 * (ECMAScript modules; the CJS (CommonJS) interop path @daywatch/mcp loads).
 * These tests drive the built artifact in child processes to catch that.
 */
function run(script: string, argv: string[]): Promise<string> {
  return execFileAsync(argv[0], [...argv.slice(1), '-e', script]).then((result) => result.stdout);
}

const reproScript = (importTarget: string) => `
  import { parseICS } from ${JSON.stringify(importTarget)};
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
`;

const bunAvailable = spawnSync('bun', ['--version'], { encoding: 'utf8' }).status === 0;

function expectBiweeklyDates(stdout: string): void {
  const ranges = JSON.parse(stdout);
  expect(ranges).toHaveLength(1);
  expect(ranges[0].dates).toEqual(['2026-11-04', '2026-11-18']);
}

describe('built package under plain Node ESM', () => {
  it('expands an RRULE with INTERVAL > 1', async () => {
    expect(existsSync(distEntry), 'build @daywatch/ical first (`yarn build`)').toBe(true);
    expectBiweeklyDates(
      await run(reproScript(distEntry), [process.execPath, '--input-type=module']),
    );
  });

  /**
   * Bun's runtime synthesizes a default export for CJS modules, so only the
   * bundler path catches a default-only import regression: it resolves rrule
   * to the package's ESM build, which has named exports but no default.
   * Skipped where bun is not installed (CI runs Node only); the gap is
   * explicit rather than silent.
   */
  it.skipIf(!bunAvailable)(
    'expands an RRULE with INTERVAL > 1 through bun build --compile',
    async () => {
      expect(existsSync(distEntry), 'build @daywatch/ical first (`yarn build`)').toBe(true);
      const dir = mkdtempSync(join(tmpdir(), 'daywatch-bun-'));
      const entry = join(dir, 'entry.ts');
      writeFileSync(entry, reproScript(distEntry));
      const outfile = join(dir, 'smoke-bin');
      await execFileAsync('bun', ['build', '--compile', entry, '--outfile', outfile]);
      const { stdout } = await execFileAsync(outfile);
      expectBiweeklyDates(stdout);
    },
  );
});
