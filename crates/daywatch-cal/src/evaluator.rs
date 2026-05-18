use chrono::{Datelike, LocalResult, NaiveDate, TimeZone, Timelike};
use chrono_tz::Tz;
use std::collections::{HashMap, HashSet};

use crate::time::*;
use crate::types::*;

// ── Public struct ───────────────────────────────────────────────────────────

pub struct RangeEvaluator {
    pub(crate) user_timezone: Tz,
}

// ── Internal structs ────────────────────────────────────────────────────────

pub(crate) struct TimedEntry {
    pub slot: TimeSlot,
    pub start_minutes: u32,
    pub end_minutes: u32,
}

struct CompiledRange {
    weekday_mask: [bool; 7],
    date_mask: [bool; 32],
    month_mask: [bool; 13],
    dates: Option<Vec<String>>,
    dates_set: Option<HashSet<String>>,
    except_dates_set: Option<HashSet<String>>,
    except_between: Option<Vec<(String, String)>>,
    has_recurrence: bool,
    has_time_fields: bool,
}

struct RawSpan {
    range_id: String,
    label: String,
    display_type: Option<String>,
    start_date: String,
    end_date: String,
    days: Vec<String>,
}

// ── Free helpers ────────────────────────────────────────────────────────────

fn compile_range(range: &DateRange) -> CompiledRange {
    let mut weekday_mask = [false; 7];
    let mut date_mask = [false; 32];
    let mut month_mask = [false; 13];
    let mut has_recurrence = false;

    match &range.day_selector {
        DaySelector::Explicit {
            dates: d,
            except_dates,
            except_between,
        } => {
            let mut sorted = d.clone();
            sorted.sort();
            let dates_set = Some(HashSet::<String>::from_iter(sorted.iter().cloned()));
            let dates = Some(sorted);

            CompiledRange {
                weekday_mask: [false; 7],
                date_mask: [false; 32],
                month_mask: [false; 13],
                dates,
                dates_set,
                except_dates_set: except_dates
                    .as_ref()
                    .map(|ed| HashSet::<String>::from_iter(ed.iter().cloned())),
                except_between: except_between.clone(),
                has_recurrence: false,
                has_time_fields: has_time_fields_inner(range),
            }
        }
        DaySelector::Recurrence {
            every_weekday,
            every_date,
            every_month,
            from_date: _,
            to_date: _,
            except_dates,
            except_between,
        } => {
            if let Some(weekdays) = every_weekday {
                for &w in weekdays {
                    if (w as usize) < 7 {
                        weekday_mask[w as usize] = true;
                    }
                }
                has_recurrence = true;
            }
            if let Some(days) = every_date {
                for &d in days {
                    if (d as usize) < 32 {
                        date_mask[d as usize] = true;
                    }
                }
                has_recurrence = true;
            }
            if let Some(months) = every_month {
                for &m in months {
                    if (m as usize) < 13 {
                        month_mask[m as usize] = true;
                    }
                }
                has_recurrence = true;
            }

            CompiledRange {
                weekday_mask,
                date_mask,
                month_mask,
                dates: None,
                dates_set: None,
                except_dates_set: except_dates
                    .as_ref()
                    .map(|ed| HashSet::<String>::from_iter(ed.iter().cloned())),
                except_between: except_between.clone(),
                has_recurrence,
                has_time_fields: has_time_fields_inner(range),
            }
        }
        DaySelector::Range {
            from_date: _,
            to_date: _,
            fixed_between: _,
            except_dates,
            except_between,
        } => CompiledRange {
            weekday_mask: [false; 7],
            date_mask: [false; 32],
            month_mask: [false; 13],
            dates: None,
            dates_set: None,
            except_dates_set: except_dates
                .as_ref()
                .map(|ed| HashSet::<String>::from_iter(ed.iter().cloned())),
            except_between: except_between.clone(),
            has_recurrence: false,
            has_time_fields: has_time_fields_inner(range),
        },
    }
}

fn has_time_fields_inner(range: &DateRange) -> bool {
    match &range.time_selector {
        Some(TimeSelector::Hours { .. }) | Some(TimeSelector::Window { .. }) => true,
        None => false,
    }
}

fn get_bounds(range: &DateRange) -> (Option<&str>, Option<&str>) {
    match &range.day_selector {
        DaySelector::Explicit { .. } => (None, None),
        DaySelector::Recurrence {
            from_date, to_date, ..
        } => (from_date.as_deref(), to_date.as_deref()),
        DaySelector::Range {
            from_date, to_date, ..
        } => (from_date.as_deref(), to_date.as_deref()),
    }
}

fn is_date_in_bounds(date_str: &str, range: &DateRange) -> bool {
    let (from_date, to_date) = get_bounds(range);

    if let Some(fd) = from_date {
        if date_str < fd {
            return false;
        }
    }
    if let Some(td) = to_date {
        if date_str > td {
            return false;
        }
    }
    true
}

fn is_date_excluded(date_str: &str, compiled: &CompiledRange) -> bool {
    if let Some(ref set) = compiled.except_dates_set {
        if set.contains(date_str) {
            return true;
        }
    }

    if let Some(ref between) = compiled.except_between {
        for (from, to) in between {
            if date_str >= from.as_str() && date_str <= to.as_str() {
                return true;
            }
        }
    }

    false
}

fn is_next_day(date_a: &str, date_b: &str) -> bool {
    let a = match parse_date(date_a) {
        Some(d) => d,
        None => return false,
    };
    let next = a + chrono::Duration::days(1);
    format_date(next) == date_b
}

fn for_each_month_in_range(
    from: NaiveDate,
    to: NaiveDate,
    mut visit: impl FnMut(i32, u32, u32, u32),
) {
    let mut year = from.year();
    let mut month = from.month();

    while year < to.year() || (year == to.year() && month <= to.month()) {
        let start_day = if year == from.year() && month == from.month() {
            from.day()
        } else {
            1
        };
        let end_day = if year == to.year() && month == to.month() {
            to.day()
        } else {
            days_in_month(year, month)
        };

        visit(year, month, start_day, end_day);

        month += 1;
        if month == 13 {
            month = 1;
            year += 1;
        }
    }
}

// ── RangeEvaluator impl ─────────────────────────────────────────────────────

impl RangeEvaluator {
    pub fn new(user_timezone: Option<&str>) -> Result<Self, String> {
        let tz_str = user_timezone.unwrap_or("UTC");
        let tz: Tz = tz_str
            .parse()
            .map_err(|e| format!("Invalid timezone '{}': {}", tz_str, e))?;
        Ok(RangeEvaluator { user_timezone: tz })
    }

    // ── Public API ──────────────────────────────────────────────────────

    pub fn is_date_in_range(&self, date: &str, range: &DateRange) -> bool {
        let compiled = compile_range(range);

        if !is_date_in_bounds(date, range) {
            return false;
        }

        if is_date_excluded(date, &compiled) {
            return false;
        }

        if let Some(ref set) = compiled.dates_set {
            return set.contains(date);
        }

        if !compiled.has_recurrence {
            return true;
        }

        if compiled.weekday_mask.iter().any(|&x| x) {
            let nd = match parse_date(date) {
                Some(d) => d,
                None => return false,
            };
            let weekday = nd.weekday().num_days_from_sunday() as usize;
            if !compiled.weekday_mask[weekday] {
                return false;
            }
        }

        if compiled.date_mask.iter().any(|&x| x) || compiled.month_mask.iter().any(|&x| x) {
            let nd = match parse_date(date) {
                Some(d) => d,
                None => return false,
            };
            let day = nd.day() as usize;

            if compiled.date_mask.iter().any(|&x| x) && !compiled.date_mask[day] {
                return false;
            }

            let month = nd.month() as usize;
            if compiled.month_mask.iter().any(|&x| x) && !compiled.month_mask[month] {
                return false;
            }
        }

        true
    }

