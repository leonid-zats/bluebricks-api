package runner

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"blueprintctl/internal/client"
	"blueprintctl/internal/config"
	"blueprintctl/internal/urls"
	"blueprintctl/internal/validate"

	"github.com/spf13/cobra"
)

// Run parses CLI args and returns a process exit code.
func Run(args []string, c *client.Client, stdout, stderr io.Writer) int {
	if c == nil {
		c = client.New()
	}
	root := newRoot(c, stdout, stderr)
	root.SetArgs(args[1:])
	err := root.Execute()
	if err == nil {
		return 0
	}
	var ee *ExitError
	if errors.As(err, &ee) {
		return ee.Code
	}
	return 1
}

func newRoot(c *client.Client, stdout, stderr io.Writer) *cobra.Command {
	var baseURLFlag string

	root := &cobra.Command{
		Use:   "blueprintctl",
		Short: "HTTP client for the Blueprint Manager API",
	}
	root.PersistentFlags().StringVar(&baseURLFlag, "base-url", "", "API base URL (overrides "+config.EnvAPIBase+")")
	root.SetOut(stdout)
	root.SetErr(stderr)
	root.SilenceErrors = true
	root.SilenceUsage = true

	root.AddCommand(cmdCreate(c, &baseURLFlag, stdout, stderr))
	root.AddCommand(cmdGet(c, &baseURLFlag, stdout, stderr))
	root.AddCommand(cmdList(c, &baseURLFlag, stdout, stderr))
	root.AddCommand(cmdUpdate(c, &baseURLFlag, stdout, stderr))
	root.AddCommand(cmdDelete(c, &baseURLFlag, stdout, stderr))

	return root
}

func resolveBase(flagPtr *string) string {
	return config.ResolveBaseURL(*flagPtr, config.BaseFromEnv())
}

func cmdCreate(c *client.Client, baseFlag *string, stdout, stderr io.Writer) *cobra.Command {
	var file string
	var idem string
	cmd := &cobra.Command{
		Use:   "create",
		Short: "POST /blueprints",
		RunE: func(cmd *cobra.Command, _ []string) error {
			base := resolveBase(baseFlag)
			body, err := os.ReadFile(file)
			if err != nil {
				fmt.Fprintf(stderr, "read file: %v\n", err)
				return &ExitError{Code: 1, Msg: err.Error()}
			}
			u, err := urls.BlueprintsListURL(base)
			if err != nil {
				fmt.Fprintf(stderr, "invalid base url: %v\n", err)
				return &ExitError{Code: 1, Msg: err.Error()}
			}
			ctx := context.Background()
			req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, bytes.NewReader(body))
			if err != nil {
				return &ExitError{Code: 1, Msg: err.Error()}
			}
			req.Header.Set("Content-Type", "application/json")
			if strings.TrimSpace(idem) != "" {
				req.Header.Set("Idempotency-Key", idem)
			}
			return doAndPrint(c, req, stdout, stderr, false)
		},
	}
	cmd.Flags().StringVar(&file, "file", "", "path to JSON body")
	_ = cmd.MarkFlagRequired("file")
	cmd.Flags().StringVar(&idem, "idempotency-key", "", "optional Idempotency-Key header")
	return cmd
}

func cmdGet(c *client.Client, baseFlag *string, stdout, stderr io.Writer) *cobra.Command {
	var idStr string
	cmd := &cobra.Command{
		Use:   "get",
		Short: "GET /blueprints/:id",
		RunE: func(cmd *cobra.Command, _ []string) error {
			id, err := validate.PositiveID(idStr)
			if err != nil {
				fmt.Fprintln(stderr, err.Error())
				return &ExitError{Code: 1, Msg: err.Error()}
			}
			base := resolveBase(baseFlag)
			u, err := urls.BlueprintByIDURL(base, id)
			if err != nil {
				fmt.Fprintf(stderr, "invalid base url: %v\n", err)
				return &ExitError{Code: 1, Msg: err.Error()}
			}
			ctx := context.Background()
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
			if err != nil {
				return &ExitError{Code: 1, Msg: err.Error()}
			}
			return doAndPrint(c, req, stdout, stderr, false)
		},
	}
	cmd.Flags().StringVar(&idStr, "id", "", "blueprint id")
	_ = cmd.MarkFlagRequired("id")
	return cmd
}

