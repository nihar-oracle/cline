# Oracle Code Assist (OCA) Implementation

Complete implementation of Oracle Code Assist as a first-class authentication provider in Cline CLI, similar to the Cline provider.

## Features

### Authentication
- ✅ **Sign In/Sign Out** - Full OAuth flow with mode selection
- ✅ **Internal/External Modes** - Separate authentication paths for Oracle internal users vs external customers
- ✅ **Base URL Configuration** - Custom OCA endpoint support
- ✅ **Session Management** - Persistent authentication state
- ✅ **Real-time Updates** - Streaming auth status via gRPC

### Model Management
- ✅ **Dynamic Model Fetching** - Retrieves available models from OCA API based on mode
- ✅ **Interactive Model Selection** - Searchable/filterable model picker
- ✅ **Default Model Setup** - Automatic model configuration after sign-in
- ✅ **Model Info** - Supports OCA model metadata (context window, pricing, etc.)

### API Configuration
- ✅ **Partial Updates** - Update individual fields without overwriting entire config
- ✅ **Field Validation** - Proper field masking and validation
- ✅ **State Persistence** - All OCA settings saved across sessions

## Files Created

### Core Authentication
- **`pkg/cli/auth/auth_oca_provider.go`** (373 lines)
  - Main OCA authentication handler
  - Sign in/out flows
  - Mode and base URL management
  - State storage and verification

- **`pkg/cli/auth/auth_oca_subscription.go`** (131 lines)
  - OCA auth status stream listener
  - Real-time authentication updates
  - Timeout handling

- **`pkg/cli/auth/models_oca.go`** (131 lines)
  - OCA model fetching and selection
  - Default model configuration
  - Model info conversion utilities

### Testing
- **`pkg/cli/auth/auth_oca_test.go`** (166 lines)
  - Unit tests for provider fields
  - Provider mapping tests
  - Integration tests for state management

## Files Modified

- **`pkg/cli/auth/auth_menu.go`**
  - Added OCA authentication status display
  - Added menu options for OCA operations

- **`pkg/cli/auth/update_api_configurations.go`**
  - Enhanced `ProviderFields` struct with OCA-specific fields
  - Added `BaseURLField`, `RefreshTokenField`, `ModeField`
  - Enhanced `ProviderUpdatesPartial` struct
  - New setter functions for OCA fields
  - Updated field mask builder

- **`pkg/cli/auth/providers_list.go`**
  - Added OCA to string/enum mappings
  - Added OCA display name

- **`pkg/cli/auth/providers_byo.go`**
  - Removed OCA from BYO providers list

- **`pkg/generated/providers.go`**
  - Added OCA constant and to AllProviders list

## Proto Integration

### OCA Account Service
```protobuf
service OcaAccountService {
  rpc ocaAccountLoginClicked(EmptyRequest) returns (String);
  rpc ocaAccountLogoutClicked(EmptyRequest) returns (Empty);
  rpc ocaSubscribeToAuthStatusUpdate(EmptyRequest) 
      returns (stream OcaAuthState);
}

message OcaAuthState {
  optional OcaUserInfo user = 1;
  optional string api_key = 2;
}

message OcaUserInfo {
  string uid = 1;
  optional string display_name = 2;
  optional string email = 3;
}
```

### OCA Models
```protobuf
rpc refreshOcaModels(StringRequest) returns (OcaCompatibleModelInfo);

message OcaCompatibleModelInfo {
  map<string, OcaModelInfo> models = 1;
  optional string error = 2;
}

message OcaModelInfo {
  optional int64 max_tokens = 1;
  optional int64 context_window = 2;
  optional bool supports_images = 3;
  bool supports_prompt_cache = 4;
  optional double input_price = 5;
  // ... more fields
}
```

### API Configuration Fields
```protobuf
message ModelsApiConfiguration {
  optional string oca_base_url = 73;
  optional string oca_api_key = 74;
  optional string oca_refresh_token = 75;
  optional string oca_mode = 76;
  // ... other fields
}
```