    pub fn get_time_slots(&self, date: &str, range: &DateRange) -> Vec<TimeSlot> {
        let time_selector = match &range.time_selector {
            Some(ts) => ts,
            None => return vec![],
        };

        let mut slots: Vec<TimeSlot> = Vec::new();

        match time_selector {
            TimeSelector::Hours {
                every_hour,
                duration,
            } => {
                for &hour in every_hour {
                    let start_time = format!("{:02}:00", hour);
                    let resolved = self.resolve_time(date, &start_time, range.timezone.as_deref());
                    let resolved = match resolved {
                        Some(r) => r,
                        None => continue,
                    };

                    let end_time = duration.map(|d| add_minutes(&resolved, d));
                    let dur = *duration;

                    slots.push(TimeSlot {
                        start_time: resolved,
                        end_time,
                        duration: dur,
                        range_id: range.id.clone(),
                        label: range.label.clone(),
                    });
                }
            }
            TimeSelector::Window {
                start_time,
                end_time,
                repeat_every,
                duration,
            } => {
                let resolved_start = self.resolve_time(date, start_time, range.timezone.as_deref());
                let resolved_start = match resolved_start {
                    Some(r) => r,
                    None => return slots,
                };

                if let Some(rep) = repeat_every {
                    if *rep == 0 {
                        return slots;
                    }
                    let end_boundary = match end_time {
                        Some(et) => self
                            .resolve_time(date, et, range.timezone.as_deref())
                            .unwrap_or_else(|| "24:00".to_string()),
                        None => "24:00".to_string(),
                    };
                    let end_minutes = time_to_minutes(&end_boundary);
                    let mut current_minutes = time_to_minutes(&resolved_start);

                    while current_minutes < end_minutes {
                        let st = minutes_to_time(current_minutes);
                        let et = duration.map(|d| add_minutes(&st, d));

                        slots.push(TimeSlot {
                            start_time: st,
                            end_time: et,
                            duration: *duration,
                            range_id: range.id.clone(),
                            label: range.label.clone(),
                        });

                        current_minutes += *rep;
                    }
                } else {
                    let end = match end_time {
                        Some(et) => self.resolve_time(date, et, range.timezone.as_deref()),
                        None => None,
                    };

                    let dur = match (duration, &end) {
                        (Some(d), _) => Some(*d),
                        (None, Some(et)) => {
                            time_to_minutes(et).checked_sub(time_to_minutes(&resolved_start))
                        }
                        (None, None) => None,
                    };

                    let end_for_slot = match (&end, dur) {
                        (Some(et), _) => Some(et.clone()),
                        (None, Some(d)) => Some(add_minutes(&resolved_start, d)),
                        (None, None) => None,
                    };

                    slots.push(TimeSlot {
                        start_time: resolved_start,
                        end_time: end_for_slot,
                        duration: dur,
                        range_id: range.id.clone(),
                        label: range.label.clone(),
                    });
                }
            }
        }

        slots.sort_by(|a, b| a.start_time.cmp(&b.start_time));
        slots
    }

    pub fn expand(&self, range: &DateRange, from: NaiveDate, to: NaiveDate) -> Vec<Occurrence> {
        let from_str = format_date(from);
        let to_str = format_date(to);

        let candidate_days = self.get_candidate_days(range, &from_str, &to_str);

        let mut occurrences: Vec<Occurrence> = Vec::new();
        let compiled = compile_range(range);

        for day in candidate_days {
            if compiled.has_time_fields {
                let slots = self.get_time_slots(&day, range);
                for slot in slots {
                    occurrences.push(Occurrence {
                        date: day.clone(),
                        start_time: Some(slot.start_time),
                        end_time: slot.end_time,
                        range_id: range.id.clone(),
                        label: range.label.clone(),
                        all_day: false,
                        display_type: range.display_type.clone(),
                    });
                }
            } else {
                occurrences.push(Occurrence {
                    date: day,
                    start_time: None,
                    end_time: None,
                    range_id: range.id.clone(),
                    label: range.label.clone(),
                    all_day: true,
                    display_type: range.display_type.clone(),
                });
            }
        }

        occurrences
    }

    pub fn expand_day(&self, range: &DateRange, date: &str) -> Vec<TimeSlot> {
        if !self.is_date_in_range(date, range) {
            return vec![];
        }
        self.get_time_slots(date, range)
    }

    pub fn compute_spans(
        &self,
        ranges: &[DateRange],
        from: NaiveDate,
        to: NaiveDate,
    ) -> Vec<SpanInfo> {
        let from_str = format_date(from);
        let to_str = format_date(to);

        let mut all_spans: Vec<RawSpan> = Vec::new();

        for range in ranges {
            let candidate_days = self.get_candidate_days(range, &from_str, &to_str);
            if candidate_days.is_empty() {
                continue;
            }

            let mut span_start = candidate_days[0].clone();
            let mut prev_date = candidate_days[0].clone();
            let mut span_days = vec![candidate_days[0].clone()];

            for day in &candidate_days[1..] {
                if is_next_day(&prev_date, day) {
                    span_days.push(day.clone());
                    prev_date = day.clone();
                } else {
                    all_spans.push(RawSpan {
                        range_id: range.id.clone(),
                        label: range.label.clone(),
                        display_type: range.display_type.clone(),
                        start_date: span_start.clone(),
                        end_date: prev_date.clone(),
                        days: span_days,
                    });
                    span_start = day.clone();
                    prev_date = day.clone();
                    span_days = vec![day.clone()];
                }
            }

            all_spans.push(RawSpan {
                range_id: range.id.clone(),
                label: range.label.clone(),
                display_type: range.display_type.clone(),
                start_date: span_start,
                end_date: prev_date,
                days: span_days,
            });
        }

        if all_spans.is_empty() {
            return vec![];
        }

        let n = all_spans.len();

        // ── Build day-indexed overlap map ──
        let mut day_to_spans: HashMap<String, Vec<usize>> = HashMap::new();
        for (i, span) in all_spans.iter().enumerate() {
            for day in &span.days {
                day_to_spans.entry(day.clone()).or_default().push(i);
            }
        }

        // ── Assign lanes via greedy interval scheduling ──
        let mut sorted_indices: Vec<usize> = (0..n).collect();
        sorted_indices.sort_by(|&a, &b| {
            all_spans[a]
                .start_date
                .cmp(&all_spans[b].start_date)
                .then(all_spans[a].end_date.cmp(&all_spans[b].end_date))
        });

        let mut lanes: Vec<Option<usize>> = vec![None; n];
        let mut lane_end_dates: Vec<String> = Vec::new();

        for &idx in &sorted_indices {
            let span = &all_spans[idx];
            let mut assigned: Option<usize> = None;

            for (lane, end_date) in lane_end_dates.iter().enumerate() {
                if *end_date < span.start_date {
                    assigned = Some(lane);
                    break;
                }
            }

            match assigned {
                Some(lane) => {
                    lane_end_dates[lane] = span.end_date.clone();
                    lanes[idx] = Some(lane);
                }
                None => {
                    let new_lane = lane_end_dates.len();
                    lane_end_dates.push(span.end_date.clone());
                    lanes[idx] = Some(new_lane);
                }
            }
        }

        // ── Compute maxOverlap per span ──
        let mut max_overlaps: Vec<usize> = vec![1; n];
        for (i, span) in all_spans.iter().enumerate() {
            for day in &span.days {
                if let Some(overlapping) = day_to_spans.get(day) {
                    if overlapping.len() > max_overlaps[i] {
                        max_overlaps[i] = overlapping.len();
                    }
                }
            }
        }

        // ── Build overlap groups via BFS on shared-day adjacency ──
        let mut span_neighbors: Vec<Vec<usize>> = vec![Vec::new(); n];
        for span_indices in day_to_spans.values() {
            if span_indices.len() > 1 {
                for &a in span_indices {
                    for &b in span_indices {
                        if a != b {
                            span_neighbors[a].push(b);
                        }
                    }
                }
            }
        }

        let mut visited = vec![false; n];
        let mut component_of: Vec<Option<usize>> = vec![None; n];
        let mut components: Vec<Vec<usize>> = Vec::new();

        for i in 0..n {
            if visited[i] {
                continue;
            }
            let mut component: Vec<usize> = Vec::new();
            let mut queue: Vec<usize> = vec![i];
            visited[i] = true;

            while let Some(node) = queue.pop() {
                component.push(node);
                for &neighbor in &span_neighbors[node] {
                    if !visited[neighbor] {
                        visited[neighbor] = true;
                        queue.push(neighbor);
                    }
                }
            }

            let comp_idx = components.len();
            components.push(component.clone());
            for &idx in &component {
                component_of[idx] = Some(comp_idx);
            }
        }

        let component_total_lanes: Vec<usize> = components
            .iter()
            .map(|comp| {
                let used_lanes: HashSet<usize> =
                    comp.iter().filter_map(|&idx| lanes[idx]).collect();
                used_lanes.len()
            })
            .collect();

        // ── Build SpanInfo results ──
        let mut results: Vec<SpanInfo> = Vec::new();
        for i in 0..n {
            let span = &all_spans[i];
            results.push(SpanInfo {
                range_id: span.range_id.clone(),
                label: span.label.clone(),
                display_type: span.display_type.clone(),
                start_date: span.start_date.clone(),
                end_date: span.end_date.clone(),
                length: span.days.len(),
                max_overlap: max_overlaps[i],
                lane: lanes[i].unwrap_or(0),
                total_lanes: component_total_lanes[component_of[i].unwrap_or(0)],
            });
        }

        results.sort_by(|a, b| a.start_date.cmp(&b.start_date).then(a.lane.cmp(&b.lane)));

        results
    }

