package validate

import "testing"

func TestPositiveID(t *testing.T) {
	t.Parallel()
	if _, err := PositiveID("0"); err == nil {
		t.Fatal("expected error for 0")
	}
	if _, err := PositiveID("abc"); err == nil {
		t.Fatal("expected error for abc")
	}
	if _, err := PositiveID("01"); err == nil {
		t.Fatal("expected error for leading zero")
	}
	n, err := PositiveID("42")
	if err != nil || n != 42 {
		t.Fatalf("got %d %v", n, err)
	}
}

func TestPagePageSize(t *testing.T) {
	t.Parallel()
	if _, err := Page("0"); err == nil {
		t.Fatal("page 0")
	}
	if _, err := PageSize("0"); err == nil {
		t.Fatal("size 0")
	}
	if _, err := PageSize("101"); err == nil {
		t.Fatal("size 101")
	}
}

func TestSortOrder(t *testing.T) {
	t.Parallel()
	if _, err := Sort("foo"); err == nil {
		t.Fatal("bad sort")
	}
	if _, err := Order("sideways"); err == nil {
		t.Fatal("bad order")
	}
}
