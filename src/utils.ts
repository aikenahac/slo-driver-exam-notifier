import * as cheerio from 'cheerio';
import { updateLastDates } from './db/update-last-dates';
import TelegramBot from 'node-telegram-bot-api';
import { getLastDates } from './db/get-last-dates';

const telegramToken = process.env.TELEGRAM_API_TOKEN ?? '';
export const bot = new TelegramBot(telegramToken, { polling: true });

const TELEGRAM_CHAT_IDS = ['943993004', '7154559188'];

// Updated encoded param for new website format
// {"page":[0],"filters":{"type":["1"],"cat":["6"],"izpitniCenter":["18"],"lokacija":["221"],"calendar_date":["2025-10-28"],"offset":["0"],"sentinel_type":["ok"],"sentinel_status":["ok"],"is_ajax":["1"]},"offsetPage":null}
export const encodedParam =
  'eyJwYWdlIjpbMF0sImZpbHRlcnMiOnsidHlwZSI6WyIxIl0sImNhdCI6WyI2Il0sIml6cGl0bmlDZW50ZXIiOlsiMTgiXSwibG9rYWNpamEiOlsiMjIxIl0sImNhbGVuZGFyX2RhdGUiOlsiMjAyNS0xMC0yOCJdLCJvZmZzZXQiOlsiMCJdLCJzZW50aW5lbF90eXBlIjpbIm9rIl0sInNlbnRpbmVsX3N0YXR1cyI6WyJvayJdLCJpc19hamF4IjpbIjEiXX0sIm9mZnNldFBhZ2UiOm51bGx9';

/**
 * Sends a Telegram notification
 * @param body - The message body
 */
export async function notifyWithTelegram(body: string): Promise<void> {
  try {
    TELEGRAM_CHAT_IDS.forEach((chat) => {
      bot.sendMessage(chat, body);
    });

    console.log(`[${getLogDate()}] [Telegram message sent]:`, body);
  } catch (err) {
    console.error(`[${getLogDate()}] [Telegram send error]:`, err);
  }
}

const baseUrlClient =
  'https://e-uprava.gov.si/si/javne-evidence/prosti-termini-zemljevid.html';

const baseUrlComputer =
  'https://e-uprava.gov.si/si/javne-evidence/prosti-termini-zemljevid/content/singleton.html';

/**
 * Decode Base64 encoded JSON parameters
 */
function decodeParameters(encodedParam: string): any {
  const decodedStr = Buffer.from(encodedParam, 'base64').toString('utf-8');
  return JSON.parse(decodedStr);
}

/**
 * Converts a date string from 'DD. MM. YYYY' to 'YYYY-MM-DD' format.
 * @param dateStr - The date string in 'DD. MM. YYYY' format
 * @returns The date string in 'YYYY-MM-DD' format
 */
function convertDateToISO(dateStr: string | null) {
  if (!dateStr) return null;

  const match = dateStr.match(/^(\d{1,2})\. (\d{1,2})\. (\d{4})$/);
  if (!match) throw new Error('Invalid date format');
  let [, day, month, year] = match;

  if (
    typeof day === 'undefined' ||
    typeof month === 'undefined' ||
    typeof year === 'undefined'
  ) {
    throw new Error('Invalid date format');
  }

  if (day.length === 1) day = '0' + day;
  if (month.length === 1) month = '0' + month;
  return `${year}-${month}-${day}`;
}

/**
 * Build URL with query parameters
 */
function buildUrl(
  baseUrl: string,
  filters: Record<string, string | string[]>,
): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        searchParams.append(key, v);
      }
    } else {
      searchParams.append(key, value);
    }
  }

  return `${baseUrl}?${searchParams.toString()}`;
}

/**
 * Extract event date and time from HTML using cheerio
 */
function extractDateTime(
  htmlContent: string,
): { date: string | null; time: string }[] {
  const $ = cheerio.load(htmlContent);
  const events: { date: string | null; time: string }[] = [];

  // Find all table rows with class js_dogodekBox js_dicDetailsBtnRow
  $('.js_dogodekBox.js_dicDetailsBtnRow').each((_, box) => {
    const $box = $(box);

    // Find the date from the calendarBox div (only in rows with rowspan)
    const calendarDiv = $box.find('.calendarBox');
    const date = calendarDiv.attr('aria-label')?.trim() || null;

    // Find the time from the td with data-th="Ura"
    const time = $box.find('td[data-th="Ura"]').text().trim();

    if (date && time) {
      events.push({ date, time });
    } else if (!date && time) {
      // If no date found in this row, use the date from previous rows
      // We'll handle this by looking for the last known date
      const prevCalendar = $box.prevAll('tr').find('.calendarBox').first();
      const prevDate = prevCalendar.attr('aria-label')?.trim() || null;
      if (prevDate && time) {
        events.push({ date: prevDate, time });
      }
    }
  });

  return events;
}

interface Event {
  date: string;
  time: string;
}

/**
 * Get the Monday of the current week for a given date
 */
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  return new Date(d.setDate(diff));
}