    pub fn find_conflicts(&self, ranges: &[DateRange], date: &str) -> Vec<Conflict> {
        let entries = self.get_timed_entries_for_day(ranges, date);

        let slots: Vec<ConflictSlot> = entries
            .into_iter()
            .filter(|e| e.slot.end_time.is_some() && e.end_minutes > e.start_minutes)
            .map(|e| ConflictSlot {
                range_id: e.slot.range_id,
                label: e.slot.label,
                start_minutes: e.start_minutes,
                end_minutes: e.end_minutes,
            })
            .collect();

        let mut conflicts: Vec<Conflict> = Vec::new();
        let mut seen: HashSet<(String, String)> = HashSet::new();

        for i in 0..slots.len() {
            for j in (i + 1)..slots.len() {
                if slots[j].start_minutes >= slots[i].end_minutes {
                    break;
                }

                if slots[i].range_id == slots[j].range_id {
                    continue;
                }

                let pair_key = if slots[i].range_id < slots[j].range_id {
                    (slots[i].range_id.clone(), slots[j].range_id.clone())
                } else {
                    (slots[j].range_id.clone(), slots[i].range_id.clone())
                };

                if seen.contains(&pair_key) {
                    continue;
                }
                seen.insert(pair_key);

                let overlap_start = u32::max(slots[i].start_minutes, slots[j].start_minutes);
                let overlap_end = u32::min(slots[i].end_minutes, slots[j].end_minutes);

                conflicts.push(Conflict {
                    range_a: RangeRef {
                        id: slots[i].range_id.clone(),
                        label: slots[i].label.clone(),
                    },
                    range_b: RangeRef {
                        id: slots[j].range_id.clone(),
                        label: slots[j].label.clone(),
                    },
                    date: date.to_string(),
                    overlap_start: Some(minutes_to_time(overlap_start)),
                    overlap_end: Some(minutes_to_time(overlap_end)),
                });
            }
        }

        conflicts
    }

    pub fn find_conflicts_in_window(
        &self,
        ranges: &[DateRange],
        from: NaiveDate,
        to: NaiveDate,
    ) -> Vec<Conflict> {
        let days = date_range(from, to);

        let mut all_conflicts: Vec<Conflict> = Vec::new();
        for day in days {
            let day_str = format_date(day);
            let day_conflicts = self.find_conflicts(ranges, &day_str);
            all_conflicts.extend(day_conflicts);
        }

        all_conflicts
    }

