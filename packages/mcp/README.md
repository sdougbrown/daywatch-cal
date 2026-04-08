# @daywatch/mcp

MCP server for calendar computation. Analyze schedules, find conflicts, free time, and suggest optimizations — powered by @daywatch/cal.

Works with any MCP client that supports stdio transport, including Claude Desktop, Claude Code, Codex, and similar tools.

## What this does

daywatch-cal MCP exposes calendar analysis and schedule optimization as MCP tools:

- Load `.ics` calendar data or native `DateRange[]` JSON into a session
- Analyze conflicts, free time, next-available slots, and day-level detail
- Score a schedule for conflicts, focus time, and context switches
- Preview and apply schedule changes in-session
- Export the current session back to `.ics`

## Quick start

Run the server over stdio:

```bash
npx @daywatch/mcp
```

Your MCP client will start the process and communicate over stdin/stdout.

## Configuration

### Claude Desktop

Add this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "daywatch-cal": {
      "command": "npx",
      "args": ["-y", "@daywatch/mcp"],
      "env": {}
    }
  }
}
```

### Claude Code

Add this to your project `.mcp.json`:

```json
{
  "mcpServers": {
    "daywatch-cal": {
      "command": "npx",
      "args": ["-y", "@daywatch/mcp"],
      "env": {}
    }
  }
}
```

### Codex

Add this to `~/.codex/config.toml`:

```toml
[mcp_servers.daywatch_cal]
command = "npx"
args = ["-y", "@daywatch/mcp"]
```

## Tools

- **`load_calendar`** — Load `.ics` text or JSON-encoded `DateRange[]` into the current session.
- **`load_calendar_file`** — Load an `.ics` file from an absolute path on disk.
- **`find_conflicts`** — Find overlapping timed events across loaded calendars in a date window.
- **`find_free_slots`** — Find open time on a specific day within working-hour bounds.
- **`find_next_free_slot`** — Find the next available slot of a required duration across a date window.
- **`score_schedule`** — Score a schedule for conflicts, free time, focus blocks, and context switches.
- **`day_detail`** — Return timed slots and all-day ranges for a specific date.
- **`expand_range`** — Expand one stored `DateRange` into concrete occurrences within a window.
- **`list_calendars`** — List loaded calendars, range counts, and sample labels.
- **`suggest_changes`** — Preview proposed schedule edits with before/after scoring and conflict counts.
- **`apply_changes`** — Apply proposed edits to the current in-memory session.
- **`generate_ics`** — Export loaded calendar data as `.ics` text.

## Workflow

The server is designed for an iterative scheduling loop:

1. **Load** calendar data with `load_calendar` or `load_calendar_file`
2. **Analyze** the current schedule with tools like `find_conflicts`, `find_free_slots`, `day_detail`, and `score_schedule`
3. **Suggest** candidate rearrangements with `suggest_changes`
4. **Apply** the chosen edits with `apply_changes`
5. **Export** the updated session with `generate_ics`

## Session model

Calendar data persists for the conversation session. Load it once, then query it many times across multiple tool calls.

- Multiple calendars can be loaded and analyzed together
- Tools can target all loaded calendars or a selected subset
- `apply_changes` mutates only the current session state
- `generate_ics` exports the ranges currently stored in-session

## Window auto-detection

When you load `.ics` data without an explicit parse window, the server starts with a default recent-to-near-future window. If that requested window does not overlap the actual data well, the server scans VEVENT date fields, detects where the calendar data lives, and reparses using that detected window when it yields more results.

This makes old archives, school terms, and seasonal calendars load more reliably without forcing the client to guess the right window up front.

## License

MIT
