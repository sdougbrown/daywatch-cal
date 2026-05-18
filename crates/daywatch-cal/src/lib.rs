mod evaluator;
pub mod scoring;
mod time;
mod types;

pub use evaluator::RangeEvaluator;
pub use scoring::score_schedule;
pub use types::{
    Conflict, DateRange, DaySelector, FindFreeSlotsOptions, FreeSlot, Occurrence, RangeRef,
    ScheduleScore, ScoreScheduleOptions, SpanInfo, TimeSelector, TimeSlot,
};
