use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum DaySelector {
    Explicit {
        dates: Vec<String>,
        #[serde(rename = "exceptDates", skip_serializing_if = "Option::is_none")]
        except_dates: Option<Vec<String>>,
        #[serde(rename = "exceptBetween", skip_serializing_if = "Option::is_none")]
        except_between: Option<Vec<(String, String)>>,
    },
    Recurrence {
        #[serde(rename = "everyWeekday", skip_serializing_if = "Option::is_none")]
        every_weekday: Option<Vec<u8>>,
        #[serde(rename = "everyDate", skip_serializing_if = "Option::is_none")]
        every_date: Option<Vec<u8>>,
        #[serde(rename = "everyMonth", skip_serializing_if = "Option::is_none")]
        every_month: Option<Vec<u8>>,
        #[serde(rename = "fromDate", skip_serializing_if = "Option::is_none")]
        from_date: Option<String>,
        #[serde(rename = "toDate", skip_serializing_if = "Option::is_none")]
        to_date: Option<String>,
        #[serde(rename = "exceptDates", skip_serializing_if = "Option::is_none")]
        except_dates: Option<Vec<String>>,
        #[serde(rename = "exceptBetween", skip_serializing_if = "Option::is_none")]
        except_between: Option<Vec<(String, String)>>,
    },
    Range {
        #[serde(rename = "fromDate", skip_serializing_if = "Option::is_none")]
        from_date: Option<String>,
        #[serde(rename = "toDate", skip_serializing_if = "Option::is_none")]
        to_date: Option<String>,
        #[serde(rename = "fixedBetween", default)]
        fixed_between: bool,
        #[serde(rename = "exceptDates", skip_serializing_if = "Option::is_none")]
        except_dates: Option<Vec<String>>,
        #[serde(rename = "exceptBetween", skip_serializing_if = "Option::is_none")]
        except_between: Option<Vec<(String, String)>>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum TimeSelector {
    Hours {
        #[serde(rename = "everyHour")]
        every_hour: Vec<u8>,
        #[serde(skip_serializing_if = "Option::is_none")]
        duration: Option<u32>,
    },
    Window {
        #[serde(rename = "startTime")]
        start_time: String,
        #[serde(rename = "endTime", skip_serializing_if = "Option::is_none")]
        end_time: Option<String>,
        #[serde(rename = "repeatEvery", skip_serializing_if = "Option::is_none")]
        repeat_every: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        duration: Option<u32>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DateRange {
    pub id: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(rename = "displayType", skip_serializing_if = "Option::is_none")]
    pub display_type: Option<String>,

    #[serde(flatten)]
    pub day_selector: DaySelector,

    #[serde(flatten)]
    pub time_selector: Option<TimeSelector>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub timezone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub flexibility: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

impl<'de> Deserialize<'de> for DateRange {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        use serde::de::Error;

        let map: serde_json::Map<String, serde_json::Value> =
            serde_json::Map::deserialize(deserializer)?;

        fn non_null(v: &serde_json::Value) -> Option<serde_json::Value> {
            if v.is_null() {
                None
            } else {
                Some(v.clone())
            }
        }

        let id: String = map
            .get("id")
            .ok_or_else(|| Error::missing_field("id"))
            .and_then(|v| serde_json::from_value(v.clone()).map_err(Error::custom))?;

        let label: String = map
            .get("label")
            .ok_or_else(|| Error::missing_field("label"))
            .and_then(|v| serde_json::from_value(v.clone()).map_err(Error::custom))?;

        let title: Option<String> = map
            .get("title")
            .and_then(non_null)
            .map(|v| serde_json::from_value(v).map_err(Error::custom))
            .transpose()?;
        let display_type: Option<String> = map
            .get("displayType")
            .and_then(non_null)
            .map(|v| serde_json::from_value(v).map_err(Error::custom))
            .transpose()?;

        let day_selector = if map.contains_key("dates") {
            let dates: Vec<String> = map
                .get("dates")
                .ok_or_else(|| Error::missing_field("dates"))
                .and_then(|v| serde_json::from_value(v.clone()).map_err(Error::custom))?;
            let except_dates: Option<Vec<String>> = map
                .get("exceptDates")
                .and_then(non_null)
                .map(|v| serde_json::from_value(v).map_err(Error::custom))
                .transpose()?;
            let except_between: Option<Vec<(String, String)>> = map
                .get("exceptBetween")
                .and_then(non_null)
                .map(|v| serde_json::from_value(v).map_err(Error::custom))
                .transpose()?;
            DaySelector::Explicit {
                dates,
                except_dates,
                except_between,
            }
        } else if map.contains_key("everyWeekday")
            || map.contains_key("everyDate")
            || map.contains_key("everyMonth")
        {
            let every_weekday: Option<Vec<u8>> = map
                .get("everyWeekday")
                .and_then(non_null)
                .map(|v| serde_json::from_value(v).map_err(Error::custom))
                .transpose()?;
            let every_date: Option<Vec<u8>> = map
                .get("everyDate")
                .and_then(non_null)
                .map(|v| serde_json::from_value(v).map_err(Error::custom))
                .transpose()?;
            let every_month: Option<Vec<u8>> = map
                .get("everyMonth")
                .and_then(non_null)
                .map(|v| serde_json::from_value(v).map_err(Error::custom))
                .transpose()?;
            let from_date: Option<String> = map
                .get("fromDate")
                .and_then(non_null)
                .map(|v| serde_json::from_value(v).map_err(Error::custom))
                .transpose()?;
            let to_date: Option<String> = map
                .get("toDate")
                .and_then(non_null)
                .map(|v| serde_json::from_value(v).map_err(Error::custom))
                .transpose()?;
            let except_dates: Option<Vec<String>> = map
                .get("exceptDates")
                .and_then(non_null)
                .map(|v| serde_json::from_value(v).map_err(Error::custom))
                .transpose()?;
            let except_between: Option<Vec<(String, String)>> = map
                .get("exceptBetween")
                .and_then(non_null)
                .map(|v| serde_json::from_value(v).map_err(Error::custom))
                .transpose()?;
            DaySelector::Recurrence {
                every_weekday,
                every_date,
                every_month,
                from_date,
                to_date,
                except_dates,
                except_between,
            }
        } else {
            let from_date: Option<String> = map
                .get("fromDate")
                .and_then(non_null)
                .map(|v| serde_json::from_value(v).map_err(Error::custom))
                .transpose()?;
            let to_date: Option<String> = map
                .get("toDate")
                .and_then(non_null)
                .map(|v| serde_json::from_value(v).map_err(Error::custom))
                .transpose()?;
            let fixed_between: bool = map
                .get("fixedBetween")
                .and_then(non_null)
                .map(|v| serde_json::from_value(v).map_err(Error::custom))
                .transpose()?
                .unwrap_or(false);
            let except_dates: Option<Vec<String>> = map
                .get("exceptDates")
                .and_then(non_null)
                .map(|v| serde_json::from_value(v).map_err(Error::custom))
                .transpose()?;
            let except_between: Option<Vec<(String, String)>> = map
                .get("exceptBetween")
                .and_then(non_null)
                .map(|v| serde_json::from_value(v).map_err(Error::custom))
                .transpose()?;
            DaySelector::Range {
                from_date,
                to_date,
                fixed_between,
                except_dates,
                except_between,
            }
        };

        let time_selector = if map.contains_key("everyHour") {
            let every_hour: Vec<u8> = map
                .get("everyHour")
                .ok_or_else(|| Error::missing_field("everyHour"))
                .and_then(|v| serde_json::from_value(v.clone()).map_err(Error::custom))?;
            let duration: Option<u32> = map
                .get("duration")
                .and_then(non_null)
                .map(|v| serde_json::from_value(v).map_err(Error::custom))
                .transpose()?;
            Some(TimeSelector::Hours {
                every_hour,
                duration,
            })
        } else if map.contains_key("startTime") {
            let start_time: String = map
                .get("startTime")
                .ok_or_else(|| Error::missing_field("startTime"))
                .and_then(|v| serde_json::from_value(v.clone()).map_err(Error::custom))?;
            let end_time: Option<String> = map
                .get("endTime")
                .and_then(non_null)
                .map(|v| serde_json::from_value(v).map_err(Error::custom))
                .transpose()?;
            let repeat_every: Option<u32> = map
                .get("repeatEvery")
                .and_then(non_null)
                .map(|v| serde_json::from_value(v).map_err(Error::custom))
                .transpose()?;
            let duration: Option<u32> = map
                .get("duration")
                .and_then(non_null)
                .map(|v| serde_json::from_value(v).map_err(Error::custom))
                .transpose()?;
            Some(TimeSelector::Window {
                start_time,
                end_time,
                repeat_every,
                duration,
            })
        } else {
            None
        };

        let timezone: Option<String> = map
            .get("timezone")
            .and_then(non_null)
            .map(|v| serde_json::from_value(v).map_err(Error::custom))
            .transpose()?;
        let flexibility: Option<u8> = map
            .get("flexibility")
            .and_then(non_null)
            .map(|v| serde_json::from_value(v).map_err(Error::custom))
            .transpose()?;
        let metadata: Option<serde_json::Value> = map.get("metadata").and_then(non_null);

        Ok(DateRange {
            id,
            label,
            title,
            display_type,
            day_selector,
            time_selector,
            timezone,
            flexibility,
            metadata,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Occurrence {
    pub date: String,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub range_id: String,
    pub label: String,
    pub all_day: bool,
    pub display_type: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeSlot {
    pub start_time: String,
    pub end_time: Option<String>,
    pub duration: Option<u32>,
    pub range_id: String,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FreeSlot {
    pub date: String,
    pub start_time: String,
    pub end_time: String,
    pub duration: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RangeRef {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conflict {
    pub range_a: RangeRef,
    pub range_b: RangeRef,
    pub date: String,
    pub overlap_start: Option<String>,
    pub overlap_end: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleScore {
    pub conflicts: u32,
    pub free_minutes: u32,
    pub focus_blocks: u32,
    pub avg_context_switches: f64,
    pub conflict_days: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpanInfo {
    pub range_id: String,
    pub label: String,
    pub display_type: Option<String>,
    pub start_date: String,
    pub end_date: String,
    pub length: usize,
    pub max_overlap: usize,
    pub lane: usize,
    pub total_lanes: usize,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FindFreeSlotsOptions {
    pub min_duration: Option<u32>,
    pub day_start: Option<String>,
    pub day_end: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreScheduleOptions {
    pub focus_block_minutes: Option<u32>,
    pub day_start: Option<String>,
    pub day_end: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_explicit_dates() {
        let dr = DateRange {
            id: "1".to_string(),
            label: "Test Explicit".to_string(),
            title: Some("Explicit Title".to_string()),
            display_type: None,
            day_selector: DaySelector::Explicit {
                dates: vec!["2026-03-21".to_string(), "2026-03-25".to_string()],
                except_dates: None,
                except_between: None,
            },
            time_selector: None,
            timezone: None,
            flexibility: None,
            metadata: None,
        };
        let json = serde_json::to_string(&dr).unwrap();
        let dr2: DateRange = serde_json::from_str(&json).unwrap();
        assert_eq!(dr, dr2);
    }

    #[test]
    fn roundtrip_recurrence_weekday() {
        let dr = DateRange {
            id: "2".to_string(),
            label: "Test Recurrence".to_string(),
            title: None,
            display_type: None,
            day_selector: DaySelector::Recurrence {
                every_weekday: Some(vec![1, 3, 5]),
                every_date: None,
                every_month: None,
                from_date: Some("2026-01-01".to_string()),
                to_date: Some("2026-12-31".to_string()),
                except_dates: None,
                except_between: None,
            },
            time_selector: None,
            timezone: None,
            flexibility: None,
            metadata: None,
        };
        let json = serde_json::to_string(&dr).unwrap();
        let dr2: DateRange = serde_json::from_str(&json).unwrap();
        assert_eq!(dr, dr2);
    }

    #[test]
    fn roundtrip_range_bounded() {
        let dr = DateRange {
            id: "3".to_string(),
            label: "Test Range Bounded".to_string(),
            title: None,
            display_type: None,
            day_selector: DaySelector::Range {
                from_date: Some("2026-03-01".to_string()),
                to_date: Some("2026-03-31".to_string()),
                fixed_between: true,
                except_dates: None,
                except_between: None,
            },
            time_selector: None,
            timezone: None,
            flexibility: None,
            metadata: None,
        };
        let json = serde_json::to_string(&dr).unwrap();
        let dr2: DateRange = serde_json::from_str(&json).unwrap();
        assert_eq!(dr, dr2);
    }

    #[test]
    fn roundtrip_range_open_ended() {
        let dr = DateRange {
            id: "4".to_string(),
            label: "Test Range Open".to_string(),
            title: None,
            display_type: None,
            day_selector: DaySelector::Range {
                from_date: Some("2026-03-01".to_string()),
                to_date: None,
                fixed_between: false,
                except_dates: None,
                except_between: None,
            },
            time_selector: None,
            timezone: None,
            flexibility: None,
            metadata: None,
        };
        let json = serde_json::to_string(&dr).unwrap();
        let dr2: DateRange = serde_json::from_str(&json).unwrap();
        assert_eq!(dr, dr2);
    }

    #[test]
    fn roundtrip_hours_time() {
        let dr = DateRange {
            id: "5".to_string(),
            label: "Test Hours".to_string(),
            title: None,
            display_type: None,
            day_selector: DaySelector::Explicit {
                dates: vec!["2026-03-21".to_string()],
                except_dates: None,
                except_between: None,
            },
            time_selector: Some(TimeSelector::Hours {
                every_hour: vec![9, 14],
                duration: Some(60),
            }),
            timezone: None,
            flexibility: None,
            metadata: None,
        };
        let json = serde_json::to_string(&dr).unwrap();
        let dr2: DateRange = serde_json::from_str(&json).unwrap();
        assert_eq!(dr, dr2);
    }

    #[test]
    fn roundtrip_window_time() {
        let dr = DateRange {
            id: "6".to_string(),
            label: "Test Window".to_string(),
            title: None,
            display_type: None,
            day_selector: DaySelector::Explicit {
                dates: vec!["2026-03-21".to_string()],
                except_dates: None,
                except_between: None,
            },
            time_selector: Some(TimeSelector::Window {
                start_time: "09:00".to_string(),
                end_time: Some("17:00".to_string()),
                repeat_every: None,
                duration: None,
            }),
            timezone: None,
            flexibility: None,
            metadata: None,
        };
        let json = serde_json::to_string(&dr).unwrap();
        let dr2: DateRange = serde_json::from_str(&json).unwrap();
        assert_eq!(dr, dr2);
    }

    #[test]
    fn roundtrip_combined_day_with_time() {
        let dr = DateRange {
            id: "7".to_string(),
            label: "Test Combined".to_string(),
            title: None,
            display_type: None,
            day_selector: DaySelector::Recurrence {
                every_weekday: Some(vec![1, 3, 5]),
                every_date: None,
                every_month: None,
                from_date: Some("2026-01-01".to_string()),
                to_date: Some("2026-12-31".to_string()),
                except_dates: None,
                except_between: None,
            },
            time_selector: Some(TimeSelector::Window {
                start_time: "09:00".to_string(),
                end_time: Some("17:00".to_string()),
                repeat_every: None,
                duration: None,
            }),
            timezone: None,
            flexibility: None,
            metadata: None,
        };
        let json = serde_json::to_string(&dr).unwrap();
        let dr2: DateRange = serde_json::from_str(&json).unwrap();
        assert_eq!(dr, dr2);
    }

    #[test]
    fn roundtrip_timezone_conversion() {
        let dr = DateRange {
            id: "8".to_string(),
            label: "Test Timezone".to_string(),
            title: None,
            display_type: None,
            day_selector: DaySelector::Explicit {
                dates: vec!["2026-03-21".to_string()],
                except_dates: None,
                except_between: None,
            },
            time_selector: None,
            timezone: Some("America/New_York".to_string()),
            flexibility: None,
            metadata: None,
        };
        let json = serde_json::to_string(&dr).unwrap();
        let dr2: DateRange = serde_json::from_str(&json).unwrap();
        assert_eq!(dr, dr2);
    }

    #[test]
    fn roundtrip_with_exclusions() {
        let dr = DateRange {
            id: "9".to_string(),
            label: "Test Exclusions".to_string(),
            title: None,
            display_type: None,
            day_selector: DaySelector::Explicit {
                dates: vec!["2026-03-21".to_string(), "2026-03-22".to_string()],
                except_dates: Some(vec!["2026-03-22".to_string()]),
                except_between: Some(vec![("2026-03-23".to_string(), "2026-03-25".to_string())]),
            },
            time_selector: None,
            timezone: None,
            flexibility: None,
            metadata: None,
        };
        let json = serde_json::to_string(&dr).unwrap();
        let dr2: DateRange = serde_json::from_str(&json).unwrap();
        assert_eq!(dr, dr2);
    }

    #[test]
    fn deser_plain_json_explicit() {
        let json = r#"{
            "id": "1",
            "label": "Explicit",
            "dates": ["2026-03-21", "2026-03-25"]
        }"#;
        let dr: DateRange = serde_json::from_str(json).unwrap();
        assert_eq!(dr.id, "1");
        assert_eq!(dr.label, "Explicit");
        assert!(matches!(dr.day_selector, DaySelector::Explicit { .. }));
        if let DaySelector::Explicit { dates, .. } = &dr.day_selector {
            assert_eq!(
                dates,
                &vec!["2026-03-21".to_string(), "2026-03-25".to_string()]
            );
        }
    }

    #[test]
    fn deser_plain_json_recurrence() {
        let json = r#"{
            "id": "2",
            "label": "Recurrence",
            "everyWeekday": [1, 3, 5],
            "fromDate": "2026-01-01",
            "toDate": "2026-12-31"
        }"#;
        let dr: DateRange = serde_json::from_str(json).unwrap();
        assert_eq!(dr.id, "2");
        assert_eq!(dr.label, "Recurrence");
        assert!(matches!(dr.day_selector, DaySelector::Recurrence { .. }));
        if let DaySelector::Recurrence {
            every_weekday,
            from_date,
            to_date,
            ..
        } = &dr.day_selector
        {
            assert_eq!(every_weekday, &Some(vec![1, 3, 5]));
            assert_eq!(from_date, &Some("2026-01-01".to_string()));
            assert_eq!(to_date, &Some("2026-12-31".to_string()));
        }
    }

    #[test]
    fn deser_plain_json_range() {
        let json = r#"{
            "id": "3",
            "label": "Range",
            "fromDate": "2026-03-01",
            "toDate": "2026-03-31",
            "fixedBetween": true
        }"#;
        let dr: DateRange = serde_json::from_str(json).unwrap();
        assert_eq!(dr.id, "3");
        assert_eq!(dr.label, "Range");
        assert!(matches!(dr.day_selector, DaySelector::Range { .. }));
        if let DaySelector::Range {
            from_date,
            to_date,
            fixed_between,
            ..
        } = &dr.day_selector
        {
            assert_eq!(from_date, &Some("2026-03-01".to_string()));
            assert_eq!(to_date, &Some("2026-03-31".to_string()));
            assert!(*fixed_between);
        }
    }

    #[test]
    fn deser_plain_json_hours() {
        let json = r#"{
            "id": "4",
            "label": "Hours",
            "dates": ["2026-03-21"],
            "everyHour": [9, 14],
            "duration": 60
        }"#;
        let dr: DateRange = serde_json::from_str(json).unwrap();
        assert_eq!(dr.id, "4");
        assert_eq!(dr.label, "Hours");
        assert!(matches!(dr.day_selector, DaySelector::Explicit { .. }));
        assert!(matches!(dr.time_selector, Some(TimeSelector::Hours { .. })));
        if let Some(TimeSelector::Hours {
            every_hour,
            duration,
        }) = &dr.time_selector
        {
            assert_eq!(every_hour, &vec![9, 14]);
            assert_eq!(duration, &Some(60));
        }
    }

    #[test]
    fn deser_plain_json_window() {
        let json = r#"{
            "id": "5",
            "label": "Window",
            "dates": ["2026-03-21"],
            "startTime": "09:00",
            "endTime": "17:00"
        }"#;
        let dr: DateRange = serde_json::from_str(json).unwrap();
        assert_eq!(dr.id, "5");
        assert_eq!(dr.label, "Window");
        assert!(matches!(
            dr.time_selector,
            Some(TimeSelector::Window { .. })
        ));
        if let Some(TimeSelector::Window {
            start_time,
            end_time,
            ..
        }) = &dr.time_selector
        {
            assert_eq!(start_time, "09:00");
            assert_eq!(end_time, &Some("17:00".to_string()));
        }
    }

    #[test]
    fn deser_range_without_fixed_between_defaults() {
        let json = r#"{
            "id": "6",
            "label": "Default FixedBetween",
            "fromDate": "2026-03-01"
        }"#;
        let dr: DateRange = serde_json::from_str(json).unwrap();
        if let DaySelector::Range { fixed_between, .. } = &dr.day_selector {
            assert!(!fixed_between);
        } else {
            panic!("Expected Range variant");
        }
    }

    #[test]
    fn deser_missing_id_fails() {
        let json = r#"{"label": "test"}"#;
        assert!(serde_json::from_str::<DateRange>(json).is_err());
    }

    #[test]
    fn deser_missing_label_fails() {
        let json = r#"{"id": "1"}"#;
        assert!(serde_json::from_str::<DateRange>(json).is_err());
    }

    #[test]
    fn deser_recurrence_takes_precedence_over_range() {
        let json =
            r#"{"id": "1", "label": "test", "everyWeekday": [1, 3, 5], "fromDate": "2026-01-01"}"#;
        let dr: DateRange = serde_json::from_str(json).unwrap();
        assert!(matches!(dr.day_selector, DaySelector::Recurrence { .. }));
    }

    #[test]
    fn deser_null_timezone_treated_as_none() {
        let json = r#"{"id": "1", "label": "test", "dates": ["2026-01-01"], "timezone": null}"#;
        let dr: DateRange = serde_json::from_str(json).unwrap();
        assert_eq!(dr.timezone, None);
    }

    #[test]
    fn serializes_public_outputs_as_camel_case_json() {
        let slot = TimeSlot {
            start_time: "09:00".to_string(),
            end_time: Some("09:30".to_string()),
            duration: Some(30),
            range_id: "r1".to_string(),
            label: "Focus".to_string(),
        };
        let json = serde_json::to_value(slot).unwrap();
        assert_eq!(json["startTime"], "09:00");
        assert_eq!(json["endTime"], "09:30");
        assert_eq!(json["rangeId"], "r1");
        assert!(json.get("start_time").is_none());
    }

    #[test]
    fn deserializes_display_type_from_json() {
        let json =
            r#"{"id": "1", "label": "test", "dates": ["2026-03-21"], "displayType": "chip"}"#;
        let dr: DateRange = serde_json::from_str(json).unwrap();
        assert_eq!(dr.display_type.as_deref(), Some("chip"));
    }
}
