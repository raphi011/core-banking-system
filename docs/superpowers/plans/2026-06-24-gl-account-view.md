# GL-account detail view + descriptive names — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every GL account (`acct_*`) a navigable, named thing — a detail route at `…/accounts/[aid]` plus `id · name` rendering with the id linking into it.

**Architecture:** Frontend-only composition of existing endpoints. The one real logic change is generalizing the statement projection to sign by the account's normal balance (so it's correct for any account type, not just liabilities); everything else reuses existing hooks, the `StatementTable`, and the chart-of-accounts data already cached for the pickers.

**Tech Stack:** Next.js 16 (App Router, client pages + `useParams`) · React 19 · TanStack Query · Tailwind v4 · shadcn/ui · Vitest (for the one pure-function unit test).

## Global Constraints

- **Frontend only — no backend change.** All data comes from existing endpoints.
- **Amounts are integer cents.** Render via `Money`/`AmountCell` from `@/components/money`.
- **No FE test runner for components.** Only `web/src/lib/*.ts` pure functions have unit tests (Vitest). Component tasks are gated by `npm run typecheck && npm run lint && npm run build` (all must be clean) plus manual browser verification per `web/CLAUDE.md`.
- **`DisallowUnknownFields` backend** — N/A here (no new requests), but don't add request bodies.
- All commands run from `web/` unless stated. Backend (`go run ./cmd/server` from repo root) must be up for manual checks.
- Branch: `gl-account-view` (already created off `main`).

---

### Task 1: Normal-balance-aware `projectStatement`

Generalize the projection to sign deltas by the account's `AccountType` using the existing `NORMAL_BALANCE` table, instead of the hard-coded liability rule. The customer statement becomes the `Liability` default — behavior unchanged. This is the only task with real unit tests.

**Files:**
- Modify: `web/src/lib/statement.ts` (signature + signing logic)
- Test: `web/src/lib/statement.test.ts` (add asset case; fix one existing call to the new options shape)
- Modify: `web/src/lib/api/hooks.ts:239-258` (`useStatement` caller passes the new options object)

**Interfaces:**
- Consumes: `NORMAL_BALANCE: Record<AccountType, Direction>` and `AccountType` from `web/src/lib/enums.ts` (already exist; `NORMAL_BALANCE` at `enums.ts:64`).
- Produces: `projectStatement(txs: Transaction[], accountId: string, opts?: { type?: AccountType; knownAccounts?: Record<string, string> }): Statement`. `type` defaults to `"Liability"`; `knownAccounts` defaults to `{}`. `Statement`, `StatementRow`, `ContraRef`, `buildKnownAccounts` are unchanged.

- [ ] **Step 1: Write the failing test**

Add to `web/src/lib/statement.test.ts`, inside the `describe("projectStatement", …)` block (after the existing liability test):

```ts
it("signs by the account's normal balance — an asset rises on a Debit", () => {
  const R = "acct_reserve"; // an asset (normal balance = Debit)
  const txs = [
    tx({ id: "f1", valueDate: "2026-06-01", entries: [leg(R, 50000, "Debit"), leg("acct_11", 50000, "Credit")] }),
    tx({ id: "f2", valueDate: "2026-06-05", entries: [leg(R, 20000, "Credit"), leg("acct_11", 20000, "Debit")] }),
  ];

  const { rows, finalBalance } = projectStatement(txs, R, { type: "Asset" });

  // Asset: Debit +, Credit − (the opposite of the liability convention)
  expect(finalBalance).toBe(30000);
  expect(rows.map((r) => r.txId)).toEqual(["f2", "f1"]); // newest first
  expect(rows[0]).toMatchObject({ delta: -20000, direction: "Credit", runningBalance: 30000 });
  expect(rows[1]).toMatchObject({ delta: 50000, direction: "Debit", runningBalance: 50000 });
});

it("defaults to the liability convention when no type is given", () => {
  const txs = [tx({ id: "t1", entries: [leg(A, 100, "Credit"), leg("acct_02", 100, "Debit")] })];
  expect(projectStatement(txs, A).rows[0].delta).toBe(100); // Credit increases a liability
});
```

