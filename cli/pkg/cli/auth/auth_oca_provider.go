package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/charmbracelet/huh"
	"github.com/cline/cli/pkg/cli/task"
	"github.com/cline/grpc-go/cline"
)

var isOCASessionAuthenticated bool

// OCA (Oracle Code Assist) provider specific code

func HandleOCAAuth(ctx context.Context) error {
	verboseLog("Authenticating with Oracle Code Assist...")

	// Check if already authenticated
	if IsOCAAuthenticated(ctx) {
		return ocaSignOutDialog(ctx)
	}

	// First, select OCA mode (internal or external)
	ocaMode, err := selectOCAMode()
	if err != nil {
		return err
	}

	// Perform sign in with selected mode
	if err := ocaSignIn(ctx, ocaMode); err != nil {
		return err
	}

	fmt.Println()

	verboseLog("✓ You are signed in to Oracle Code Assist (%s mode)!", ocaMode)

	// Configure default OCA model after successful authentication
	if err := configureDefaultOCAModel(ctx, ocaMode); err != nil {
		fmt.Printf("Warning: Could not configure default OCA model: %v\n", err)
		fmt.Println("You can configure a model later with 'cline auth' and selecting 'Change OCA model'")
	}

	// Return to main auth menu after successful authentication
	return HandleAuthMenuNoArgs(ctx)
}

// selectOCAMode prompts the user to select between internal and external OCA mode
func selectOCAMode() (string, error) {
	var mode string
	options := []huh.Option[string]{
		huh.NewOption("Internal (Oracle internal users)", "internal"),
		huh.NewOption("External (Oracle Cloud customers)", "external"),
	}

	form := huh.NewForm(
		huh.NewGroup(
			huh.NewSelect[string]().
				Title("Select Oracle Code Assist mode").
				Description("Choose based on your Oracle account type").
				Options(options...).
				Value(&mode),
		),
	)

	if err := form.Run(); err != nil {
		return "", fmt.Errorf("failed to select OCA mode: %w", err)
	}

	return mode, nil
}

func ocaSignOut(ctx context.Context) error {
	manager, err := createTaskManager(ctx)
	if err != nil {
		return fmt.Errorf("failed to create task manager: %w", err)
	}

	client := manager.GetClient()

	// Call OCA logout RPC
	_, err = client.Ocaaccount.OcaAccountLogoutClicked(ctx, &cline.EmptyRequest{})
	if err != nil {
		return fmt.Errorf("failed to logout from OCA: %w", err)
	}

	isOCASessionAuthenticated = false
	fmt.Println("✓ You have been signed out of Oracle Code Assist.")
	return nil
}

func ocaSignOutDialog(ctx context.Context) error {
	var confirm bool
	form := huh.NewForm(
		huh.NewGroup(
			huh.NewConfirm().
				Title("You are already signed in to Oracle Code Assist.").
				Description("Would you like to sign out?").
				Value(&confirm),
		),
	)

	if err := form.Run(); err != nil {
		return nil
	}

	if confirm {
		if err := ocaSignOut(ctx); err != nil {
			fmt.Printf("Failed to sign out: %v\n", err)
			return err
		}
	}
	return HandleAuthMenuNoArgs(ctx)
}

