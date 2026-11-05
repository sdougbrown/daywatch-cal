//! Gates the crate's scheduling operations through Umpire availability
//! schemas loaded as live data: a host can add or retune gating without a
//! rebuild. Conditions carry the profile's calendar state; fields are the
//! operations a consumer (e.g. the MCP server) would expose as tools.

use serde_json::{json, Value};
use umpire::{AvailabilityMap, Umpire};

const TOOL_GATE_SCHEMA: &str = r#"{
    "version": 1,
    "conditions": {
        "connected": {"type": "boolean", "description": "a calendar source is connected"},
        "readOnly": {"type": "boolean", "description": "the profile is read-only"},
        "region": {"type": "string", "description": "scheduling region"}
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

fn conditions(connected: bool, read_only: bool, region: &str) -> serde_json::Map<String, Value> {
    serde_json::from_value(json!({
        "connected": connected, "readOnly": read_only, "region": region
    }))
    .unwrap()
}

fn values(title: &str) -> serde_json::Map<String, Value> {
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
    let availability = engine
        .check(&values("team sync"), &conditions(false, false, "us"), None)
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
    let availability = engine
        .check(&values("team sync"), &conditions(true, true, "us"), None)
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
fn writable_profile_enables_everything_and_validates_input() {
    let engine = engine();
    let availability = engine
        .check(&values("team sync"), &conditions(true, false, "us"), None)
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

    // No title means no input: satisfied stays false and the validator
    // never runs, so valid is None rather than false — absent ≠ invalid.
    let untitled = engine
        .check(&values(""), &conditions(true, false, "us"), None)
        .unwrap();
    assert!(!untitled["cal.createEvent"].satisfied);
    assert_eq!(untitled["cal.createEvent"].valid, None);

    // A present but overlong title fails the validator with the schema's
    // error message.
    let long_title = engine
        .check(
            &values("standup with the platform team overdue"),
            &conditions(true, false, "us"),
            None,
        )
        .unwrap();
    assert_eq!(long_title["cal.createEvent"].valid, Some(false));
    assert_eq!(long_title["cal.createEvent"].error, "Title is too long");
}

#[test]
fn play_recommends_clearing_values_after_the_profile_locks() {
    let engine = engine();

    let before = engine
        .check(&values("team sync"), &conditions(true, false, "us"), None)
        .unwrap();
    let after = engine
        .check(&values("team sync"), &conditions(true, true, "us"), None)
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

// Keep the availability map type in scope for consumers copying this pattern.
#[allow(dead_code)]
fn _availability_map_type_is_reexported(_: &AvailabilityMap) {}
