# Hot Reloading Development Guide

This document explains how to use the hot reloading setup for efficient development of both React components and Firebase Functions.

## Quick Start

### 1. Start Firebase Emulators with Functions Hot Reload

```bash
cd /path/to/Minneapolis-Winter-League
npm run dev:watch
```

### 2. Start React App (New Terminal)

```bash
cd App
npm run dev:emulators
```

### 3. Open Your Development URLs

- **React App**: <http://localhost:5173/>
- **Firebase Emulator UI**: <http://localhost:4000/>

## How It Works

### React Hot Reloading

- **What**: Vite automatically reloads React components when you make changes
- **Files Watched**: All files in `App/src/`
- **Speed**: Near-instantaneous updates in browser
- **State**: Component state is preserved when possible

### Firebase Functions Hot Reloading

- **What**: TypeScript files are automatically compiled and Functions reloaded
- **Files Watched**: All files in `Functions/src/`
- **Process**:
  1. You edit a TypeScript file in `Functions/src/`
  2. TypeScript compiler detects change and recompiles
  3. Firebase Functions emulator detects compiled JavaScript change
  4. Function is automatically reloaded
- **Speed**: 1-3 seconds for full reload cycle

## What Gets Hot Reloaded

### ✅ Automatically Reloaded

- React components and hooks
- CSS and styling changes
- Firebase Functions TypeScript code
- Firebase Functions configuration changes

### ⚠️ Requires Manual Restart

- Environment variables changes
- Firebase emulator configuration (`firebase.json`)
- Firestore security rules
- Package.json dependency changes
- New files that aren't properly imported

## Development Workflow

### Making Changes

1. **React Changes**: Edit files in `App/src/` → Browser updates automatically
2. **Function Changes**: Edit files in `Functions/src/` → Wait 1-3 seconds for reload
3. **Test Changes**: Use your app and check both frontend and backend functionality

### Monitoring Hot Reload

Watch the terminal output:

```bash
# React changes (Terminal 2)
vite v6.3.5 dev server running at:
> Local: http://localhost:5173/
✨ Hot reload: Component updated

# Functions changes (Terminal 1)
[0] 5:06:12 PM - File change detected. Starting incremental compilation...
[0] 5:06:13 PM - Found 0 errors. Watching for file changes.
[1] ✔ Functions reloaded
```

## Troubleshooting

### Functions Not Reloading

1. **Check Terminal Output**: Look for TypeScript compilation errors
2. **Manual Build**: Try `cd Functions && npm run build`
3. **Restart Emulators**: Stop (Ctrl+C) and run `npm run dev:watch` again

### React Not Hot Reloading

1. **Check File Imports**: Ensure files are properly imported
2. **Browser Cache**: Try hard refresh (Cmd+Shift+R / Ctrl+Shift+R)
3. **Restart Dev Server**: Stop and run `npm run dev:emulators` again

### Port Conflicts

If you get port errors:

```bash
# Kill processes using specific ports
npx kill-port 5173 4000 8080 5001 9099 9199

# Then restart
npm run dev:watch
```

### Memory Issues

If TypeScript compilation becomes slow:

```bash
# Clear TypeScript cache
cd Functions && rm -rf node_modules/.cache
npm install
```

## Performance Tips

### Optimize TypeScript Compilation

- **Use Incremental Compilation**: Already enabled in `tsconfig.json`
- **Exclude Unnecessary Files**: Don't watch `node_modules`, `dist`, etc.
- **Target Modern Node**: Using ESNext for faster compilation

### Optimize React Hot Reload

- **Keep Components Small**: Smaller components reload faster
- **Use Fast Refresh**: Vite's Fast Refresh preserves state
- **Minimize Side Effects**: Avoid heavy computations in component bodies

## Alternative Development Methods

### Standard Development (No Hot Reload)

```bash
# Terminal 1: Start emulators
npm run dev

# Terminal 2: Start React app
cd App && npm run dev:emulators

# Manual rebuild after Functions changes
cd Functions && npm run build
```

### Functions-Only Development

```bash
# Just run Functions in watch mode
npm run functions:watch

# Start emulators separately
npm run emulators:start
```

## Files and Scripts Reference

### Root Package.json Scripts

- `npm run dev:watch` - Start emulators + Functions hot reload
- `npm run functions:watch` - Only Functions TypeScript watch mode
- `npm run dev` - Standard emulator start
- `npm run emulators:start` - Start emulators without build

### Functions Package.json Scripts

- `npm run build:watch` - TypeScript compilation in watch mode
- `npm run dev` - Alias for build:watch
- `npm run build` - One-time build

### App Package.json Scripts

- `npm run dev:emulators` - Vite dev server with emulator config
- `npm run dev` - Vite dev server with production config

## Best Practices

1. **Start with Hot Reload**: Use `npm run dev:watch` as your default
2. **Monitor Both Terminals**: Keep an eye on compilation output
3. **Test Frequently**: Changes are fast, so test often
4. **Commit Working State**: Save your progress before major changes
5. **Use Emulator UI**: Great for debugging Firebase Functions and data

## Need Help?

- Check terminal output for error messages
- Restart development servers if issues persist
- Review other documentation in `docs/setup/`
- Ensure all dependencies are installed with `npm install`