## User Flow

### Sign In

1. Run `cline auth`
2. Select "Authenticate with Oracle Code Assist"
3. Choose mode:
   - **Internal** (Oracle internal users)
   - **External** (Oracle Cloud customers)
4. Enter base URL (optional):
   - Default: Press Enter
   - Custom: Enter URL like `https://oca-custom.oracle.com`
5. State is stored:
   - `ocaMode` = "internal" or "external"
   - `ocaBaseUrl` = custom URL (if provided)
6. Browser opens with OAuth URL
7. User authenticates in browser
8. Auth stream receives:
   - `OcaAuthState` with user info and API key
9. System stores:
   - `ocaUserInfo` = { uid, displayName, email }
   - `ocaApiKey` = OAuth token
   - `ocaRefreshToken` = Refresh token
10. Models are fetched using `refreshOcaModels(mode)`
11. User selects model from searchable list
12. Configuration applied
13. ✅ OCA is now active provider!

### Sign Out

1. Select "Sign out of Oracle Code Assist"
2. Confirm action
3. RPC called: `ocaAccountLogoutClicked()`
4. State cleared:
   - `ocaUserInfo` = null
   - `ocaApiKey` = ""
   - `ocaRefreshToken` = ""
5. ✅ Signed out successfully

### Change Model

1. Select "Change OCA model"
2. System retrieves stored `ocaMode` from state
3. Models fetched via `refreshOcaModels(mode)`
4. Searchable/filterable model list displayed
5. User selects new model
6. Configuration updated
7. ✅ Model changed

## State Management

### Fields Stored
```
ocaMode          - "internal" or "external"
ocaBaseUrl       - Custom endpoint URL (optional)
ocaApiKey        - OAuth access token
ocaRefreshToken  - OAuth refresh token
ocaUserInfo      - User profile { uid, displayName, email }
planModeApiModelId - Selected model for plan mode
actModeApiModelId  - Selected model for act mode
planModeApiProvider - Set to ApiProvider_OCA
actModeApiProvider  - Set to ApiProvider_OCA
```

### Storage Flow
```
User Input → ProviderUpdatesPartial → UpdateProviderPartial() 
           → setModeField/setBaseURLField/setAPIKeyField 
           → buildProviderFieldMask 
           → UpdateApiConfigurationPartialRequest 
           → gRPC: updateApiConfigurationPartial()
           → State persisted
```

## Testing

### Unit Tests
Run unit tests:
```bash
go test ./pkg/cli/auth -run TestOCAProvider -v
```

**Tests included:**
- `TestOCAProviderFields` - Verifies all OCA provider fields are configured
- `TestOCAProviderMappings` - Tests string/enum conversions
- `TestOCAModeStorage` - Integration test for mode storage (requires running server)

### Manual Testing

1. **Kill old instances:**
```bash
./bin/cline instance kill --all-cli
```

2. **Start fresh instance (debugger will do this automatically):**
```bash
# In VSCode: F5 → "Debug cline (interactive mode)"
```

3. **Test sign in flow:**
```bash
./bin/cline auth
# Select: Authenticate with Oracle Code Assist
# Choose: Internal or External
# Enter: Base URL (or press Enter)
# Complete OAuth in browser
# Select model from list
```

## Debugging

### VSCode Launch Configurations

All configurations in `.vscode/launch.json` include:
```json
"env": {
  "CLINE_BIN_DIR": "${workspaceFolder}/bin",
  "CLINE_ROOT_DIR": "${workspaceFolder}/../dist-standalone"
}
```

**Available configurations:**
- Debug cline (interactive mode)
- Debug cline (with custom prompt)
- Debug cline (version)
- Debug cline (auth)
- Debug cline (config)
- Debug cline-host
- Debug cline-host (verbose)
- Debug cline-host (custom port)

### Required Components

```
✅ cline (31MB, ARM64)
✅ cline-host (26MB, ARM64)
✅ node (104MB, ARM64)
✅ cline-core.js (39MB, latest with OCA support)
✅ Go proto files (regenerated with OCA)
```

