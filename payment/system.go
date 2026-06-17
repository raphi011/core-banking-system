package payment

import (
	"fmt"
	"sync"
	"time"

	"github.com/raphi011/ledger"
)

// System is the payment processor. It owns one ledger per participant bank
// plus a central-bank ledger, and orchestrates payments through their full
// lifecycle: initiation, clearing (netting), and settlement.
//
// # Multiple ledgers, no cross-ledger atomicity
//
// Each participant bank and the central bank keep separate ledger.Service
// instances, each with its own lock. A single payment therefore touches
// several ledgers, and those postings cannot be one atomic transaction the
// way a real RTGS would guarantee with a locked settlement window. The
// System serializes whole operations under its own mutex and always posts
// the debit side before the credit side; this is a deliberate simplification
// for a single-process learning model.
//
// # Thread safety
//
// All public methods are safe for concurrent use.
type System struct {
	mu    sync.RWMutex
	clock func() time.Time

	schemes      map[SchemeID]Scheme
	participants map[ParticipantID]*Participant
	payments     map[PaymentID]*Payment
	mandates     map[MandateID]*Mandate
	cycles       map[CycleID]*ClearingCycle
	settlements  map[SettlementID]*Settlement

	// openCycle tracks the single open clearing cycle per scheme.
	openCycle map[SchemeID]CycleID

	// endToEndIndex deduplicates payments by their end-to-end id.
	endToEndIndex map[string]PaymentID

	// centralBank holds the participants' reserve accounts.
	centralBank        *ledger.Service
	cbReserveSubledger ledger.SubledgerID
	cbAssets           ledger.AccountID // balancing asset for reserve issuance

	idCounter int64
}

// NewSystem creates a payment system with the SEPA Credit Transfer and SEPA
// Direct Debit schemes registered. It uses time.Now as its clock; tests set
// the clock field directly for determinism.
func NewSystem() *System {
	return NewSystemWithClock(time.Now)
}

// NewSystemWithClock is like NewSystem but reads time from the provided
// clock. Every ledger the system creates shares this clock.
func NewSystemWithClock(clock func() time.Time) *System {
	s := &System{
		clock:         clock,
		schemes:       make(map[SchemeID]Scheme),
		participants:  make(map[ParticipantID]*Participant),
		payments:      make(map[PaymentID]*Payment),
		mandates:      make(map[MandateID]*Mandate),
		cycles:        make(map[CycleID]*ClearingCycle),
		settlements:   make(map[SettlementID]*Settlement),
		openCycle:     make(map[SchemeID]CycleID),
		endToEndIndex: make(map[string]PaymentID),
		centralBank:   ledger.NewServiceWithClock(clock),
	}

	// Build the central bank's chart of accounts.
	cb, _ := s.centralBank.CreateLedger("Central Bank")
	reserves, _ := s.centralBank.CreateSubledger(cb.ID, "Member Reserves")
	capital, _ := s.centralBank.CreateSubledger(cb.ID, "Central Bank Capital")
	assets, _ := s.centralBank.CreateAccount(capital.ID, "Settlement Assets", ledger.Asset)
	s.cbReserveSubledger = reserves.ID
	s.cbAssets = assets.ID

	s.RegisterScheme(SCT{})
	s.RegisterScheme(SDD{})
	return s
}

func (s *System) now() time.Time { return s.clock() }

func (s *System) nextID(prefix string) string {
	s.idCounter++
	return fmt.Sprintf("%s_%d", prefix, s.idCounter)
}

// RegisterScheme adds (or replaces) a scheme. Adding support for instant or
// card payments is just a matter of registering a type that implements
// Scheme — the orchestration below is scheme-agnostic.
func (s *System) RegisterScheme(sc Scheme) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.schemes[sc.ID()] = sc
}

// CentralBank exposes the central-bank ledger for inspection (balances,
// audit trail). Treat it as read-only.
func (s *System) CentralBank() *ledger.Service { return s.centralBank }

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

