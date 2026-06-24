# Chart-of-accounts Numbering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace opaque `acct_*`/`sub_*` IDs with hierarchical chart-of-accounts numbers (`type.subledger.sequence` for accounts, `block` for subledgers), used directly as the entities' IDs.

**Architecture:** All account/subledger IDs are minted in two `ledger.Book` methods (`CreateSubledger`, `CreateAccount`), so the change is centralized there plus a small `AccountType.codeBlock()` helper. Numbers are deterministic from creation order and unique per `Book`. No Go type changes (IDs stay `string`); only the produced values change, so no API/web schema change.

**Tech Stack:** Go 1.24.7, standard library only.

## Global Constraints

- Account ID format: `fmt.Sprintf("%d.%s.%03d", typeBlock, subledgerID, seq)` → e.g. `200.100.001`.
- Type blocks: Asset `100`, Liability `200`, Equity `300`, Revenue `400`, Expense `500`.
- Subledger IDs: `100, 200, 300, …` (book-level counter, step 100, in creation order).
- Account `seq` is per `(typeBlock, subledgerID)` pair, each starting at `001`, zero-padded to 3 digits (type-first CoA convention).
- Numbers are unique **per `Book`**, not globally (the ledger core must not encode the bank/participant — that lives in the `payment` layer).
- Ledger IDs are unchanged (`ldg_*`). `nextID` stays in use for ledgers/events/transactions; `evt_`/`txn_` numeric suffixes will drift — accepted.
- No behavior change beyond identifier values. Regression gate (Task 2 onward): `go build ./... && go vet ./... && go test ./... && test -z "$(gofmt -l .)"`.

---

### Task 1: Core CoA numbering in the `ledger` package

Mint the new IDs in `ledger`. Ends green at package scope (`go test ./ledger/`); repo-wide tests have known downstream failures in `deposit`/`payment` that Task 2 fixes.

**Files:**
- Modify: `ledger/types.go` (add `AccountType.codeBlock()`)
- Modify: `ledger/book.go` (Book fields, `NewBookWithClock`, `CreateSubledger`, `CreateAccount`, import)
- Test: `ledger/numbering_test.go` (new)

**Interfaces:**
- Consumes: existing `Book`, `AccountType`, `CreateLedger/CreateSubledger/CreateAccount`.
- Produces:
  - `func (t AccountType) codeBlock() int` — Asset→100 … Expense→500, unknown→0.
  - `CreateSubledger(ledgerID, name)` returns a `Subledger` whose `ID` is `"100"`, `"200"`, … (book-wide creation order).
  - `CreateAccount(subledgerID, name, type)` returns an `Account` whose `ID` is `"<typeBlock>.<subledgerID>.<seq3>"`, `seq` per `(typeBlock, subledgerID)`.

- [ ] **Step 1: Write the failing numbering test**

Create `ledger/numbering_test.go`:

```go
package ledger

import "testing"

func TestAccountTypeCodeBlock(t *testing.T) {
	cases := map[AccountType]int{
		Asset: 100, Liability: 200, Equity: 300, Revenue: 400, Expense: 500,
	}
	for typ, want := range cases {
		if got := typ.codeBlock(); got != want {
			t.Errorf("%s.codeBlock() = %d, want %d", typ, got, want)
		}
	}
}

func TestSubledgerNumbering(t *testing.T) {
	book := NewBook()
	gl, _ := book.CreateLedger("GL")
	for i, want := range []string{"100", "200", "300"} {
		sl, err := book.CreateSubledger(gl.ID, "S")
		if err != nil {
			t.Fatalf("CreateSubledger #%d: %v", i, err)
		}
		if string(sl.ID) != want {
			t.Errorf("subledger #%d ID = %q, want %q", i, sl.ID, want)
		}
	}
}

func TestAccountNumbering(t *testing.T) {
	book := NewBook()
	gl, _ := book.CreateLedger("GL")
	deposits, _ := book.CreateSubledger(gl.ID, "Customer Deposits") // 100
	interbank, _ := book.CreateSubledger(gl.ID, "Interbank")        // 200

	alice, _ := book.CreateAccount(deposits.ID, "Alice", Liability)
	bob, _ := book.CreateAccount(deposits.ID, "Bob", Liability)
	suspense, _ := book.CreateAccount(interbank.ID, "Clearing Suspense", Liability)
	reserve, _ := book.CreateAccount(interbank.ID, "Reserve", Asset)

	want := map[string]string{
		"alice": "200.100.001", "bob": "200.100.002",
		"suspense": "200.200.001", "reserve": "100.200.001",
	}
	got := map[string]string{
		"alice": string(alice.ID), "bob": string(bob.ID),
		"suspense": string(suspense.ID), "reserve": string(reserve.ID),
	}
	for k, w := range want {
		if got[k] != w {
			t.Errorf("%s ID = %q, want %q", k, got[k], w)
		}
	}
}

func TestAccountNumberingDeterministic(t *testing.T) {
	build := func() AccountID {
		book := NewBook()
		gl, _ := book.CreateLedger("GL")
		sl, _ := book.CreateSubledger(gl.ID, "Deposits")
		a, _ := book.CreateAccount(sl.ID, "Alice", Liability)
		return a.ID
	}
	if build() != build() {
		t.Error("account IDs are not deterministic across books")
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `go test ./ledger/ -run 'Numbering|CodeBlock' -v`
Expected: FAIL — `codeBlock` undefined (compile error) and/or IDs are still `acct_*`/`sub_*`.

- [ ] **Step 3: Add `codeBlock()` to `ledger/types.go`**

Insert after `NormalBalance` (after line 57):

```go
// codeBlock returns the leading chart-of-accounts block for the type:
// 100 Asset, 200 Liability, 300 Equity, 400 Revenue, 500 Expense.
func (t AccountType) codeBlock() int {
	switch t {
	case Asset:
		return 100
	case Liability:
		return 200
	case Equity:
		return 300
	case Revenue:
		return 400
	case Expense:
		return 500
	default:
		return 0
	}
}
```

- [ ] **Step 4: Add the counters to the `Book` struct (`ledger/book.go`)**

In the `Book` struct, after the `idCounter int64` field, add:

```go
	// subledgerSeq is the last chart-of-accounts block issued to a subledger
	// (100, 200, …). Subledgers are identified by their block, book-wide.
	subledgerSeq int

	// accountSeq is the next account sequence within each
	// "<typeBlock>.<subledgerID>" branch. Account numbers reset per
	// (type, subledger) — the type-first chart-of-accounts convention.
	accountSeq map[string]int
