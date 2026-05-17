use daywatch_cal::{
    score_schedule, DateRange, FindFreeSlotsOptions, RangeEvaluator, ScoreScheduleOptions,
};
use serde::Deserialize;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct IsDateInRangeAssertion {
    date: String,
    expected: bool,
    #[serde(default)]
    #[serde(rename = "rangeId")]
    range_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
struct ExpandAssertion {
    from: String,
    to: String,
    expected_dates: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
struct TimeSlotExpected {
    start_time: String,
    #[serde(default)]
    end_time: Option<String>,
    #[serde(default)]
    duration: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct TimeSlotsAssertion {
    date: String,
    expected: Vec<TimeSlotExpected>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RangeRefExpected {
    id: String,
    label: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
struct ConflictExpected {
    range_a: RangeRefExpected,
    range_b: RangeRefExpected,
    date: String,
    #[serde(default)]
    overlap_start: Option<String>,
    #[serde(default)]
    overlap_end: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ConflictAssertion {
    date: String,
    expected: Vec<ConflictExpected>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
struct FreeSlotExpected {
    date: String,
    start_time: String,
    end_time: String,
    duration: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
struct FreeSlotOptions {
    #[serde(default)]
    day_start: Option<String>,
    #[serde(default)]
    day_end: Option<String>,
    #[serde(default)]
    min_duration: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct FreeSlotAssertion {
    date: String,
    options: FreeSlotOptions,
    expected: Vec<FreeSlotExpected>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
struct ScoreScheduleExpected {
    conflicts: u32,
    free_minutes: u32,
    focus_blocks: u32,
    avg_context_switches: f64,
    conflict_days: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
struct ScoreScheduleOptionsFixture {
    #[serde(default)]
    focus_block_minutes: Option<u32>,
    #[serde(default)]
    day_start: Option<String>,
    #[serde(default)]
    day_end: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ScoreScheduleAssertion {
    from: String,
    to: String,
    options: ScoreScheduleOptionsFixture,
    expected: ScoreScheduleExpected,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
struct Fixture {
    #[allow(dead_code)]
    description: String,
    #[serde(default)]
    user_timezone: Option<String>,
    range: Option<DateRange>,
    ranges: Option<Vec<DateRange>>,
    #[serde(default)]
    #[serde(rename = "isDateInRange")]
    is_date_in_range: Option<Vec<IsDateInRangeAssertion>>,
    #[serde(default)]
    expand: Option<Vec<ExpandAssertion>>,
    #[serde(default)]
    #[serde(rename = "timeSlots")]
    time_slots: Option<Vec<TimeSlotsAssertion>>,
    #[serde(default)]
    #[serde(rename = "findConflicts")]
    find_conflicts: Option<Vec<ConflictAssertion>>,
    #[serde(default)]
    #[serde(rename = "findFreeSlots")]
    find_free_slots: Option<Vec<FreeSlotAssertion>>,
    #[serde(default)]
    #[serde(rename = "scoreSchedule")]
    score_schedule: Option<Vec<ScoreScheduleAssertion>>,
}

fn run_fixture_file(path: &Path) {
    let content = fs::read_to_string(path).unwrap_or_else(|e| {
        panic!("Failed to read fixture {:?}: {}", path, e);
    });

    let fixture: Fixture = serde_json::from_str(&content).unwrap_or_else(|e| {
        panic!("Failed to parse fixture {:?}: {}", path, e);
    });

    let tz_arg = fixture.user_timezone.as_deref();
    let evaluator = RangeEvaluator::new(tz_arg).unwrap_or_else(|e| {
        panic!(
            "Failed to create evaluator for {:?} with tz {:?}: {}",
            path, fixture.user_timezone, e
        );
    });

    let file_stem = path.file_stem().unwrap().to_string_lossy();

    let mut test_count: usize = 0;

    if let Some(ref assertions) = fixture.is_date_in_range {
        if let Some(ref range) = fixture.range {
            for a in assertions {
                let context = format!(
                    "{}: is_date_in_range({}, {:?})",
                    file_stem, a.date, range.id
                );
                assert_eq!(
                    evaluator.is_date_in_range(&a.date, range),
                    a.expected,
                    "{}",
                    context
                );
                test_count += 1;
            }
        } else if let Some(ref ranges) = fixture.ranges {
            let range_map: HashMap<&str, &DateRange> =
                ranges.iter().map(|r| (r.id.as_str(), r)).collect();

            for a in assertions {
                let range_id = a.range_id.as_deref().unwrap_or_else(|| {
                    panic!("range_id required in multi-range fixture for is_date_in_range")
                });
                let range = range_map
                    .get(range_id)
                    .unwrap_or_else(|| panic!("Range id '{}' not found in fixture", range_id));

                let context = format!("{}: is_date_in_range({}, {})", file_stem, a.date, range_id);
                assert_eq!(
                    evaluator.is_date_in_range(&a.date, range),
                    a.expected,
                    "{}",
                    context
                );
                test_count += 1;
            }
        }
    }

    if let Some(ref expand_cases) = fixture.expand {
        let range = fixture
            .range
            .as_ref()
            .expect("expand requires a single range fixture");

        for case in expand_cases {
            let from_date = chrono::NaiveDate::parse_from_str(&case.from, "%Y-%m-%d")
                .unwrap_or_else(|e| panic!("Invalid from date '{}': {}", case.from, e));
            let to_date = chrono::NaiveDate::parse_from_str(&case.to, "%Y-%m-%d")
                .unwrap_or_else(|e| panic!("Invalid to date '{}': {}", case.to, e));

            let occurrences = evaluator.expand(range, from_date, to_date);
            let actual_dates: Vec<String> = occurrences.iter().map(|o| o.date.clone()).collect();

            let context = format!("{}: expand({:?} to {:?})", file_stem, case.from, case.to);
            assert_eq!(actual_dates, case.expected_dates, "{}", context);

            for occ in &occurrences {
                assert_eq!(occ.range_id, range.id, "{}: occurrence.range_id", file_stem);
                assert_eq!(occ.label, range.label, "{}: occurrence.label", file_stem);
                if range.time_selector.is_some() {
                    assert!(
                        !occ.all_day,
                        "{}: occurrence.all_day should be false with time_selector",
                        file_stem
                    );
                } else {
                    assert!(
                        occ.all_day,
                        "{}: occurrence.all_day should be true without time_selector",
                        file_stem
                    );
                }
            }

            test_count += 1;
        }
    }

    if let Some(ref time_slots_cases) = fixture.time_slots {
        let range = fixture
            .range
            .as_ref()
            .expect("time_slots requires a single range fixture");

        for case in time_slots_cases {
            let slots = evaluator.get_time_slots(&case.date, range);

            let context = format!("{}: get_time_slots({}, {})", file_stem, case.date, range.id);

            assert_eq!(
                slots.len(),
                case.expected.len(),
                "{} — slot count mismatch. Got {} slots: {:?}",
                context,
                slots.len(),
                slots
            );

            for (i, (actual, expected)) in slots.iter().zip(case.expected.iter()).enumerate() {
                assert_eq!(
                    actual.start_time, expected.start_time,
                    "{} — slot[{}].start_time",
                    context, i
                );
                assert_eq!(
                    actual.end_time, expected.end_time,
                    "{} — slot[{}].end_time",
                    context, i
                );
                assert_eq!(
                    actual.duration, expected.duration,
                    "{} — slot[{}].duration",
                    context, i
                );
                assert_eq!(
                    actual.range_id, range.id,
                    "{} — slot[{}].range_id",
                    context, i
                );
                assert_eq!(actual.label, range.label, "{} — slot[{}].label", context, i);
            }
            test_count += 1;
        }
    }

    if let Some(ref conflict_cases) = fixture.find_conflicts {
        let ranges = fixture
            .ranges
            .as_ref()
            .expect("find_conflicts requires a multi-range fixture");

        for case in conflict_cases {
            let conflicts = evaluator.find_conflicts(ranges, &case.date);
            assert_eq!(
                conflicts.len(),
                case.expected.len(),
                "{}: find_conflicts({}) — conflict count mismatch. Got: {:?}",
                file_stem,
                case.date,
                conflicts
            );

            for (i, (actual, expected)) in conflicts.iter().zip(case.expected.iter()).enumerate() {
                assert_eq!(
                    actual.range_a.id, expected.range_a.id,
                    "{} — conflict[{}].range_a.id",
                    file_stem, i
                );
                assert_eq!(
                    actual.range_a.label, expected.range_a.label,
                    "{} — conflict[{}].range_a.label",
                    file_stem, i
                );
                assert_eq!(
                    actual.range_b.id, expected.range_b.id,
                    "{} — conflict[{}].range_b.id",
                    file_stem, i
                );
                assert_eq!(
                    actual.range_b.label, expected.range_b.label,
                    "{} — conflict[{}].range_b.label",
                    file_stem, i
                );
                assert_eq!(
                    actual.date, expected.date,
                    "{} — conflict[{}].date",
                    file_stem, i
                );
                assert_eq!(
                    actual.overlap_start, expected.overlap_start,
                    "{} — conflict[{}].overlap_start",
                    file_stem, i
                );
                assert_eq!(
                    actual.overlap_end, expected.overlap_end,
                    "{} — conflict[{}].overlap_end",
                    file_stem, i
                );
            }
            test_count += 1;
        }
    }

    if let Some(ref free_slot_cases) = fixture.find_free_slots {
        let ranges = fixture
            .ranges
            .as_ref()
            .expect("find_free_slots requires a multi-range fixture");

        for case in free_slot_cases {
            let options = FindFreeSlotsOptions {
                min_duration: case.options.min_duration,
                day_start: case.options.day_start.clone(),
                day_end: case.options.day_end.clone(),
            };

            let slots = evaluator.find_free_slots(ranges, &case.date, options);

            assert_eq!(
                slots.len(),
                case.expected.len(),
                "{}: find_free_slots({}) — slot count mismatch. Got: {:?}",
                file_stem,
                case.date,
                slots
            );

            for (i, (actual, expected)) in slots.iter().zip(case.expected.iter()).enumerate() {
                assert_eq!(
                    actual.date, expected.date,
                    "{} — free_slot[{}].date",
                    file_stem, i
                );
                assert_eq!(
                    actual.start_time, expected.start_time,
                    "{} — free_slot[{}].start_time",
                    file_stem, i
                );
                assert_eq!(
                    actual.end_time, expected.end_time,
                    "{} — free_slot[{}].end_time",
                    file_stem, i
                );
                assert_eq!(
                    actual.duration, expected.duration,
                    "{} — free_slot[{}].duration",
                    file_stem, i
                );
            }
            test_count += 1;
        }
    }

    if let Some(ref score_cases) = fixture.score_schedule {
        let ranges = fixture
            .ranges
            .as_ref()
            .expect("score_schedule requires a multi-range fixture");

        for case in score_cases {
            let from_date = chrono::NaiveDate::parse_from_str(&case.from, "%Y-%m-%d")
                .unwrap_or_else(|e| panic!("Invalid from date '{}': {}", case.from, e));
            let to_date = chrono::NaiveDate::parse_from_str(&case.to, "%Y-%m-%d")
                .unwrap_or_else(|e| panic!("Invalid to date '{}': {}", case.to, e));

            let options = ScoreScheduleOptions {
                focus_block_minutes: case.options.focus_block_minutes,
                day_start: case.options.day_start.clone(),
                day_end: case.options.day_end.clone(),
            };

            let score = score_schedule(&evaluator, ranges, from_date, to_date, options);

            let context = format!(
                "{}: score_schedule({:?} to {:?})",
                file_stem, case.from, case.to
            );

            assert_eq!(
                score.conflicts, case.expected.conflicts,
                "{} — conflicts",
                context
            );
            assert_eq!(
                score.free_minutes, case.expected.free_minutes,
                "{} — free_minutes",
                context
            );
            assert_eq!(
                score.focus_blocks, case.expected.focus_blocks,
                "{} — focus_blocks",
                context
            );
            assert!(
                (score.avg_context_switches - case.expected.avg_context_switches).abs() < 0.001,
                "{} — avg_context_switches: expected {}, got {}",
                context,
                case.expected.avg_context_switches,
                score.avg_context_switches
            );
            assert_eq!(
                score.conflict_days, case.expected.conflict_days,
                "{} — conflict_days",
                context
            );
            test_count += 1;
        }
    }

    assert!(
        test_count > 0,
        "Fixture {:?} had no assertions to run",
        path
    );
}

fn walk_fixtures(dir: &Path, files: &mut Vec<std::path::PathBuf>) {
    let entries = fs::read_dir(dir)
        .unwrap_or_else(|e| panic!("Failed to read fixture directory {:?}: {}", dir, e));

    for entry in entries {
        let entry = entry.unwrap_or_else(|e| {
            panic!("Failed to read fixture entry in {:?}: {}", dir, e);
        });
        let path = entry.path();
        if path.is_dir() {
            walk_fixtures(&path, files);
        } else if path.extension().map_or(false, |ext| ext == "json") {
            files.push(path);
        }
    }
}

#[test]
fn conformance() {
    let fixtures_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("conformance")
        .join("fixtures");

    let mut files = Vec::new();
    walk_fixtures(&fixtures_dir, &mut files);
    files.sort();

    assert!(
        !files.is_empty(),
        "No fixture files found in {:?}",
        fixtures_dir
    );

    let mut total_fixtures = 0usize;

    for file in &files {
        run_fixture_file(file);
        total_fixtures += 1;
    }

    eprintln!("\n  All {} conformance fixtures passed.\n", total_fixtures);
}
