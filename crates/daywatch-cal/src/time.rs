use chrono::Datelike;
use chrono::NaiveDate;

pub(crate) fn parse_date(date: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()
}

pub(crate) fn parse_hhmm(time: &str) -> Option<(u32, u32)> {
    let parts: Vec<&str> = time.split(':').collect();
    if parts.len() != 2 {
        return None;
    }
    let hour: u32 = parts[0].parse().ok()?;
    let minute: u32 = parts[1].parse().ok()?;
    if hour > 24 || minute > 59 {
        return None;
    }
    if hour == 24 && minute != 0 {
        return None;
    }
    Some((hour, minute))
}

pub(crate) fn time_to_minutes(time: &str) -> u32 {
    let (hour, minute) = parse_hhmm(time).expect("Invalid time format");
    hour * 60 + minute
}

pub(crate) fn minutes_to_time(minutes: u32) -> String {
    let hour = minutes / 60;
    let minute = minutes % 60;
    format!("{:02}:{:02}", hour, minute)
}

pub(crate) fn add_minutes(time: &str, delta: u32) -> String {
    let total = time_to_minutes(time) + delta;
    minutes_to_time(total)
}

pub(crate) fn format_date(date: NaiveDate) -> String {
    date.format("%Y-%m-%d").to_string()
}

pub(crate) fn date_range(from: NaiveDate, to: NaiveDate) -> Vec<NaiveDate> {
    if from > to {
        return Vec::new();
    }
    let num_days = (to - from).num_days() as usize;
    let mut dates = Vec::with_capacity(num_days + 1);
    for i in 0..=num_days {
        dates.push(from + chrono::Duration::days(i as i64));
    }
    dates
}

pub(crate) fn days_in_month(year: i32, month: u32) -> u32 {
    let (next_year, next_month) = if month == 12 {
        (year + 1, 1u32)
    } else {
        (year, month + 1)
    };
    NaiveDate::from_ymd_opt(next_year, next_month, 1)
        .and_then(|d| d.pred_opt().map(|d| d.day()))
        .unwrap_or(31)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_time_to_minutes_24_00() {
        assert_eq!(time_to_minutes("24:00"), 1440);
    }

    #[test]
    fn test_time_to_minutes_09_30() {
        assert_eq!(time_to_minutes("09:30"), 570);
    }

    #[test]
    fn test_time_to_minutes_00_00() {
        assert_eq!(time_to_minutes("00:00"), 0);
    }

    #[test]
    fn test_time_to_minutes_23_59() {
        assert_eq!(time_to_minutes("23:59"), 1439);
    }

    #[test]
    fn test_minutes_to_time_570() {
        assert_eq!(minutes_to_time(570), "09:30");
    }

    #[test]
    fn test_minutes_to_time_0() {
        assert_eq!(minutes_to_time(0), "00:00");
    }

    #[test]
    fn test_minutes_to_time_1440() {
        assert_eq!(minutes_to_time(1440), "24:00");
    }

    #[test]
    fn test_add_minutes() {
        assert_eq!(add_minutes("09:00", 30), "09:30");
    }

    #[test]
    fn test_parse_date_valid() {
        let date = parse_date("2026-03-08").unwrap();
        assert_eq!(date.year(), 2026);
        assert_eq!(date.month(), 3);
        assert_eq!(date.day(), 8);
    }

    #[test]
    fn test_parse_date_invalid() {
        assert!(parse_date("not-a-date").is_none());
    }

    #[test]
    fn test_days_in_month_february_leap() {
        assert_eq!(days_in_month(2024, 2), 29);
    }

    #[test]
    fn test_days_in_month_february_non_leap() {
        assert_eq!(days_in_month(2025, 2), 28);
    }

    #[test]
    fn test_days_in_month_december() {
        assert_eq!(days_in_month(2026, 12), 31);
    }

    #[test]
    fn test_date_range() {
        let from = parse_date("2026-03-01").unwrap();
        let to = parse_date("2026-03-05").unwrap();
        let dates = date_range(from, to);
        assert_eq!(dates.len(), 5);
        assert_eq!(format_date(dates[0]), "2026-03-01");
        assert_eq!(format_date(dates[4]), "2026-03-05");
    }

    #[test]
    fn test_date_range_empty_when_from_after_to() {
        let from = parse_date("2026-03-10").unwrap();
        let to = parse_date("2026-03-01").unwrap();
        let dates = date_range(from, to);
        assert!(dates.is_empty());
    }

    #[test]
    fn test_date_range_single_day() {
        let date = parse_date("2026-03-05").unwrap();
        let dates = date_range(date, date);
        assert_eq!(dates.len(), 1);
        assert_eq!(format_date(dates[0]), "2026-03-05");
    }

    #[test]
    fn test_format_date() {
        let date = parse_date("2026-07-15").unwrap();
        assert_eq!(format_date(date), "2026-07-15");
    }

    #[test]
    fn test_parse_hhmm_invalid() {
        assert!(parse_hhmm("25:00").is_none());
        assert!(parse_hhmm("24:01").is_none());
        assert!(parse_hhmm("abc").is_none());
        assert!(parse_hhmm("").is_none());
    }
}
