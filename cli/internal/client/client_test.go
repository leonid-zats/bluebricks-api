package client

import "testing"

func TestExitCodeForHTTP(t *testing.T) {
	t.Parallel()
	if ExitCodeForHTTP(404) != 1 {
		t.Fatal("4xx")
	}
	if ExitCodeForHTTP(503) != 2 {
		t.Fatal("5xx")
	}
	if ExitCodeForHTTP(200) != 0 {
		t.Fatal("2xx")
	}
}
