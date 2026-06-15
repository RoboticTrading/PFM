import { numeric, timestamp } from "drizzle-orm/pg-core";

/**
 * Standard mutable-row timestamps. `updated_at` is maintained by the app on
 * write (Actions); both default to now() at insert.
 */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

/** Money column — fixed precision, never float. Drizzle returns it as a string. */
export function money(name: string) {
  return numeric(name, { precision: 20, scale: 4 });
}
