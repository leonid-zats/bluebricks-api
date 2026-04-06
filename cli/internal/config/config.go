package config

import (
	"os"
	"strings"
)

const (
	EnvAPIBase   = "BLUEPRINTS_API_BASE"
	DefaultBase  = "http://localhost:3000"
)

// ResolveBaseURL returns the API base URL. Non-empty flag overrides non-empty env over default.
func ResolveBaseURL(flagBase, envBase string) string {
	if s := strings.TrimSpace(flagBase); s != "" {
		return strings.TrimRight(s, "/")
	}
	if s := strings.TrimSpace(envBase); s != "" {
		return strings.TrimRight(s, "/")
	}
	return strings.TrimRight(DefaultBase, "/")
}

// BaseFromEnv reads BLUEPRINTS_API_BASE from the environment (raw value; may be empty).
func BaseFromEnv() string {
	return os.Getenv(EnvAPIBase)
}
