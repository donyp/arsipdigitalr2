---
inclusion: auto
name: notification-guidelines
description: Guidelines for using the Notify notification system instead of alert/confirm
---

# Notification System Guidelines

## 🎯 Overview

This project uses a **unified Notify system** that automatically replaces all `alert()` and `confirm()` calls with a professional toast notification system. 

**Important:** The notification system includes a global override that intercepts `alert()` and `confirm()` calls automatically, but it's best practice to use the Notify API directly.

## ✅ Do's - Use Notify System

### Toast Notifications (Auto-dismiss)

```javascript
// Success - Green, 4s auto-dismiss
Notify.success('Operation successful!');
Notify.success('✓ File uploaded');
Notify.success('✓ ' + filename + ' created');

// Error - Red, 5s auto-dismiss
Notify.error('Operation failed');
Notify.error('Error: ' + error.message);
Notify.error('❌ Failed to save');

// Warning - Orange, 4s auto-dismiss
Notify.warning('Please review before submitting');
Notify.warning('⚠ This action cannot be undone');

// Info - Blue, 4s auto-dismiss
Notify.info('New update available');
Notify.info('ℹ Information');
```

### Confirmation Dialogs (User Action Required)

```javascript
// Generic confirmation
Notify.confirm(
    'Confirm Action',
    'Are you sure you want to proceed?',
    () => {
        // User clicked Confirm
        performAction();
    },
    () => {
        // User clicked Cancel (optional)
        console.log('Cancelled');
    }
);

// Delete/Destructive confirmation (Red warning)
Notify.confirmDelete(
    'Delete Item',
    'Are you sure? This action cannot be undone.',
    async () => {
        // User clicked Delete
        await API.delete('/api/items/' + itemId);
        Notify.success('Item deleted successfully');
    },
    () => {
        // Cancelled
    }
);
```

## ❌ Don'ts - Avoid These

```javascript
// ❌ DON'T: Use browser alert()
alert('Success!');
alert('Error occurred');

// ❌ DON'T: Use browser confirm()
if (confirm('Delete this?')) {
    // Delete logic
}

// ❌ DON'T: Use console.log for user feedback
console.log('Operation complete');
```

## 📝 Real-World Examples

### User Management
```javascript
// When creating a user
async function createUser(data) {
    try {
        const result = await API.post('/api/users', data);
        Notify.success('✓ User ' + result.username + ' created');
        loadUsers();
    } catch (error) {
        Notify.error('Failed to create user: ' + error.message);
    }
}

// When deleting a user
async function deleteUser(userId) {
    Notify.confirmDelete(
        'Delete User',
        'This user will be permanently deleted.',
        async () => {
            try {
                await API.delete('/api/users/' + userId);
                Notify.success('User deleted successfully');
                loadUsers();
            } catch (error) {
                Notify.error('Failed to delete: ' + error.message);
            }
        }
    );
}
```

### File Uploads
```javascript
// Success case
Notify.success('✓ ' + filename + ' uploaded successfully');

// Error case
Notify.error('Upload failed: File size exceeds 10MB');

// Confirmation before overwrite
Notify.confirmDelete(
    'File Exists',
    'A file with this name already exists. Overwrite?',
    async () => {
        await uploadFile(true); // Overwrite
        Notify.success('File overwritten');
    }
);
```

### Form Submissions
```javascript
// Validation error
if (!email.includes('@')) {
    Notify.error('Invalid email format');
    return;
}

// Success
Notify.success('Form submitted successfully');

// Confirmation before final submission
Notify.confirm(
    'Submit Form',
    'Please review your information before submitting.',
    async () => {
        await submitForm();
        Notify.success('✓ Form submitted');
    }
);
```

## 🎨 Notification Types

| Method | Type | Color | Auto-dismiss | Use Case |
|--------|------|-------|--------------|----------|
| `success()` | Toast | Green | 4s | Positive action results |
| `error()` | Toast | Red | 5s | Errors and failures |
| `warning()` | Toast | Orange | 4s | Warnings and cautions |
| `info()` | Toast | Blue | 4s | General information |
| `confirm()` | Modal | Blue/Gray | No | General confirmations |
| `confirmDelete()` | Modal | Red/Gray | No | Destructive actions |

## 📍 Notification Position

All notifications appear at **bottom-right corner** with smooth slide-in from right animation.

- **Toast**: Stack upward, max 5 visible
- **Modal**: Center screen with overlay
- **Auto-dismiss**: User can close manually anytime

## 🔄 Automatic Fallback

Even if new code uses `alert()` or `confirm()`, they will automatically be intercepted and replaced with Notify:

```javascript
// This still works but uses Notify internally
alert('This will use Notify.info()');
confirm('This will use Notify.confirm()');
```

**However, it's better to use Notify API directly for optimal behavior.**

## 💡 Tips

1. **Use icons**: Prepend ✓, ✕, ⚠, or ℹ for visual clarity
2. **Be descriptive**: Include what failed/succeeded, not just "Error"
3. **Use confirmDelete for destructive**: Helps users understand severity
4. **Chain with async**: Use async/await for operations before showing success

```javascript
// Good ✓
Notify.success('✓ Invoice #123 created and sent');

// Better with async ✓✓
async function publishInvoice(id) {
    try {
        await API.post(`/api/invoices/${id}/publish`);
        Notify.success('✓ Invoice published to customer');
        reloadData();
    } catch (err) {
        Notify.error('Failed to publish: ' + err.message);
    }
}
```

## 🚀 When Adding New Features

**Always use Notify from the start:**

1. Import notification system: `js/notification-system.js`
2. Use `Notify.success/error/warning/info` for feedback
3. Use `Notify.confirm/confirmDelete` for confirmations
4. Never use `alert()` or `confirm()`

This ensures consistency and professional UX across the entire application!