```

- [ ] **Step 5: Initialise `accountSeq` and add the `strconv` import (`ledger/book.go`)**

In `NewBookWithClock`, add `accountSeq` to the returned struct literal:

```go
	return &Book{
		ledgers:          make(map[LedgerID]*Ledger),
		subledgers:       make(map[SubledgerID]*Subledger),
		accounts:         make(map[AccountID]*Account),
		transactions:     make(map[TransactionID]*Transaction),
		idempotencyIndex: make(map[string]TransactionID),
		accountSeq:       make(map[string]int),
		clock:            clock,
	}
```

Add `"strconv"` to the import block at the top of `book.go` (keep imports gofmt-sorted: `"fmt"`, `"strconv"`, `"sync"`, `"time"`).

- [ ] **Step 6: Mint subledger IDs in `CreateSubledger` (`ledger/book.go`)**

Replace the `sl := &Subledger{ ... ID: SubledgerID(s.nextID("sub")) ... }` construction with:

```go
	s.subledgerSeq += 100
	sl := &Subledger{
		ID:        SubledgerID(strconv.Itoa(s.subledgerSeq)),
		LedgerID:  ledgerID,
		Name:      name,
		CreatedAt: s.now(),
	}
```

(Leave the `ErrLedgerNotFound` check, `s.subledgers[sl.ID] = sl`, and `appendAudit` calls unchanged.)

- [ ] **Step 7: Mint account IDs in `CreateAccount` (`ledger/book.go`)**

Replace the `acct := &Account{ ... ID: AccountID(s.nextID("acct")) ... }` construction with:

```go
	block := accountType.codeBlock()
	key := fmt.Sprintf("%d.%s", block, subledgerID)
	s.accountSeq[key]++
	acct := &Account{
		ID:          AccountID(fmt.Sprintf("%d.%s.%03d", block, subledgerID, s.accountSeq[key])),
		SubledgerID: subledgerID,
		Name:        name,
		Type:        accountType,
		CreatedAt:   s.now(),
	}
