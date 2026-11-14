// services/desk.go
// Package services exposes the fixture's Wails bindings; behaviour lives in internal/desk.
package services

import "smegglect/fixtures/wails/internal/desk"

// DeskService is the Go-backed action the fixture's buttons call.
type DeskService struct {
	counter *desk.Counter
}

// NewDeskService wraps a counter.
func NewDeskService(c *desk.Counter) *DeskService {
	return &DeskService{counter: c}
}

// Ping performs one backend action and returns the new total.
func (s *DeskService) Ping() int {
	return s.counter.Bump()
}

// Pings returns the total without acting.
func (s *DeskService) Pings() int {
	return s.counter.Total()
}