Also update the one existing call that passes a label map positionally (currently `web/src/lib/statement.test.ts:89`) to the new options shape:

```ts
// before: projectStatement([single, split], A, { acct_03: "suspense" })
const { rows } = projectStatement([single, split], A, { knownAccounts: { acct_03: "suspense" } });
```

- [ ] **Step 2: Run the tests to verify the new asset test fails**

Run: `npx vitest run src/lib/statement.test.ts`
Expected: FAIL — the asset test sees the liability sign (`delta: +20000` / `finalBalance: 70000`) because `projectStatement` ignores `type`; the relabeled call and others still pass.

- [ ] **Step 3: Implement the normal-balance signing**

Edit `web/src/lib/statement.ts`. Change the imports at the top:

```ts
import type { Direction, TransactionStatus } from "@/lib/enums";
import { NORMAL_BALANCE } from "@/lib/enums";
import type { AccountType } from "@/lib/enums";
import type { Participant, Transaction } from "@/lib/types";
```

Replace the `projectStatement` signature and the `delta` computation. The new signature and the destructure of options:

```ts
export function projectStatement(
  txs: Transaction[],
  accountId: string,
  opts: { type?: AccountType; knownAccounts?: Record<string, string> } = {},
): Statement {
  const { type = "Liability", knownAccounts = {} } = opts;
  const increases = NORMAL_BALANCE[type]; // the direction that increases this account

  const touching = txs.filter((t) => t.entries.some((e) => e.accountId === accountId));
```

(Rename the local `glAccount` parameter usages to `accountId` throughout the function body — there are references at the `touching` filter, the `mine`/`others` split, and the contra construction.) Replace the delta reducer:

```ts
    const delta = mine.reduce(
      (sum, e) => sum + (e.direction === increases ? e.amount : -e.amount),
      0,
    );
```

Update the doc comment above the function to say it signs by the account's normal balance (no longer "liability convention"), and update the inline comment on `runningBalance` in `StatementRow` (`statement.ts:17`) from "liability convention" to "signed by the account's normal balance".

- [ ] **Step 4: Update the `useStatement` caller**

Edit `web/src/lib/api/hooks.ts:246`. The deposit statement's backing account is always a liability, so pass it explicitly:

```ts
  const { rows, finalBalance } = useMemo(
    () => projectStatement(txq.data ?? [], glAccount, { type: "Liability", knownAccounts: known }),
    [txq.data, glAccount, known],
  );
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/statement.test.ts`
Expected: PASS — all `projectStatement` and `buildKnownAccounts` tests green, including the new asset and default-liability tests.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: clean (no errors). Confirms the `useStatement` caller and any other `projectStatement` callers match the new signature.

- [ ] **Step 7: Commit**

```bash
git add src/lib/statement.ts src/lib/statement.test.ts src/lib/api/hooks.ts
git commit -m "Make statement projection normal-balance-aware

Sign deltas by the account's AccountType via NORMAL_BALANCE instead of a
hard-coded liability rule. The customer statement is now the Liability
special case; any account type reconciles to its book balance."
```

---

### Task 2: `AccountRef` component + thread `pid` through `StatementTable`

Create a shared `AccountRef` that renders `id · name` with the id linking to the account route, and use it in the statement table's contra cell and expanded legs. Add an `amountHintId` prop so a generic (non-liability) page can show a type-agnostic hint.

**Files:**
- Create: `web/src/components/account-ref.tsx`
- Modify: `web/src/components/statement/statement-table.tsx` (add `pid` + `amountHintId` props; use `AccountRef`)
- Modify: `web/src/components/statement/statement-card.tsx:45` (pass `pid`)
- Modify: `web/src/app/participants/[pid]/deposit-accounts/[did]/statement/page.tsx:26` (pass `pid`)

**Interfaces:**
- Consumes: `useAllAccounts(pid)` from `@/lib/api/hooks` (returns `AccountWithContext[]`); `IdText` from `@/components/id-text`.
- Produces: `AccountRef({ pid, id, label?, className? }: { pid: string; id: string; label?: string; className?: string })`. `StatementTable` now requires a `pid: string` prop and accepts optional `amountHintId?: string` (default `"statement-amount"`).

