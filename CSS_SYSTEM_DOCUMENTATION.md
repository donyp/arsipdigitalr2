# Unified Dark/Light Mode CSS System Documentation

## Overview

Comprehensive CSS variable system untuk dark/light mode support di seluruh aplikasi. Semua warna sekarang terpusat dalam CSS variables yang automatically adapt ke dark/light mode.

## File Structure

```
css/
├── color-vars.css          # Master color variables (light & dark mode)
├── unified-forms.css       # Form elements (inputs, selects, textareas)
├── unified-buttons.css     # Buttons, badges, action menus
├── unified-cards.css       # Cards, containers, tables, panels
├── unified-alerts.css      # Alerts, toasts, notifications
├── unified-header.css      # Header styling (existing)
├── style.css              # Global styles (existing)
└── tailwind.generated.css # Tailwind output (existing)

js/
├── dark-mode-init.js      # Dark mode initialization & transitions
└── (other scripts)
```

## CSS Variables Reference

### 1. PRIMARY COLORS
```css
--color-primary              #667eea (light), #60a5fa (dark)
--color-primary-light        #8b9ef7 (light), #93c5fd (dark)
--color-primary-dark         #5568d3 (light), #3b82f6 (dark)
--color-primary-gradient-start
--color-primary-gradient-end
```

### 2. ACCENT COLORS
```css
--color-accent-purple        #8b5cf6 (light), #a78bfa (dark)
--color-accent-blue          #3b82f6 (light), #60a5fa (dark)
--color-accent-green         #10b981 (consistent across modes)
--color-accent-red           #ef4444 (consistent across modes)
--color-accent-orange        #f39c12 (light), #fbbf24 (dark)
--color-accent-cyan          #06b6d4 (light), #22d3ee (dark)
```

### 3. STATUS COLORS
```css
--color-success              #10b981
--color-success-light        #d1fae5 (light), #86efac (dark)
--color-success-dark         #047857 (light), #22c55e (dark)

--color-error                #ef4444
--color-error-light          #fee2e2 (light), #fca5a5 (dark)
--color-error-dark           #991b1b (light), #f87171 (dark)

--color-warning              #f39c12
--color-warning-light        #fef3c7 (light), #fcd34d (dark)
--color-warning-dark         #92400e (light), #fde047 (dark)

--color-info                 #3b82f6
--color-info-light           #dbeafe (light), #93c5fd (dark)
--color-info-dark            #1e40af (light), #bfdbfe (dark)
```

### 4. STATUS BACKGROUNDS (with opacity)
```css
--color-status-success-bg    rgba(16, 185, 129, 0.1) (light)
                            rgba(16, 185, 129, 0.15) (dark)
--color-status-error-bg      rgba(239, 68, 68, 0.1) (light)
                            rgba(239, 68, 68, 0.15) (dark)
--color-status-warning-bg    rgba(243, 156, 18, 0.1) (light)
                            rgba(251, 191, 36, 0.15) (dark)
--color-status-info-bg       rgba(59, 130, 246, 0.1) (light)
                            rgba(96, 165, 250, 0.15) (dark)
```

### 5. ROLE-BASED COLORS
```css
--color-role-admin           #667eea (light), #60a5fa (dark)
--color-role-moderator       #a855f7 (light), #c084fc (dark)
--color-role-zona-admin      #3b82f6 (light), #93c5fd (dark)
--color-role-customer        #10b981 (consistent)
```

### 6. PRIORITY COLORS
```css
--color-priority-low         #dbeafe (bg), #1e40af (text) - light
--color-priority-medium      #fef3c7 (bg), #92400e (text) - light
--color-priority-high        #fee2e2 (bg), #991b1b (text) - light
--color-priority-urgent      #ede9fe (bg), #5b21b6 (text) - light

(Dark mode: lighter backgrounds, lighter text colors)
```

### 7. STAT CARD ICON BACKGROUNDS
```css
--color-stat-icon-purple     #8b5cf6 (light), #a78bfa (dark)
--color-stat-icon-green      #059669 (light), #10b981 (dark)
--color-stat-icon-red        #dc2626 (light), #f87171 (dark)
--color-stat-icon-blue       #3b82f6 (light), #60a5fa (dark)
--color-stat-icon-orange     #f97316 (light), #fb923c (dark)
```

