// Central query-key factory. Mutations invalidate by these keys so caches stay
// consistent (e.g. funding a participant invalidates that participant's
// balances). Keys grow as milestones add screens.

export const qk = {
  participants: () => ["participants"] as const,
  participant: (pid: string) => ["participants", pid] as const,

  schemes: () => ["schemes"] as const,

  reserves: () => ["central-bank", "reserves"] as const,
  reserve: (pid: string) => ["central-bank", "reserves", pid] as const,
  centralBankAudit: () => ["central-bank", "audit"] as const,

  // Ledger layer (all nested under the participant so a post can invalidate
  // a whole subtree at once).
  ledgers: (pid: string) => ["participants", pid, "ledgers"] as const,
  subledgers: (pid: string, lid: string) =>
    ["participants", pid, "ledgers", lid, "subledgers"] as const,
  accounts: (pid: string, sid: string) =>
    ["participants", pid, "subledgers", sid, "accounts"] as const,
  accountBalance: (pid: string, aid: string) =>
    ["participants", pid, "accounts", aid, "balance"] as const,
  transactions: (pid: string, account?: string) =>
    account
      ? (["participants", pid, "transactions", { account }] as const)
      : (["participants", pid, "transactions"] as const),
  transaction: (pid: string, tid: string) =>
    ["participants", pid, "transaction", tid] as const,
  ledgerAudit: (pid: string, entity?: string) =>
    entity
      ? (["participants", pid, "audit", { entity }] as const)
      : (["participants", pid, "audit"] as const),
};