/**
 * Format date to YYYY-MM-DD
 */
function formatDateToISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Poll events for multiple weeks ahead
 * Stops when at least 10 events are found or max weeks reached
 */
export async function getEvents(encodedParam: string, weeksAhead: number = 20, minEvents: number = 10): Promise<Array<Event>> {
  const params = decodeParameters(encodedParam);
  const filters = params.filters ?? {};

  const allEvents: Array<Event> = [];
  const today = new Date();
  const startMonday = getMonday(today);

  // Fetch events for each week
  for (let week = 0; week < weeksAhead; week++) {
    const weekDate = new Date(startMonday);
    weekDate.setDate(startMonday.getDate() + (week * 7));

    const calendarDate = formatDateToISO(weekDate);
    const weekFilters = { ...filters, calendar_date: calendarDate };
    const url = buildUrl(baseUrlComputer, weekFilters);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`[${getLogDate()}] HTTP error for week ${week + 1}: ${response.status}`);
        continue;
      }

      const htmlContent = await response.text();
      const eventsRaw = extractDateTime(htmlContent);
      const events = eventsRaw.map((event) => ({
        date: convertDateToISO(event.date),
        time: event.time,
      }));

      const validEvents = events.filter((event) => event.date) as Array<Event>;
      allEvents.push(...validEvents);

      console.log(`[${getLogDate()}] Found ${validEvents.length} events for week starting ${calendarDate}`);

      // Stop fetching if we have enough events
      if (allEvents.length >= minEvents) {
        console.log(`[${getLogDate()}] Reached ${allEvents.length} events, stopping search`);
        break;
      }
    } catch (err) {
      console.error(`[${getLogDate()}] Error fetching week ${week + 1}:`, err);
    }
  }

  return allEvents;
}

function formatDate(dateStr: string) {
  const currentYear = new Date().getFullYear();
  const [year, month, day] = dateStr.split('-');
  return `${day}. ${month}. ${year}`.replace(` ${currentYear}`, '');
}

export function constructMessage(events: Event[]): string {
  const header = 'Novi termini za glavno vožnjo so na voljo\n';

  const formattedEvents = events
    .filter((event) => event.date && event.time)
    .map((event) => `- ${formatDate(event.date)} ob ${event.time}`)
    .join('\n');

  // Build URL with hash fragment for new format
  const params = decodeParameters(encodedParam);
  const filters = params.filters ?? {};

  // Remove dynamic fields that shouldn't be in the client URL
  const { calendar_date, offset, is_ajax, sentinel_type, sentinel_status, ...staticFilters } = filters;

  // Create clean params object for client URL
  const clientParams = {
    filters: staticFilters
  };
  const clientEncodedParam = Buffer.from(JSON.stringify(clientParams)).toString('base64');
  const url = `${baseUrlClient}?lang=si#${clientEncodedParam}`;

  const footer = `\n\nPoglej si več: ${url}`;

  return `${header}\n${formattedEvents}${footer}`;
}

async function notifyAboutNewEvents(events: Array<Event>): Promise<void> {
  const message = constructMessage(events);

  await notifyWithTelegram(message);
}

export async function invalidateDates(): Promise<void> {
  const lastDates = getLastDates();

  let validated = [...lastDates];

  if (lastDates.length > 0) {
    validated = validated.filter((dateTime) => {
      if (!dateTime) return false;

      const [date] = dateTime.split('--');
      if (!date) return false;

      const eventDate = new Date(date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      return eventDate > today;
    });
  }

  updateLastDates(validated);
}

export async function checkForNewTerms(): Promise<void> {
  const lastDates = getLastDates();
  const newEvents = await getEvents(encodedParam);

  // Filter out events already in lastDates
  let filteredEvents = newEvents.filter((event) => {
    const eventDate = `${event.date}--${event.time}`;
    return !lastDates.includes(eventDate);
  });

  updateLastDates(newEvents.map((event) => `${event.date}--${event.time}`));

  // Further filter: only keep events before the earliest date in lastDates
  if (lastDates.length > 0) {
    // Extract dates from lastDates (format: YYYY-MM-DD--HH:MM), filter out undefined/null
    const lastDatesOnly = lastDates
      .map((d) => d.split('--')[0])
      .filter((d): d is string => !!d);
    if (lastDatesOnly.length > 0) {
      // Find the earliest date in lastDates
      const earliestDate = lastDatesOnly.reduce((min, curr) =>
        curr < min ? curr : min,
      );
      filteredEvents = filteredEvents.filter(
        (event) => event.date && event.date < earliestDate,
      );
    }
  }

  if (filteredEvents.length > 0) {
    await notifyAboutNewEvents(filteredEvents);
  } else {
    console.log(`[${getLogDate()}] No new terms found`);
  }
}

export function formatLogDate(date: Date): string {
  const pad = (num: number) => num.toString().padStart(2, "0");

  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1); // months are 0-indexed
  const year = date.getFullYear();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${day}.${month}.${year} @ ${hours}:${minutes}`;
}

export function getLogDate(): string {
  const now = new Date();
  return formatLogDate(now);
}