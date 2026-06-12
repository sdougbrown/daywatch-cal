---
'@daywatch/mcp': minor
---

Add `load_calendar_url` tool: fetch an .ics feed by URL (incident.io schedule feeds, published calendar links) and load it directly into the session, removing the harness-side fetch step that behaved inconsistently across clients. Accepts https and webcal URLs; plain http is allowed for localhost only, and redirects are followed manually (max 5 hops) with every hop re-validated against the same scheme/host policy. The fetch uses the built-in Node fetch with a 30s timeout, a 20 MB streamed size cap, and body sniffing (`BEGIN:VCALENDAR`) instead of trusting Content-Type. Auth tokens embedded in feed URLs are redacted from all results and error messages, and failure classes (timeout, network, non-2xx, empty body, HTML body) each surface a distinct actionable error.