// AddParticipant registers a new bank. It builds the bank's own ledger and
// chart of accounts and opens a reserve account for it at the central bank.
//
// The new bank starts with zero reserves; fund it with Deposit.
func (s *System) AddParticipant(name string) (*Participant, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	bank := ledger.NewServiceWithClock(s.clock)

	gl, err := bank.CreateLedger(name + " GL")
	if err != nil {
		return nil, err
	}
	customers, err := bank.CreateSubledger(gl.ID, "Customer Deposits")
	if err != nil {
		return nil, err
	}
	interbank, err := bank.CreateSubledger(gl.ID, "Interbank")
	if err != nil {
		return nil, err
	}
	suspense, err := bank.CreateAccount(interbank.ID, "Clearing Suspense", ledger.Liability)
	if err != nil {
		return nil, err
	}
	reserve, err := bank.CreateAccount(interbank.ID, "Reserve at Central Bank", ledger.Asset)
	if err != nil {
		return nil, err
	}

	// Open the bank's reserve account in the central-bank ledger.
	cbReserve, err := s.centralBank.CreateAccount(s.cbReserveSubledger, "Reserve: "+name, ledger.Liability)
	if err != nil {
		return nil, err
	}

	p := &Participant{
		ID:                ParticipantID(s.nextID("bank")),
		Name:              name,
		Ledger:            bank,
		CustomerSubledger: customers.ID,
		SuspenseAccount:   suspense.ID,
		ReserveAccount:    reserve.ID,
		SettlementAccount: cbReserve.ID,
	}
	s.participants[p.ID] = p
	return p, nil
}

// Deposit funds a customer account with cash, modelled as the bank placing
// the cash on reserve at the central bank.
//
// Two ledgers move in step, keeping the reserve mirror intact:
//
//	bank ledger:    Debit  Reserve at Central Bank (asset)  / Credit customer (liability)
//	central bank:   Debit  Settlement Assets (asset)        / Credit Reserve: <bank> (liability)
func (s *System) Deposit(participant ParticipantID, account ledger.AccountID, amount ledger.Amount, description string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if amount <= 0 {
		return ErrInvalidPaymentAmount
	}
	p, ok := s.participants[participant]
	if !ok {
		return ErrParticipantNotFound
	}
	if _, err := p.Ledger.GetAccount(account); err != nil {
		return ErrAccountNotInParticipant
	}

	if _, err := p.Ledger.PostTransaction(ledger.PostTransactionRequest{
		Description: description,
		Entries: []ledger.Entry{
			{AccountID: p.ReserveAccount, Amount: amount, Direction: ledger.Debit},
			{AccountID: account, Amount: amount, Direction: ledger.Credit},
		},
	}); err != nil {
		return err
	}

	_, err := s.centralBank.PostTransaction(ledger.PostTransactionRequest{
		Description: "Reserve credit: " + p.Name,
		Entries: []ledger.Entry{
			{AccountID: s.cbAssets, Amount: amount, Direction: ledger.Debit},
			{AccountID: p.SettlementAccount, Amount: amount, Direction: ledger.Credit},
		},
	})
	return err
}

// ---------------------------------------------------------------------------
// Mandates (for direct debits)
// ---------------------------------------------------------------------------

// CreateMandate records a debtor's authorization for a creditor to collect
// funds via direct debit. A MaxAmount of 0 means unlimited.
func (s *System) CreateMandate(debtor, creditor PartyRef, maxAmount ledger.Amount) (Mandate, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.checkParty(debtor); err != nil {
		return Mandate{}, err
	}
	if err := s.checkParty(creditor); err != nil {
		return Mandate{}, err
	}

	m := &Mandate{
		ID:        MandateID(s.nextID("mnd")),
		Debtor:    debtor,
		Creditor:  creditor,
		MaxAmount: maxAmount,
		Status:    MandateActive,
		CreatedAt: s.now(),
	}
	s.mandates[m.ID] = m
	return *m, nil
}

// RevokeMandate marks a mandate as revoked. Future direct debits referencing
// it will be rejected.
func (s *System) RevokeMandate(id MandateID) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	m, ok := s.mandates[id]
	if !ok {
		return ErrMandateNotFound
	}
	m.Status = MandateRevoked
	return nil
}

// ---------------------------------------------------------------------------
// Clearing cycles
// ---------------------------------------------------------------------------

