import * as cheerio from 'cheerio';
import { updateLastDates } from './db/update-last-dates';
import TelegramBot from 'node-telegram-bot-api';
import { getLastDates } from './db/get-last-dates';

const telegramToken = process.env.TELEGRAM_API_TOKEN ?? '';
export const bot = new TelegramBot(telegramToken, { polling: true });

const TELEGRAM_CHAT_IDS = ['943993004'];

const encodedParam = 'eyJwYWdlIjpbMF0sImZpbHRlcnMiOnsidHlwZSI6WyIxIl0sImNhdCI6WyI2Il0sIml6cGl0bmlDZW50ZXIiOlsiMTgiXSwibG9rYWNpamEiOlsiMjIxIl0sIm9mZnNldCI6WyIwIl0sInNlbnRpbmVsX3R5cGUiOlsib2siXSwic2VudGluZWxfc3RhdHVzIjpbIm9rIl0sImlzX2FqYXgiOlsiMSJdfSwib2Zmc2V0UGFnZSI6bnVsbH0=';

/**
 * Sends a Telegram notification
 * @param body - The message body
 */
export async function notifyWithTelegram(body: string): Promise<void> {
  try {
    TELEGRAM_CHAT_IDS.forEach((chat) => {
      bot.sendMessage(chat, body);
    });

    console.log('Telegram message sent:', body);
  } catch (err) {
    console.error('Telegram send error:', err);
  }
}

const baseUrlClient =
  'https://e-uprava.gov.si/si/javne-evidence/prosti-termini';

const baseUrlComputer =
  'https://e-uprava.gov.si/si/javne-evidence/prosti-termini/content/singleton.html';

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

  const match = dateStr.match(/^(\d{2})\. (\d{2})\. (\d{4})$/);
  if (!match) throw new Error('Invalid date format');
  const [, day, month, year] = match;
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

  $('.js_dogodekBox').each((_, box) => {
    const calendarDiv = $(box).find('.calendarBox');
    const date = calendarDiv.attr('aria-label')?.trim() || null;

    const spans = $(box).find('span');
    const time = spans.last().text().trim();

    if (date || time) {
      events.push({ date, time });
    }
  });

  return events;
}

interface Event {
  date: string;
  time: string;
}

/**
 * Poll events repeatedly at interval
 */
async function getEvents(encodedParam: string): Promise<Array<Event>> {
  const params = decodeParameters(encodedParam);
  const filters = params.filters ?? {};
  const url = buildUrl(baseUrlComputer, filters);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const htmlContent = await response.text();
    const eventsRaw = extractDateTime(htmlContent);
    const events = eventsRaw.map((event) => ({
      date: convertDateToISO(event.date),
      time: event.time,
    }));

    return events.filter((event) => event.date) as Array<Event>;
  } catch (err) {
    console.error('Error fetching the URL:', err);
    return [];
  }
}

function formatDate(dateStr: string) {
  const currentYear = new Date().getFullYear();
  const [year, month, day] = dateStr.split("-");
  return `${day}. ${month}. ${year}`.replace(` ${currentYear}`, '');
}


function constructMessage(events: Event[]): string {
  const header = "Novi termini za glavno vožnjo so na voljo\n";
  
  const formattedEvents = events
    .filter((event) => event.date && event.time)
    .map((event, idx) => `${idx + 1}. ${formatDate(event.date)} ob ${event.time}`)
    .join("\n");

  const params = decodeParameters(encodedParam);
  const filters = params.filters ?? {};
  const url = buildUrl(baseUrlClient, filters);
  const footer = `\n\nPoglej si več: ${url}`;

  return `${header}\n${formattedEvents}${footer}`;
}

async function notifyAboutNewEvents(events: Array<Event>): Promise<void> {
  const message = constructMessage(events);

  await notifyWithTelegram(message);
}

export async function checkForNewTerms(): Promise<void> {
  const lastDates = getLastDates();
  const newEvents = await getEvents(encodedParam);


  // Filter out events already in lastDates
  let filteredEvents = newEvents.filter((event) => {
    const eventDate = `${event.date}--${event.time}`;
    return !lastDates.includes(eventDate);
  });

  // Further filter: only keep events before the earliest date in lastDates
  if (lastDates.length > 0) {
    // Extract dates from lastDates (format: YYYY-MM-DD--HH:MM), filter out undefined/null
    const lastDatesOnly = lastDates
      .map((d) => d.split('--')[0])
      .filter((d): d is string => !!d);
    if (lastDatesOnly.length > 0) {
      // Find the earliest date in lastDates
      const earliestDate = lastDatesOnly.reduce((min, curr) => (curr < min ? curr : min));
      filteredEvents = filteredEvents.filter((event) => event.date && event.date < earliestDate);
    }
  }

  if (filteredEvents.length > 0) {
    await notifyAboutNewEvents(filteredEvents);
    updateLastDates(newEvents.map((event) => `${event.date}--${event.time}`));
  } else {
    console.log('No new terms found');
  }
}