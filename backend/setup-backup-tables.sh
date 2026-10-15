#!/bin/bash

# Setup Backup Tables Script
# This script initializes backup tables in Supabase

echo "======================================================"
echo "  Arsip Digital - Backup System Setup"
echo "======================================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ ERROR: .env file not found in backend/"
    echo "   Please create .env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    exit 1
fi

echo "✓ Found .env file"
echo ""
echo "Running backup table initialization..."
echo ""

# Run the initialization script
node init-backup-tables.js

if [ $? -eq 0 ]; then
    echo ""
    echo "======================================================"
    echo "✅ Setup Complete!"
    echo "======================================================"
    echo ""
    echo "Next steps:"
    echo "1. Start the backend server: npm start"
    echo "2. Test backup via: curl -X POST http://localhost:3000/api/backups/manual -H 'Content-Type: application/json' -H 'Authorization: Bearer YOUR_TOKEN' -d '{\"type\":\"database\"}'"
    echo ""
else
    echo ""
    echo "======================================================"
    echo "❌ Setup Failed"
    echo "======================================================"
    echo ""
    echo "Please run manually:"
    echo "1. Open Supabase Dashboard"
    echo "2. Go to SQL Editor → New Query"
    echo "3. Copy contents of CREATE_BACKUP_TABLES.sql"
    echo "4. Click Run"
    echo ""
    exit 1
fi
