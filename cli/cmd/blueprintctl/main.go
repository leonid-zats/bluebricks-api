package main

import (
	"os"

	"blueprintctl/internal/client"
	"blueprintctl/internal/runner"
)

func main() {
	os.Exit(runner.Run(os.Args, client.New(), os.Stdout, os.Stderr))
}
