package runner

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"blueprintctl/internal/client"
)

func TestRun_get_success(t *testing.T) {
	t.Parallel()
	var gotMethod, gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":1,"name":"x"}`))
	}))
	t.Cleanup(srv.Close)

	var stdout, stderr strings.Builder
	c := &client.Client{HTTP: srv.Client()}
	code := Run([]string{"blueprintctl", "--base-url", srv.URL, "get", "--id", "1"}, c, &stdout, &stderr)
	if code != 0 {
		t.Fatalf("exit %d stderr %q", code, stderr.String())
	}
	if gotMethod != http.MethodGet || gotPath != "/blueprints/1" {
		t.Fatalf("method %q path %q", gotMethod, gotPath)
	}
	if !strings.Contains(stdout.String(), `"id":1`) {
		t.Fatalf("stdout %q", stdout.String())
	}
}

func TestRun_list_query(t *testing.T) {
	t.Parallel()
	var rawQuery string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rawQuery = r.URL.RawQuery
		_, _ = w.Write([]byte(`{"items":[],"page":1,"page_size":20,"total":0,"total_pages":0}`))
	}))
	t.Cleanup(srv.Close)

	var stdout strings.Builder
	c := &client.Client{HTTP: srv.Client()}
	code := Run([]string{
		"blueprintctl", "--base-url", srv.URL, "list",
		"--page", "1", "--page-size", "20", "--sort", "name", "--order", "asc",
	}, c, &stdout, io.Discard)
	if code != 0 {
		t.Fatal(code)
	}
	if rawQuery != "page=1&page_size=20&sort=name&order=asc" {
		t.Fatalf("query %q", rawQuery)
	}
}

func TestRun_get_404_stderr_exit1(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"error":"not_found"}`))
	}))
	t.Cleanup(srv.Close)

	var stderr strings.Builder
	c := &client.Client{HTTP: srv.Client()}
	code := Run([]string{"blueprintctl", "--base-url", srv.URL, "get", "--id", "99"}, c, io.Discard, &stderr)
	if code != 1 {
		t.Fatalf("exit %d", code)
	}
	if !strings.Contains(stderr.String(), `"error":"not_found"`) {
		t.Fatalf("stderr %q", stderr.String())
	}
}

func TestRun_get_503_exit2(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"error":"service_unavailable"}`))
	}))
	t.Cleanup(srv.Close)

	var stderr strings.Builder
	c := &client.Client{HTTP: srv.Client()}
	code := Run([]string{"blueprintctl", "--base-url", srv.URL, "get", "--id", "1"}, c, io.Discard, &stderr)
	if code != 2 {
		t.Fatalf("exit %d", code)
	}
	if !strings.Contains(stderr.String(), "service_unavailable") {
		t.Fatalf("stderr %q", stderr.String())
	}
}

func TestRun_invalid_id_no_request(t *testing.T) {
	t.Parallel()
	called := false
	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		called = true
	}))
	t.Cleanup(srv.Close)

	var stderr strings.Builder
	c := &client.Client{HTTP: srv.Client()}
	code := Run([]string{"blueprintctl", "--base-url", srv.URL, "get", "--id", "0"}, c, io.Discard, &stderr)
	if code != 1 || !strings.Contains(stderr.String(), "positive integer") {
		t.Fatalf("code %d stderr %q", code, stderr.String())
	}
	if called {
		t.Fatal("server should not be called")
	}
}

func TestRun_create_idempotency_header(t *testing.T) {
	t.Parallel()
	var key string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key = r.Header.Get("Idempotency-Key")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{}`))
	}))
	t.Cleanup(srv.Close)

	tmp := t.TempDir() + "/body.json"
	if err := os.WriteFile(tmp, []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	var stdout strings.Builder
	c := &client.Client{HTTP: srv.Client()}
	code := Run([]string{
		"blueprintctl", "--base-url", srv.URL, "create", "--file", tmp, "--idempotency-key", "k1",
	}, c, &stdout, io.Discard)
	if code != 0 {
		t.Fatal(code)
	}
	if key != "k1" {
		t.Fatalf("header %q", key)
	}
}

func TestRun_delete_204_no_stdout(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(srv.Close)

	var stdout strings.Builder
	c := &client.Client{HTTP: srv.Client()}
	code := Run([]string{"blueprintctl", "--base-url", srv.URL, "delete", "--id", "3"}, c, &stdout, io.Discard)
	if code != 0 {
		t.Fatal(code)
	}
	if stdout.Len() != 0 {
		t.Fatalf("expected empty stdout, got %q", stdout.String())
	}
}

func TestRun_list_order_without_sort(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	t.Cleanup(srv.Close)

	var stderr strings.Builder
	c := &client.Client{HTTP: srv.Client()}
	code := Run([]string{
		"blueprintctl", "--base-url", srv.URL, "list", "--page", "1", "--page-size", "10", "--order", "asc",
	}, c, io.Discard, &stderr)
	if code != 1 || !strings.Contains(stderr.String(), "order requires sort") {
		t.Fatalf("code %d stderr %q", code, stderr.String())
	}
}

func TestRun_create_missing_file(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("server should not be called")
	}))
	t.Cleanup(srv.Close)

	var stderr strings.Builder
	c := &client.Client{HTTP: srv.Client()}
	code := Run([]string{
		"blueprintctl", "--base-url", srv.URL, "create", "--file", "/no/such/file.json",
	}, c, io.Discard, &stderr)
	if code != 1 {
		t.Fatalf("exit %d", code)
	}
	if !strings.Contains(stderr.String(), "read file:") {
		t.Fatalf("stderr %q", stderr.String())
	}
}
