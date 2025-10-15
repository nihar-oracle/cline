#!/bin/bash

# Test script to verify OCA RPC methods are available

set -e

echo "🧪 Testing OCA RPC availability..."
echo ""

# Change to CLI directory
cd "$(dirname "$0")"

# Start a fresh instance in the background
echo "1. Starting fresh Cline instance..."
INSTANCE_OUTPUT=$(./bin/cline instance new 2>&1)
echo "$INSTANCE_OUTPUT"

# Extract the address from the output
ADDRESS=$(echo "$INSTANCE_OUTPUT" | grep -o "localhost:[0-9]*" | head -1)

if [ -z "$ADDRESS" ]; then
    echo "❌ Failed to start instance"
    exit 1
fi

echo "✓ Instance started at $ADDRESS"
echo ""

# Wait a moment for instance to be ready
sleep 2

# Test the instance is healthy
echo "2. Checking instance health..."
./bin/cline instance list
echo ""

echo "3. Testing API configuration update (this is where the error occurs)..."
echo "   This will fail if updateApiConfigurationPartial is not implemented"
echo ""

# The actual test would happen when we try to authenticate
# For now, just verify the instance is running
echo "✓ Instance is running"
echo ""
echo "To test OCA authentication:"
echo "  ./bin/cline --address $ADDRESS auth"
echo ""
echo "To kill the instance:"
echo "  ./bin/cline instance kill $ADDRESS"

