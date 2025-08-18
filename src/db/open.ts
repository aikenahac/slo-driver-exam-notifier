import { Database } from "bun:sqlite";

export const db = new Database("last_dates.db", {
  create: true
});