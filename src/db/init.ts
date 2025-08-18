import { db } from "./open";

export function initializeDatabase() {
  const createLastDatesTableQuery = `
    CREATE TABLE IF NOT EXISTS LastDates (
      id TEXT PRIMARY KEY,
      dateTime TEXT NOT NULL
    );
  `;

  db.exec(createLastDatesTableQuery);
}