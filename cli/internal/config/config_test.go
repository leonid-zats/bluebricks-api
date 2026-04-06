package config

import "testing"

func TestResolveBaseURL(t *testing.T) {
	t.Parallel()
	if got := ResolveBaseURL("", ""); got != "http://localhost:3000" {
		t.Fatalf("default: got %q", got)
	}
	if got := ResolveBaseURL("", "http://api.example.com/"); got != "http://api.example.com" {
		t.Fatalf("env trim slash: got %q", got)
	}
	if got := ResolveBaseURL("http://flag.test/", ""); got != "http://flag.test" {
		t.Fatalf("flag overrides: got %q", got)
	}
	if got := ResolveBaseURL("  http://spaces/  ", "http://env"); got != "http://spaces" {
		t.Fatalf("flag trim: got %q", got)
	}
}
