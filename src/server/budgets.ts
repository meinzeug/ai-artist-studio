import { randomUUID } from "node:crypto";
import { one, transaction } from "./db";
import { AppError } from "./security";
// Paid adapters must call this before any external write. Unknown cost is never zero.
export async function reservePaidAction(
  userId: string,
  jobId: string,
  estimatedCost: number | null,
  approved: boolean,
) {
  if (!approved)
    throw new AppError(
      "Kostenpflichtige Aktion benötigt ausdrückliche Budgetfreigabe.",
    );
  if (
    estimatedCost === null ||
    !Number.isFinite(estimatedCost) ||
    estimatedCost < 0
  )
    throw new AppError(
      "Kosten unbekannt. Verbindliche Obergrenze erforderlich.",
    );
  return transaction(async (c) => {
    const settings = await one(
      "SELECT * FROM settings WHERE user_id=$1 FOR UPDATE",
      [userId],
      c,
    );
    if (!settings || settings.emergency_stop)
      throw new AppError("Produktion gesperrt.");
    const job = await one("SELECT user_id FROM jobs WHERE id=$1", [jobId], c);
    if (!job || job.user_id !== userId)
      throw new AppError("Auftrag gehört nicht zum Betreiber.");
    const existing = await one(
      "SELECT * FROM budget_reservations WHERE job_id=$1",
      [jobId],
      c,
    );
    if (existing) {
      if (existing.user_id !== userId)
        throw new AppError("Unzulässige Reservierung.");
      if (existing.kind !== "external" || existing.cost === null)
        throw new AppError(
          "Auftrag besitzt keine passende Kostenreservierung.",
        );
      return existing;
    }
    const sums = await one(
      "SELECT coalesce(sum(cost) FILTER(WHERE created_at>=date_trunc('day',now() AT TIME ZONE $2) AT TIME ZONE $2),0) AS daily,coalesce(sum(cost) FILTER(WHERE created_at>=date_trunc('month',now() AT TIME ZONE $2) AT TIME ZONE $2),0) AS monthly FROM budget_reservations WHERE user_id=$1 AND state IN ('reserved','consumed')",
      [userId, settings.timezone],
      c,
    );
    if (
      Number(sums!.daily) + estimatedCost > Number(settings.daily_cost_limit) ||
      Number(sums!.monthly) + estimatedCost >
        Number(settings.monthly_cost_limit)
    )
      throw new AppError("Kostenbudget würde überschritten.");
    const row = await one(
      "INSERT INTO budget_reservations(id,user_id,job_id,kind,units,cost) VALUES($1,$2,$3,'external',1,$4) RETURNING *",
      [randomUUID(), userId, jobId, estimatedCost],
      c,
    );
    return row;
  });
}
