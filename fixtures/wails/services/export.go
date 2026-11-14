//go:build smegglect

// services/export.go
package services

import (
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// MaxExportBytes bounds one exported bundle.
const MaxExportBytes = 64 << 20

var exportName = regexp.MustCompile(`^smegglect-[A-Za-z0-9_-]{1,64}\.zip$`)

// ErrExportName means the frontend sent a name that is not a Smegglect bundle name.
var ErrExportName = errors.New("export: unexpected file name")

// ExportService saves Smegglect bundles natively for the debug overlay.
type ExportService struct {
	// Dir, when set, receives bundles without a dialog (used by automated runs).
	Dir string
}

// Save writes one bundle and returns its path, or "" when the user cancels the dialog.
func (s *ExportService) Save(name string, data string) (string, error) {
	if !exportName.MatchString(name) {
		return "", ErrExportName
	}
	if base64.StdEncoding.DecodedLen(len(data)) > MaxExportBytes {
		return "", fmt.Errorf("export: bundle over %d bytes", MaxExportBytes)
	}
	raw, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		return "", fmt.Errorf("export: decode: %w", err)
	}
	path := ""
	if s.Dir != "" {
		path = filepath.Join(s.Dir, name)
	} else {
		path, err = application.Get().Dialog.SaveFile().SetFilename(name).PromptForSingleSelection()
		if err != nil || path == "" {
			return "", err
		}
	}
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		return "", fmt.Errorf("export: write: %w", err)
	}
	return path, nil
}