    pub fn find_free_slots(
        &self,
        ranges: &[DateRange],
        date: &str,
        options: FindFreeSlotsOptions,
    ) -> Vec<FreeSlot> {
        let min_duration = options.min_duration.unwrap_or(15);
        let day_start_min = match parse_hhmm(options.day_start.as_deref().unwrap_or("00:00")) {
            Some((hour, minute)) => hour * 60 + minute,
            None => return vec![],
        };
        let day_end_min = match parse_hhmm(options.day_end.as_deref().unwrap_or("24:00")) {
            Some((hour, minute)) => hour * 60 + minute,
            None => return vec![],
        };

        let entries = self.get_timed_entries_for_day(ranges, date);

        let mut occupied: Vec<(u32, u32)> = entries
            .into_iter()
            .filter(|e| e.end_minutes > e.start_minutes)
            .map(|e| (e.start_minutes, e.end_minutes))
            .collect();

        occupied.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));

        let mut merged: Vec<(u32, u32)> = Vec::new();
        for interval in occupied {
            if let Some(last) = merged.last_mut() {
                if interval.0 <= last.1 {
                    last.1 = u32::max(last.1, interval.1);
                } else {
                    merged.push(interval);
                }
            } else {
                merged.push(interval);
            }
        }

        let mut free_slots: Vec<FreeSlot> = Vec::new();
        let mut cursor = day_start_min;

        for (start, end) in merged {
            let clamped_start = u32::max(start, day_start_min);
            let clamped_end = u32::min(end, day_end_min);

            if clamped_start > cursor {
                let gap_end = u32::min(clamped_start, day_end_min);
                let dur = gap_end - cursor;
                if dur >= min_duration {
                    free_slots.push(FreeSlot {
                        date: date.to_string(),
                        start_time: minutes_to_time(cursor),
                        end_time: minutes_to_time(gap_end),
                        duration: dur,
                    });
                }
            }

            cursor = u32::max(cursor, clamped_end);
        }

        if cursor < day_end_min {
            let dur = day_end_min - cursor;
            if dur >= min_duration {
                free_slots.push(FreeSlot {
                    date: date.to_string(),
                    start_time: minutes_to_time(cursor),
                    end_time: minutes_to_time(day_end_min),
                    duration: dur,
                });
            }
        }

        free_slots
    }

    pub fn find_next_free_slot(
        &self,
        ranges: &[DateRange],
        from: NaiveDate,
        to: NaiveDate,
        duration_minutes: u32,
        options: FindFreeSlotsOptions,
    ) -> Option<FreeSlot> {
        for date in date_range(from, to) {
            let date_str = format_date(date);
            let slots = self.find_free_slots(
                ranges,
                &date_str,
                FindFreeSlotsOptions {
                    min_duration: Some(duration_minutes),
                    ..options.clone()
                },
            );
            if let Some(slot) = slots.into_iter().next() {
                return Some(slot);
            }
        }

        None
    }

    pub(crate) fn get_timed_entries_for_day(
        &self,
        ranges: &[DateRange],
        date: &str,
    ) -> Vec<TimedEntry> {
        let mut entries: Vec<TimedEntry> = Vec::new();

        for range in ranges {
            if !self.is_date_in_range(date, range) {
                continue;
            }
            let compiled = compile_range(range);
            if !compiled.has_time_fields {
                continue;
            }

            let time_slots = self.get_time_slots(date, range);
            for slot in time_slots {
                let start_minutes = time_to_minutes(&slot.start_time);
                let end_minutes = match &slot.end_time {
                    Some(et) => time_to_minutes(et),
                    None => start_minutes + slot.duration.unwrap_or(0),
                };

                entries.push(TimedEntry {
                    slot,
                    start_minutes,
                    end_minutes,
                });
            }
        }

        entries.sort_by(|a, b| {
            a.start_minutes
                .cmp(&b.start_minutes)
                .then(a.end_minutes.cmp(&b.end_minutes))
        });
        entries
    }

    // ── Private helpers ──────────────────────────────────────────────────

    fn resolve_time(&self, date_str: &str, time: &str, range_tz: Option<&str>) -> Option<String> {
        let tz_str = match range_tz {
            Some(tz) => tz,
            None => {
                parse_hhmm(time)?;
                return Some(time.to_owned());
            }
        };
        let range_tz: Tz = tz_str.parse().ok()?;
        let (hour, minute) = parse_hhmm(time)?;
        let nd = parse_date(date_str)?;
        let naive_dt = nd.and_hms_opt(hour, minute, 0)?;

        let range_dt = match range_tz.from_local_datetime(&naive_dt) {
            LocalResult::Single(dt) => dt,
            LocalResult::Ambiguous(earliest, _latest) => earliest,
            LocalResult::None => return None,
        };

        let user_dt = range_dt.with_timezone(&self.user_timezone);
        Some(format!("{:02}:{:02}", user_dt.hour(), user_dt.minute()))
    }

    fn get_candidate_days(&self, range: &DateRange, from_str: &str, to_str: &str) -> Vec<String> {
        let compiled = compile_range(range);

        let (range_from, range_to) = get_bounds(range);
        let mut effective_from = from_str.to_string();
        let mut effective_to = to_str.to_string();

        if let Some(rf) = range_from {
            if rf > effective_from.as_str() {
                effective_from = rf.to_string();
            }
        }
        if let Some(rt) = range_to {
            if rt < effective_to.as_str() {
                effective_to = rt.to_string();
            }
        }

        if effective_from > effective_to {
            return vec![];
        }

        if let Some(ref dates) = compiled.dates {
            return dates
                .iter()
                .filter(|d| {
                    d.as_str() >= effective_from.as_str()
                        && d.as_str() <= effective_to.as_str()
                        && !is_date_excluded(d, &compiled)
                })
                .cloned()
                .collect();
        }

        let from_nd = match parse_date(&effective_from) {
            Some(d) => d,
            None => return vec![],
        };
        let to_nd = match parse_date(&effective_to) {
            Some(d) => d,
            None => return vec![],
        };

        if !compiled.has_recurrence {
            let all_days: Vec<String> = date_range(from_nd, to_nd)
                .into_iter()
                .map(format_date)
                .collect();
            if compiled.except_dates_set.is_none() && compiled.except_between.is_none() {
                return all_days;
            }
            return all_days
                .into_iter()
                .filter(|day| !is_date_excluded(day, &compiled))
                .collect();
        }

        if compiled.date_mask.iter().any(|&x| x) {
            return self.generate_candidate_days_by_day_of_month(from_nd, to_nd, &compiled);
        }

        if compiled.weekday_mask.iter().any(|&x| x) {
            return self.generate_candidate_days_by_weekday(from_nd, to_nd, &compiled);
        }

        if compiled.month_mask.iter().any(|&x| x) {
            return self.generate_candidate_days_by_month(from_nd, to_nd, &compiled);
        }

        let all_days: Vec<String> = date_range(from_nd, to_nd)
            .into_iter()
            .map(format_date)
            .collect();
        all_days
            .into_iter()
            .filter(|day| self.is_date_in_range(day, range))
            .collect()
    }

    fn generate_candidate_days_by_day_of_month(
        &self,
        from: NaiveDate,
        to: NaiveDate,
        compiled: &CompiledRange,
    ) -> Vec<String> {
        let mut results: Vec<String> = Vec::new();

        for_each_month_in_range(from, to, |year, month, start_day, end_day| {
            if compiled.month_mask.iter().any(|&x| x) && !compiled.month_mask[month as usize] {
                return;
            }

            let max_day = days_in_month(year, month);

            for d in start_day..=end_day {
                let d_usize = d as usize;
                if d_usize >= 32 || !compiled.date_mask[d_usize] || d > max_day {
                    continue;
                }

                if compiled.weekday_mask.iter().any(|&x| x) {
                    if let Some(nd) = NaiveDate::from_ymd_opt(year, month, d) {
                        let wd = nd.weekday().num_days_from_sunday() as usize;
                        if !compiled.weekday_mask[wd] {
                            continue;
                        }
                    } else {
                        continue;
                    }
                }

                let date_str = format_date(
                    NaiveDate::from_ymd_opt(year, month, d)
                        .expect("from_ymd_opt failed with valid year/month/day"),
                );
                if !is_date_excluded(&date_str, compiled) {
                    results.push(date_str);
                }
            }
        });

        results.sort();
        results
    }

    fn generate_candidate_days_by_weekday(
        &self,
        from: NaiveDate,
        to: NaiveDate,
        compiled: &CompiledRange,
    ) -> Vec<String> {
        let mut results: Vec<String> = Vec::new();

        for_each_month_in_range(from, to, |year, month, start_day, end_day| {
            if compiled.month_mask.iter().any(|&x| x) && !compiled.month_mask[month as usize] {
                return;
            }

            let first_of_month = match NaiveDate::from_ymd_opt(year, month, 1) {
                Some(d) => d,
                None => return,
            };
            let first_weekday = first_of_month.weekday().num_days_from_sunday() as i32;

            for weekday in 0..7i32 {
                if !compiled.weekday_mask[weekday as usize] {
                    continue;
                }

                let mut day = 1 + ((weekday - first_weekday + 7) % 7);
                if day < start_day as i32 {
                    let skip = ((start_day as i32 - day + 6) / 7) * 7;
                    day += skip;
                }

                while day <= end_day as i32 {
                    if let Some(nd) = NaiveDate::from_ymd_opt(year, month, day as u32) {
                        let date_str = format_date(nd);
                        if !is_date_excluded(&date_str, compiled) {
                            results.push(date_str);
                        }
                    }
                    day += 7;
                }
            }
        });

        results.sort();
        results
    }

    fn generate_candidate_days_by_month(
        &self,
        from: NaiveDate,
        to: NaiveDate,
        compiled: &CompiledRange,
    ) -> Vec<String> {
        let mut results: Vec<String> = Vec::new();

        for_each_month_in_range(from, to, |year, month, start_day, end_day| {
            if !compiled.month_mask[month as usize] {
                return;
            }

            let month_from = NaiveDate::from_ymd_opt(year, month, start_day).map(format_date);
            let month_to = NaiveDate::from_ymd_opt(year, month, end_day).map(format_date);

            let (mf, mt) = match (month_from, month_to) {
                (Some(f), Some(t)) => (f, t),
                _ => return,
            };

            let from_nd = match parse_date(&mf) {
                Some(d) => d,
                None => return,
            };
            let to_nd = match parse_date(&mt) {
                Some(d) => d,
                None => return,
            };

            let days: Vec<String> = date_range(from_nd, to_nd)
                .into_iter()
                .map(format_date)
                .collect();

            if compiled.except_dates_set.is_none() && compiled.except_between.is_none() {
                results.extend(days);
                return;
            }

            for day in days {
                if !is_date_excluded(&day, compiled) {
                    results.push(day);
                }
            }
        });

        results
    }
}

