// One typed function per backend route. Each returns the parsed DTO(s). Grows
// as milestones add coverage; see PLAN.md for the full endpoint → screen map.

import { request, qs } from "./client";
import type {
  Account,
  AuditEvent,
  Balance,
  BookBalance,
  CreateAccountRequest,
  DescriptionRequest,
  FundRequest,
  Ledger,
  NameRequest,
  Participant,
  PostTransactionRequest,
  Reserve,
  Scheme,
  Subledger,
  Transaction,
} from "../types";

// --- Participants ---------------------------------------------------------

export function listParticipants(): Promise<Participant[]> {
  return request("GET", "/participants");
}

export function getParticipant(pid: string): Promise<Participant> {
  return request("GET", `/participants/${pid}`);
}

export function addParticipant(body: NameRequest): Promise<Participant> {
  return request("POST", "/participants", body);
}

// Funds a customer deposit account (and the bank's central-bank reserve in
// step). Returns the deposit account's new balance.
export function fundDeposit(pid: string, body: FundRequest): Promise<Balance> {
  return request("POST", `/participants/${pid}/deposits`, body);
}

// --- Schemes --------------------------------------------------------------

export function listSchemes(): Promise<Scheme[]> {
  return request("GET", "/schemes");
}

// --- Central bank ---------------------------------------------------------

export function listReserves(): Promise<Reserve[]> {
  return request("GET", "/central-bank/reserves");
}

export function getReserve(pid: string): Promise<Reserve> {
  return request("GET", `/central-bank/reserves/${pid}`);
}

export function centralBankAudit(): Promise<AuditEvent[]> {
  return request("GET", "/central-bank/audit");
}

// --- Ledger: ledgers / subledgers / accounts -----------------------------

export function listLedgers(pid: string): Promise<Ledger[]> {
  return request("GET", `/participants/${pid}/ledgers`);
}

export function createLedger(pid: string, body: NameRequest): Promise<Ledger> {
  return request("POST", `/participants/${pid}/ledgers`, body);
}

export function listSubledgers(
  pid: string,
  lid: string,
): Promise<Subledger[]> {
  return request("GET", `/participants/${pid}/ledgers/${lid}/subledgers`);
}

export function createSubledger(
  pid: string,
  lid: string,
  body: NameRequest,
): Promise<Subledger> {
  return request("POST", `/participants/${pid}/ledgers/${lid}/subledgers`, body);
}

export function listAccounts(pid: string, sid: string): Promise<Account[]> {
  return request("GET", `/participants/${pid}/subledgers/${sid}/accounts`);
}

export function createAccount(
  pid: string,
  sid: string,
  body: CreateAccountRequest,
): Promise<Account> {
  return request("POST", `/participants/${pid}/subledgers/${sid}/accounts`, body);
}

export function getBookBalance(
  pid: string,
  aid: string,
): Promise<BookBalance> {
  return request("GET", `/participants/${pid}/accounts/${aid}/balance`);
}

// --- Ledger: transactions -------------------------------------------------

export function listTransactions(
  pid: string,
  account?: string,
): Promise<Transaction[]> {
  return request("GET", `/participants/${pid}/transactions${qs({ account })}`);
}

export function getTransaction(
  pid: string,
  tid: string,
): Promise<Transaction> {
  return request("GET", `/participants/${pid}/transactions/${tid}`);
}

export function postTransaction(
  pid: string,
  body: PostTransactionRequest,
): Promise<Transaction> {
  return request("POST", `/participants/${pid}/transactions`, body);
}

export function reverseTransaction(
  pid: string,
  tid: string,
  body: DescriptionRequest,
): Promise<Transaction> {
  return request(
    "POST",
    `/participants/${pid}/transactions/${tid}/reversal`,
    body,
  );
}

// --- Ledger: audit --------------------------------------------------------

export function ledgerAudit(
  pid: string,
  entity?: string,
): Promise<AuditEvent[]> {
  return request("GET", `/participants/${pid}/audit${qs({ entity })}`);
}