func ocaSignIn(ctx context.Context, ocaMode string) error {
	if IsOCAAuthenticated(ctx) {
		return nil
	}

	manager, err := createTaskManager(ctx)
	if err != nil {
		return fmt.Errorf("failed to create task manager: %w", err)
	}

	// STEP 1: Store the mode in state FIRST (backend needs this for OAuth URL generation)
	verboseLog("Storing OCA mode: %s", ocaMode)
	if err := storeOCAModeWithManager(ctx, manager, ocaMode); err != nil {
		verboseLog("Failed to store OCA mode: %v", err)
		return fmt.Errorf("failed to store OCA mode: %w", err)
	}

	// STEP 2: Prompt for base URL (optional)
	baseURL, err := promptForOCABaseURL(ocaMode)
	if err != nil {
		return err
	}

	// STEP 3: Store base URL if provided (backend needs this for OAuth URL)
	if baseURL != "" {
		verboseLog("Storing OCA base URL: %s", baseURL)
		if err := storeOCABaseURLWithManager(ctx, manager, baseURL); err != nil {
			verboseLog("Failed to store OCA base URL: %v", err)
			return fmt.Errorf("failed to store OCA base URL: %w", err)
		}
	}

	// STEP 4: Verify state was updated correctly
	if err := verifyOCAStateUpdated(ctx, manager, ocaMode, baseURL); err != nil {
		return fmt.Errorf("failed to verify OCA state: %w", err)
	}

	// STEP 5: Subscribe to OCA auth updates before initiating login
	verboseLog("Subscribing to OCA auth status updates...")
	listener, err := NewOCAAuthStatusListener(ctx)
	if err != nil {
		verboseLog("Failed to subscribe to OCA auth updates: %v", err)
		return fmt.Errorf("failed to subscribe to OCA auth updates: %w", err)
	}
	defer listener.Stop()

	if err := listener.Start(); err != nil {
		verboseLog("Failed to start OCA auth listener: %v", err)
		return fmt.Errorf("failed to start OCA auth listener: %w", err)
	}

	// STEP 6: Initiate OCA login (opens browser with callback URL)
	// Backend reads ocaMode and ocaBaseUrl from state to generate proper OAuth URL
	verboseLog("Initiating OCA login (mode: %s, baseURL: %s)...", ocaMode, baseURL)

	client := manager.GetClient()

	authURLResp, err := client.Ocaaccount.OcaAccountLoginClicked(ctx, &cline.EmptyRequest{})
	if err != nil {
		verboseLog("Failed to initiate OCA login: %v", err)
		return fmt.Errorf("failed to initiate OCA login: %w", err)
	}

	if authURLResp != nil && authURLResp.Value != "" {
		verboseLog("OCA auth URL generated: %s", authURLResp.Value)
		fmt.Printf("\n  🌐 Opening browser for Oracle Code Assist authentication (%s mode)...\n", ocaMode)
	} else {
		fmt.Printf("\n  Opening browser for Oracle Code Assist authentication (%s mode)...\n", ocaMode)
	}

	fmt.Println("  Waiting for you to complete authentication in your browser...")
	fmt.Println("   (This may take a few moments. Timeout: 5 minutes)")

	// STEP 7: Wait for auth status update confirming success
	verboseLog("Waiting for OCA authentication to complete...")
	if err := listener.WaitForAuthentication(5 * time.Minute); err != nil {
		verboseLog("OCA authentication failed or timed out: %v", err)
		fmt.Println("\n  Authentication failed or timed out.")
		fmt.Println("  Please try again with 'cline auth'")
		return err
	}

	// STEP 8: Set the session flag after confirmed authentication
	isOCASessionAuthenticated = true
	verboseLog("OCA login successful")
	return nil
}

// promptForOCABaseURL prompts the user for an optional OCA base URL
func promptForOCABaseURL(mode string) (string, error) {
	var baseURL string

	description := "Enter the OCA base URL (optional, press Enter to use default)"
	if mode == "internal" {
		description = "Enter the internal OCA base URL (press Enter for default Oracle internal endpoint)"
	}

	form := huh.NewForm(
		huh.NewGroup(
			huh.NewInput().
				Title("OCA Base URL (optional)").
				Description(description).
				Placeholder("https://oca.oracle.com").
				Value(&baseURL),
		),
	)

	if err := form.Run(); err != nil {
		return "", fmt.Errorf("failed to get base URL: %w", err)
	}

	return baseURL, nil
}

// storeOCABaseURL stores the OCA base URL in state
func storeOCABaseURL(ctx context.Context, baseURL string) error {
	manager, err := createTaskManager(ctx)
	if err != nil {
		return fmt.Errorf("failed to create task manager: %w", err)
	}
	return storeOCABaseURLWithManager(ctx, manager, baseURL)
}

// storeOCABaseURLWithManager stores the OCA base URL using provided manager
func storeOCABaseURLWithManager(ctx context.Context, manager *task.Manager, baseURL string) error {
	updates := ProviderUpdatesPartial{
		BaseURL: &baseURL,
	}

	if err := UpdateProviderPartial(ctx, manager, cline.ApiProvider_OCA, updates, false); err != nil {
		return fmt.Errorf("failed to store OCA base URL: %w", err)
	}

	verboseLog("OCA base URL '%s' stored successfully", baseURL)
	return nil
}

// storeOCAMode stores the OCA mode (internal/external) in state
func storeOCAMode(ctx context.Context, mode string) error {
	manager, err := createTaskManager(ctx)
	if err != nil {
		return fmt.Errorf("failed to create task manager: %w", err)
	}
	return storeOCAModeWithManager(ctx, manager, mode)
}

// storeOCAModeWithManager stores the OCA mode using provided manager
func storeOCAModeWithManager(ctx context.Context, manager *task.Manager, mode string) error {
	// Update state with OCA mode using the proper API configuration update
	updates := ProviderUpdatesPartial{
		Mode: &mode,
	}

	// Update the OCA mode without setting as active provider (just store the mode)
	if err := UpdateProviderPartial(ctx, manager, cline.ApiProvider_OCA, updates, false); err != nil {
		return fmt.Errorf("failed to store OCA mode: %w", err)
	}

	verboseLog("OCA mode '%s' stored successfully", mode)
	return nil
}

