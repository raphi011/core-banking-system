package payment

import "github.com/raphi011/ledger"

// Participant is a bank (or payment service provider) that takes part in the
// clearing and settlement system.
//
// Each participant keeps its OWN ledger — its general ledger / balance sheet.
// Banks only meet at the central bank, where each holds a reserve account.
// This mirrors reality and is what makes the distinction between clearing
// (exchanging instructions) and settlement (moving central-bank reserves)
// concrete.
//
// The internal accounts each participant needs:
//
//   - Customer deposit accounts (Liability): what the bank owes its
//     customers. Created via OpenCustomerAccount.
//   - Clearing Suspense (Liability): an in-transit account holding funds
//     that have left a customer but not yet settled between banks. It
//     returns to zero once a cycle settles.
//   - Reserve at Central Bank (Asset): the bank's claim on the central bank.
//     It mirrors the bank's reserve account in the central-bank ledger and
//     moves only at settlement.
type Participant struct {
	ID     ParticipantID
	Name   string
	Ledger *ledger.Service

	CustomerSubledger ledger.SubledgerID
	SuspenseAccount   ledger.AccountID // "Clearing Suspense" (Liability)
	ReserveAccount    ledger.AccountID // "Reserve at Central Bank" (Asset)

	// SettlementAccount is this participant's reserve account in the
	// central-bank ledger (the central bank's "vostro" view of the bank).
	SettlementAccount ledger.AccountID
}

// OpenCustomerAccount opens a new customer deposit account at the bank.
//
// Customer deposits are Liability accounts: the money belongs to the
// customer, so the bank owes it to them.
func (p *Participant) OpenCustomerAccount(name string) (ledger.Account, error) {
	return p.Ledger.CreateAccount(p.CustomerSubledger, name, ledger.Liability)
}
