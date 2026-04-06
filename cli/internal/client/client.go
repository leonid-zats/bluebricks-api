package client

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"
)

const defaultTimeout = 60 * time.Second

// Client performs HTTP calls against the Blueprints API.
type Client struct {
	HTTP *http.Client
}

// New returns a client with a 60s request timeout.
func New() *Client {
	return &Client{
		HTTP: &http.Client{Timeout: defaultTimeout},
	}
}

// Do sends the request and returns status, full body, and a network/timeout error if any.
func (c *Client) Do(ctx context.Context, req *http.Request) (status int, body []byte, err error) {
	if c.HTTP == nil {
		c.HTTP = &http.Client{Timeout: defaultTimeout}
	}
	req = req.WithContext(ctx)
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	b, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return resp.StatusCode, b, fmt.Errorf("read response body: %w", readErr)
	}
	return resp.StatusCode, b, nil
}

// ExitCodeForHTTP maps HTTP status to CLI exit code per spec: 4xx -> 1, 5xx -> 2.
func ExitCodeForHTTP(status int) int {
	if status >= 400 && status < 500 {
		return 1
	}
	if status >= 500 {
		return 2
	}
	return 0
}
