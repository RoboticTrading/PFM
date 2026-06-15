import { desc, eq } from "drizzle-orm";

import { getDb } from "../index";
import { positionHistory } from "./schemas";

export interface PositionHistoryRow {
  positionId: string;
  strategyType: string | null;
  underlying: string | null;
  openDate: string | null;
  closeDate: string | null;
  isClosed: boolean | null;
  netPnl: string | null;
  contracts: number | null;
}

function project(
  r: typeof positionHistory.$inferSelect,
): PositionHistoryRow {
  return {
    positionId: String(r.positionId),
    strategyType: r.strategyType,
    underlying: r.underlying,
    openDate: r.openDate,
    closeDate: r.closeDate,
    isClosed: r.isClosed,
    netPnl: r.netPnl,
    contracts: r.contracts,
  };
}

/** `trade_analysis.position_history` rows, newest open first (read-only). */
export async function listPositionHistory(
  opts: { limit?: number; openOnly?: boolean } = {},
): Promise<PositionHistoryRow[]> {
  const base = getDb().select().from(positionHistory);
  const filtered = opts.openOnly
    ? base.where(eq(positionHistory.isClosed, false))
    : base;
  const rows = await filtered
    .orderBy(desc(positionHistory.openDate))
    .limit(opts.limit ?? 100);
  return rows.map(project);
}

/** Look up a single position_history row by its id (for linking). */
export async function getPositionHistory(
  positionId: string,
): Promise<PositionHistoryRow | null> {
  const rows = await getDb()
    .select()
    .from(positionHistory)
    .where(eq(positionHistory.positionId, positionId))
    .limit(1);
  return rows[0] ? project(rows[0]) : null;
}
