import type { Chapter } from "../types";

export const chapter: Chapter = {
  slug: "02-double-entry-bookkeeping",
  number: 2,
  part: "Part I · The Foundations of Bank Accounting",
  title: "Double-Entry Bookkeeping",
  questions: [
    {
      kind: "mc",
      id: "ch2-q1",
      difficulty: "core",
      concept: "double-entry",
      prompt:
        "A customer deposits $100 in cash. The bank debits its Cash account. What does it credit?",
      options: [
        "The customer's Deposit account — a liability",
        "The bank's Equity account",
        "The customer's Loan account",
        "The bank's Revenue account",
      ],
      answer: 0,
      explanation:
        "Your deposit is the bank's **debt**, not its asset — it owes you the money back. Debit Cash (an asset rises), credit the Deposit (a liability rises); the two sides are equal, so the entry balances. See [[double-entry]] and [[account-type-liability]].",
    },
    {
      kind: "truefalse",
      id: "ch2-q2",
      difficulty: "intro",
      concept: "double-entry",
      prompt: "Every transaction must record equal total debits and total credits.",
      answer: true,
      explanation:
        "This is the single rule of [[double-entry]]: within any transaction the debits and credits are equal, so value is never created or destroyed — it only moves.",
    },
    {
      kind: "truefalse",
      id: "ch2-q3",
      difficulty: "core",
      concept: "normal-balance",
      prompt: "A credit always increases an account's balance.",
      answer: false,
      explanation:
        "Whether a credit raises or lowers a balance depends on the account's type — its [[normal-balance]]. Credits increase liabilities, equity and revenue, but decrease assets and expenses.",
    },
    {
      kind: "mc",
      id: "ch2-q4",
      difficulty: "core",
      concept: "double-entry",
      prompt: "When a trial balance shows total debits equal to total credits, what does that prove?",
      options: [
        "The books are internally balanced",
        "Every transaction is economically correct",
        "No fraud has occurred",
        "Every account has a positive balance",
      ],
      answer: 0,
      explanation:
        "A balanced trial balance proves only that the records are internally consistent — equal debits and credits. It cannot tell you a posting went to the wrong (but still balancing) account. See [[double-entry]].",
    },
    {
      kind: "numeric",
      id: "ch2-q5",
      difficulty: "core",
      concept: "account-type-liability",
      unit: "dollars",
      prompt:
        "A customer deposits $100 in cash. By how many dollars does the bank's total liabilities change? (Enter a number of dollars.)",
      answer: 100,
      explanation:
        "Cash (an asset) rises by $100 and the Deposit (a [[account-type-liability]]) rises by $100. Both sides of the balance sheet grow together.",
    },
    {
      kind: "numeric",
      id: "ch2-q6",
      difficulty: "challenge",
      concept: "account-type-liability",
      unit: "dollars",
      prompt:
        "One customer transfers $50 to another customer at the same bank. By how many dollars does the bank's TOTAL liabilities change? (Enter a number of dollars.)",
      answer: 0,
      explanation:
        "The bank still owes the same total — the obligation just moved from one customer to another. One deposit falls $50, another rises $50; total [[account-type-liability]] is unchanged. No cash left the building.",
    },
    {
      kind: "multi",
      id: "ch2-q7",
      difficulty: "challenge",
      concept: "double-entry",
      prompt: "Which of these are true of double-entry bookkeeping? (Select all that apply.)",
      options: [
        "Every transaction touches at least two accounts",
        "Total debits must equal total credits",
        "A single transaction may have three or more entries",
        "It stores just one running balance per customer",
      ],
      answers: [0, 1, 2],
      explanation:
        "The 'double' means every transaction is recorded from two perspectives — where value came from and where it went — and it always balances, even when it spans three or more accounts. Storing a single balance is exactly what [[double-entry]] avoids.",
    },
    {
      kind: "mc",
      id: "ch2-q8",
      difficulty: "challenge",
      concept: "double-entry",
      prompt:
        "A proposed transaction has debits of $30 and credits of $20. What should a correct banking system do?",
      options: [
        "Reject it — debits must equal credits",
        "Record it and flag it for later review",
        "Silently add a $10 balancing entry",
        "Record only the credit side",
      ],
      answer: 0,
      explanation:
        "An unbalanced set of entries is a corruption of the records, not a small problem. The balance rule of [[double-entry]] is enforced at posting time and the transaction is refused outright.",
    },
    {
      kind: "mc",
      id: "ch2-q9",
      difficulty: "intro",
      concept: "normal-balance",
      prompt: "When your bank says it has 'credited your account,' your balance…",
      options: ["Went up", "Went down", "Stayed the same", "Was frozen"],
      answer: 0,
      explanation:
        "Everyday language has it backwards. Your account is the bank's liability, and credits increase liabilities — so a credit raises your balance. See [[normal-balance]].",
    },
  ],
};
