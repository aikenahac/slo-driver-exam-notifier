import { constructMessage, encodedParam, getEvents, getLogDate, notifyWithTelegram } from "./utils";

async function testMessages() {
  const events = await getEvents(encodedParam);
  const message = constructMessage(events);

  console.log(`[${getLogDate()}] [TEST MESSAGE]::`, message);
  await notifyWithTelegram(message);
}

testMessages();