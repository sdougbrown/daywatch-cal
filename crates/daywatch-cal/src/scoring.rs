use chrono::NaiveDate;

use crate::evaluator::{RangeEvaluator, TimedEntry};
use crate::time::{date_range, format_date, parse_hhmm};
use crate::types::{DateRange, ScheduleScore, ScoreScheduleOptions};

fn merge_intervals(
    entries: &[TimedEntry],
    day_start_min: u32,
    day_end_min: u32,
) -> Vec<(u32, u32)> {
    let mut intervals: Vec<(u32, u32)> = Vec::new();
    for entry in entries {
        let start = entry.start_minutes;
        let end = entry.end_minutes;
        if end <= start {
            continue;
        }
        let clipped_start = u32::max(start, day_start_min);
        let clipped_end = u32::min(end, day_end_min);
        if clipped_start < clipped_end {
            intervals.push((clipped_start, clipped_end));
        }
    }
    if intervals.is_empty() {
        return vec![];
    }
    intervals.sort_by_key(|a| a.0);
    let mut merged: Vec<(u32, u32)> = vec![intervals[0]];
    for interval in intervals.iter().skip(1) {
        let last = merged.last_mut().unwrap();
        if interval.0 <= last.1 {
            last.1 = u32::max(last.1, interval.1);
        } else {
            merged.push(*interval);
        }
    }
    merged
}

fn compute_gaps(merged: &[(u32, u32)], day_start_min: u32, day_end_min: u32) -> Vec<(u32, u32)> {
    let mut gaps: Vec<(u32, u32)> = Vec::new();
    let mut cursor = day_start_min;
    for &(s, e) in merged {
        if s > cursor {
            gaps.push((cursor, s));
        }
        cursor = u32::max(cursor, e);
    }
    if cursor < day_end_min {
        gaps.push((cursor, day_end_min));
    }
    gaps
}

