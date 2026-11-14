//go:build smegglect

// debug_on.go
package main

import (
	"os"

	"github.com/wailsapp/wails/v3/pkg/application"

	"smegglect/fixtures/wails/services"
)

// debugServices registers the native save used by the Smegglect overlay; only `-tags smegglect` builds have it.
func debugServices() []application.Service {
	return []application.Service{application.NewService(&services.ExportService{Dir: os.Getenv("SMEGGLECT_EXPORT_DIR")})}
}
