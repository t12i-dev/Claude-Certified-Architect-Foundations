import assert from "node:assert/strict";
import { addDurationToDatetime, getReminders, setReminder } from "./reminder-tools.js";

// The example from the lesson
assert.equal(addDurationToDatetime("2050-01-01", 177, "days"), "2050-06-27");
// "days" is the default unit
assert.equal(addDurationToDatetime("2050-01-01", 1), "2050-01-02");
assert.equal(addDurationToDatetime("2026-10-31", 1, "weeks"), "2026-11-07");

// Month-end clamping, non-leap vs leap year
assert.equal(addDurationToDatetime("2050-01-31", 1, "months"), "2050-02-28");
assert.equal(addDurationToDatetime("2052-01-31", 1, "months"), "2052-02-29");
assert.equal(addDurationToDatetime("2052-02-29", 1, "years"), "2053-02-28");

// Negative durations subtract
assert.equal(addDurationToDatetime("2026-03-01", -1, "days"), "2026-02-28");

// Time-of-day units keep the time and roll over midnight
assert.equal(addDurationToDatetime("2026-10-31 23:30:00", 45, "minutes"), "2026-11-01 00:15:00");
assert.equal(addDurationToDatetime("2026-10-31", 5, "hours"), "2026-10-31 05:00:00");

// Errors Claude can read and learn from
assert.throws(() => addDurationToDatetime("2050-02-30", 1, "days"), /not a real calendar date/);
assert.throws(() => addDurationToDatetime("tomorrow", 1, "days"), /Invalid datetime/);
assert.throws(() => addDurationToDatetime("2050-01-01", 1, "fortnights"), /Unsupported unit/);
assert.throws(() => addDurationToDatetime("2050-01-01", 1.5, "months"), /whole number/);
assert.throws(() => addDurationToDatetime("2050-01-01", Number.NaN, "days"), /finite number/);

// set_reminder is idempotent
const first = setReminder("Doctor's appointment", "2050-06-27");
assert.equal(first.already_existed, false);
const again = setReminder("Doctor's appointment", "2050-06-27");
assert.equal(again.already_existed, true);
assert.equal(again.id, first.id);
assert.equal(getReminders().length, 1);

assert.throws(() => setReminder("", "2050-06-27"), /content/);
assert.throws(() => setReminder("x", "next week"), /timestamp/);

console.log("All date tool checks passed.");