pub fn score_schedule(
    evaluator: &RangeEvaluator,
    ranges: &[DateRange],
    from: NaiveDate,
    to: NaiveDate,
    options: ScoreScheduleOptions,
) -> ScheduleScore {
    let focus_block_minutes = options.focus_block_minutes.unwrap_or(60);
    let day_start = options.day_start.as_deref().unwrap_or("09:00");
    let day_end = options.day_end.as_deref().unwrap_or("17:00");
    let day_start_min = match parse_hhmm(day_start) {
        Some((hour, minute)) => hour * 60 + minute,
        None => return ScheduleScore::default(),
    };
    let day_end_min = match parse_hhmm(day_end) {
        Some((hour, minute)) => hour * 60 + minute,
        None => return ScheduleScore::default(),
    };

    let days = date_range(from, to);

    let mut total_conflicts: u32 = 0;
    let mut total_free_minutes: u32 = 0;
    let mut total_focus_blocks: u32 = 0;
    let mut total_context_switches: u32 = 0;
    let mut conflict_days: u32 = 0;

    for &day in &days {
        let date_str = format_date(day);
        let timed_entries = evaluator.get_timed_entries_for_day(ranges, &date_str);

        // Context switches
        let mut switches: u32 = 0;
        let mut last_range_id: Option<&str> = None;
        for entry in &timed_entries {
            if let Some(last) = last_range_id {
                if entry.slot.range_id != last {
                    switches += 1;
                }
            }
            last_range_id = Some(&entry.slot.range_id);
        }
        total_context_switches += switches;

        // Conflicts
        let mut day_has_conflict = false;
        for (i, entry_a) in timed_entries.iter().enumerate() {
            let end_a = entry_a.end_minutes;
            if end_a <= entry_a.start_minutes {
                continue;
            }
            for entry_b in timed_entries.iter().skip(i + 1) {
                let start_b = entry_b.start_minutes;
                let end_b = entry_b.end_minutes;
                if end_b <= start_b {
                    continue;
                }
                if start_b < end_a {
                    total_conflicts += 1;
                    day_has_conflict = true;
                }
            }
        }
        if day_has_conflict {
            conflict_days += 1;
        }

        // Free time
        let occupied = merge_intervals(&timed_entries, day_start_min, day_end_min);
        let working_minutes = day_end_min - day_start_min;
        let occupied_minutes: u32 = occupied.iter().map(|(s, e)| e - s).sum();
        let free_minutes = working_minutes - occupied_minutes;
        total_free_minutes += free_minutes;

        // Focus blocks
        let gaps = compute_gaps(&occupied, day_start_min, day_end_min);
        for &(s, e) in &gaps {
            if e - s >= focus_block_minutes {
                total_focus_blocks += 1;
            }
        }
    }

    let avg_context_switches = if days.is_empty() {
        0.0
    } else {
        total_context_switches as f64 / days.len() as f64
    };

    ScheduleScore {
        conflicts: total_conflicts,
        free_minutes: total_free_minutes,
        focus_blocks: total_focus_blocks,
        avg_context_switches,
        conflict_days,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::time::parse_date;
    use crate::types::{DaySelector, TimeSelector};
    use chrono::NaiveDate;

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

    fn evaluator() -> RangeEvaluator {
        RangeEvaluator::new(None).unwrap()
    }

    fn day_str(y: i32, m: u32, d: u32) -> String {
        format_date(NaiveDate::from_ymd_opt(y, m, d).unwrap())
    }

    #[test]
    fn test_score_schedule_empty() {
        let ev = evaluator();
        let from = parse_date("2026-03-01").unwrap();
        let to = parse_date("2026-03-03").unwrap();
        let score = score_schedule(&ev, &[], from, to, ScoreScheduleOptions::default());
        assert_eq!(score.conflicts, 0);
        assert_eq!(score.free_minutes, 8 * 60 * 3); // 3 days × 8 hours
        assert_eq!(score.focus_blocks, 3); // 3 days × 1 focus block (8h gap)
        assert_eq!(score.conflict_days, 0);
        assert_eq!(score.avg_context_switches, 0.0);
    }

    #[test]
    fn test_score_schedule_no_conflicts() {
        let ev = evaluator();
        let r1 = make_range(
            "1",
            "Morning",
            DaySelector::Explicit {
                dates: vec![day_str(2026, 3, 10)],
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
        let r2 = make_range(
            "2",
            "Afternoon",
            DaySelector::Explicit {
                dates: vec![day_str(2026, 3, 10)],
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Window {
                start_time: "13:00".to_string(),
                end_time: Some("15:00".to_string()),
                repeat_every: None,
                duration: None,
            }),
        );
        let from = parse_date("2026-03-10").unwrap();
        let to = parse_date("2026-03-10").unwrap();
        let score = score_schedule(
            &ev,
            &[r1, r2],
            from,
            to,
            ScoreScheduleOptions {
                focus_block_minutes: Some(60),
                day_start: Some("09:00".to_string()),
                day_end: Some("17:00".to_string()),
            },
        );
        // 2 blocks of 2h each = 4h occupied → 4h free
        assert_eq!(score.free_minutes, 4 * 60);
        // two gaps: 2h and 4h → 2 focus blocks
        assert_eq!(score.focus_blocks, 2);
        assert_eq!(score.conflicts, 0);
    }

    #[test]
    fn test_score_schedule_with_conflicts() {
        let ev = evaluator();
        let r1 = make_range(
            "1",
            "Meeting A",
            DaySelector::Explicit {
                dates: vec![day_str(2026, 3, 12)],
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
        let r2 = make_range(
            "2",
            "Meeting B",
            DaySelector::Explicit {
                dates: vec![day_str(2026, 3, 12)],
                except_dates: None,
                except_between: None,
            },
            Some(TimeSelector::Window {
                start_time: "11:00".to_string(),
                end_time: Some("13:00".to_string()),
                repeat_every: None,
                duration: None,
            }),
        );
        let from = parse_date("2026-03-12").unwrap();
        let to = parse_date("2026-03-12").unwrap();
        let score = score_schedule(&ev, &[r1, r2], from, to, ScoreScheduleOptions::default());
        assert_eq!(score.conflicts, 1);
        // occupied: 10-13 merged → 3h → 5h free
        assert_eq!(score.free_minutes, 5 * 60);
        assert_eq!(score.conflict_days, 1);
    }
}
