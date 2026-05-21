// Working-days math for CQC / NHS deadlines (complaint acknowledgement,
// FP17 submission windows, etc.). UK working days = Mon-Fri.
//
// Bank holidays are not yet accounted for — adding ~8 days a year to the
// "working" set. When we wire up the gov.uk bank-holiday feed, this is the
// single place to update.

export function isWorkingDay(date: Date): boolean {
  const day = date.getDay(); // 0 = Sunday ... 6 = Saturday
  return day !== 0 && day !== 6;
}

/** Returns `from` advanced by `days` working days. Counts the next working
 *  day (skipping weekends) as +1, not 0. So +3 from a Wednesday is the
 *  following Monday (Thu, Fri, then Mon). */
export function addWorkingDays(from: Date, days: number): Date {
  const result = new Date(from);
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (isWorkingDay(result)) remaining -= 1;
  }
  return result;
}

/** Counts how many working days lie between `from` and `to` (exclusive of
 *  `from`, inclusive of `to`). Negative if `to` is before `from`. */
export function workingDaysBetween(from: Date, to: Date): number {
  if (to.getTime() === from.getTime()) return 0;
  const sign = to > from ? 1 : -1;
  const start = new Date(sign > 0 ? from : to);
  const end = new Date(sign > 0 ? to : from);
  let count = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    if (isWorkingDay(cursor)) count += 1;
  }
  return count * sign;
}