- [ ] **Step 1: Create `AccountRef`**

Create `web/src/components/account-ref.tsx`:

```tsx
"use client";

import Link from "next/link";

import { IdText } from "@/components/id-text";
import { useAllAccounts } from "@/lib/api/hooks";

// Renders an account id as `id · name`, the id linking to the account's detail
// page. `label` (a curated role word like "suspense", or "this account") wins
// over the resolved chart-of-accounts name. `stopPropagation` keeps the link
// clickable inside a row that has its own onClick (e.g. the statement table).
export function AccountRef({
  pid,
  id,
  label,
  className,
}: {
  pid: string;
  id: string;
  label?: string;
  className?: string;
}) {
  const { data } = useAllAccounts(pid);
  const name = label ?? data?.find((a) => a.id === id)?.name;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Link
        href={`/participants/${pid}/accounts/${id}`}
        className="hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        <IdText id={id} className={className} />
      </Link>
      {name && <span className="text-xs text-muted-foreground">· {name}</span>}
    </span>
  );
}
```

- [ ] **Step 2: Use `AccountRef` in `StatementTable` and add the new props**

Edit `web/src/components/statement/statement-table.tsx`:

Add the import:

```ts
import { AccountRef } from "@/components/account-ref";
```

Change `ContraCell` to take `pid` and render `AccountRef` (replacing the inline `IdText` + label):

```tsx
function ContraCell({ pid, contra }: { pid: string; contra: ContraRef }) {
  if (contra.kind === "split") {
    return <span className="text-xs text-muted-foreground">Split · {contra.count} legs</span>;
  }
  return <AccountRef pid={pid} id={contra.accountId} label={contra.label} />;
}
```

Change the `StatementTable` signature to require `pid` and accept `amountHintId`:

```tsx
export function StatementTable({
  rows,
  book,
  glAccount,
  pid,
  amountHintId = "statement-amount",
}: {
  rows: StatementRow[];
  book?: number;
  glAccount: string;
  pid: string;
  amountHintId?: string;
}) {
```

In the Amount column header, use the prop:

```tsx
                  <Hint id={amountHintId} />
```

In the contra cell usage (currently `<ContraCell contra={row.contra} />`), pass `pid`:

```tsx
                    <ContraCell pid={pid} contra={row.contra} />
```

In the expanded-legs list, replace the leg's `<IdText id={e.accountId} />` with `AccountRef` (keep the surrounding `DirectionBadge`, the `isMine` highlight, and the "this account" badge exactly as-is):

```tsx
                                  <DirectionBadge direction={e.direction} />
                                  <AccountRef pid={pid} id={e.accountId} />
                                  {isMine && (
```

`Hint`'s `id` prop accepts any registry key string, so passing `amountHintId` is type-safe as `string`. (If `Hint`'s prop is a stricter union, widen the `amountHintId` type to match `Hint`'s `id` type in the same edit.)

- [ ] **Step 3: Pass `pid` from the two existing callers**

Edit `web/src/components/statement/statement-card.tsx:45`:

```tsx
            <StatementTable rows={recent} book={book} glAccount={account.glAccount} pid={pid} />
```

Edit `web/src/app/participants/[pid]/deposit-accounts/[did]/statement/page.tsx:26`:

```tsx
  return <StatementTable rows={rows} book={book} glAccount={account.glAccount} pid={pid} />;
```

- [ ] **Step 4: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all clean. (The new required `pid` prop forces both callers to be updated — if either was missed, typecheck fails here.)

- [ ] **Step 5: Manual verification**

With backend + `npm run dev` up: open a funded deposit account's statement. Confirm each contra and each expanded leg now reads `acct_x · Name`, the id is a link, and clicking it navigates to `/participants/{pid}/accounts/{acct_x}` (a 404/empty page is expected until Task 3 — just confirm the URL and that the row does NOT toggle-expand when the link is clicked).

- [ ] **Step 6: Commit**

