#!/bin/bash

# Test Token Generation Script
# Run: bash test-token-generation.sh

echo "🔐 Testing Daily Token Generation"
echo "================================"
echo ""

# Check if server is running
echo "Checking if server is running on localhost:5000..."
if ! curl -s http://localhost:5000 > /dev/null 2>&1; then
    echo "❌ Server not running on port 5000"
    echo "Please start the backend server first: npm start"
    exit 1
fi

echo "✅ Server is running"
echo ""

# Get users with valid emails
echo "📋 Getting list of users with valid emails..."
USERS_RESPONSE=$(curl -s -X GET http://localhost:5000/api/dev/test-users \
  -H "Content-Type: application/json")

echo "$USERS_RESPONSE" | jq '.' 2>/dev/null || echo "$USERS_RESPONSE"
echo ""

# Generate tokens
echo "🔄 Generating tokens for all users..."
GENERATE_RESPONSE=$(curl -s -X POST http://localhost:5000/api/dev/test-generate-tokens \
  -H "Content-Type: application/json" \
  -d '{}')

echo "$GENERATE_RESPONSE" | jq '.' 2>/dev/null || echo "$GENERATE_RESPONSE"
echo ""

echo "✅ Test complete!"
echo ""
echo "If tokens were sent successfully:"
echo "- Check email inbox for 5-digit codes"
echo "- Use codes to login via 2FA form"