// OpenCycle opens a clearing cycle for a scheme. Payments submitted while it
// is open accumulate in it until CloseCycle computes their net positions.
func (s *System) OpenCycle(scheme SchemeID) (ClearingCycle, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.schemes[scheme]; !ok {
		return ClearingCycle{}, ErrSchemeNotFound
	}
	if _, ok := s.openCycle[scheme]; ok {
		return ClearingCycle{}, ErrCycleAlreadyOpen
	}

	c := &ClearingCycle{
		ID:           CycleID(s.nextID("cyc")),
		Scheme:       scheme,
		Status:       CycleOpen,
		NetPositions: map[ParticipantID]ledger.Amount{},
		OpenedAt:     s.now(),
	}
	s.cycles[c.ID] = c
	s.openCycle[scheme] = c.ID
	return copyCycle(c), nil
}

// CloseCycle reaches the cut-off: it computes each participant's net position
// across the cycle's payments and marks the payments Cleared. No money moves
// yet — that happens at SettleCycle.
func (s *System) CloseCycle(id CycleID) (ClearingCycle, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	c, ok := s.cycles[id]
	if !ok {
		return ClearingCycle{}, ErrCycleNotFound
	}
	if c.Status != CycleOpen {
		return ClearingCycle{}, ErrCycleNotOpen
	}

	net := map[ParticipantID]ledger.Amount{}
	for _, pid := range c.PaymentIDs {
		p := s.payments[pid]
		// Money flows debtor -> creditor regardless of scheme direction.
		net[p.Debtor.Participant] -= p.Amount
		net[p.Creditor.Participant] += p.Amount
		if err := s.transition(p, Cleared); err != nil {
			return ClearingCycle{}, err
		}
	}

	c.NetPositions = net
	c.Status = CycleClosed
	c.ClosedAt = s.now()
	delete(s.openCycle, c.Scheme)
	return copyCycle(c), nil
}

