package validate

import (
	"fmt"
	"strconv"
	"strings"
)

// PositiveID parses a blueprint id: decimal digits only, value >= 1.
func PositiveID(raw string) (int, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return 0, fmt.Errorf("id is required")
	}
	if len(s) > 1 && s[0] == '0' {
		return 0, fmt.Errorf("id must be a positive integer")
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return 0, fmt.Errorf("id must be a positive integer")
		}
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < 1 {
		return 0, fmt.Errorf("id must be a positive integer")
	}
	return n, nil
}

// Page parses list page (>= 1).
func Page(raw string) (int, error) {
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || n < 1 {
		return 0, fmt.Errorf("page must be an integer >= 1")
	}
	return n, nil
}

// PageSize parses page_size (1–100).
func PageSize(raw string) (int, error) {
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || n < 1 || n > 100 {
		return 0, fmt.Errorf("page-size must be an integer between 1 and 100")
	}
	return n, nil
}

// Sort validates optional sort value.
func Sort(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	switch s {
	case "name", "version", "created_at":
		return s, nil
	default:
		return "", fmt.Errorf("sort must be one of: name, version, created_at")
	}
}

// Order validates optional order value.
func Order(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	switch s {
	case "asc", "desc":
		return s, nil
	default:
		return "", fmt.Errorf("order must be asc or desc")
	}
}