```

(Leave the `ErrSubledgerNotFound` check, `s.accounts[acct.ID] = acct`, and `appendAudit` calls unchanged.)

- [ ] **Step 8: Run the numbering tests — verify they pass**

Run: `go test ./ledger/ -run 'Numbering|CodeBlock' -v`
Expected: PASS (all four tests).

- [ ] **Step 9: Run the whole ledger package + vet + format**

Run: `go test ./ledger/ && go vet ./ledger/ && gofmt -l ledger/`
Expected: ledger tests PASS (existing `book_test.go`/`list_test.go` capture IDs from creation, so they need no changes), vet clean, no gofmt output.

- [ ] **Step 10: Commit**

```bash
git add ledger/types.go ledger/book.go ledger/numbering_test.go
git commit -m "Number accounts and subledgers with chart-of-accounts codes"
```

---

### Task 2: Update the two ID-dependent tests and the web comment

Three small downstream edits close the repo-wide regression gate. Only one test actually breaks functionally (`deposit`); the other two are clarity/staleness fixes.

**Files:**
- Modify: `deposit/register_test.go` (rewrite `mustCash`, delete now-unused `itoa`)
- Modify: `payment/system_test.go:381` (sentinel literal)
- Modify: `web/src/components/id-text.tsx` (stale comment)

**Interfaces:**
- Consumes: `Book.ListLedgers() []Ledger`, `Book.ListSubledgers(LedgerID) []Subledger`, `Book.ListAccounts(SubledgerID) []Account` (existing, in `ledger/list.go`).
- Produces: nothing new — restores a green suite.

- [ ] **Step 1: Confirm the downstream failure**

Run: `go test ./... 2>&1 | grep -vE 'ok|no test files'`
Expected: failures originate in `deposit` (the `mustCash` helper reconstructs `acct_<n>` IDs that no longer exist). `payment`/`seed`/`api` should still pass because they capture IDs from creation/responses.

- [ ] **Step 2: Rewrite `mustCash` to find the asset account by type (`deposit/register_test.go`)**

Replace the `mustCash` function (the one scanning `"acct_" + itoa(id)`) with a format-independent walk:

```go
// mustCash returns the cash account created by testRegister, located by type
// (it is the only Asset account in the fixture), without depending on the ID
// format.
func mustCash(t *testing.T, reg *Register) ledger.AccountID {
	t.Helper()
	for _, l := range reg.book.ListLedgers() {
		for _, sl := range reg.book.ListSubledgers(l.ID) {
			for _, a := range reg.book.ListAccounts(sl.ID) {
				if a.Type == ledger.Asset {
					return a.ID
				}
			}
		}
	}
	t.Fatal("cash account not found")
	return ""
}
```

- [ ] **Step 3: Delete the now-unused `itoa` helper (`deposit/register_test.go`)**

Remove the entire `func itoa(i int) string { ... }` function (its only caller was `mustCash`). If `go build` later reports `itoa` used elsewhere, restore it instead — but the only reference was in `mustCash`.

- [ ] **Step 4: Update the not-found sentinel (`payment/system_test.go:381`)**

Change the literal `"acct_999"` to `"999.999.999"` (still a non-existent account, now in the new format):

```go
			Debtor: PartyRef{Participant: a.ID, Account: "999.999.999"}, Creditor: PartyRef{Participant: b.ID, Account: bob},
```

- [ ] **Step 5: Fix the stale ID example comment (`web/src/components/id-text.tsx`)**

Update the leading comment that cites `acct_9` as an example ID. Replace the example with a new-format one, e.g.:

```ts
// Renders a backend ID (bank_1, 200.100.001, …) in monospace. IDs are
```

(Comment-only; not covered by the Go gate.)

- [ ] **Step 6: Run the full regression gate**

Run: `go build ./... && go vet ./... && go test ./... && test -z "$(gofmt -l .)"`
Expected: builds, vets clean, all tests PASS, no gofmt diffs.

- [ ] **Step 7: Commit**

```bash
git add deposit/register_test.go payment/system_test.go web/src/components/id-text.tsx
git commit -m "Update tests and a comment for chart-of-accounts IDs"
```

---

## Self-Review

**Spec coverage:**
- `type.subledger.sequence` account IDs + `block` subledger IDs → Task 1 (Steps 6–7). ✓
- Type blocks 100–500 → `codeBlock()`, Task 1 Step 3. ✓
- Subledger book-level counter (100, 200…) → `subledgerSeq`, Task 1 Steps 4–6. ✓
- `seq` per (type, subledger), zero-padded 3 → Task 1 Step 7 + `TestAccountNumbering`. ✓
- Per-book uniqueness / no bank encoding → numbering uses only type+subledger (no payment-layer input). ✓
- Determinism → `TestAccountNumberingDeterministic`. ✓
- `evt_`/`txn_` drift accepted; `nextID` retained for others → Steps 6–7 only swap account/subledger minting. ✓
- Ledger IDs unchanged → `CreateLedger` untouched. ✓
- Known hardcoded literals fixed → Task 2 Steps 2–4. ✓
- Web no functional change, optional comment → Task 2 Step 5. ✓
- New numbering unit tests (incl. mixed-type subledger) → Task 1 Step 1. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases". Every code step shows the exact code. The `itoa` removal has an explicit fallback condition rather than a vague instruction.

**Type consistency:** `codeBlock()` returns `int`; `subledgerSeq int`; `accountSeq map[string]int`; IDs built with `strconv.Itoa` (subledger) and `fmt.Sprintf("%d.%s.%03d", …)` (account) — consistent across Steps 3–7 and matched verbatim by the Task 1 test expectations (`"100"`, `"200.100.001"`). `mustCash` uses the real `ListLedgers/ListSubledgers/ListAccounts` signatures from `ledger/list.go`.
