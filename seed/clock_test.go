package seed

import (
	"testing"
	"time"
)

func TestClockFrozenThenLive(t *testing.T) {
	start := time.Date(2025, 9, 15, 9, 0, 0, 0, time.UTC)
	c := newClock(start)

	if got := c.now(); !got.Equal(start) {
		t.Fatalf("frozen now = %v, want %v", got, start)
	}

	c.advance(24 * time.Hour)
	want := start.Add(24 * time.Hour)
	if got := c.now(); !got.Equal(want) {
		t.Fatalf("after advance now = %v, want %v", got, want)
	}

	c.goLive()
	got := c.now()
	if time.Since(got) > time.Minute || got.Before(time.Now().Add(-time.Minute)) {
		t.Fatalf("after goLive now = %v, want ~time.Now()", got)
	}

	// Advancing after going live has no observable effect: now still tracks
	// real wall-clock time.
	c.advance(1000 * time.Hour)
	got = c.now()
	if time.Since(got) > time.Minute || got.Before(time.Now().Add(-time.Minute)) {
		t.Fatalf("after advance post-goLive now = %v, want ~time.Now()", got)
	}
}
