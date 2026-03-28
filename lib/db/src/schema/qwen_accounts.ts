import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const qwenAccountsTable = pgTable("qwen_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  tokenType: text("token_type").default("Bearer"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertQwenAccountSchema = createInsertSchema(qwenAccountsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertQwenAccount = z.infer<typeof insertQwenAccountSchema>;
export type QwenAccount = typeof qwenAccountsTable.$inferSelect;
