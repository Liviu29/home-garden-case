/**
 * Plantation date is a CALENDAR DATE, but the backend column is an ISO datetime
 * (`plantationDate: z.union([z.iso.datetime(), z.date()])`). Naively calling
 * `Date.prototype.toISOString()` on the value a date picker produces (local
 * midnight) shifts the stored day backwards for every timezone east of UTC:
 *
 *   Europe/Brussels, user picks 10 Sep 2026
 *   new Date(2026, 8, 10).toISOString() === '2026-09-09T22:00:00.000Z'  ← 9 Sep
 *
 * So we serialize the picked Y/M/D at **UTC midnight** and read it back in UTC.
 * The calendar day the user chose is then the calendar day everyone sees, in
 * every timezone, in the database, and in Swagger.
 */

/** Local calendar day (as picked) → ISO datetime pinned to UTC midnight. */
export function toPlantationDate(picked: Date): string {
  return new Date(
    Date.UTC(picked.getFullYear(), picked.getMonth(), picked.getDate()),
  ).toISOString();
}

/**
 * Stored ISO datetime → a Date whose LOCAL Y/M/D equal the stored UTC day, so
 * date pickers and `DatePipe` (which format locally) show the intended day.
 */
export function fromPlantationDate(iso: string): Date {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }
  return new Date(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
}