func cmdList(c *client.Client, baseFlag *string, stdout, stderr io.Writer) *cobra.Command {
	var pageStr, pageSizeStr, sortStr, orderStr string
	cmd := &cobra.Command{
		Use:   "list",
		Short: "GET /blueprints",
		RunE: func(cmd *cobra.Command, _ []string) error {
			page, err := validate.Page(pageStr)
			if err != nil {
				fmt.Fprintln(stderr, err.Error())
				return &ExitError{Code: 1, Msg: err.Error()}
			}
			pageSize, err := validate.PageSize(pageSizeStr)
			if err != nil {
				fmt.Fprintln(stderr, err.Error())
				return &ExitError{Code: 1, Msg: err.Error()}
			}
			hasSort := strings.TrimSpace(sortStr) != ""
			hasOrder := strings.TrimSpace(orderStr) != ""
			if hasOrder && !hasSort {
				msg := "order requires sort"
				fmt.Fprintln(stderr, msg)
				return &ExitError{Code: 1, Msg: msg}
			}
			var sort, order string
			if hasSort {
				sort, err = validate.Sort(sortStr)
				if err != nil {
					fmt.Fprintln(stderr, err.Error())
					return &ExitError{Code: 1, Msg: err.Error()}
				}
			}
			if hasOrder {
				order, err = validate.Order(orderStr)
				if err != nil {
					fmt.Fprintln(stderr, err.Error())
					return &ExitError{Code: 1, Msg: err.Error()}
				}
			}
			base := resolveBase(baseFlag)
			u, err := urls.BlueprintsListURL(base)
			if err != nil {
				fmt.Fprintf(stderr, "invalid base url: %v\n", err)
				return &ExitError{Code: 1, Msg: err.Error()}
			}
			q := fmt.Sprintf("page=%d&page_size=%d", page, pageSize)
			if hasSort {
				q += "&sort=" + sort
			}
			if hasOrder {
				q += "&order=" + order
			}
			full := u + "?" + q
			ctx := context.Background()
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, full, nil)
			if err != nil {
				return &ExitError{Code: 1, Msg: err.Error()}
			}
			return doAndPrint(c, req, stdout, stderr, false)
		},
	}
	cmd.Flags().StringVar(&pageStr, "page", "", "page number (>= 1)")
	cmd.Flags().StringVar(&pageSizeStr, "page-size", "", "page size (1-100)")
	cmd.Flags().StringVar(&sortStr, "sort", "", "optional: name | version | created_at")
	cmd.Flags().StringVar(&orderStr, "order", "", "optional: asc | desc (requires --sort)")
	_ = cmd.MarkFlagRequired("page")
	_ = cmd.MarkFlagRequired("page-size")
	return cmd
}

func cmdUpdate(c *client.Client, baseFlag *string, stdout, stderr io.Writer) *cobra.Command {
	var idStr, file string
	cmd := &cobra.Command{
		Use:   "update",
		Short: "PUT /blueprints/:id",
		RunE: func(cmd *cobra.Command, _ []string) error {
			id, err := validate.PositiveID(idStr)
			if err != nil {
				fmt.Fprintln(stderr, err.Error())
				return &ExitError{Code: 1, Msg: err.Error()}
			}
			body, err := os.ReadFile(file)
			if err != nil {
				fmt.Fprintf(stderr, "read file: %v\n", err)
				return &ExitError{Code: 1, Msg: err.Error()}
			}
			base := resolveBase(baseFlag)
			u, err := urls.BlueprintByIDURL(base, id)
			if err != nil {
				fmt.Fprintf(stderr, "invalid base url: %v\n", err)
				return &ExitError{Code: 1, Msg: err.Error()}
			}
			ctx := context.Background()
			req, err := http.NewRequestWithContext(ctx, http.MethodPut, u, bytes.NewReader(body))
			if err != nil {
				return &ExitError{Code: 1, Msg: err.Error()}
			}
			req.Header.Set("Content-Type", "application/json")
			return doAndPrint(c, req, stdout, stderr, false)
		},
	}
	cmd.Flags().StringVar(&idStr, "id", "", "blueprint id")
	cmd.Flags().StringVar(&file, "file", "", "path to JSON body")
	_ = cmd.MarkFlagRequired("id")
	_ = cmd.MarkFlagRequired("file")
	return cmd
}

func cmdDelete(c *client.Client, baseFlag *string, stdout, stderr io.Writer) *cobra.Command {
	var idStr string
	cmd := &cobra.Command{
		Use:   "delete",
		Short: "DELETE /blueprints/:id",
		RunE: func(cmd *cobra.Command, _ []string) error {
			id, err := validate.PositiveID(idStr)
			if err != nil {
				fmt.Fprintln(stderr, err.Error())
				return &ExitError{Code: 1, Msg: err.Error()}
			}
			base := resolveBase(baseFlag)
			u, err := urls.BlueprintByIDURL(base, id)
			if err != nil {
				fmt.Fprintf(stderr, "invalid base url: %v\n", err)
				return &ExitError{Code: 1, Msg: err.Error()}
			}
			ctx := context.Background()
			req, err := http.NewRequestWithContext(ctx, http.MethodDelete, u, nil)
			if err != nil {
				return &ExitError{Code: 1, Msg: err.Error()}
			}
			return doAndPrint(c, req, stdout, stderr, true)
		},
	}
	cmd.Flags().StringVar(&idStr, "id", "", "blueprint id")
	_ = cmd.MarkFlagRequired("id")
	return cmd
}

func doAndPrint(c *client.Client, req *http.Request, stdout, stderr io.Writer, isDelete bool) error {
	status, body, err := c.Do(req.Context(), req)
	if err != nil {
		fmt.Fprintf(stderr, "%v\n", err)
		return &ExitError{Code: 2, Msg: err.Error()}
	}
	if status >= 200 && status < 300 {
		if isDelete && status == http.StatusNoContent {
			return nil
		}
		if _, werr := stdout.Write(body); werr != nil {
			return &ExitError{Code: 1, Msg: werr.Error()}
		}
		if len(body) > 0 && body[len(body)-1] != '\n' {
			_, _ = stdout.Write([]byte("\n"))
		}
		return nil
	}
	if len(body) > 0 {
		_, _ = stderr.Write(body)
		if body[len(body)-1] != '\n' {
			_, _ = stderr.Write([]byte("\n"))
		}
	}
	code := client.ExitCodeForHTTP(status)
	return &ExitError{Code: code, Msg: fmt.Sprintf("http %d", status)}
}
