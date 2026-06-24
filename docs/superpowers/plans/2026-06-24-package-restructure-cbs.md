# cbs Module Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the Go module to `github.com/raphi011/cbs`, move the root `ledger` package into a `ledger/` subdirectory, and split `api/dto.go` into per-resource files — with no behavior change.

**Architecture:** Pure restructuring of an already-clean, acyclic, downward-only package DAG (`cmd/server → api,seed → payment → deposit → ledger`). Sequenced **rename-first, then move** so the module rename is a single uniform string swap and the move only has to repoint the bare core import at `…/cbs/ledger`. The DTO split is an intra-package relocation of declarations.

**Tech Stack:** Go 1.24.7, standard library only (no external deps).

## Global Constraints

- New module path: `github.com/raphi011/cbs` (exact).
- The moved package keeps `package ledger`; **no exported identifier changes anywhere**.
- macOS / BSD `sed` requires the `-i ''` form (empty backup-suffix arg). Adjust to `sed -i` if executing under GNU sed.
- **This is a refactor: no new tests.** The existing suite is the regression gate — it must stay green after every task. Do not modify test behavior; only their import paths change (handled by the same rewrites as production code).
- Regression gate command (run at the end of every task, all must pass):
  ```
  go build ./... && go vet ./... && go test ./... && test -z "$(gofmt -l .)"
  ```
- These stay at the repo root, untouched: `book/`, `README.md`, `web/`, `docs/`.
- The two historical files `docs/superpowers/plans/2026-06-23-*.md` and `docs/superpowers/specs/2026-06-23-*.md` reference the old module path and are **left unchanged** (they record past state).

---

### Task 1: Rename module to `github.com/raphi011/cbs`

Rename the module and rewrite every internal import. At this point the core `ledger` package is still at the repo root, so its import path is the bare `github.com/raphi011/cbs`; sub-packages are `github.com/raphi011/cbs/<sub>`. A single uniform swap is correct because both the bare module path and every sub-path share the `github.com/raphi011/ledger` prefix.

**Files:**
- Modify: `go.mod` (module directive)
- Modify: all 18 `*.go` files importing the module (in `deposit/`, `payment/`, `seed/`, `api/`, `cmd/server/`)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: module path `github.com/raphi011/cbs`; core ledger package importable as `github.com/raphi011/cbs` (still root, temporarily); sub-packages as `github.com/raphi011/cbs/deposit|payment|seed|api`.

- [ ] **Step 1: Establish a green baseline**

Run: `go build ./... && go test ./...`
Expected: PASS (clean tree before any change). If this fails, stop — the tree was already broken.

- [ ] **Step 2: Rewrite the module directive in go.mod**

Run:
```
go mod edit -module github.com/raphi011/cbs
```
Verify: `head -1 go.mod` shows `module github.com/raphi011/cbs`.

- [ ] **Step 3: Rewrite import paths in all Go files**

Run:
```
grep -rl --include='*.go' 'github.com/raphi011/ledger' . \
  | grep -v '/web/' \
  | xargs sed -i '' 's|github.com/raphi011/ledger|github.com/raphi011/cbs|g'
```
Verify no occurrences remain in source:
```
grep -rn --include='*.go' 'github.com/raphi011/ledger' . | grep -v '/web/'
```
Expected: no output. (The `docs/*.md` files are intentionally not matched by `--include='*.go'`.)

- [ ] **Step 4: Format**

Run: `gofmt -w .`

- [ ] **Step 5: Run the regression gate**

