# WhatsApp Invoice Notifications - Database Setup

## Quick Start

```bash
# Apply the database migration
node backend/execute-whatsapp-migration.js
```

That's it! The table will be created automatically.

---

## What This Does

Creates the `whatsapp_invoice_notifications` table in Supabase that:
- Stores WhatsApp messages generated from invoice PDF uploads
- Groups messages by zona (area)
- Tracks which messages have been sent
- Enables bulk upload notifications to appear in the **Notify Zona** dashboard

## Files

- **`CREATE_WHATSAPP_INVOICE_NOTIFICATIONS.sql`** - SQL migration (create table, indexes, permissions)
- **`execute-whatsapp-migration.js`** - Node script to apply migration automatically

## Manual Setup (If Auto-Run Fails)

1. Go to https://app.supabase.com
2. Select your project
3. Click **SQL Editor** → **New Query**
4. Copy-paste entire content of `CREATE_WHATSAPP_INVOICE_NOTIFICATIONS.sql`
5. Click **Run**

## Verify

After running migration, verify it worked:

```sql
-- In Supabase SQL Editor, run:
SELECT COUNT(*) as table_count FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'whatsapp_invoice_notifications';
-- Should return: table_count = 1
```

## Troubleshooting

**Error: "Cannot connect to Supabase"**
- Check `.env` has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- Use manual setup instead

**Error: "relation already exists"**
- Table is already created, this is fine
- Try uploading an invoice to test

**Notifications still not appearing**
- Verify table was created (run SQL above)
- Restart backend server
- Try uploading a test invoice
- Check browser console for errors

## How It Works

```
Upload Invoice PDF
  ↓
API: POST /api/whatsapp/generate-invoice-messages
  ↓
Backend: Insert notification into whatsapp_invoice_notifications
  ↓
Frontend: GET /api/whatsapp/pending-invoice-messages
  ↓
Notify Zona Dashboard: Shows pending messages to copy & send
```

## Schema

| Field | Type | Purpose |
|-------|------|---------|
| id | UUID | Unique ID |
| zona_id | BIGINT | Zona (area) ID |
| moderator_id | UUID | User who uploaded |
| message | TEXT | WhatsApp message to send |
| sent_at | TIMESTAMP | NULL if pending, timestamp if sent |
| created_at | TIMESTAMP | When created |

## See Also

- `whatsapp-invoice-notifications.js` - Backend WhatsApp notification functions
- `whatsapp-messages.html` - Frontend Notify Zona dashboard page
- `js/upload-invoice-pdf.js` - Invoice upload with notification generation
