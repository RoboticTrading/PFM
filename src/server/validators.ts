import { z } from "zod";

/** A decimal money string, e.g. "-82.10" or "1234.5600". */
export const moneyString = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "amount must be a decimal string");

/** An ISO calendar date, "YYYY-MM-DD". */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");
