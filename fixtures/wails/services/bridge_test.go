//go:build smegglect

// services/bridge_test.go
package services

import (
	"context"
	"encoding/base64"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

type seen struct {
	method, path, auth, origin, kind string
	body                             []byte
}

// broker stands in for `smegglect-bridge serve`: it answers on loopback and writes .smegglect/bridge.json.
func broker(t *testing.T, handle func(w http.ResponseWriter, r *http.Request)) (string, chan seen) {
	t.Helper()
	calls := make(chan seen, 8)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		calls <- seen{r.Method, r.URL.RequestURI(), r.Header.Get("Authorization"), r.Header.Get("Origin"), r.Header.Get("Content-Type"), body}
		handle(w, r)
	}))
	t.Cleanup(srv.Close)
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, ".smegglect"), 0o700); err != nil {
		t.Fatal(err)
	}
	info := `{"url":"` + srv.URL + `","token":"tok_1","pid":1}`
	if err := os.WriteFile(filepath.Join(root, ".smegglect", "bridge.json"), []byte(info), 0o600); err != nil {
		t.Fatal(err)
	}
	return root, calls
}

func TestBridgeForwardsWithTheTokenAsThePage(t *testing.T) {
	root, calls := broker(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"bat_1"}`))
	})
	svc := &BridgeService{Root: root}
	reply, err := svc.Bridge(context.Background(), BridgeRequest{Method: "POST", Path: "/v1/batches", Body: `{"id":"bat_1"}`, Type: "application/json"})
	if err != nil {
		t.Fatal(err)
	}
	if reply != (BridgeReply{Status: 201, Body: `{"id":"bat_1"}`}) {
		t.Fatalf("reply = %+v", reply)
	}
	got := <-calls
	if got.method != "POST" || got.path != "/v1/batches" || got.auth != "Bearer tok_1" || got.origin != BridgeOrigin || got.kind != "application/json" || string(got.body) != `{"id":"bat_1"}` {
		t.Fatalf("broker saw %+v", got)
	}
}

func TestBridgeSendsAttachmentsAsBytes(t *testing.T) {
	root, calls := broker(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) })
	svc := &BridgeService{Root: root}
	png := []byte{0x89, 'P', 'N', 'G', 0, 255}
	reply, err := svc.Bridge(context.Background(), BridgeRequest{Method: "PUT", Path: "/v1/batches/bat_1/attachments/att_1", Body: base64.StdEncoding.EncodeToString(png), Type: "image/png", Base64: true})
	if err != nil || reply.Status != 204 {
		t.Fatalf("reply = %+v, %v", reply, err)
	}
	if got := <-calls; string(got.body) != string(png) || got.kind != "image/png" {
		t.Fatalf("broker saw %+v", got)
	}
}

func TestBridgeAnswersStatusZeroWithoutABroker(t *testing.T) {
	svc := &BridgeService{Root: t.TempDir()}
	reply, err := svc.Bridge(context.Background(), BridgeRequest{Method: "GET", Path: "/v1/health"})
	if err != nil || reply.Status != 0 {
		t.Fatalf("no broker: %+v, %v", reply, err)
	}
	// A broker that stopped after writing its file is the same.
	root, _ := broker(t, func(w http.ResponseWriter, r *http.Request) {})
	if err := os.WriteFile(filepath.Join(root, ".smegglect", "bridge.json"), []byte(`{"url":"http://127.0.0.1:9","token":"t"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	reply, err = (&BridgeService{Root: root}).Bridge(context.Background(), BridgeRequest{Method: "GET", Path: "/v1/health"})
	if err != nil || reply.Status != 0 {
		t.Fatalf("stopped broker: %+v, %v", reply, err)
	}
}

func TestBridgeRefusesWhatTheOverlayNeverSends(t *testing.T) {
	root, calls := broker(t, func(w http.ResponseWriter, r *http.Request) {})
	svc := &BridgeService{Root: root}
	for _, req := range []BridgeRequest{
		{Method: "DELETE", Path: "/v1/batches/bat_1"},
		{Method: "GET", Path: "/v2/health"},
		{Method: "GET", Path: "//evil.example/v1/health"},
		{Method: "GET", Path: "/v1/../secret"},
		{Method: "GET", Path: "/v1/health#x"},
	} {
		if _, err := svc.Bridge(context.Background(), req); !errors.Is(err, ErrBridgeRequest) {
			t.Fatalf("%+v: err = %v", req, err)
		}
	}
	if _, err := svc.Bridge(context.Background(), BridgeRequest{Method: "PUT", Path: "/v1/batches/bat_1/attachments/att_1", Body: "not base64!", Base64: true}); err == nil {
		t.Fatal("bad base64 was accepted")
	}
	if len(calls) != 0 {
		t.Fatalf("%d refused requests reached the broker", len(calls))
	}
}

func TestBridgeEndsALongPollWhenTheCallIsCancelled(t *testing.T) {
	root, _ := broker(t, func(w http.ResponseWriter, r *http.Request) { <-r.Context().Done() })
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan BridgeReply, 1)
	go func() {
		reply, _ := (&BridgeService{Root: root}).Bridge(ctx, BridgeRequest{Method: "GET", Path: "/v1/page/next?after=1&wait=25"})
		done <- reply
	}()
	time.Sleep(50 * time.Millisecond)
	cancel()
	select {
	case reply := <-done:
		if reply.Status != 0 {
			t.Fatalf("reply = %+v", reply)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("the poll outlived its call")
	}
}
