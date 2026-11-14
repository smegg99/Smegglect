//go:build smegglect

// services/export_test.go
package services

import (
	"encoding/base64"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestSaveRejectsUnexpectedNames(t *testing.T) {
	s := &ExportService{Dir: t.TempDir()}
	for _, name := range []string{"../x.zip", "smegglect-a/../../b.zip", "notes.txt", "smegglect-.zip"} {
		if _, err := s.Save(name, ""); !errors.Is(err, ErrExportName) {
			t.Errorf("Save(%q) error = %v, want ErrExportName", name, err)
		}
	}
}

func TestSaveWritesIntoDir(t *testing.T) {
	dir := t.TempDir()
	s := &ExportService{Dir: dir}
	path, err := s.Save("smegglect-bat_1.zip", base64.StdEncoding.EncodeToString([]byte("PK")))
	if err != nil {
		t.Fatal(err)
	}
	if path != filepath.Join(dir, "smegglect-bat_1.zip") {
		t.Fatalf("path = %q", path)
	}
	got, _ := os.ReadFile(path)
	if string(got) != "PK" {
		t.Fatalf("content = %q", got)
	}
}
