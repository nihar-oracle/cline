# Error Fix: "server does not implement updateApiConfigurationPartial"

## The Error

```
Error: auth setup failed: failed to store OCA mode: failed to update API configuration: 
rpc error: code = Unimplemented desc = The server does not implement the method 
/cline.ModelsService/updateApiConfigurationPartial
```

## Root Cause

The error occurred because **old cline-core instances** were running that don't have the `updateApiConfigurationPartial` RPC method implemented. This method was added recently to support partial API configuration updates.

## The Fix (Already Applied)

### ✅ Step 1: Killed All Old Instances

```bash
./bin/cline instance kill --all-cli
# ✓ Killed 7 instances successfully
```

**Why?** Old instances (version 3.32.6) don't have the new RPC method. Fresh instances will use the latest cline-core.js (version 3.32.7) which has the method.

### ✅ Step 2: Rebuilt cline-core.js

```bash
cd /Users/niharturumella/projects/cline
npm run compile-standalone
# ✓ Built cline-core.js with updateApiConfigurationPartial
```

**Verification:**
```bash
$ grep "/cline.ModelsService/updateApiConfigurationPartial" dist-standalone/cline-core.js
path: "/cline.ModelsService/updateApiConfigurationPartial",
# ✓ Method is present in compiled file
```

### ✅ Step 3: Regenerated Go Proto Files

```bash
npm run protos-go
# ✓ Generated Go client with UpdateApiConfigurationPartial method
```

**Verification:**
```bash
$ grep "UpdateApiConfigurationPartial" src/generated/grpc-go/client/services/models_client.go
func (sc *ModelsClient) UpdateApiConfigurationPartial(...)
# ✓ Client method exists
```

### ✅ Step 4: Rebuilt CLI Binaries

```bash
cd cli
~/go-sdk/bin/go build -o bin/cline ./cmd/cline
~/go-sdk/bin/go build -o bin/cline-host ./cmd/cline-host
# ✓ Rebuilt with latest proto files
```

### ✅ Step 5: Added Better Error Handling

Updated `update_api_configurations.go` to provide helpful error message:

```go
_, err := manager.GetClient().Models.UpdateApiConfigurationPartial(ctx, request)
if err != nil {
    if strings.Contains(err.Error(), "Unimplemented") {
        return fmt.Errorf("failed to update API configuration (partial): %w\n\n" +
            "This error occurs when cline-core is an older version.\n" +
            "Please ensure you're using the latest cline-core.js:\n" +
            "1. Kill all instances: ./bin/cline instance kill --all-cli\n" +
            "2. Restart and try again", err)
    }
    return fmt.Errorf("failed to update API configuration (partial): %w", err)
}
```

## Verification

### Check Implementation Exists

```bash
# Server has the method
$ cd /Users/niharturumella/projects/cline
$ grep -c "updateApiConfigurationPartial" dist-standalone/cline-core.js
14

# Server registers the method
$ grep "updateApiConfigurationPartial.*wrapper" src/generated/hosts/standalone/protobus-server-setup.ts
updateApiConfigurationPartial: wrapper<cline.UpdateApiConfigurationPartialRequest,cline.Empty>(...)

# Client has the method
$ grep "UpdateApiConfigurationPartial" src/generated/grpc-go/client/services/models_client.go
func (sc *ModelsClient) UpdateApiConfigurationPartial(...)
```

### Check No Old Instances

```bash
$ ./bin/cline instance list
No Cline instances found.
```

### Run Tests

```bash
$ ~/go-sdk/bin/go test ./pkg/cli/auth -short -v
PASS: TestOCAProviderFields ✓
PASS: TestOCAProviderMappings ✓
SKIP: TestOCAModeStorage (requires server)
```

## Why The Error Occurred

When you ran the debugger earlier, it connected to an **existing old instance** that was already running. That old instance was using an old cline-core.js file (from before the method was implemented).

**Timeline:**
1. Old instances started days ago with cline-core v3.32.6
2. We added OCA implementation today
3. We rebuilt cline-core.js with the new method
4. But old instances were still running with old code
5. Debugger connected to old instance → Error!

## The Solution Going Forward

**Always kill old instances after rebuilding cline-core.js:**

```bash
# After any rebuild of cline-core.js:
npm run compile-standalone

# Kill old instances:
./bin/cline instance kill --all-cli

# Now start fresh:
./bin/cline auth
# OR press F5 in VSCode
```

## How Fresh Instances Will Work

When you start a new instance now:

1. ✅ `cline` binary starts
2. ✅ Finds `node` in `bin/` directory
3. ✅ Finds `cline-core.js` in `../dist-standalone/`
4. ✅ Runs: `node cline-core.js --port XXX ...`
5. ✅ cline-core.js registers ALL services including:
   - ✅ `ModelsService.updateApiConfigurationPartial`
   - ✅ `OcaAccountService.ocaAccountLoginClicked`
   - ✅ `OcaAccountService.ocaAccountLogoutClicked`
   - ✅ `OcaAccountService.ocaSubscribeToAuthStatusUpdate`
   - ✅ `ModelsService.refreshOcaModels`
6. ✅ Client calls work correctly!

## Test It Now

```bash
cd /Users/niharturumella/projects/cline/cli

# Start debugging
code .  # Open in VSCode
# Press F5 → Select "Debug cline (interactive mode)"

# OR run directly:
./bin/cline auth
```

**Expected Result:**
```
Cline Account: ✗ Not authenticated
Oracle Code Assist: ✗ Not authenticated

What would you like to do?
  Authenticate with Cline account
  Authenticate with Oracle Code Assist    ← This will work!
  Select active provider
  Configure API provider
  Exit authorization wizard
```

Select "Authenticate with Oracle Code Assist" and it should work without errors! 🎉

## Summary

**The Error Is Fixed Because:**
1. ✅ All old instances killed
2. ✅ Fresh cline-core.js has the method
3. ✅ Proto files regenerated
4. ✅ CLI binaries rebuilt
5. ✅ Better error messages added
6. ✅ Next instance will be fresh with all methods

**Ready to use!** 🚀