// ── Internal type for conflict sweep ────────────────────────────────────────

struct ConflictSlot {
    range_id: String,
    label: String,
    start_minutes: u32,
    end_minutes: u32,
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_range(
        id: &str,
        label: &str,
        day_selector: DaySelector,
        time_selector: Option<TimeSelector>,
    ) -> DateRange {
        DateRange {
            id: id.to_string(),
            label: label.to_string(),
            title: None,
            display_type: None,
            day_selector,
            time_selector,
            timezone: None,
            flexibility: None,
            metadata: None,
        }
    }

    fn day<S: Into<String>>(s: S) -> String {
        s.into()
    }

    fn evaluator() -> RangeEvaluator {
        RangeEvaluator::new(None).unwrap()
    }

    // ── is_date_in_range ────────────────────────────────────────────────

    #[test]
    fn test_explicit_dates_in_range() {
        let ev = evaluator();
        let range = make_range(
            "1",
            "test",
            DaySelector::Explicit {
                dates: vec![day("2026-03-01"), day("2026-03-15")],
                except_dates: None,
                except_between: None,
            },
            None,
        );
        assert!(ev.is_date_in_range("2026-03-01", &range));
        assert!(ev.is_date_in_range("2026-03-15", &range));
        assert!(!ev.is_date_in_range("2026-03-02", &range));
    }

    #[test]
    fn test_explicit_dates_with_except() {
        let ev = evaluator();
        let range = make_range(
            "1",
            "test",
            DaySelector::Explicit {
                dates: vec![day("2026-03-01"), day("2026-03-15")],
                except_dates: Some(vec![day("2026-03-15")]),
                except_between: None,
            },
            None,
        );
        assert!(ev.is_date_in_range("2026-03-01", &range));
        assert!(!ev.is_date_in_range("2026-03-15", &range));
    }

    #[test]
    fn test_explicit_dates_with_except_between() {
        let ev = evaluator();
        let range = make_range(
            "1",
            "test",
            DaySelector::Explicit {
                dates: vec![day("2026-03-01"), day("2026-03-10"), day("2026-03-20")],
                except_dates: None,
                except_between: Some(vec![(day("2026-03-05"), day("2026-03-15"))]),
            },
            None,
        );
        assert!(ev.is_date_in_range("2026-03-01", &range));
        assert!(!ev.is_date_in_range("2026-03-10", &range));
        assert!(ev.is_date_in_range("2026-03-20", &range));
    }

    #[test]
    fn test_recurrence_every_weekday() {
        let ev = evaluator();
        // 2026-03-02 is a Monday (weekday=1 in our convention, Sun=0)
        let range = make_range(
            "1",
            "test",
            DaySelector::Recurrence {
                every_weekday: Some(vec![1]), // Monday
                every_date: None,
                every_month: None,
                from_date: Some(day("2026-03-01")),
                to_date: Some(day("2026-03-31")),
                except_dates: None,
                except_between: None,
            },
            None,
        );
        assert!(!ev.is_date_in_range("2026-03-01", &range)); // Sunday
        assert!(ev.is_date_in_range("2026-03-02", &range)); // Monday
        assert!(!ev.is_date_in_range("2026-03-03", &range)); // Tuesday
    }

    #[test]
    fn test_recurrence_every_date_and_month() {
        let ev = evaluator();
        let range = make_range(
            "1",
            "test",
            DaySelector::Recurrence {
                every_weekday: None,
                every_date: Some(vec![15]),
                every_month: Some(vec![3]),
                from_date: Some(day("2026-01-01")),
                to_date: Some(day("2026-12-31")),
                except_dates: None,
                except_between: None,
            },
            None,
        );
        assert!(ev.is_date_in_range("2026-03-15", &range));
        assert!(!ev.is_date_in_range("2026-03-14", &range));
        assert!(!ev.is_date_in_range("2026-04-15", &range));
    }

    #[test]
    fn test_range_bounded() {
        let ev = evaluator();
        let range = make_range(
            "1",
            "test",
            DaySelector::Range {
                from_date: Some(day("2026-03-01")),
                to_date: Some(day("2026-03-10")),
                fixed_between: false,
                except_dates: None,
                except_between: None,
            },
            None,
        );
        assert!(ev.is_date_in_range("2026-03-01", &range));
        assert!(ev.is_date_in_range("2026-03-05", &range));
        assert!(ev.is_date_in_range("2026-03-10", &range));
        assert!(!ev.is_date_in_range("2026-02-28", &range));
        assert!(!ev.is_date_in_range("2026-03-11", &range));
    }

    #[test]
    fn test_range_open_ended() {
        let ev = evaluator();
        let range = make_range(
            "1",
            "test",
            DaySelector::Range {
                from_date: Some(day("2026-03-01")),
                to_date: None,
                fixed_between: false,
                except_dates: None,
                except_between: None,
            },
            None,
        );
        assert!(ev.is_date_in_range("2026-03-01", &range));
        assert!(ev.is_date_in_range("2026-12-31", &range));
        assert!(!ev.is_date_in_range("2026-02-28", &range));
    }

    #[test]
    fn test_bounds_before_date_check() {
        let ev = evaluator();
        let range = make_range(
            "1",
            "test",
            DaySelector::Recurrence {
                every_weekday: Some(vec![1]),
                every_date: None,
                every_month: None,
                from_date: Some(day("2026-03-01")),
                to_date: Some(day("2026-03-07")),
                except_dates: None,
                except_between: None,
            },
            None,
        );
        assert!(!ev.is_date_in_range("2026-02-23", &range)); // Monday but before bounds
        assert!(!ev.is_date_in_range("2026-03-09", &range)); // Monday but after bounds
        assert!(ev.is_date_in_range("2026-03-02", &range)); // Monday in bounds
    }

    // ── get_time_slots ──────────────────────────────────────────────────

