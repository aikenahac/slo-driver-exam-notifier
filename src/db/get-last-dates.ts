import { db } from './open';

export function getLastDates(): Array<string> {
  const rows = db.prepare(`SELECT dateTime FROM LastDates`).all() as Array<{ dateTime: string }>;
  return rows.map((row) => row.dateTime);
}
