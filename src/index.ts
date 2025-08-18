import { initializeDatabase } from './db/init';
import { bot, checkForNewTerms } from './utils';
import cron from 'node-cron';

initializeDatabase();

bot.on('message', (msg: any) => {
  const chatId = msg.chat.id;

  console.log(`Received message from ${chatId}:`, msg.text);
});

cron.schedule(
  '*/15 * * * *',
  async () => {
    console.log('Running scheduled term check every 15 minutes');
    await checkForNewTerms();
  },
  {
    timezone: 'Europe/Ljubljana',
  },
);
