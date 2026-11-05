//! Gates the crate's scheduling operations through Umpire availability
//! schemas loaded as live data: a host can add or retune gating without a
//! rebuild. Conditions carry the profile's calendar state plus facts the
//! [`RangeEvaluator`] computes from the day's ranges; fields are the
//! operations a consumer (e.g. the MCP server) would expose as tools.

use daywatch_cal::{DateRange, FindFreeSlotsOptions, RangeEvaluator};
use serde_json::{json, Map, Value};
use umpire::Umpire;

const TOOL_GATE_SCHEMA: &str = r#"{
    "version": 1,
    "conditions": {
        "connected": {"type": "boolean", "description": "a calendar source is connected"},
        "readOnly": {"type": "boolean", "description": "the profile is read-only"},
        "hasOpenTime": {"type": "boolean", "description": "the evaluated day has open time"}
    },
    "fields": {
        "cal.freeSlots": {"isEmpty": "string"},
        "cal.conflicts": {"isEmpty": "string"},
        "cal.createEvent": {"isEmpty": "string"},
        "cal.deleteEvent": {"isEmpty": "string"}
    },
    "rules": [
        {"type": "requires", "field": "cal.freeSlots",
         "when": {"op": "cond", "condition": "connected"},
         "reason": "connect a calendar first"},
        {"type": "requires", "field": "cal.freeSlots",
         "when": {"op": "cond", "condition": "hasOpenTime"},
         "reason": "no open time on this date"},
        {"type": "requires", "field": "cal.conflicts",
         "when": {"op": "cond", "condition": "connected"},
         "reason": "connect a calendar first"},
        {"type": "requires", "field": "cal.createEvent",
         "dependencies": [
             {"op": "cond", "condition": "connected"},
             {"op": "condEq", "condition": "readOnly", "value": false}
         ],
         "reason": "writable calendar required"},
        {"type": "enabledWhen", "field": "cal.deleteEvent",
         "when": {"op": "and", "exprs": [
             {"op": "cond", "condition": "connected"},
             {"op": "condEq", "condition": "readOnly", "value": false}
         ]},
         "reason": "deleting needs a connected, writable profile"}
    ],
    "validators": {
        "cal.createEvent": {"op": "maxLength", "value": 20, "error": "Title is too long"}
    }
}"#;

fn engine() -> Umpire {
    let schema = umpire::parse_schema(TOOL_GATE_SCHEMA.as_bytes()).expect("schema parses");
    Umpire::from_schema(schema).expect("engine builds")
}

/// Builds the evaluator and derives the schema's live conditions from the
/// crate's own schedule computation: open time comes from
/// [`RangeEvaluator::find_free_slots`] and connectivity from the ranges a
/// disconnected profile does not have.
fn conditions(
    evaluator: &RangeEvaluator,
    ranges: &[DateRange],
    connected: bool,
    read_only: bool,
    date: &str,
) -> Map<String, Value> {
    let free = evaluator.find_free_slots(
        ranges,
        date,
        FindFreeSlotsOptions {
            min_duration: Some(30),
            day_start: Some("09:00".into()),
            day_end: Some("17:00".into()),
        },
    );
    serde_json::from_value(json!({
        "connected": connected,
        "readOnly": read_only,
        "hasOpenTime": !free.is_empty(),
    }))
    .unwrap()
}

fn ranges(raw: Value) -> Vec<DateRange> {
    serde_json::from_value(raw).expect("ranges decode from the flat TS shape")
}

fn values(title: &str) -> Map<String, Value> {
    serde_json::from_value(json!({
        "cal.freeSlots": "week-of-the-14th",
        "cal.conflicts": "team-cal",
        "cal.createEvent": title,
        "cal.deleteEvent": "stale-hold"
    }))
    .unwrap()
}

fn gated(status: &umpire::FieldAvailability) -> bool {
    !status.enabled
}

#[test]
fn disconnected_profile_gates_every_operation() {
    let engine = engine();
    let evaluator = RangeEvaluator::new(Some("America/New_York")).expect("evaluator builds");
    // A disconnected profile has no ranges, so the evaluator derives no open
    // time either.
    let conditions = conditions(&evaluator, &[], false, false, "2026-03-02");
    let availability = engine
        .check(&values("team sync"), &conditions, None)
        .unwrap();
    for op in ["cal.freeSlots", "cal.conflicts"] {
        assert!(gated(&availability[op]), "{} should be gated", op);
        assert_eq!(availability[op].reason, "connect a calendar first");
    }
    // requires rules report the rule's own reason no matter which
    // dependency failed.
    assert!(gated(&availability["cal.createEvent"]));
    assert_eq!(
        availability["cal.createEvent"].reason,
        "writable calendar required"
    );
    assert!(gated(&availability["cal.deleteEvent"]));
    assert_eq!(
        availability["cal.deleteEvent"].reason,
        "deleting needs a connected, writable profile"
    );
}

