// internal/desk/desk.go
// Package desk holds the fixture's only domain state: how often the backend was asked to act.
package desk

import "sync"

// Counter counts backend actions; selecting a control in Smegglect must never move it.
type Counter struct {
	mu sync.Mutex
	n  int
}

// Bump records one action and returns the new total.
func (c *Counter) Bump() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.n++
	return c.n
}

// Total returns the number of actions so far.
func (c *Counter) Total() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.n
}
