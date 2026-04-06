package urls

import (
	"fmt"
	"net/url"
	"strings"
)

// BlueprintsListURL returns an absolute URL for GET/POST /blueprints.
func BlueprintsListURL(base string) (string, error) {
	return joinPath(base, "/blueprints")
}

// BlueprintByIDURL returns an absolute URL for a single blueprint resource.
func BlueprintByIDURL(base string, id int) (string, error) {
	return joinPath(base, fmt.Sprintf("/blueprints/%d", id))
}

func joinPath(base, path string) (string, error) {
	b := strings.TrimSpace(base)
	if b == "" {
		b = "http://localhost:3000"
	}
	u, err := url.Parse(b)
	if err != nil {
		return "", err
	}
	ref, err := url.Parse(path)
	if err != nil {
		return "", err
	}
	return u.ResolveReference(ref).String(), nil
}
