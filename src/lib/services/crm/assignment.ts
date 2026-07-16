/**
 * Round-robin lead assignment planner. Pure and deterministic: each lead goes
 * to the member with the fewest owned open leads at that moment (ties broken
 * by user id), and the running counts include assignments made within the
 * same plan, so a batch spreads evenly.
 */

export type AssignableMember = { userId: string; openCount: number };

export type Assignment = { leadId: string; userId: string };

export function planRoundRobin(
  leadIds: string[],
  members: AssignableMember[],
): Assignment[] {
  if (members.length === 0) return [];
  const counts = new Map<string, number>();
  for (const m of members) counts.set(m.userId, m.openCount);
  const userIds = [...counts.keys()].sort();

  const assignments: Assignment[] = [];
  for (const leadId of leadIds) {
    let best = userIds[0];
    for (const userId of userIds) {
      if ((counts.get(userId) ?? 0) < (counts.get(best) ?? 0)) best = userId;
    }
    counts.set(best, (counts.get(best) ?? 0) + 1);
    assignments.push({ leadId, userId: best });
  }
  return assignments;
}
