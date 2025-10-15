package auth

import (
	"context"
	"testing"

	"github.com/cline/cli/pkg/cli/global"
	"github.com/cline/cli/pkg/cli/task"
	"github.com/cline/grpc-go/cline"
)

// TestOCAModeStorage tests that OCA mode can be stored and retrieved
func TestOCAModeStorage(t *testing.T) {
	// This test requires a running cline-core instance
	// Skip in unit test mode
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	ctx := context.Background()

	// Initialize global config
	err := global.InitializeGlobalConfig(&global.GlobalConfig{
		Verbose:      true,
		OutputFormat: "plain",
		CoreAddress:  "localhost:50052",
	})
	if err != nil {
		t.Fatalf("Failed to initialize global config: %v", err)
	}

	// Start a test instance
	instance, err := global.Clients.StartNewInstance(ctx)
	if err != nil {
		t.Fatalf("Failed to start test instance: %v", err)
	}
	defer global.KillInstanceByAddress(ctx, global.Clients.GetRegistry(), instance.Address)

	manager, err := task.NewManagerForAddress(ctx, instance.Address)
	if err != nil {
		t.Fatalf("Failed to create manager: %v", err)
	}

	testCases := []struct {
		name    string
		mode    string
		baseURL string
	}{
		{
			name:    "Internal mode without baseURL",
			mode:    "internal",
			baseURL: "",
		},
		{
			name:    "External mode with baseURL",
			mode:    "external",
			baseURL: "https://oca-external.oracle.com",
		},
		{
			name:    "Internal mode with custom baseURL",
			mode:    "internal",
			baseURL: "https://oca-internal-custom.oracle.com",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Store mode
			err := storeOCAModeWithManager(ctx, manager, tc.mode)
			if err != nil {
				t.Errorf("Failed to store OCA mode: %v", err)
				return
			}

			// Store base URL if provided
			if tc.baseURL != "" {
				err = storeOCABaseURLWithManager(ctx, manager, tc.baseURL)
				if err != nil {
					t.Errorf("Failed to store OCA base URL: %v", err)
					return
				}
			}

			// Verify state
			err = verifyOCAStateUpdated(ctx, manager, tc.mode, tc.baseURL)
			if err != nil {
				t.Errorf("Failed to verify OCA state: %v", err)
				return
			}

			// Retrieve mode
			retrievedMode, err := getOCAModeFromState(ctx, manager)
			if err != nil {
				t.Errorf("Failed to retrieve OCA mode: %v", err)
				return
			}

			if retrievedMode != tc.mode {
				t.Errorf("Mode mismatch: expected %s, got %s", tc.mode, retrievedMode)
			}

			t.Logf("✓ Successfully stored and retrieved mode=%s, baseURL=%s", tc.mode, tc.baseURL)
		})
	}
}

// TestOCAProviderFields tests that OCA provider fields are properly configured
func TestOCAProviderFields(t *testing.T) {
	fields, err := GetProviderFields(cline.ApiProvider_OCA)
	if err != nil {
		t.Fatalf("Failed to get OCA provider fields: %v", err)
	}

	// Verify all expected fields are set
	if fields.APIKeyField != "ocaApiKey" {
		t.Errorf("Expected APIKeyField='ocaApiKey', got '%s'", fields.APIKeyField)
	}

	if fields.BaseURLField != "ocaBaseUrl" {
		t.Errorf("Expected BaseURLField='ocaBaseUrl', got '%s'", fields.BaseURLField)
	}

	if fields.RefreshTokenField != "ocaRefreshToken" {
		t.Errorf("Expected RefreshTokenField='ocaRefreshToken', got '%s'", fields.RefreshTokenField)
	}

	if fields.ModeField != "ocaMode" {
		t.Errorf("Expected ModeField='ocaMode', got '%s'", fields.ModeField)
	}

	if fields.PlanModeModelIDField != "planModeApiModelId" {
		t.Errorf("Expected PlanModeModelIDField='planModeApiModelId', got '%s'", fields.PlanModeModelIDField)
	}

	if fields.ActModeModelIDField != "actModeApiModelId" {
		t.Errorf("Expected ActModeModelIDField='actModeApiModelId', got '%s'", fields.ActModeModelIDField)
	}

	t.Log("✓ All OCA provider fields are properly configured")
}

// TestOCAProviderMappings tests string/enum conversions for OCA
func TestOCAProviderMappings(t *testing.T) {
	// Test enum to string
	providerID := GetProviderIDForEnum(cline.ApiProvider_OCA)
	if providerID != "oca" {
		t.Errorf("Expected GetProviderIDForEnum(OCA)='oca', got '%s'", providerID)
	}

	// Test string to enum
	provider, ok := mapProviderStringToEnum("oca")
	if !ok {
		t.Error("Failed to map 'oca' string to enum")
	}
	if provider != cline.ApiProvider_OCA {
		t.Errorf("Expected mapProviderStringToEnum('oca')=ApiProvider_OCA, got %v", provider)
	}

	// Test display name
	displayName := getProviderDisplayName(cline.ApiProvider_OCA)
	if displayName != "Oracle Code Assist" {
		t.Errorf("Expected display name='Oracle Code Assist', got '%s'", displayName)
	}

	t.Log("✓ All OCA provider mappings work correctly")
}