### 8. AVATAR/MESSAGE GRADIENTS
```css
--color-avatar-support       linear-gradient(135deg, #4f46e5, #6366f1) - light
                            linear-gradient(135deg, #818cf8, #a5b4fc) - dark

--color-avatar-customer      linear-gradient(135deg, #10b981, #34d399) - light
                            linear-gradient(135deg, #10b981, #6ee7b7) - dark

--color-avatar-admin         linear-gradient(135deg, #667eea, #764ba2) - light
                            linear-gradient(135deg, #60a5fa, #a78bfa) - dark

--color-avatar-moderator     linear-gradient(135deg, #a855f7, #c084fc) - light
                            linear-gradient(135deg, #c084fc, #e879f9) - dark
```

### 9. BACKGROUND COLORS (from dark-mode-init.js)
```css
--color-bg-primary          #ffffff (light), #0f172a (dark)
--color-bg-secondary        #f8f9fa (light), #1e293b (dark)
--color-bg-tertiary         #f0f2f5 (light), #334155 (dark)

--color-text-primary        #0a0e27 (light), #f1f5f9 (dark)
--color-text-secondary      #4a5568 (light), #cbd5e1 (dark)
--color-text-tertiary       #718096 (light), #94a3b8 (dark)

--color-text-muted          #6b7280 (light), #cbd5e1 (dark)

--color-border              #d2d6dc (light), #475569 (dark)
--color-border-dark         #bcc1cc (light), #64748b (dark)
```

## CSS Classes & Components

### Forms (unified-forms.css)
```html
<!-- Form elements automatically adapt to dark mode -->
<input type="text" placeholder="Enter text">
<textarea></textarea>
<select>
    <option>Select option</option>
</select>
<!-- Focus states use CSS variables for proper dark mode styling -->
```

### Buttons (unified-buttons.css)
```html
<!-- Primary buttons -->
<button class="btn-primary">Button</button>
<button class="btn-primary-outline">Outline</button>
<button class="btn-primary-gradient">Gradient</button>

<!-- Status buttons -->
<button class="btn-success">Success</button>
<button class="btn-danger">Danger</button>
<button class="btn-warning">Warning</button>

<!-- Icon buttons -->
<button class="btn-icon btn-icon-primary"><i class="fas fa-edit"></i></button>

<!-- Badges -->
<span class="badge badge-success">Success</span>
<span class="badge badge-error">Error</span>
<span class="badge badge-admin">Admin</span>
<span class="badge badge-priority-high">High Priority</span>
```

### Cards (unified-cards.css)
```html
<!-- Basic card -->
<div class="card">
    <div class="card-header">
        <h3 class="card-title">Title</h3>
    </div>
    <div class="card-body">Content here</div>
    <div class="card-footer">Footer</div>
</div>

<!-- Stat card -->
<div class="stat-card">
    <div class="stat-icon stat-icon-purple">
        <i class="fas fa-chart-bar"></i>
    </div>
    <div class="stat-content">
        <div class="stat-label">Total Sales</div>
        <div class="stat-value">$45,231</div>
        <div class="stat-change positive">↑ 12% from last month</div>
    </div>
</div>

<!-- Table -->
<table class="table table-striped">
    <thead>
        <tr>
            <th>Column 1</th>
            <th>Column 2</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>Data 1</td>
            <td>Data 2</td>
        </tr>
    </tbody>
</table>
```

### Alerts (unified-alerts.css)
```html
<!-- Alert banner -->
<div class="alert alert-success">
    <div class="alert-icon">
        <i class="fas fa-check-circle"></i>
    </div>
    <div class="alert-content">
        <div class="alert-title">Success!</div>
        <div class="alert-message">Operation completed successfully</div>
    </div>
</div>

<!-- Toast notification (JS generated) -->
<div class="toast toast-success">
    <div class="toast-icon"><i class="fas fa-check-circle"></i></div>
    <div class="toast-content">
        <div class="toast-title">Success</div>
        <div class="toast-message">Saved successfully</div>
    </div>
</div>

<!-- Error message -->
<div class="error-message">
    <i class="fas fa-exclamation-circle"></i>
    Error occurred while processing
</div>
```

