package urls

import "testing"

func TestBlueprintsListURL(t *testing.T) {
	t.Parallel()
	u, err := BlueprintsListURL("http://localhost:3000/")
	if err != nil || u != "http://localhost:3000/blueprints" {
		t.Fatalf("got %q err %v", u, err)
	}
}

func TestBlueprintByIDURL(t *testing.T) {
	t.Parallel()
	u, err := BlueprintByIDURL("http://h:9", 7)
	if err != nil || u != "http://h:9/blueprints/7" {
		t.Fatalf("got %q err %v", u, err)
	}
}
