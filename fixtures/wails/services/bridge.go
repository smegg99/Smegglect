//go:build smegglect

// services/bridge.go
package services

import (
	"bytes"
	"cmp"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// BridgeOrigin marks forwarded calls as the page's; the broker must admit it (`serve --origin wails://wails`).
const BridgeOrigin = "wails://wails"

var (
	bridgeURL  = regexp.MustCompile(`^http://127\.0\.0\.1:\d{1,5}$`)
	bridgePath = regexp.MustCompile(`^/v1/[A-Za-z0-9_./-]*(\?[A-Za-z0-9_=&-]*)?$`)
)

// ErrBridgeRequest means the window asked the bridge proxy for something the overlay never sends.
var ErrBridgeRequest = errors.New("bridge: unexpected request")

// BridgeService forwards the overlay's calls to the local Smegglect broker for a window whose origin it does not admit.
type BridgeService struct {
	// Root holds the running broker's .smegglect/bridge.json; the working directory when empty.
	Root string
}

// BridgeRequest is one overlay request for the local Smegglect broker.
type BridgeRequest struct {
	Method string `json:"method"`
	Path   string `json:"path"`
	Body   string `json:"body,omitempty"`
	Type   string `json:"type,omitempty"`
	// Base64 marks Body as base64, e.g. an attached screenshot.
	Base64 bool `json:"base64,omitempty"`
}

// BridgeReply is the broker's answer; Status 0 means no broker is running for the project.
type BridgeReply struct {
	Status int    `json:"status"`
	Body   string `json:"body"`
}

// Bridge forwards one overlay request to the broker with its token, which the window never sees.
func (s *BridgeService) Bridge(ctx context.Context, req BridgeRequest) (BridgeReply, error) {
	body, err := bridgeBody(req)
	if err != nil {
		return BridgeReply{}, err
	}
	url, token, ok := s.broker()
	if !ok {
		return BridgeReply{}, nil
	}
	call, err := http.NewRequestWithContext(ctx, req.Method, url+req.Path, body)
	if err != nil {
		return BridgeReply{}, fmt.Errorf("bridge: request: %w", err)
	}
	call.Header.Set("Authorization", "Bearer "+token)
	call.Header.Set("Origin", BridgeOrigin)
	if req.Type != "" {
		call.Header.Set("Content-Type", req.Type)
	}
	res, err := http.DefaultClient.Do(call)
	if err != nil {
		// A stopped broker or a call the window cancelled; neither is worth an error in the log.
		return BridgeReply{}, nil
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, MaxExportBytes+1))
	if err != nil {
		return BridgeReply{}, nil
	}
	if len(raw) > MaxExportBytes {
		return BridgeReply{}, fmt.Errorf("bridge: answer over %d bytes", MaxExportBytes)
	}
	return BridgeReply{Status: res.StatusCode, Body: string(raw)}, nil
}

func bridgeBody(req BridgeRequest) (io.Reader, error) {
	switch req.Method {
	case http.MethodGet, http.MethodPost, http.MethodPut:
	default:
		return nil, ErrBridgeRequest
	}
	if !bridgePath.MatchString(req.Path) || strings.Contains(req.Path, "..") {
		return nil, ErrBridgeRequest
	}
	if len(req.Body) > base64.StdEncoding.EncodedLen(MaxExportBytes) {
		return nil, fmt.Errorf("bridge: request over %d bytes", MaxExportBytes)
	}
	if !req.Base64 {
		return strings.NewReader(req.Body), nil
	}
	raw, err := base64.StdEncoding.DecodeString(req.Body)
	if err != nil {
		return nil, fmt.Errorf("bridge: decode: %w", err)
	}
	return bytes.NewReader(raw), nil
}

// broker reads the address and token the running broker wrote for the project; it changes on every start.
func (s *BridgeService) broker() (string, string, bool) {
	raw, err := os.ReadFile(filepath.Join(cmp.Or(s.Root, "."), ".smegglect", "bridge.json"))
	if err != nil {
		return "", "", false
	}
	var info struct {
		URL   string `json:"url"`
		Token string `json:"token"`
	}
	if json.Unmarshal(raw, &info) != nil || !bridgeURL.MatchString(info.URL) || info.Token == "" {
		return "", "", false
	}
	return info.URL, info.Token, true
}
