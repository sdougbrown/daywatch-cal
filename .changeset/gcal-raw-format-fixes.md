---
'@daywatch/mcp': patch
---

gcal adapter: accept the raw Google Calendar API format. Declined events (response on the `self` attendee) and uppercase `WORKING_LOCATION`/`BIRTHDAY` event types were loaded as busy time, and the UTC offset in `dateTime` was dropped, so events organized in another zone landed at the wrong time. Offset-bearing dateTimes are now re-expressed in the range's zone, or pinned to a fixed-offset zone when `timeZone` is absent, so no offset-bearing time stays floating.