    #[test]
    fn test_time_slots_hours() {
        let ev = evaluator();
        let range = make_range(
            "1",
            "test",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Hours {
                every_hour: vec![9, 14],
                duration: Some(60),
            }),
        );
        let slots = ev.get_time_slots("2026-03-02", &range);
        assert_eq!(slots.len(), 2);
        assert_eq!(slots[0].start_time, "09:00");
        assert_eq!(slots[0].end_time, Some("10:00".to_string()));
        assert_eq!(slots[1].start_time, "14:00");
        assert_eq!(slots[1].end_time, Some("15:00".to_string()));
    }

    #[test]
    fn test_time_slots_window() {
        let ev = evaluator();
        let range = make_range(
            "1",
            "test",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Window {
                start_time: "09:00".to_string(),
                end_time: Some("17:00".to_string()),
                repeat_every: None,
                duration: None,
            }),
        );
        let slots = ev.get_time_slots("2026-03-02", &range);
        assert_eq!(slots.len(), 1);
        assert_eq!(slots[0].start_time, "09:00");
        assert_eq!(slots[0].end_time, Some("17:00".to_string()));
        assert_eq!(slots[0].duration, Some(480));
    }

    #[test]
    fn test_time_slots_repeat_every() {
        let ev = evaluator();
        let range = make_range(
            "1",
            "test",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Window {
                start_time: "09:00".to_string(),
                end_time: Some("11:00".to_string()),
                repeat_every: Some(60),
                duration: Some(30),
            }),
        );
        let slots = ev.get_time_slots("2026-03-02", &range);
        assert_eq!(slots.len(), 2);
        assert_eq!(slots[0].start_time, "09:00");
        assert_eq!(slots[0].end_time, Some("09:30".to_string()));
        assert_eq!(slots[1].start_time, "10:00");
        assert_eq!(slots[1].end_time, Some("10:30".to_string()));
    }

    #[test]
    fn test_time_slots_repeat_every_zero_returns_empty() {
        let ev = evaluator();
        let range = make_range(
            "1",
            "test",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Window {
                start_time: "09:00".to_string(),
                end_time: Some("10:00".to_string()),
                repeat_every: Some(0),
                duration: Some(15),
            }),
        );
        assert!(ev.get_time_slots("2026-03-02", &range).is_empty());
    }

    #[test]
    fn test_time_slots_reversed_window_does_not_underflow() {
        let ev = evaluator();
        let range = make_range(
            "1",
            "test",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Window {
                start_time: "10:00".to_string(),
                end_time: Some("09:00".to_string()),
                repeat_every: None,
                duration: None,
            }),
        );
        let slots = ev.get_time_slots("2026-03-02", &range);
        assert_eq!(slots[0].duration, None);
    }

    #[test]
    fn test_time_slots_window_duration_only() {
        let ev = evaluator();
        let range = make_range(
            "1",
            "test",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Window {
                start_time: "09:00".to_string(),
                end_time: None,
                repeat_every: None,
                duration: Some(90),
            }),
        );
        let slots = ev.get_time_slots("2026-03-02", &range);
        assert_eq!(slots.len(), 1);
        assert_eq!(slots[0].start_time, "09:00");
        assert_eq!(slots[0].end_time, Some("10:30".to_string()));
        assert_eq!(slots[0].duration, Some(90));
    }

    #[test]
    fn test_time_slots_no_time_selector() {
        let ev = evaluator();
        let range = make_range(
            "1",
            "test",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            None,
        );
        let slots = ev.get_time_slots("2026-03-02", &range);
        assert!(slots.is_empty());
    }

    // ── expand ──────────────────────────────────────────────────────────

    #[test]
    fn test_expand_all_day() {
        let ev = evaluator();
        let range = make_range(
            "1",
            "test",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02"), day("2026-03-03")],
                except_dates: None,
                except_between: None,
            },
            None,
        );
        let from = parse_date("2026-03-01").unwrap();
        let to = parse_date("2026-03-31").unwrap();
        let occurrences = ev.expand(&range, from, to);
        assert_eq!(occurrences.len(), 2);
        assert!(occurrences[0].all_day);
        assert_eq!(occurrences[0].date, "2026-03-02");
        assert_eq!(occurrences[1].date, "2026-03-03");
    }

    #[test]
    fn test_expand_explicit_dates_respects_exclusions() {
        let ev = evaluator();
        let range = make_range(
            "1",
            "test",
            DaySelector::Explicit {
                dates: vec![day("2026-03-01"), day("2026-03-02"), day("2026-03-03")],
                except_dates: Some(vec![day("2026-03-02")]),
                except_between: None,
            },
            None,
        );
        let occurrences = ev.expand(
            &range,
            parse_date("2026-03-01").unwrap(),
            parse_date("2026-03-03").unwrap(),
        );
        let dates: Vec<&str> = occurrences.iter().map(|occ| occ.date.as_str()).collect();
        assert_eq!(dates, vec!["2026-03-01", "2026-03-03"]);
    }

    #[test]
    fn test_expand_with_time_slots() {
        let ev = evaluator();
        let range = make_range(
            "1",
            "test",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Hours {
                every_hour: vec![9, 10],
                duration: Some(30),
            }),
        );
        let from = parse_date("2026-03-01").unwrap();
        let to = parse_date("2026-03-31").unwrap();
        let occurrences = ev.expand(&range, from, to);
        assert_eq!(occurrences.len(), 2);
        assert!(!occurrences[0].all_day);
        assert_eq!(occurrences[0].start_time, Some("09:00".to_string()));
        assert_eq!(occurrences[1].start_time, Some("10:00".to_string()));
    }

    #[test]
    fn test_expand_day() {
        let ev = evaluator();
        let range = make_range(
            "1",
            "test",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Hours {
                every_hour: vec![9],
                duration: Some(30),
            }),
        );
        let slots = ev.expand_day(&range, "2026-03-02");
        assert_eq!(slots.len(), 1);

        let slots = ev.expand_day(&range, "2026-03-03");
        assert!(slots.is_empty());
    }

    // ── get_timed_entries_for_day ───────────────────────────────────────

    #[test]
    fn test_timed_entries_basic() {
        let ev = evaluator();
        let range = make_range(
            "1",
            "test",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Window {
                start_time: "09:00".to_string(),
                end_time: Some("10:00".to_string()),
                repeat_every: None,
                duration: None,
            }),
        );
        let entries = ev.get_timed_entries_for_day(&[range], "2026-03-02");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].start_minutes, 540); // 09:00
        assert_eq!(entries[0].end_minutes, 600); // 10:00
    }

    #[test]
    fn test_timed_entries_sorted() {
        let ev = evaluator();
        let range1 = make_range(
            "1",
            "a",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Window {
                start_time: "10:00".to_string(),
                end_time: Some("11:00".to_string()),
                repeat_every: None,
                duration: None,
            }),
        );
        let range2 = make_range(
            "2",
            "b",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Window {
                start_time: "09:00".to_string(),
                end_time: Some("09:30".to_string()),
                repeat_every: None,
                duration: None,
            }),
        );
        let entries = ev.get_timed_entries_for_day(&[range1, range2], "2026-03-02");
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].start_minutes, 540); // 09:00
        assert_eq!(entries[1].start_minutes, 600); // 10:00
    }

    #[test]
    fn test_timed_entries_skip_all_day() {
        let ev = evaluator();
        let range = make_range(
            "1",
            "test",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            None, // no time selector => all-day
        );
        let entries = ev.get_timed_entries_for_day(&[range], "2026-03-02");
        assert!(entries.is_empty());
    }

    // ── find_conflicts ──────────────────────────────────────────────────

    #[test]
    fn test_no_conflicts_no_overlap() {
        let ev = evaluator();
        let range1 = make_range(
            "1",
            "A",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Window {
                start_time: "09:00".to_string(),
                end_time: Some("10:00".to_string()),
                repeat_every: None,
                duration: None,
            }),
        );
        let range2 = make_range(
            "2",
            "B",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Window {
                start_time: "10:00".to_string(),
                end_time: Some("11:00".to_string()),
                repeat_every: None,
                duration: None,
            }),
        );
        let conflicts = ev.find_conflicts(&[range1, range2], "2026-03-02");
        assert!(conflicts.is_empty());
    }

    #[test]
    fn test_conflicts_overlap() {
        let ev = evaluator();
        let range1 = make_range(
            "1",
            "A",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Window {
                start_time: "09:00".to_string(),
                end_time: Some("11:00".to_string()),
                repeat_every: None,
                duration: None,
            }),
        );
        let range2 = make_range(
            "2",
            "B",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Window {
                start_time: "10:00".to_string(),
                end_time: Some("12:00".to_string()),
                repeat_every: None,
                duration: None,
            }),
        );
        let conflicts = ev.find_conflicts(&[range1, range2], "2026-03-02");
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].overlap_start, Some("10:00".to_string()));
        assert_eq!(conflicts[0].overlap_end, Some("11:00".to_string()));
    }

    #[test]
    fn test_conflicts_same_range_not_conflict() {
        let ev = evaluator();
        let range = make_range(
            "1",
            "A",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Hours {
                every_hour: vec![9, 10],
                duration: Some(90),
            }),
        );
        let conflicts = ev.find_conflicts(&[range], "2026-03-02");
        assert!(conflicts.is_empty());
    }

    #[test]
    fn test_conflicts_zero_length_excluded() {
        let ev = evaluator();
        let range1 = make_range(
            "1",
            "A",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Window {
                start_time: "09:00".to_string(),
                end_time: Some("09:00".to_string()), // zero length
                repeat_every: None,
                duration: None,
            }),
        );
        let range2 = make_range(
            "2",
            "B",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Window {
                start_time: "09:00".to_string(),
                end_time: Some("10:00".to_string()),
                repeat_every: None,
                duration: None,
            }),
        );
        let conflicts = ev.find_conflicts(&[range1, range2], "2026-03-02");
        assert!(conflicts.is_empty());
    }

    // ── find_conflicts_in_window ────────────────────────────────────────

    #[test]
    fn test_conflicts_in_window() {
        let ev = evaluator();
        let range1 = make_range(
            "1",
            "A",
            DaySelector::Recurrence {
                every_weekday: Some(vec![1]), // Monday
                every_date: None,
                every_month: None,
                from_date: Some(day("2026-03-01")),
                to_date: Some(day("2026-03-31")),
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Window {
                start_time: "09:00".to_string(),
                end_time: Some("11:00".to_string()),
                repeat_every: None,
                duration: None,
            }),
        );
        let range2 = make_range(
            "2",
            "B",
            DaySelector::Recurrence {
                every_weekday: Some(vec![1]), // Monday
                every_date: None,
                every_month: None,
                from_date: Some(day("2026-03-01")),
                to_date: Some(day("2026-03-31")),
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Window {
                start_time: "10:00".to_string(),
                end_time: Some("12:00".to_string()),
                repeat_every: None,
                duration: None,
            }),
        );
        let from = parse_date("2026-03-01").unwrap();
        let to = parse_date("2026-03-31").unwrap();
        let conflicts = ev.find_conflicts_in_window(&[range1, range2], from, to);
        assert!(!conflicts.is_empty());
        for c in &conflicts {
            assert_eq!(c.overlap_start, Some("10:00".to_string()));
            assert_eq!(c.overlap_end, Some("11:00".to_string()));
        }
    }

    // ── find_free_slots ─────────────────────────────────────────────────

    #[test]
    fn test_free_slots_basic() {
        let ev = evaluator();
        let range = make_range(
            "1",
            "busy",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Window {
                start_time: "10:00".to_string(),
                end_time: Some("12:00".to_string()),
                repeat_every: None,
                duration: None,
            }),
        );
        let free = ev.find_free_slots(&[range], "2026-03-02", FindFreeSlotsOptions::default());
        assert!(!free.is_empty());
        // Should have a free slot before 10:00
        let morning = free.iter().find(|s| s.start_time == "00:00");
        assert!(morning.is_some());
        // And after 12:00
        let afternoon = free.iter().find(|s| s.start_time == "12:00");
        assert!(afternoon.is_some());
    }

    #[test]
    fn test_free_slots_min_duration() {
        let ev = evaluator();
        let range = make_range(
            "1",
            "busy",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Window {
                start_time: "09:00".to_string(),
                end_time: Some("09:30".to_string()),
                repeat_every: None,
                duration: None,
            }),
        );
        let free = ev.find_free_slots(
            &[range],
            "2026-03-02",
            FindFreeSlotsOptions {
                min_duration: Some(1380), // 23 hours
                ..Default::default()
            },
        );
        // The gap from 09:30 to 24:00 is 870 min, plus 00:00-09:00 is 540.
        // Neither individually is >= 1380.
        // But they become one gap when we merge? No — occupied from 09:00-09:30.
        // Before: 00:00-09:00 (540 min), After: 09:30-24:00 (870 min).
        // Neither >= 1380, so no free slots.
        assert!(free.is_empty());
    }

    #[test]
    fn test_free_slots_day_start_end() {
        let ev = evaluator();
        let range = make_range(
            "1",
            "busy",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Window {
                start_time: "09:00".to_string(),
                end_time: Some("17:00".to_string()),
                repeat_every: None,
                duration: None,
            }),
        );
        let free = ev.find_free_slots(
            &[range],
            "2026-03-02",
            FindFreeSlotsOptions {
                day_start: Some("08:00".to_string()),
                day_end: Some("18:00".to_string()),
                ..Default::default()
            },
        );
        let before = free.iter().find(|s| s.start_time == "08:00");
        assert!(before.is_some());
        assert_eq!(before.unwrap().end_time, "09:00");

        let after = free.iter().find(|s| s.start_time == "17:00");
        assert!(after.is_some());
        assert_eq!(after.unwrap().end_time, "18:00");
    }

    #[test]
    fn test_free_slots_merge_overlapping() {
        let ev = evaluator();
        let range1 = make_range(
            "1",
            "A",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Window {
                start_time: "09:00".to_string(),
                end_time: Some("10:00".to_string()),
                repeat_every: None,
                duration: None,
            }),
        );
        let range2 = make_range(
            "2",
            "B",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Window {
                start_time: "09:30".to_string(),
                end_time: Some("11:00".to_string()),
                repeat_every: None,
                duration: None,
            }),
        );
        let free = ev.find_free_slots(
            &[range1, range2],
            "2026-03-02",
            FindFreeSlotsOptions::default(),
        );
        // The two overlapping slots should be merged into one occupied block 09:00-11:00
        let gap = free.iter().find(|s| s.start_time == "00:00");
        assert!(gap.is_some());
        assert_eq!(gap.unwrap().end_time, "09:00");

        let after = free.iter().find(|s| s.start_time == "11:00");
        assert!(after.is_some());
    }

    // ── find_next_free_slot ─────────────────────────────────────────────

    #[test]
    fn test_find_next_free_slot_finds_first() {
        let ev = evaluator();
        let range = make_range(
            "1",
            "busy",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Window {
                start_time: "09:00".to_string(),
                end_time: Some("17:00".to_string()),
                repeat_every: None,
                duration: None,
            }),
        );
        let from = parse_date("2026-03-01").unwrap();
        let to = parse_date("2026-03-05").unwrap();
        let slot = ev.find_next_free_slot(&[range], from, to, 60, FindFreeSlotsOptions::default());
        assert!(slot.is_some());
        let s = slot.unwrap();
        // Should find a free slot on 2026-03-01 (no busy range) or early on 2026-03-02
        assert!(s.date <= "2026-03-02".to_string());
        assert!(s.duration >= 60);
    }

    #[test]
    fn test_find_next_free_slot_no_room() {
        let ev = evaluator();
        let all_day = make_range(
            "1",
            "busy",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Window {
                start_time: "00:00".to_string(),
                end_time: Some("24:00".to_string()),
                repeat_every: None,
                duration: None,
            }),
        );
        let from = parse_date("2026-03-02").unwrap();
        let to = parse_date("2026-03-02").unwrap();
        let slot =
            ev.find_next_free_slot(&[all_day], from, to, 15, FindFreeSlotsOptions::default());
        assert!(slot.is_none());
    }

    // ── compute_spans ───────────────────────────────────────────────────

    #[test]
    fn test_compute_spans_basic() {
        let ev = evaluator();
        let range = make_range(
            "1",
            "test",
            DaySelector::Recurrence {
                every_weekday: Some(vec![1, 2, 3, 4, 5]), // Mon-Fri
                every_date: None,
                every_month: None,
                from_date: Some(day("2026-03-02")),
                to_date: Some(day("2026-03-13")),
                except_dates: None,
                except_between: None,
            },
            None,
        );
        let from = parse_date("2026-03-01").unwrap();
        let to = parse_date("2026-03-31").unwrap();
        let spans = ev.compute_spans(&[range], from, to);
        assert_eq!(spans.len(), 2); // Two work-weeks separated by weekend
        assert_eq!(spans[0].start_date, "2026-03-02"); // Monday
        assert_eq!(spans[0].end_date, "2026-03-06"); // Friday
        assert_eq!(spans[1].start_date, "2026-03-09"); // Monday
        assert_eq!(spans[1].end_date, "2026-03-13"); // Friday
    }

    #[test]
    fn test_compute_spans_overlapping_ranges() {
        let ev = evaluator();
        let range1 = make_range(
            "1",
            "A",
            DaySelector::Recurrence {
                every_weekday: Some(vec![1, 2, 3, 4, 5]),
                every_date: None,
                every_month: None,
                from_date: Some(day("2026-03-02")),
                to_date: Some(day("2026-03-13")),
                except_dates: None,
                except_between: None,
            },
            None,
        );
        let range2 = make_range(
            "2",
            "B",
            DaySelector::Recurrence {
                every_weekday: Some(vec![1, 2, 3, 4, 5]),
                every_date: None,
                every_month: None,
                from_date: Some(day("2026-03-02")),
                to_date: Some(day("2026-03-06")),
                except_dates: None,
                except_between: None,
            },
            None,
        );
        let from = parse_date("2026-03-01").unwrap();
        let to = parse_date("2026-03-31").unwrap();
        let spans = ev.compute_spans(&[range1, range2], from, to);
        // 3 spans total: range2(week1), range1(week1), range1(week2)
        assert_eq!(spans.len(), 3);
        // range1 and range2 overlap in week1, so they get different lanes
        let span_a = spans
            .iter()
            .find(|s| s.range_id == "1" && s.start_date == "2026-03-02");
        let span_b = spans.iter().find(|s| s.range_id == "2");
        assert!(span_a.is_some());
        assert!(span_b.is_some());
        assert_ne!(span_a.unwrap().lane, span_b.unwrap().lane);
    }

    #[test]
    fn test_compute_spans_max_overlap() {
        let ev = evaluator();
        // Three ranges all active the same week
        let r1 = make_range(
            "1",
            "A",
            DaySelector::Recurrence {
                every_weekday: Some(vec![1, 2, 3, 4, 5]),
                every_date: None,
                every_month: None,
                from_date: Some(day("2026-03-02")),
                to_date: Some(day("2026-03-06")),
                except_dates: None,
                except_between: None,
            },
            None,
        );
        let r2 = make_range(
            "2",
            "B",
            DaySelector::Recurrence {
                every_weekday: Some(vec![1, 2, 3, 4, 5]),
                every_date: None,
                every_month: None,
                from_date: Some(day("2026-03-02")),
                to_date: Some(day("2026-03-06")),
                except_dates: None,
                except_between: None,
            },
            None,
        );
        let r3 = make_range(
            "3",
            "C",
            DaySelector::Recurrence {
                every_weekday: Some(vec![1, 2, 3, 4, 5]),
                every_date: None,
                every_month: None,
                from_date: Some(day("2026-03-02")),
                to_date: Some(day("2026-03-04")),
                except_dates: None,
                except_between: None,
            },
            None,
        );
        let from = parse_date("2026-03-01").unwrap();
        let to = parse_date("2026-03-31").unwrap();
        let spans = ev.compute_spans(&[r1, r2, r3], from, to);
        // max_overlap for the 2-day span (r3) should be 3
        let short_span = spans.iter().find(|s| s.range_id == "3").unwrap();
        assert_eq!(short_span.max_overlap, 3);
        assert_eq!(short_span.total_lanes, 3);
    }

    #[test]
    fn test_compute_spans_empty() {
        let ev = evaluator();
        let range = make_range(
            "1",
            "test",
            DaySelector::Explicit {
                dates: vec![day("2026-03-02")],
                except_dates: None,
                except_between: None,
            },
            None,
        );
        let from = parse_date("2026-04-01").unwrap();
        let to = parse_date("2026-04-30").unwrap();
        let spans = ev.compute_spans(&[range], from, to);
        assert!(spans.is_empty());
    }

    // ── Timezone resolve_time ───────────────────────────────────────────

    #[test]
    fn test_resolve_time_no_range_tz_returns_unchanged() {
        let ev = evaluator();
        let result = ev.resolve_time("2026-03-02", "09:00", None);
        assert_eq!(result, Some("09:00".to_string()));
    }

    #[test]
    fn test_resolve_time_same_tz() {
        let ev = RangeEvaluator::new(Some("America/New_York")).unwrap();
        let result = ev.resolve_time("2026-03-02", "09:00", Some("America/New_York"));
        assert_eq!(result, Some("09:00".to_string()));
    }

    #[test]
    fn test_resolve_time_different_tz() {
        // ET is UTC-5 in March (before DST starts on Mar 8, 2026)
        let ev = RangeEvaluator::new(Some("America/New_York")).unwrap();
        let result = ev.resolve_time("2026-03-02", "12:00", Some("UTC"));
        assert_eq!(result, Some("07:00".to_string()));
    }

    #[test]
    fn test_resolve_time_spring_forward_gap() {
        // DST spring-forward in New York: 2026-03-08 at 2:00 AM (clocks jump to 3:00)
        // 2:30 AM doesn't exist
        let ev = RangeEvaluator::new(Some("America/New_York")).unwrap();
        let result = ev.resolve_time("2026-03-08", "02:30", Some("America/New_York"));
        assert!(result.is_none());
    }

    #[test]
    fn test_resolve_time_fall_back_ambiguous() {
        // DST fall-back in New York: 2026-11-01 at 2:00 AM (clocks fall back to 1:00)
        // 1:30 AM exists twice — we take earliest
        let ev = RangeEvaluator::new(Some("America/New_York")).unwrap();
        let result = ev.resolve_time("2026-11-01", "01:30", Some("America/New_York"));
        assert!(result.is_some());
    }

    #[test]
    fn test_resolve_time_utc_to_eastern_daylight() {
        // July: Eastern is UTC-4 (UTC 14:00 = 10:00 Eastern)
        let ev = RangeEvaluator::new(Some("America/New_York")).unwrap();
        let result = ev.resolve_time("2026-07-01", "14:00", Some("UTC"));
        assert_eq!(result, Some("10:00".to_string()));
    }
}
