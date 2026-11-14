//go:build !smegglect

// debug_off.go
package main

import "github.com/wailsapp/wails/v3/pkg/application"

// debugServices is empty in release builds: no export handler exists.
func debugServices() []application.Service { return nil }