// SettleCycle settles a closed cycle. It moves each participant's net
// position across reserve accounts at the central bank, mirrors that movement
// in each bank's own reserve account (clearing its suspense to zero), and
// posts the creditor leg of every payment so the payees receive their funds.
func (s *System) SettleCycle(id CycleID) (Settlement, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	c, ok := s.cycles[id]
	if !ok {
		return Settlement{}, ErrCycleNotFound
	}
	if c.Status != CycleClosed {
		return Settlement{}, ErrCycleNotClosed
	}

	// 1. Central-bank settlement transaction: move netted reserves between
	//    participants. The net positions sum to zero, so this balances.
	var cbEntries []ledger.Entry
	for pid, net := range c.NetPositions {
		if net == 0 {
			continue
		}
		p := s.participants[pid]
		if net > 0 {
			cbEntries = append(cbEntries, ledger.Entry{AccountID: p.SettlementAccount, Amount: net, Direction: ledger.Credit})
		} else {
			cbEntries = append(cbEntries, ledger.Entry{AccountID: p.SettlementAccount, Amount: -net, Direction: ledger.Debit})
		}
	}

	var settlementTx ledger.TransactionID
	if len(cbEntries) > 0 {
		tx, err := s.centralBank.PostTransaction(ledger.PostTransactionRequest{
			IdempotencyKey: string(c.ID) + ":settle",
			Description:    "Settlement of clearing cycle " + string(c.ID),
			Entries:        cbEntries,
		})
		if err != nil {
			return Settlement{}, err
		}
		settlementTx = tx.ID

		// 2. Mirror each net movement in the participant's own ledger,
		//    moving funds between its suspense and reserve so suspense
		//    returns to zero and its reserve asset tracks the central bank.
		for pid, net := range c.NetPositions {
			if net == 0 {
				continue
			}
			p := s.participants[pid]
			var entries []ledger.Entry
			if net > 0 { // net receiver: reserve up, suspense down
				entries = []ledger.Entry{
					{AccountID: p.ReserveAccount, Amount: net, Direction: ledger.Debit},
					{AccountID: p.SuspenseAccount, Amount: net, Direction: ledger.Credit},
				}
			} else { // net payer: reserve down, suspense up
				entries = []ledger.Entry{
					{AccountID: p.SuspenseAccount, Amount: -net, Direction: ledger.Debit},
					{AccountID: p.ReserveAccount, Amount: -net, Direction: ledger.Credit},
				}
			}
			if _, err := p.Ledger.PostTransaction(ledger.PostTransactionRequest{
				IdempotencyKey: string(c.ID) + ":reserve:" + string(pid),
				Description:    "Net settlement of cycle " + string(c.ID),
				Entries:        entries,
			}); err != nil {
				return Settlement{}, err
			}
		}
	}

	// 3. Post the creditor leg of every payment: the payee's bank releases
	//    the funds from its suspense to the payee's account.
	for _, pid := range c.PaymentIDs {
		p := s.payments[pid]
		creditor := s.participants[p.Creditor.Participant]
		tx, err := creditor.Ledger.PostTransaction(ledger.PostTransactionRequest{
			IdempotencyKey: string(p.ID) + ":credit",
			Description:    p.Description,
			ValueDate:      p.ValueDate,
			Metadata:       paymentMetadata(p),
			Entries: []ledger.Entry{
				{AccountID: creditor.SuspenseAccount, Amount: p.Amount, Direction: ledger.Debit},
				{AccountID: p.Creditor.Account, Amount: p.Amount, Direction: ledger.Credit},
			},
		})
		if err != nil {
			return Settlement{}, err
		}
		p.CreditorLegTx = tx.ID
		if err := s.transition(p, Settled); err != nil {
			return Settlement{}, err
		}
	}

	st := &Settlement{
		ID:           SettlementID(s.nextID("set")),
		CycleID:      c.ID,
		NetPositions: copyPositions(c.NetPositions),
		SettlementTx: settlementTx,
		ValueDate:    s.now(),
		SettledAt:    s.now(),
	}
	s.settlements[st.ID] = st
	c.Status = CycleSettled
	c.SettlementID = st.ID
	return *st, nil
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

// InitiatePaymentRequest describes a payment to submit.
type InitiatePaymentRequest struct {
	Scheme      SchemeID
	Debtor      PartyRef
	Creditor    PartyRef
	Amount      ledger.Amount
	MandateID   MandateID // required for pull schemes
	EndToEndID  string    // optional client reference; deduplicated if set
	Description string
	Metadata    map[string]string
}

// InitiatePayment validates and accepts a payment into the open clearing
// cycle for its scheme. It immediately posts the debtor leg — the payer's
// money leaves their account into the bank's clearing suspense — value-dated
// to the scheme's settlement date. The creditor is paid later, at settlement.
func (s *System) InitiatePayment(req InitiatePaymentRequest) (Payment, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	scheme, ok := s.schemes[req.Scheme]
	if !ok {
		return Payment{}, ErrSchemeNotFound
	}
	if req.Amount <= 0 {
		return Payment{}, ErrInvalidPaymentAmount
	}
	if err := s.checkParty(req.Debtor); err != nil {
		return Payment{}, err
	}
	if err := s.checkParty(req.Creditor); err != nil {
		return Payment{}, err
	}
	if req.EndToEndID != "" {
		if _, dup := s.endToEndIndex[req.EndToEndID]; dup {
			return Payment{}, ErrDuplicateEndToEndID
		}
	}

	cycleID, ok := s.openCycle[req.Scheme]
	if !ok {
		return Payment{}, ErrCycleNotOpen
	}

	now := s.now()
	p := &Payment{
		ID:          PaymentID(s.nextID("pay")),
		Scheme:      req.Scheme,
		Debtor:      req.Debtor,
		Creditor:    req.Creditor,
		Amount:      req.Amount,
		MandateID:   req.MandateID,
		EndToEndID:  req.EndToEndID,
		Status:      Initiated,
		CycleID:     cycleID,
		BookingDate: now,
		ValueDate:   now.Add(scheme.SettlementDelay()),
		Description: req.Description,
		Metadata:    req.Metadata,
		CreatedAt:   now,
	}

	if err := scheme.Validate(p, SchemeContext{System: s, Now: now}); err != nil {
		return Payment{}, err
	}

	// Debtor leg: money leaves the payer into the bank's clearing suspense.
	debtor := s.participants[p.Debtor.Participant]
	tx, err := debtor.Ledger.PostTransaction(ledger.PostTransactionRequest{
		IdempotencyKey: string(p.ID) + ":debit",
		Description:    p.Description,
		BookingDate:    now,
		ValueDate:      p.ValueDate,
		Metadata:       paymentMetadata(p),
		Entries: []ledger.Entry{
			{AccountID: p.Debtor.Account, Amount: p.Amount, Direction: ledger.Debit},
			{AccountID: debtor.SuspenseAccount, Amount: p.Amount, Direction: ledger.Credit},
		},
	})
	if err != nil {
		return Payment{}, err
	}
	p.DebtorLegTx = tx.ID

	if err := s.transition(p, Accepted); err != nil {
		return Payment{}, err
	}

	cycle := s.cycles[cycleID]
	cycle.PaymentIDs = append(cycle.PaymentIDs, p.ID)
	s.payments[p.ID] = p
	if req.EndToEndID != "" {
		s.endToEndIndex[req.EndToEndID] = p.ID
	}
	return copyPayment(p), nil
}

// RejectPayment rejects a payment before it has cleared, reversing the debtor
// leg if one was posted and removing it from its clearing cycle.
func (s *System) RejectPayment(id PaymentID, reason string) (Payment, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	p, ok := s.payments[id]
	if !ok {
		return Payment{}, ErrPaymentNotFound
	}
	if p.Status != Initiated && p.Status != Accepted {
		return Payment{}, ErrInvalidStateTransition
	}

	if p.DebtorLegTx != "" {
		debtor := s.participants[p.Debtor.Participant]
		if _, err := debtor.Ledger.ReverseTransaction(p.DebtorLegTx, "Reject payment "+string(p.ID)+": "+reason); err != nil {
			return Payment{}, err
		}
	}
	s.removeFromCycle(p)

	if err := s.transition(p, Rejected); err != nil {
		return Payment{}, err
	}
	p.RejectReason = reason
	return copyPayment(p), nil
}

// ReturnPayment returns a settled payment (a SEPA R-transaction). It posts
// compensating transactions that move the funds back from the creditor to the
// debtor across the central bank, undoing the original flow.
func (s *System) ReturnPayment(id PaymentID, reason string) (Payment, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	p, ok := s.payments[id]
	if !ok {
		return Payment{}, ErrPaymentNotFound
	}
	scheme := s.schemes[p.Scheme]
	if scheme == nil || !scheme.AllowsReturn() {
		return Payment{}, ErrSchemeUnsupportedReturn
	}
	if p.Status != Settled {
		return Payment{}, ErrInvalidStateTransition
	}

	debtor := s.participants[p.Debtor.Participant]
	creditor := s.participants[p.Creditor.Participant]

	// Debtor's bank refunds the payer, funded by reserves coming back in.
	if _, err := debtor.Ledger.PostTransaction(ledger.PostTransactionRequest{
		IdempotencyKey: string(p.ID) + ":return-debit",
		Description:    "Return of payment " + string(p.ID) + ": " + reason,
		Entries: []ledger.Entry{
			{AccountID: debtor.ReserveAccount, Amount: p.Amount, Direction: ledger.Debit},
			{AccountID: p.Debtor.Account, Amount: p.Amount, Direction: ledger.Credit},
		},
	}); err != nil {
		return Payment{}, err
	}

	// Creditor's bank claws the funds back from the payee, paying out reserves.
	if _, err := creditor.Ledger.PostTransaction(ledger.PostTransactionRequest{
		IdempotencyKey: string(p.ID) + ":return-credit",
		Description:    "Return of payment " + string(p.ID) + ": " + reason,
		Entries: []ledger.Entry{
			{AccountID: p.Creditor.Account, Amount: p.Amount, Direction: ledger.Debit},
			{AccountID: creditor.ReserveAccount, Amount: p.Amount, Direction: ledger.Credit},
		},
	}); err != nil {
		return Payment{}, err
	}

	// Central bank reverses the reserve movement.
	if _, err := s.centralBank.PostTransaction(ledger.PostTransactionRequest{
		IdempotencyKey: string(p.ID) + ":return-settle",
		Description:    "Return settlement for payment " + string(p.ID),
		Entries: []ledger.Entry{
			{AccountID: creditor.SettlementAccount, Amount: p.Amount, Direction: ledger.Debit},
			{AccountID: debtor.SettlementAccount, Amount: p.Amount, Direction: ledger.Credit},
		},
	}); err != nil {
		return Payment{}, err
	}

	if err := s.transition(p, Returned); err != nil {
		return Payment{}, err
	}
	p.RejectReason = reason
	return copyPayment(p), nil
}

// ---------------------------------------------------------------------------
// Read accessors
// ---------------------------------------------------------------------------

// GetPayment returns a payment by ID.
func (s *System) GetPayment(id PaymentID) (Payment, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	p, ok := s.payments[id]
	if !ok {
		return Payment{}, ErrPaymentNotFound
	}
	return copyPayment(p), nil
}

// GetCycle returns a clearing cycle by ID.
func (s *System) GetCycle(id CycleID) (ClearingCycle, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	c, ok := s.cycles[id]
	if !ok {
		return ClearingCycle{}, ErrCycleNotFound
	}
	return copyCycle(c), nil
}

// GetMandate returns a mandate by ID.
func (s *System) GetMandate(id MandateID) (Mandate, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	m, ok := s.mandates[id]
	if !ok {
		return Mandate{}, ErrMandateNotFound
	}
	return *m, nil
}

// ReserveBalance returns a participant's reserve balance as held at the
// central bank.
func (s *System) ReserveBalance(id ParticipantID) (ledger.Balance, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	p, ok := s.participants[id]
	if !ok {
		return ledger.Balance{}, ErrParticipantNotFound
	}
	return s.centralBank.GetBalance(p.SettlementAccount)
}

// ---------------------------------------------------------------------------
// Internal helpers (assume s.mu is held)
// ---------------------------------------------------------------------------

// transition moves a payment to a new status if the edge is legal.
func (s *System) transition(p *Payment, to PaymentStatus) error {
	allowed := map[PaymentStatus][]PaymentStatus{
		Initiated: {Accepted, Rejected},
		Accepted:  {Cleared, Rejected},
		Cleared:   {Settled},
		Settled:   {Returned},
	}
	for _, ok := range allowed[p.Status] {
		if ok == to {
			p.Status = to
			return nil
		}
	}
	return ErrInvalidStateTransition
}

// checkParty verifies that a party's participant exists and its account
// exists within that participant's ledger.
func (s *System) checkParty(ref PartyRef) error {
	p, ok := s.participants[ref.Participant]
	if !ok {
		return ErrParticipantNotFound
	}
	if _, err := p.Ledger.GetAccount(ref.Account); err != nil {
		return ErrAccountNotInParticipant
	}
	return nil
}

// removeFromCycle drops a payment from its (open) clearing cycle.
func (s *System) removeFromCycle(p *Payment) {
	c, ok := s.cycles[p.CycleID]
	if !ok {
		return
	}
	out := c.PaymentIDs[:0]
	for _, pid := range c.PaymentIDs {
		if pid != p.ID {
			out = append(out, pid)
		}
	}
	c.PaymentIDs = out
}

func paymentMetadata(p *Payment) map[string]string {
	md := map[string]string{
		"payment_id": string(p.ID),
		"scheme":     string(p.Scheme),
	}
	if p.EndToEndID != "" {
		md["end_to_end_id"] = p.EndToEndID
	}
	if p.MandateID != "" {
		md["mandate_id"] = string(p.MandateID)
	}
	return md
}

func copyPayment(p *Payment) Payment {
	cp := *p
	if p.Metadata != nil {
		cp.Metadata = make(map[string]string, len(p.Metadata))
		for k, v := range p.Metadata {
			cp.Metadata[k] = v
		}
	}
	return cp
}

func copyCycle(c *ClearingCycle) ClearingCycle {
	cp := *c
	cp.PaymentIDs = make([]PaymentID, len(c.PaymentIDs))
	copy(cp.PaymentIDs, c.PaymentIDs)
	cp.NetPositions = copyPositions(c.NetPositions)
	return cp
}

func copyPositions(in map[ParticipantID]ledger.Amount) map[ParticipantID]ledger.Amount {
	out := make(map[ParticipantID]ledger.Amount, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}