```bash
git add src/components/account-ref.tsx src/components/statement/statement-table.tsx src/components/statement/statement-card.tsx "src/app/participants/[pid]/deposit-accounts/[did]/statement/page.tsx"
git commit -m "Add AccountRef; render statement accounts as id·name links"
```

---

### Task 3: GL-account hooks + detail route

Add the two thin hooks and the `…/accounts/[aid]` page that composes them with the reused `StatementTable`. This task's deliverable is a working, navigable account page.

**Files:**
- Modify: `web/src/lib/api/hooks.ts` (add `useGLAccount`, `useAccountStatement`; import `AccountType`)
- Create: `web/src/app/participants/[pid]/accounts/[aid]/page.tsx`

**Interfaces:**
- Consumes: `useAllAccounts`, `useAccountBalance`, `useTransactions`, `useParticipant`, `useDepositAccounts` (all exist in `hooks.ts`); `projectStatement`/`buildKnownAccounts` from `@/lib/statement`; `AccountWithContext` is the element type of `useAllAccounts` data (`{ ...Account, ledgerName, subledgerName }`); `StatementTable` (now requires `pid`, accepts `amountHintId`); `AccountTypeBadge` from `@/components/enum-badge`.
- Produces:
  - `useGLAccount(pid: string, aid: string): { account: AccountWithContext | undefined; isLoading: boolean; error: unknown; refetch: () => void }`
  - `useAccountStatement(pid: string, aid: string, type: AccountType | undefined): { rows: StatementRow[]; finalBalance: number; book: number | undefined; isLoading: boolean; error: unknown; refetch: () => void }`

- [ ] **Step 1: Add the hooks**

Edit `web/src/lib/api/hooks.ts`. Add to the existing enum import (or add a new import line):

```ts
import type { AccountType } from "@/lib/enums";
```

Add these two hooks (place them right after `useAllAccounts`, near `hooks.ts:141`):

```ts
// A single GL account with its ledger/subledger context, derived from the
// cached chart of accounts (there's no per-account GET endpoint). Returns
// undefined for an unknown id once loading settles → the page shows not-found.
export function useGLAccount(pid: string, aid: string) {
  const q = useAllAccounts(pid);
  const account = useMemo(() => q.data?.find((a) => a.id === aid), [q.data, aid]);
  return {
    account,
    isLoading: q.isLoading,
    error: q.error,
    refetch: () => q.refetch(),
  };
}

// The General Ledger projected onto ANY account, signed by its normal balance,
// with the account's book balance for reconciliation. The deposit-specific
// useStatement is the Liability sibling of this; here `type` comes from the
// resolved account (pass undefined while it loads — rows aren't shown yet).
export function useAccountStatement(pid: string, aid: string, type: AccountType | undefined) {
  const txq = useTransactions(pid, aid);
  const balq = useAccountBalance(pid, aid);
  const partq = useParticipant(pid);

  const known = useMemo(() => buildKnownAccounts(partq.data), [partq.data]);
  const { rows, finalBalance } = useMemo(
    () => projectStatement(txq.data ?? [], aid, { type: type ?? "Liability", knownAccounts: known }),
    [txq.data, aid, type, known],
  );

  return {
    rows: rows as StatementRow[],
    finalBalance,
    book: balq.data?.balance,
    isLoading: txq.isLoading || balq.isLoading,
    error: txq.error ?? balq.error,
    refetch: () => txq.refetch(),
  };
}
```

