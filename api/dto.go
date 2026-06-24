package api

// This file defines the JSON wire format for the API. The domain packages use
// integer enums (rendered here via their String() methods) and typed string
// IDs (rendered as plain strings), so explicit DTOs keep the wire format
// readable and decoupled from the internal Go types. Monetary amounts stay as
// integer minor units (never floats or strings).
//
// Per-resource DTOs live in dto_ledger.go, dto_deposit.go, and dto_payment.go
// (mirroring the handlers_*.go split). This file holds only the cross-cutting
// types shared across resources.

// nameRequest, descriptionRequest, and reasonRequest are generic single-field
// request bodies reused across multiple resources.

type nameRequest struct {
	Name string `json:"name"`
}

type descriptionRequest struct {
	Description string `json:"description"`
}

type reasonRequest struct {
	Reason string `json:"reason"`
}
