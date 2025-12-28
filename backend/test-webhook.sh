#!/bin/bash

# Strava Webhook Test Script
# Use this to test your webhook endpoint locally

echo "🚀 Testing Strava Webhook Verification..."
echo ""

# Replace with your backend URL
BACKEND_URL="http://localhost:3000"  # Change to your deployment URL

echo "📍 Testing GET verification handshake..."
RESPONSE=$(curl -s -w "\n%{http_code}" "${BACKEND_URL}/api/webhooks/strava?hub.mode=subscribe&hub.verify_token=RUNEASY_2025_TOKEN&hub.challenge=TEST_CHALLENGE_123")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Verification successful!"
    echo "Response body: $BODY"
    
    # Check if challenge is returned
    if echo "$BODY" | grep -q "TEST_CHALLENGE_123"; then
        echo "✅ Challenge returned correctly!"
    else
        echo "⚠️  Challenge not found in response"
    fi
else
    echo "❌ Verification failed with HTTP $HTTP_CODE"
    echo "Response: $BODY"
fi

echo ""
echo "📍 Testing with wrong token (should fail)..."
RESPONSE=$(curl -s -w "\n%{http_code}" "${BACKEND_URL}/api/webhooks/strava?hub.mode=subscribe&hub.verify_token=WRONG_TOKEN&hub.challenge=TEST_CHALLENGE_123")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

if [ "$HTTP_CODE" = "403" ]; then
    echo "✅ Correctly rejected invalid token!"
else
    echo "❌ Should have returned 403, got HTTP $HTTP_CODE"
fi

echo ""
echo "📍 Testing with wrong mode (should fail)..."
RESPONSE=$(curl -s -w "\n%{http_code}" "${BACKEND_URL}/api/webhooks/strava?hub.mode=unsubscribe&hub.verify_token=RUNEASY_2025_TOKEN&hub.challenge=TEST_CHALLENGE_123")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

if [ "$HTTP_CODE" = "403" ]; then
    echo "✅ Correctly rejected invalid mode!"
else
    echo "❌ Should have returned 403, got HTTP $HTTP_CODE"
fi

echo ""
echo "✨ Tests complete!"