### Debugging OCA Authentication

1. Set breakpoints in:
   - `auth_oca_provider.go:HandleOCAAuth()` - Main entry point
   - `auth_oca_provider.go:ocaSignIn()` - Sign in flow
   - `auth_oca_provider.go:storeOCAModeWithManager()` - State storage
   - `auth_oca_subscription.go:readStream()` - Auth status updates

2. Start debugger (F5)
3. Step through the complete flow
4. Watch state being updated in real-time

## Implementation Details

### Key Design Decisions

1. **Separate from BYO Providers**: OCA is treated like Cline, not a "bring your own" provider, because it requires special OAuth authentication.

2. **Mode-First Selection**: Users select internal/external mode before authentication, not after, because the OAuth endpoint depends on the mode.

3. **State Verification**: Mode and base URL are verified after storage to ensure the backend can read them before OAuth.

4. **Manager Reuse**: Single task manager is reused across storage operations to avoid connection overhead.

5. **Graceful Fallbacks**: If mode isn't stored, system prompts user again rather than failing.

### Error Handling

- Network failures during model fetch
- OAuth timeout (5 minutes)
- State persistence failures
- Missing mode or base URL
- Invalid or expired tokens

### Future Enhancements

- [ ] Implement token refresh logic
- [ ] Add organization support (like Cline)
- [ ] Cache fetched models
- [ ] Add model filtering by capabilities
- [ ] Support for model presets

## Troubleshooting

### Issue: "server does not implement updateApiConfigurationPartial"

**Solution:**
```bash
# Kill all old instances
./bin/cline instance kill --all-cli

# Rebuild cline-core.js (if needed)
cd /Users/niharturumella/projects/cline
npm run compile-standalone

# Rebuild CLI binaries
cd cli
~/go-sdk/bin/go build -o bin/cline ./cmd/cline

# Start fresh
./bin/cline auth
```

### Issue: "OCA mode not found in state"

**Solution:**
The mode will be prompted again. This is expected behavior if:
- First time using OCA
- State was cleared
- Switching from old to new implementation

### Issue: "Model fetching failed"

**Possible causes:**
- No internet connection
- Invalid mode selected
- OCA API is down
- Invalid base URL

**Solution:**
- Check network connection
- Try re-authenticating
- Verify base URL is correct
- Check OCA service status

## API Reference

### Main Functions

```go
// Authentication
HandleOCAAuth(ctx) error
IsOCAAuthenticated(ctx) bool
HandleChangeOCAModel(ctx) error

// Sign In/Out
ocaSignIn(ctx, mode) error
ocaSignOut(ctx) error
selectOCAMode() (string, error)

// State Management
storeOCAMode(ctx, mode) error
storeOCABaseURL(ctx, baseURL) error
getOCAModeFromState(ctx, manager) (string, error)
verifyOCAStateUpdated(ctx, manager, mode, baseURL) error

// Models
FetchOCAModels(ctx, manager, mode) (map[string]*OcaModelInfo, error)
SelectOCAModelWithFetch(ctx, manager, mode) error
SetDefaultOCAModel(ctx, manager, mode) error
```

### Configuration Update

```go
// Update OCA configuration
updates := ProviderUpdatesPartial{
    Mode:         &"internal",
    BaseURL:      &"https://oca.oracle.com",
    APIKey:       &"oca-key-123",
    RefreshToken: &"refresh-token-456",
    ModelID:      &"oca/gpt-4.1",
}

err := UpdateProviderPartial(ctx, manager, ApiProvider_OCA, updates, true)
```

## Version History

- **v1.0** (Oct 14, 2024) - Initial implementation
  - Complete OAuth authentication flow
  - Internal/External mode selection
  - Model fetching and selection
  - Full state management
  - Unit tests

## Credits

Implementation follows the patterns established by the Cline provider authentication flow, adapted for OCA's specific requirements (modes, base URL, etc.).