Run:
```
go build ./... && go vet ./... && go test ./... && test -z "$(gofmt -l .)"
```
Expected: builds, vets clean, all tests PASS, no gofmt diffs.

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "Rename Go module to github.com/raphi011/cbs"
```

---

### Task 2: Move the `ledger` package into `ledger/`

`git mv` the 7 root `*.go` files into a new `ledger/` directory (package name stays `ledger`), then repoint the bare core import `"github.com/raphi011/cbs"` at the new subdir path `"github.com/raphi011/cbs/ledger"`. The core package imports nothing internal, so the moved files themselves need no import edits.

**Files:**
- Move: `doc.go`, `errors.go`, `service.go`, `service_test.go`, `types.go`, `list.go`, `list_test.go` → `ledger/`
- Modify: consumers in `deposit/`, `payment/`, `seed/`, `api/` (the bare core import only — `cmd/server` does not import the core directly)

**Interfaces:**
- Consumes: module path `github.com/raphi011/cbs` from Task 1.
- Produces: core ledger package at import path `github.com/raphi011/cbs/ledger`. No symbol changes — `ledger.Book`, `ledger.Amount`, `ledger.PostTransactionRequest`, etc. are unchanged.

- [ ] **Step 1: Create the directory and move the files (history-preserving)**

Run:
```
mkdir ledger
git mv doc.go errors.go service.go service_test.go types.go list.go list_test.go ledger/
```
Verify: `ls ledger/` lists the 7 files; `ls *.go` errors / shows none at root.

- [ ] **Step 2: Confirm the moved files still declare `package ledger`**

Run: `grep -h '^package ' ledger/*.go | sort -u`
Expected: a single line `package ledger`.

- [ ] **Step 3: Repoint the bare core import in its consumers**

Run:
```
grep -rl --include='*.go' '"github.com/raphi011/cbs"' . \
  | grep -v '/web/' \
  | xargs sed -i '' 's|"github.com/raphi011/cbs"|"github.com/raphi011/cbs/ledger"|g'
```
This matches only the bare core import (closing quote immediately after `cbs`); sub-package imports like `"github.com/raphi011/cbs/deposit"` are not affected.
Verify: `grep -rn --include='*.go' '"github.com/raphi011/cbs"' . | grep -v '/web/'`
Expected: no output (every bare import is now `…/cbs/ledger`).

- [ ] **Step 4: Format**

Run: `gofmt -w .`

- [ ] **Step 5: Run the regression gate**

Run:
```
go build ./... && go vet ./... && go test ./... && test -z "$(gofmt -l .)"
```
Expected: builds, vets clean, all tests PASS (including the moved `ledger/service_test.go` and `ledger/list_test.go`), no gofmt diffs.

- [ ] **Step 6: Commit**

```
git add -A
git commit -m "Move ledger package into ledger/ subdirectory"
```

---

### Task 3: Split `api/dto.go` into per-resource files

`api/dto.go` (531 lines) is the only file in `api/` not split per-resource. Relocate its declarations into three resource files mirroring `handlers_*.go`, leaving cross-cutting declarations in a trimmed `dto.go`. **Move declarations verbatim — do not alter any struct field, body, or signature.** All files are `package api`, so this is a pure relocation; the compiler is the authority on per-file imports.

**Files:**
- Create: `api/dto_ledger.go`
- Create: `api/dto_deposit.go`
- Create: `api/dto_payment.go`
- Modify: `api/dto.go` (trim to shared remainder)

**Interfaces:**
- Consumes: `github.com/raphi011/cbs/ledger` (+ `…/deposit`, `…/payment`) from Tasks 1–2.
- Produces: identical exported/unexported API surface within `package api`; handlers and `server_test.go` are unaffected (same package).

Declaration assignment (names exactly as they appear in the current `dto.go`):

- **`api/dto_ledger.go`** — `ledgerDTO`, `toLedgerDTO`, `subledgerDTO`, `toSubledgerDTO`, `accountDTO`, `toAccountDTO`, `entryDTO`, `transactionDTO`, `toTransactionDTO`, `toLedgerAuditDTO`, `createAccountRequest`, `postTransactionRequest`, `postTransactionRequest.toDomain`, `accountTypeFromString`, `directionFromString`.
  Imports: `"fmt"`, `"time"`, `"github.com/raphi011/cbs/ledger"`.

- **`api/dto_deposit.go`** — `depositAccountDTO`, `toDepositAccountDTO`, `holdDTO`, `toHoldDTO`, `balanceDTO`, `toBalanceDTO`, `snapshotDTO`, `toSnapshotDTO`, `toDepositAuditDTO`, `openDepositAccountRequest`, `statusRequest`, `createHoldRequest`, `captureHoldRequest`, `snapshotRequest`, `fundRequest`.
  Imports: `"time"`, `"github.com/raphi011/cbs/deposit"` (add `"github.com/raphi011/cbs/ledger"` only if `go build` reports it used).

- **`api/dto_payment.go`** — `participantDTO`, `toParticipantDTO`, `reserveDTO`, `partyRefDTO`, `toPartyRefDTO`, `partyRefDTO.toDomain`, `paymentDTO`, `toPaymentDTO`, `mandateDTO`, `toMandateDTO`, `clearingCycleDTO`, `toClearingCycleDTO`, `settlementDTO`, `toSettlementDTO`, `positionsToMap`, `schemeDTO`, `toSchemeDTO`, `createMandateRequest`, `initiatePaymentRequest`, `initiatePaymentRequest.toDomain`, `openCycleRequest`.
  Imports: `"time"`, `"github.com/raphi011/cbs/ledger"`, `"github.com/raphi011/cbs/payment"`.

- **`api/dto.go`** (remainder, shared/cross-cutting) — the file-level wire-format comment, the `auditEventDTO` type (rendered from both ledger and deposit audit events), and the generic request envelopes `nameRequest`, `descriptionRequest`, `reasonRequest`.
  Imports: `"time"` only.

- [ ] **Step 1: Create `api/dto_ledger.go`**

Create the file with header `package api`, the imports listed above, and the ledger-group declarations moved verbatim out of `dto.go`:
```go
package api

import (
	"fmt"
	"time"

	"github.com/raphi011/cbs/ledger"
)

// (move the ledger-layer declarations here verbatim)
```

- [ ] **Step 2: Create `api/dto_deposit.go`**

```go
package api

import (
	"time"

	"github.com/raphi011/cbs/deposit"
)

// (move the deposit-layer declarations here verbatim)
```

- [ ] **Step 3: Create `api/dto_payment.go`**

```go
package api

import (
	"time"

	"github.com/raphi011/cbs/ledger"
	"github.com/raphi011/cbs/payment"
)

// (move the payment-layer declarations here verbatim)
```

- [ ] **Step 4: Trim `api/dto.go` to the shared remainder**

Leave only the file comment, `auditEventDTO`, `nameRequest`, `descriptionRequest`, `reasonRequest`, and reduce the import block to:
```go
import (
	"time"
)
```

- [ ] **Step 5: Reconcile imports against the compiler**

Run: `go build ./...`
For any `imported and not used` error, remove that import from the offending file; for any `undefined: <pkg>` error, add the corresponding `github.com/raphi011/cbs/<pkg>` import. Re-run until it builds. (If `goimports` is installed, `goimports -w api/` does this automatically.)

- [ ] **Step 6: Format**

Run: `gofmt -w api/`

- [ ] **Step 7: Confirm no declaration was lost or duplicated**

Run:
```
grep -hcE '^(func|type) ' api/dto.go api/dto_ledger.go api/dto_deposit.go api/dto_payment.go | paste -sd+ - | bc
```
Expected: `55` (the original count of top-level `func`/`type` declarations in `dto.go`).

- [ ] **Step 8: Run the regression gate**

Run:
```
go build ./... && go vet ./... && go test ./... && test -z "$(gofmt -l .)"
```
Expected: builds, vets clean, all tests PASS (`api/server_test.go` exercises the DTOs end-to-end), no gofmt diffs.

- [ ] **Step 9: Commit**

```
git add -A
git commit -m "Split api/dto.go into per-resource files"
```

---

## Self-Review

**Spec coverage:**
- Module rename → Task 1. ✓
- Root `ledger` → `ledger/` move → Task 2. ✓
- `api/dto.go` split → Task 3. ✓
- `book/`/`README.md`/`web/`/`docs/` untouched → Global Constraints. ✓
- Historical docs left at old path → Global Constraints. ✓
- No-behavior-change / existing tests as gate → Global Constraints + each task's gate. ✓

**Placeholder scan:** The "(move … here verbatim)" markers in Task 3 are deliberate relocation instructions (the source content already exists in `dto.go` with exact declaration lists given above), not unfinished work. No TBD/TODO/"handle edge cases" placeholders.

**Type consistency:** Declaration names in Task 3 are copied verbatim from the live `dto.go` grep; the count check (Step 7, expect 55) guards against drift. Import paths are consistent with the post-Task-2 layout (`github.com/raphi011/cbs/ledger|deposit|payment`).
