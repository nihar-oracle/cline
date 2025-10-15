package auth

import (
	"context"
	"fmt"

	"github.com/cline/cli/pkg/cli/task"
	"github.com/cline/grpc-go/cline"
)

// DefaultOCAModelID is the default model ID for OCA provider.
const DefaultOCAModelID = "oca/gpt-4.1"

// FetchOCAModels fetches available OCA models from Cline Core.
// The mode parameter should be "internal" or "external" depending on the OCA account type.
func FetchOCAModels(ctx context.Context, manager *task.Manager, mode string) (map[string]*cline.OcaModelInfo, error) {
	verboseLog("Fetching OCA models (mode: %s)", mode)

	req := &cline.StringRequest{
		Value: mode,
	}

	resp, err := manager.GetClient().Models.RefreshOcaModels(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch OCA models: %w", err)
	}

	if resp.Error != nil && *resp.Error != "" {
		return nil, fmt.Errorf("OCA API error: %s", *resp.Error)
	}

	return resp.Models, nil
}

// GetOCAModelInfo retrieves information for a specific OCA model.
func GetOCAModelInfo(modelID string, models map[string]*cline.OcaModelInfo) (*cline.OcaModelInfo, error) {
	modelInfo, exists := models[modelID]
	if !exists {
		return nil, fmt.Errorf("model %s not found", modelID)
	}
	return modelInfo, nil
}

// SetDefaultOCAModel configures the default OCA model after authentication.
// This is called automatically after successful OCA sign-in.
func SetDefaultOCAModel(ctx context.Context, manager *task.Manager, mode string) error {
	// Fetch available models
	models, err := FetchOCAModels(ctx, manager, mode)
	if err != nil {
		// If we can't fetch models, we'll use the default without model info
		fmt.Printf("Warning: Could not fetch OCA models: %v\n", err)
		fmt.Printf("Using default model: %s\n", DefaultOCAModelID)
		return applyDefaultOCAModel(ctx, manager, nil)
	}

	// Check if default model is available
	modelInfo, err := GetOCAModelInfo(DefaultOCAModelID, models)
	if err != nil {
		fmt.Printf("Warning: Default model not found: %v\n", err)
		// Try to use any available model
		for modelID := range models {
			fmt.Printf("Using available model: %s\n", modelID)
			return applyOCAModelConfiguration(ctx, manager, modelID, models[modelID])
		}
		return fmt.Errorf("no usable OCA models found")
	}

	return applyOCAModelConfiguration(ctx, manager, DefaultOCAModelID, modelInfo)
}

// SelectOCAModelWithFetch presents a menu to select an OCA model and applies the configuration.
// This is used when the user wants to select a different model after authentication.
func SelectOCAModelWithFetch(ctx context.Context, manager *task.Manager, mode string) error {
	// Fetch models
	models, err := FetchOCAModels(ctx, manager, mode)
	if err != nil {
		return fmt.Errorf("failed to fetch OCA models: %w", err)
	}

	// Convert to interface map for generic utilities
	modelMap := ConvertOCAModelsToInterface(models)

	// Get model IDs as a sorted list
	modelIDs := ConvertModelsMapToSlice(modelMap)

	// Display selection menu
	selectedModelID, err := DisplayModelSelectionMenu(modelIDs, "Oracle Code Assist")
	if err != nil {
		return fmt.Errorf("model selection failed: %w", err)
	}

	// Get the selected model info
	modelInfo := models[selectedModelID]

	// Apply the configuration
	if err := applyOCAModelConfiguration(ctx, manager, selectedModelID, modelInfo); err != nil {
		return err
	}

	fmt.Println()

	// Return to main auth menu after model selection
	return HandleAuthMenuNoArgs(ctx)
}

// applyOCAModelConfiguration applies an OCA model configuration to both Act and Plan modes using UpdateProviderPartial.
func applyOCAModelConfiguration(ctx context.Context, manager *task.Manager, modelID string, modelInfo *cline.OcaModelInfo) error {
	provider := cline.ApiProvider_OCA

	updates := ProviderUpdatesPartial{
		ModelID:   &modelID,
		ModelInfo: modelInfo,
	}

	return UpdateProviderPartial(ctx, manager, provider, updates, true)
}

func applyDefaultOCAModel(ctx context.Context, manager *task.Manager, modelInfo *cline.OcaModelInfo) error {
	return applyOCAModelConfiguration(ctx, manager, DefaultOCAModelID, modelInfo)
}

// ConvertOCAModelsToInterface converts OCA model map to generic interface map.
// This allows OCA models to be used with the generic fetching utilities.
func ConvertOCAModelsToInterface(models map[string]*cline.OcaModelInfo) map[string]interface{} {
	result := make(map[string]interface{}, len(models))
	for k, v := range models {
		result[k] = v
	}
	return result
}
