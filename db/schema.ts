import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const contextScans = sqliteTable('context_scans', {
  id: text('id').primaryKey(),
  month: text('month').notNull(),
  site: text('site').notNull(),
  credits: integer('credits').notNull().default(0),
  lockedUntil: integer('locked_until').notNull().default(0),
  payload: text('payload').notNull(),
});
