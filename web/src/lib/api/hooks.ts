// TanStack Query hooks wrapping the endpoint functions. Queries use the key
// factory; mutations invalidate affected keys. Grows per milestone.

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import * as api from "./endpoints";
import { qk } from "./query-keys";

// --- Participants ---------------------------------------------------------

export function useParticipants() {
  return useQuery({
    queryKey: qk.participants(),
    queryFn: api.listParticipants,
  });
}

export function useParticipant(pid: string) {
  return useQuery({
    queryKey: qk.participant(pid),
    queryFn: () => api.getParticipant(pid),
    enabled: pid !== "",
  });
}

export function useAddParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.addParticipant,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.participants() });
    },
  });
}

// --- Schemes --------------------------------------------------------------

export function useSchemes() {
  return useQuery({ queryKey: qk.schemes(), queryFn: api.listSchemes });
}

// --- Central bank ---------------------------------------------------------

export function useReserves() {
  return useQuery({ queryKey: qk.reserves(), queryFn: api.listReserves });
}

export function useReserve(pid: string) {
  return useQuery({
    queryKey: qk.reserve(pid),
    queryFn: () => api.getReserve(pid),
    enabled: pid !== "",
  });
}

export function useCentralBankAudit() {
  return useQuery({
    queryKey: qk.centralBankAudit(),
    queryFn: api.centralBankAudit,
  });
}

// --- Ledger: accounts tree ------------------------------------------------

export function useLedgers(pid: string) {
  return useQuery({
    queryKey: qk.ledgers(pid),
    queryFn: () => api.listLedgers(pid),
    enabled: pid !== "",
  });
}

export function useCreateLedger(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string }) => api.createLedger(pid, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.ledgers(pid) }),
  });
}

export function useSubledgers(pid: string, lid: string) {
  return useQuery({
    queryKey: qk.subledgers(pid, lid),
    queryFn: () => api.listSubledgers(pid, lid),
    enabled: pid !== "" && lid !== "",
  });
}

export function useCreateSubledger(pid: string, lid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string }) =>
      api.createSubledger(pid, lid, body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: qk.subledgers(pid, lid) }),
  });
}

export function useAccounts(pid: string, sid: string) {
  return useQuery({
    queryKey: qk.accounts(pid, sid),
    queryFn: () => api.listAccounts(pid, sid),
    enabled: pid !== "" && sid !== "",
  });
}

export function useCreateAccount(pid: string, sid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; type: import("../enums").AccountType }) =>
      api.createAccount(pid, sid, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.accounts(pid, sid) }),
  });
}

export function useAccountBalance(pid: string, aid: string) {
  return useQuery({
    queryKey: qk.accountBalance(pid, aid),
    queryFn: () => api.getBookBalance(pid, aid),
    enabled: pid !== "" && aid !== "",
  });
}

// --- Ledger: transactions -------------------------------------------------

export function useTransactions(pid: string, account?: string) {
  return useQuery({
    queryKey: qk.transactions(pid, account),
    queryFn: () => api.listTransactions(pid, account),
    enabled: pid !== "",
  });
}

export function useTransaction(pid: string, tid: string) {
  return useQuery({
    queryKey: qk.transaction(pid, tid),
    queryFn: () => api.getTransaction(pid, tid),
    enabled: pid !== "" && tid !== "",
  });
}

// Invalidate the participant's transactions, account balances and audit after
// any posting.
function invalidateLedger(
  qc: ReturnType<typeof useQueryClient>,
  pid: string,
) {
  qc.invalidateQueries({ queryKey: ["participants", pid, "transactions"] });
  qc.invalidateQueries({ queryKey: ["participants", pid, "accounts"] });
  qc.invalidateQueries({ queryKey: ["participants", pid, "audit"] });
}

export function usePostTransaction(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: import("../types").PostTransactionRequest) =>
      api.postTransaction(pid, body),
    onSuccess: () => invalidateLedger(qc, pid),
  });
}

export function useReverseTransaction(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { tid: string; description: string }) =>
      api.reverseTransaction(pid, vars.tid, { description: vars.description }),
    onSuccess: () => invalidateLedger(qc, pid),
  });
}

export function useLedgerAudit(pid: string, entity?: string) {
  return useQuery({
    queryKey: qk.ledgerAudit(pid, entity),
    queryFn: () => api.ledgerAudit(pid, entity),
    enabled: pid !== "",
  });
}