// getOCAModeFromState retrieves the OCA mode from state
func getOCAModeFromState(ctx context.Context, manager *task.Manager) (string, error) {
	state, err := manager.GetClient().State.GetLatestState(ctx, &cline.EmptyRequest{})
	if err != nil {
		return "", fmt.Errorf("failed to get state: %w", err)
	}

	var stateData map[string]interface{}
	if err := json.Unmarshal([]byte(state.StateJson), &stateData); err != nil {
		return "", fmt.Errorf("failed to parse state: %w", err)
	}

	if mode, ok := stateData["ocaMode"].(string); ok && mode != "" {
		return mode, nil
	}

	return "", fmt.Errorf("OCA mode not found in state")
}

// verifyOCAStateUpdated verifies that OCA mode and base URL were successfully stored
func verifyOCAStateUpdated(ctx context.Context, manager *task.Manager, expectedMode, expectedBaseURL string) error {
	state, err := manager.GetClient().State.GetLatestState(ctx, &cline.EmptyRequest{})
	if err != nil {
		return fmt.Errorf("failed to get state for verification: %w", err)
	}

	var stateData map[string]interface{}
	if err := json.Unmarshal([]byte(state.StateJson), &stateData); err != nil {
		return fmt.Errorf("failed to parse state for verification: %w", err)
	}

	// Verify mode was stored
	if mode, ok := stateData["ocaMode"].(string); !ok || mode != expectedMode {
		return fmt.Errorf("OCA mode not properly stored (expected: %s, got: %v)", expectedMode, mode)
	}

	// Verify base URL if it was provided
	if expectedBaseURL != "" {
		if baseURL, ok := stateData["ocaBaseUrl"].(string); !ok || baseURL != expectedBaseURL {
			return fmt.Errorf("OCA base URL not properly stored (expected: %s, got: %v)", expectedBaseURL, baseURL)
		}
	}

	verboseLog("✓ OCA state verified - mode: %s, baseURL: %s", expectedMode, expectedBaseURL)
	return nil
}

func IsOCAAuthenticated(ctx context.Context) bool {
	if isOCASessionAuthenticated {
		verboseLog("OCA session is already authenticated")
		return true
	}

	verboseLog("Verifying OCA authentication with server...")

	manager, err := createTaskManager(ctx)
	if err != nil {
		verboseLog("Failed to get task manager for OCA auth check: %v", err)
		return false
	}

	state, err := manager.GetClient().State.GetLatestState(ctx, &cline.EmptyRequest{})
	if err != nil {
		verboseLog("Failed to get state for OCA auth check: %v", err)
		return false
	}

	// Parse state to check for OCA user info and API key
	var stateData map[string]interface{}
	if err := json.Unmarshal([]byte(state.StateJson), &stateData); err != nil {
		verboseLog("Failed to parse state for OCA auth check: %v", err)
		return false
	}

	// Check if OCA user info exists (similar to how Cline checks for user?.uid)
	if ocaUserInfo, ok := stateData["ocaUserInfo"].(map[string]interface{}); ok {
		if uid, ok := ocaUserInfo["uid"].(string); ok && uid != "" {
			verboseLog("Server verification successful - OCA user authenticated")
			isOCASessionAuthenticated = true
			return true
		}
	}

	// Fallback: Check if OCA API key exists
	if apiKey, ok := stateData["ocaApiKey"].(string); ok && apiKey != "" {
		verboseLog("OCA API key found in state")
		isOCASessionAuthenticated = true
		return true
	}

	verboseLog("OCA authentication verification failed")
	return false
}

// HandleChangeOCAModel allows OCA-authenticated users to change their OCA model selection
func HandleChangeOCAModel(ctx context.Context) error {
	// Ensure user is authenticated
	if !IsOCAAuthenticated(ctx) {
		return fmt.Errorf("you must be authenticated with Oracle Code Assist to change models. Run 'cline auth' to sign in")
	}

	// Get task manager
	manager, err := createTaskManager(ctx)
	if err != nil {
		return fmt.Errorf("failed to create task manager: %w", err)
	}

	// Get the stored OCA mode from state
	mode, err := getOCAModeFromState(ctx, manager)
	if err != nil {
		// If we can't get the mode, ask the user
		verboseLog("Could not retrieve OCA mode from state: %v", err)
		mode, err = selectOCAMode()
		if err != nil {
			return err
		}
	}

	// Launch OCA model selection with fetching
	return SelectOCAModelWithFetch(ctx, manager, mode)
}

// configureDefaultOCAModel configures the default OCA model after authentication
func configureDefaultOCAModel(ctx context.Context, mode string) error {
	verboseLog("Configuring default OCA model...")

	// Create task manager
	manager, err := task.NewManagerForDefault(ctx)
	if err != nil {
		return fmt.Errorf("failed to create task manager: %w", err)
	}

	// Set default OCA model with the specified mode
	return SetDefaultOCAModel(ctx, manager, mode)
}
