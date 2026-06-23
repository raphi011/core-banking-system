// Package seed builds a comprehensive, internally consistent sample payment
// network for the core-banking system: four banks, customer deposit accounts in
// every lifecycle status, authorization holds, end-of-day snapshots, direct-debit
// mandates, and payments spanning the full lifecycle (settled, returned, cleared,
// accepted and rejected) across settled, closed and open clearing cycles.
//
// The scenario is built on a deterministic clock so IDs and dates are
// reproducible across runs; the clock is switched to real wall-clock time before
// the network is returned, so operations performed afterwards (for example via
// the API after a reset) are timestamped live. It is the factory the server boots
// from and resets to.
package seed