#[test]
fn read_only_profile_allows_reads_blocks_writes() {
    let engine = engine();
    let evaluator = RangeEvaluator::new(Some("America/New_York")).expect("evaluator builds");
    let day = ranges(json!([
        {"id": "standup", "label": "Standup", "dates": ["2026-03-02"],
         "startTime": "09:00", "endTime": "10:00"}
    ]));
    let conditions = conditions(&evaluator, &day, true, true, "2026-03-02");
    let availability = engine
        .check(&values("team sync"), &conditions, None)
        .unwrap();
    assert!(!gated(&availability["cal.freeSlots"]));
    assert!(!gated(&availability["cal.conflicts"]));
    assert!(gated(&availability["cal.createEvent"]));
    assert_eq!(
        availability["cal.createEvent"].reason,
        "writable calendar required"
    );
    assert!(gated(&availability["cal.deleteEvent"]));
    assert_eq!(
        availability["cal.deleteEvent"].reason,
        "deleting needs a connected, writable profile"
    );
}

#[test]
fn fully_booked_date_gates_free_slots_but_keeps_other_ops() {
    let engine = engine();
    let evaluator = RangeEvaluator::new(Some("America/New_York")).expect("evaluator builds");
    // The whole working day is one meeting: the evaluator derives no open
    // time, so the schema gates the free-slots operation while reads stay up.
    let day = ranges(json!([
        {"id": "offsite", "label": "Offsite", "dates": ["2026-03-02"],
         "startTime": "09:00", "endTime": "17:00"}
    ]));
    let conditions = conditions(&evaluator, &day, true, false, "2026-03-02");
    let availability = engine
        .check(&values("team sync"), &conditions, None)
        .unwrap();
    assert!(gated(&availability["cal.freeSlots"]));
    assert_eq!(
        availability["cal.freeSlots"].reason,
        "no open time on this date"
    );
    assert!(!gated(&availability["cal.conflicts"]));
    assert!(!gated(&availability["cal.createEvent"]));
    assert!(!gated(&availability["cal.deleteEvent"]));
}

#[test]
fn open_day_reports_conflicts_and_validates_operation_input() {
    let engine = engine();
    let evaluator = RangeEvaluator::new(Some("America/New_York")).expect("evaluator builds");
    let day = ranges(json!([
        {"id": "standup", "label": "Standup", "dates": ["2026-03-02"],
         "startTime": "09:00", "endTime": "10:00"},
        {"id": "overlap", "label": "Overlap", "dates": ["2026-03-02"],
         "startTime": "09:30", "endTime": "11:00"}
    ]));

    // The crate's conflict detection feeds the same evaluation the gate
    // reads: two overlapping ranges on the day.
    let conflicts = evaluator.find_conflicts(&day, "2026-03-02");
    assert_eq!(conflicts.len(), 1, "expected the overlap to conflict");

    let conditions = conditions(&evaluator, &day, true, false, "2026-03-02");
    let availability = engine
        .check(&values("team sync"), &conditions, None)
        .unwrap();
    for op in [
        "cal.freeSlots",
        "cal.conflicts",
        "cal.createEvent",
        "cal.deleteEvent",
    ] {
        assert!(!gated(&availability[op]), "{} should be available", op);
    }
    assert_eq!(availability["cal.createEvent"].valid, Some(true));

    // No title means no input: satisfied stays false and the validator never
    // runs, so valid is None rather than false — absent ≠ invalid.
    let untitled = engine.check(&values(""), &conditions, None).unwrap();
    assert!(!untitled["cal.createEvent"].satisfied);
    assert_eq!(untitled["cal.createEvent"].valid, None);

    // A present but overlong title fails the validator with the schema's
    // error message.
    let long_title = engine
        .check(
            &values("standup with the platform team overdue"),
            &conditions,
            None,
        )
        .unwrap();
    assert_eq!(long_title["cal.createEvent"].valid, Some(false));
    assert_eq!(long_title["cal.createEvent"].error, "Title is too long");
}

#[test]
fn play_recommends_clearing_values_after_the_profile_locks() {
    let engine = engine();
    let evaluator = RangeEvaluator::new(Some("America/New_York")).expect("evaluator builds");
    let day = ranges(json!([
        {"id": "standup", "label": "Standup", "dates": ["2026-03-02"],
         "startTime": "09:00", "endTime": "10:00"}
    ]));

    let before = engine
        .check(
            &values("team sync"),
            &conditions(&evaluator, &day, true, false, "2026-03-02"),
            None,
        )
        .unwrap();
    let after = engine
        .check(
            &values("team sync"),
            &conditions(&evaluator, &day, true, true, "2026-03-02"),
            None,
        )
        .unwrap();

    let fouls = engine.play(&before, &after, &values("team sync"));
    let fouled: Vec<&str> = fouls.iter().map(|f| f.field.as_str()).collect();
    assert_eq!(
        fouled,
        vec!["cal.createEvent", "cal.deleteEvent"],
        "fouls: {:?}",
        fouls
    );
    assert_eq!(fouls[0].reason, "writable calendar required");
    assert_eq!(
        fouls[1].reason,
        "deleting needs a connected, writable profile"
    );
}
