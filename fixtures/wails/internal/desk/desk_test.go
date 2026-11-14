// internal/desk/desk_test.go
package desk

import (
	"sync"
	"testing"
)

func TestCounterConcurrent(t *testing.T) {
	var c Counter
	var wg sync.WaitGroup
	for range 50 {
		wg.Go(func() { c.Bump() })
	}
	wg.Wait()
	if got := c.Total(); got != 50 {
		t.Fatalf("Total() = %d, want 50", got)
	}
}
