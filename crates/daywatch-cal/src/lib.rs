mod time;
mod types;
mod evaluator;
pub mod scoring;

pub use evaluator::RangeEvaluator;
pub use scoring::score_schedule;
pub use types::{
    Conflict, DateRange, DaySelector, FindFreeSlotsOptions, FreeSlot, Occurrence, RangeRef,
    ScheduleScore, ScoreScheduleOptions, SpanInfo, TimeSelector, TimeSlot,
};
