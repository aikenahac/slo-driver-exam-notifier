import { getLogDate } from '../utils';
import { db } from './open';

/**
 * Sets the last 10 dates from the web server
 * @param {Array<string>} dates - The dates in YYYY-MM-DD-H-mm format.
 */
export function updateLastDates(dateTimes: Array<string>) {
  try {
    db.exec(`DELETE FROM LastDates`);

    dateTimes.forEach((date, index) => {
      db.run(
        `INSERT OR REPLACE INTO LastDates (id, dateTime) VALUES (?, ?)`,
        [`${Date.now() * index}-${date}`, date],
      );

      console.log(`[${getLogDate()}] [DB] Inserted date: ${date}`);
    });
  } catch (error) {
    console.error(`[${getLogDate()}] [DB] Error setting last dates:`, error);
    throw error;
  }
}