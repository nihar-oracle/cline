package auth

import (
	"context"
	"fmt"
	"io"
	"time"

	"github.com/cline/cli/pkg/cli/global"
	"github.com/cline/grpc-go/cline"
)

// OCAAuthStatusListener manages subscription to OCA auth status updates
type OCAAuthStatusListener struct {
	stream    cline.OcaAccountService_OcaSubscribeToAuthStatusUpdateClient
	updatesCh chan *cline.OcaAuthState
	errCh     chan error
	ctx       context.Context
	cancel    context.CancelFunc
}

// NewOCAAuthStatusListener creates a new OCA auth status listener
func NewOCAAuthStatusListener(parentCtx context.Context) (*OCAAuthStatusListener, error) {
	client, err := global.GetDefaultClient(parentCtx)
	if err != nil {
		return nil, fmt.Errorf("failed to get client: %w", err)
	}

	// Create cancellable context
	ctx, cancel := context.WithCancel(parentCtx)

	// Subscribe to OCA auth status updates
	stream, err := client.Ocaaccount.OcaSubscribeToAuthStatusUpdate(ctx, &cline.EmptyRequest{})
	if err != nil {
		cancel()
		return nil, fmt.Errorf("failed to subscribe to OCA auth updates: %w", err)
	}

	return &OCAAuthStatusListener{
		stream:    stream,
		updatesCh: make(chan *cline.OcaAuthState, 10),
		errCh:     make(chan error, 1),
		ctx:       ctx,
		cancel:    cancel,
	}, nil
}

// Start begins listening to the OCA auth status update stream
func (l *OCAAuthStatusListener) Start() error {
	verboseLog("Starting OCA auth status listener...")

	go l.readStream()

	return nil
}

// readStream reads from the gRPC stream and forwards messages to channels
func (l *OCAAuthStatusListener) readStream() {
	defer close(l.updatesCh)
	defer close(l.errCh)

	for {
		select {
		case <-l.ctx.Done():
			verboseLog("OCA auth listener context cancelled")
			return
		default:
			state, err := l.stream.Recv()
			if err != nil {
				if err == io.EOF {
					verboseLog("OCA auth status stream closed")
					return
				}
				verboseLog("Error reading from OCA auth status stream: %v", err)
				select {
				case l.errCh <- err:
				case <-l.ctx.Done():
				}
				return
			}

			verboseLog("Received OCA auth state update: user=%v", state.User != nil)

			select {
			case l.updatesCh <- state:
			case <-l.ctx.Done():
				return
			}
		}
	}
}

// WaitForAuthentication blocks until OCA authentication succeeds or timeout occurs
func (l *OCAAuthStatusListener) WaitForAuthentication(timeout time.Duration) error {
	verboseLog("Waiting for OCA authentication (timeout: %v)...", timeout)

	timer := time.NewTimer(timeout)
	defer timer.Stop()

	for {
		select {
		case <-timer.C:
			return fmt.Errorf("OCA authentication timeout after %v - please try again", timeout)

		case <-l.ctx.Done():
			return fmt.Errorf("OCA authentication cancelled")

		case err := <-l.errCh:
			return fmt.Errorf("OCA authentication stream error: %w", err)

		case state := <-l.updatesCh:
			if isOCAAuthenticated(state) {
				verboseLog("OCA authentication successful!")
				return nil
			}
			verboseLog("Received OCA auth update but not authenticated yet...")
		}
	}
}

// Stop closes the stream and cleans up resources
func (l *OCAAuthStatusListener) Stop() {
	verboseLog("Stopping OCA auth status listener...")
	l.cancel()
}

// isOCAAuthenticated checks if OcaAuthState indicates successful authentication
func isOCAAuthenticated(state *cline.OcaAuthState) bool {
	return state != nil && state.User != nil && state.ApiKey != nil && *state.ApiKey != ""
}