(`useAccountBalance` returns `BookBalance` → `{ accountId, balance }`, so the account's book balance is `balq.data?.balance`. Contrast with `useStatement`, which uses the deposit `Balance.book`.)

- [ ] **Step 2: Create the page**

Create `web/src/app/participants/[pid]/accounts/[aid]/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { IdText } from "@/components/id-text";
import { Money } from "@/components/money";
import { AccountTypeBadge } from "@/components/enum-badge";
import { ErrorState } from "@/components/error-state";
import { StatementTable } from "@/components/statement/statement-table";
import {
  useAccountStatement,
  useDepositAccounts,
  useGLAccount,
  useParticipant,
} from "@/lib/api/hooks";
import { buildKnownAccounts } from "@/lib/statement";

export default function AccountDetailPage() {
  const params = useParams();
  const pid = typeof params.pid === "string" ? params.pid : "";
  const aid = typeof params.aid === "string" ? params.aid : "";

  const { account, isLoading: accLoading, error: accError, refetch } = useGLAccount(pid, aid);
  const statement = useAccountStatement(pid, aid, account?.type);
  const { data: deposits } = useDepositAccounts(pid);
  const { data: participant } = useParticipant(pid);

  const back = `/participants/${pid}/ledger`;
  const backingDeposit = deposits?.find((d) => d.glAccount === aid);
  const role = participant ? buildKnownAccounts(participant)[aid] : undefined;

  return (
    <div className="space-y-5">
      <Link href={back} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Chart of accounts
      </Link>

      {accError ? (
        <ErrorState error={accError} onRetry={() => refetch()} />
      ) : accLoading ? (
        <Skeleton className="h-10 w-64" />
      ) : !account ? (
        <ErrorState error={new Error(`Account ${aid} not found in the chart of accounts.`)} onRetry={() => refetch()} />
      ) : (
        <>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight">{account.name}</h2>
              <AccountTypeBadge type={account.type} />
              <IdText id={account.id} />
            </div>
            <p className="text-sm text-muted-foreground">
              {account.ledgerName} · {account.subledgerName}
              {role && (
                <>
                  {" · "}the participant&apos;s <span className="font-medium">{role}</span> account
                </>
              )}
            </p>
            {backingDeposit && (
              <p className="text-sm text-muted-foreground">
                Backing account for deposit{" "}
                <Link
                  href={`/participants/${pid}/deposit-accounts/${backingDeposit.id}`}
                  className="underline hover:text-foreground"
                >
                  {backingDeposit.name}
                </Link>
                .
              </p>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Balance</CardTitle>
            </CardHeader>
            <CardContent>
              {statement.book == null ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                <div className="text-lg font-semibold tabular-nums">
                  <Money cents={statement.book} />
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Account ledger</h3>
            {statement.error ? (
              <ErrorState error={statement.error} onRetry={() => statement.refetch()} />
            ) : statement.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <StatementTable
                rows={statement.rows}
                book={statement.book}
                glAccount={aid}
                pid={pid}
                amountHintId="normal-balance"
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 4: Manual verification (the reconciliation tie-out is the key check)**

Backend + `npm run dev` up. Seed: create participant → open deposit account → fund it → post a couple of transactions touching it.
- From the deposit statement (Task 2), click the backing account leg (`acct_11`) → lands on `/participants/{pid}/accounts/acct_11`. Confirm: header shows name · `Liability` badge · id · subledger context · "Backing account for deposit …" link; the **Balance** equals the deposit's Book; the ledger's newest **Running balance reconciles** (green banner) to that Balance.
- Click a contra leg that points at an **asset** (e.g. the reserve) → its page shows the `Asset` badge and the running balance reconciles with the **opposite** sign convention (a Debit raises it). This is the normal-balance teaching payoff.
- Visit `/participants/{pid}/accounts/does_not_exist` → clean "not found" `ErrorState`, not a half-rendered page.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/hooks.ts "src/app/participants/[pid]/accounts/[aid]/page.tsx"
git commit -m "Add GL-account detail route with normal-balance-aware ledger"
```

---

### Task 4: Wire links from the Ledger page and the deposit detail line

Make the remaining account references navigate into the new route: the Ledger page's account rows and the deposit detail page's "Backed by GL account" line (the inverse of Task 3's backlink).

**Files:**
- Modify: `web/src/app/participants/[pid]/ledger/page.tsx:185-199` (`AccountRow`)
- Modify: `web/src/app/participants/[pid]/deposit-accounts/[did]/page.tsx:366-370` (the "Backed by" line)

**Interfaces:**
- Consumes: `AccountRef` from `@/components/account-ref` (deposit detail line); `Link` from `next/link` (ledger row). No new exports.

- [ ] **Step 1: Link the Ledger account rows**

Edit `web/src/app/participants/[pid]/ledger/page.tsx`. Add the import:

```ts
import Link from "next/link";
```

In `AccountRow`, make the name a link to the account page (keep the `AccountTypeBadge` and `IdText` as-is — the name already shows, so don't use `AccountRef` here and double it):

```tsx
function AccountRow({ pid, account }: { pid: string; account: Account }) {
  const { data } = useAccountBalance(pid, account.id);
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="flex items-center gap-2">
        <Link
          href={`/participants/${pid}/accounts/${account.id}`}
          className="text-sm hover:underline"
        >
          {account.name}
        </Link>
        <AccountTypeBadge type={account.type} />
        <IdText id={account.id} />
      </span>
      <span className="text-sm font-medium">
        <Money cents={data?.balance ?? 0} />
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Link the deposit detail "Backed by GL account" line**

Edit `web/src/app/participants/[pid]/deposit-accounts/[did]/page.tsx`. Add the import:

```ts
import { AccountRef } from "@/components/account-ref";
```

Replace the `IdText` for the backing account (currently `web/src/app/participants/[pid]/deposit-accounts/[did]/page.tsx:367`) with `AccountRef`:

```tsx
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            Backed by GL account <AccountRef pid={pid} id={account.glAccount} /> · overdraft
            limit <Money cents={account.overdraftLimit} />
            <Hint id="overdraft" />
          </p>
```

- [ ] **Step 3: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 4: Manual verification**

- Ledger page (`/participants/{pid}/ledger`): each account name is now a link; clicking one opens its `/accounts/[aid]` page. Confirm an asset (e.g. reserve) and a liability (a customer account) both open and reconcile.
- Deposit detail page: "Backed by GL account `acct_11 · Name`" is a link landing on the same account page → round-trips with that page's "Backing account for deposit …" backlink.

- [ ] **Step 5: Commit**

```bash
git add "src/app/participants/[pid]/ledger/page.tsx" "src/app/participants/[pid]/deposit-accounts/[did]/page.tsx"
git commit -m "Link account references from ledger + deposit detail to account view"
```

---

## Self-Review

**Spec coverage:**
- Generalize projection (normal-balance-aware), Liability special case → **Task 1.** ✓
- New route `…/accounts/[aid]` with header (name · type · context · role note · deposit backlink), balance card, account-ledger with double-entry expand → **Task 3** (expand reused from `StatementTable`). ✓
- `AccountRef` (`id · name`, id-as-anchor, curated words via `label`) → **Task 2.** ✓
- Link wiring: statement contra + legs → **Task 2**; Ledger rows + deposit "Backed by" line → **Task 4**; transactions page deferred (out of scope). ✓
- No backend change; composes existing endpoints/hooks → all tasks. ✓
- Tests: asset + liability projection cases → **Task 1**; component gates typecheck/lint/build + manual → Tasks 2-4. ✓
- Edge cases: unknown aid (not-found ErrorState, Task 3), empty ledger (`StatementTable` empty state), unresolved name (`AccountRef` falls back to bare id), well-known role note (Task 3), link-inside-clickable-row (`stopPropagation` in `AccountRef`). ✓
- Hint correctness: liability-specific `statement-amount` kept for the deposit statement; generic page uses type-agnostic `normal-balance` via `amountHintId` (Task 2/3). ✓ (Improvement over the spec, which hadn't caught the hint mismatch.)

**Placeholder scan:** none — every step has concrete code/commands/expected output.

**Type consistency:** `projectStatement(txs, accountId, { type?, knownAccounts? })` defined in Task 1, consumed with that exact shape in Task 1 (`useStatement`) and Task 3 (`useAccountStatement`). `StatementTable` gains required `pid` + optional `amountHintId` in Task 2, consumed with those names in Task 2 callers and Task 3 page. `useGLAccount`/`useAccountStatement` signatures defined in Task 3 interfaces match their page usage. `AccountRef({ pid, id, label?, className? })` defined Task 2, used in Tasks 2-4. `book` derives from `balq.data?.balance` (BookBalance) on the generic path vs `Balance.book` on the deposit path — intentional, noted.
