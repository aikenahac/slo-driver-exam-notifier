import { initializeDatabase } from './db/init';
import { bot, checkForNewTerms, getLogDate, invalidateDates } from './utils';
import cron from 'node-cron';

initializeDatabase();

bot.on('message', (msg: any) => {
  const chatId = msg.chat.id;

  console.log(`[${getLogDate()}] Received message from ${chatId}:`, msg.text);
});

cron.schedule(
  '*/30 * * * *',
  async () => {
    console.log(`[${getLogDate()}] Invalidating dates before today`);
    await invalidateDates();
    console.log(`[${getLogDate()}] Running scheduled term check every 30 minutes`);
    await checkForNewTerms();
  },
  {
    timezone: 'Europe/Ljubljana',
  },
);