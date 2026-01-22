# Environment Variable Setup Guide

## Common Issues with GEMINI_API_KEY

If you're getting "GEMINI_API_KEY not configured" error, check the following:

### 1. File Location
The `.env` file **MUST** be in the **root directory** of your project (same folder as `package.json`).

```
cursurpdf/
├── .env          ← HERE (root directory)
├── package.json
├── app/
└── ...
```

### 2. File Format
Your `.env` file should look exactly like this (NO quotes, NO spaces):

```env
GEMINI_API_KEY=your_actual_api_key_here
```

**WRONG formats:**
```env
GEMINI_API_KEY="your_key"          ❌ No quotes
GEMINI_API_KEY = your_key          ❌ No spaces around =
GEMINI_API_KEY= your_key           ❌ No space after =
GEMINI_API_KEY =your_key           ❌ No space before =
```

**CORRECT format:**
```env
GEMINI_API_KEY=AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz1234567    ✅
```

### 3. Restart Dev Server
**IMPORTANT:** After creating or modifying the `.env` file, you **MUST** restart your Next.js dev server:

1. Stop the server (Ctrl+C in terminal)
2. Start it again: `npm run dev`

Next.js only reads `.env` files when the server starts!

### 4. Check for Typos
- Make sure it's exactly `GEMINI_API_KEY` (all caps, underscores)
- No extra spaces or characters
- The file is named `.env` (with the dot at the beginning)

### 5. Verify the File is Being Read
After restarting, check the terminal/console when you make a request. You should see debug logs like:
```
GEMINI_API_KEY exists: true
GEMINI_API_KEY length: 39
```

If you see `exists: false`, the file isn't being read correctly.

### 6. Windows-Specific Issues
- Make sure the file is saved as `.env` and not `.env.txt`
- In Windows Explorer, you might need to enable "Show hidden files" to see it
- Use a text editor like VS Code, Notepad++, or Sublime Text (avoid Word/WordPad)

### Quick Test
1. Create `.env` in root directory
2. Add: `GEMINI_API_KEY=test123`
3. Restart dev server: `npm run dev`
4. Make a request and check console logs

If it still doesn't work, check the console output for the debug information that shows the current working directory and whether the env variable exists.

