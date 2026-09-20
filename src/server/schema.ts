import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

// Versioned SQL migrations own DDL. This typed projection is shared by the read model.
export const artists = pgTable("artists", {
  id: uuid().primaryKey(),
  user_id: uuid().notNull(),
  name: text().notNull(),
  bio: text().notNull(),
  language: text().notNull(),
  market: text().notNull(),
  genre: text().notNull(),
  color: text().notNull(),
  identity: jsonb().$type<Record<string, unknown>>().notNull(),
  version: integer().notNull(),
  archived: boolean().notNull(),
  created_at: timestamp({ withTimezone: true, mode: "string" }).notNull(),
});