## Integration Guide

### Step 1: Include CSS Files (in <head>)
```html
<link rel="stylesheet" href="css/color-vars.css">
<link rel="stylesheet" href="css/unified-forms.css">
<link rel="stylesheet" href="css/unified-buttons.css">
<link rel="stylesheet" href="css/unified-cards.css">
<link rel="stylesheet" href="css/unified-alerts.css">
```

### Step 2: Include JS (in <head>)
```html
<script src="js/dark-mode-init.js"></script>
```

### Step 3: Use CSS Classes
Replace all hardcoded colors with semantic class names:

**Before (hardcoded):**
```html
<button style="background-color: #667eea; color: white;">Click me</button>
<div style="background-color: #f9fafb; border: 1px solid #e5e7eb;">
    Card content
</div>
```

**After (CSS variables):**
```html
<button class="btn-primary">Click me</button>
<div class="card">
    Card content
</div>
```

### Step 4: Dark Mode Toggle
```javascript
// Toggle dark mode
function toggleDarkMode() {
    const isDark = localStorage.getItem('dark_mode_enabled') === 'true';
    localStorage.setItem('dark_mode_enabled', String(!isDark));
    document.documentElement.setAttribute('data-dark-mode', String(!isDark));
}
```

## Color Consistency Rules

### ✅ DO:
- Use CSS variable class names (`.btn-primary`, `.badge-success`, `.card`)
- Let CSS handle dark mode adaptations automatically
- Use semantic color names (`success`, `error`, `warning`, `info`)
- Apply consistent styling across all components

### ❌ DON'T:
- Hardcode colors in inline styles
- Use hardcoded hex values (#667eea, #ef4444, etc.)
- Create component-specific color variables
- Mix light and dark mode colors in same element

## Dynamic Element Generation

When creating elements via JavaScript, use CSS classes instead of inline styles:

**Before (hardcoded):**
```javascript
const btn = document.createElement('button');
btn.style.backgroundColor = '#667eea';
btn.style.color = 'white';
btn.textContent = 'Submit';
```

**After (CSS variables):**
```javascript
const btn = document.createElement('button');
btn.className = 'btn-primary';
btn.textContent = 'Submit';
```

## Customization

To customize colors for your brand:

1. Edit `css/color-vars.css`
2. Update color values in `:root` (light mode) and `html[data-dark-mode="true"]` (dark mode)
3. All components will automatically adapt

Example:
```css
:root {
    --color-primary: #your-light-color;
    --color-primary-gradient-end: #your-gradient-end;
}

html[data-dark-mode="true"] {
    --color-primary: #your-dark-color;
    --color-primary-gradient-end: #your-dark-gradient;
}
```

## Browser Support

- ✅ Modern browsers (Chrome, Firefox, Safari, Edge)
- ✅ CSS Custom Properties (CSS Variables)
- ⚠️ IE11: Partial support (requires polyfill)

## Performance Notes

- CSS variables are processed at render time (not build time)
- No JavaScript overhead for color switching
- Transitions are hardware-accelerated
- FOUC (Flash of Unstyled Content) prevented by early initialization

## Migration Checklist

- [x] Created master color variables (color-vars.css)
- [x] Created form styling (unified-forms.css)
- [x] Created button/badge styling (unified-buttons.css)
- [x] Created card/table styling (unified-cards.css)
- [x] Created alert/notification styling (unified-alerts.css)
- [x] Added color-vars.css to 25+ HTML files
- [x] Updated dark-mode-init.js with variable documentation
- [ ] Test all pages in light mode
- [ ] Test all pages in dark mode
- [ ] Verify no hardcoded colors remain
- [ ] Test mode switching smoothly
- [ ] Test contrast ratios (WCAG AA compliance)

## Support

For questions or issues:
1. Check color-vars.css for available variables
2. Review component CSS files for class names
3. Verify dark-mode-init.js is loaded before other scripts
4. Check browser console for CSS variable errors
