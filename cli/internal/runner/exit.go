package runner

// ExitError is returned from Cobra RunE to set process exit status.
type ExitError struct {
	Code int
	Msg  string
}

func (e *ExitError) Error() string {
	if e.Msg == "" {
		return "error"
	}
	return e.Msg
}
