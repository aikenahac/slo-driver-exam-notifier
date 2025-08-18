import { constructMessage, encodedParam, getEvents, notifyWithTelegram } from "./utils";

async function testMessages() {
  const events = await getEvents(encodedParam);
  const message = constructMessage(events);

  console.log("[TEST MESSAGE]::", message);
  await notifyWithTelegram(message);
}

testMessages();