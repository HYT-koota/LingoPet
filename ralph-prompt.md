# Ralph Loop Prompt: Fix Supabase Authentication Hang in LingoPet

## Context
You are working on the LingoPet project in the `LingoPet\` subdirectory (Supabase version). The app uses React + TypeScript + Tailwind + Supabase.

## Core Problems (from "0205待办.md")
1. **Word save hangs**: `saveWord()` starts but never completes. Console shows `[Dictionary] Attempting to save word` but no `[saveWord]` logs.
2. **Review fails**: Clicking "Daily Review" only shows `[Review] Starting new review` with no follow-up.
3. **Root cause**: `supabase.auth.getUser()` calls may be hanging/stalling. Multiple data service functions (`getWords`, `saveWord`, `getPetState`, etc.) all depend on this call.

## Already Implemented Debugging
- Enhanced `supabaseClient.ts`: Network request interceptor for `supabase.co` requests, auth state listeners, detailed logging
- Enhanced `supabaseDataService.ts`: Timing measurements, detailed JSON logging for all `getUser()` calls
- Timeout protections: 10-second timeouts for `saveWord()` (Dictionary.tsx) and `getWords()` (App.tsx)
- Error handling: `try-catch` wrappers, detailed error logging

## Current State
- Supabase config: ✅ URL and Anon Key configured in `.env.local`
- Database schema: `supabase-schema.sql` defines 3 tables with RLS policies
- The app runs but authentication hangs, causing UI to show loading spinners indefinitely

## Your Task
Diagnose and fix the Supabase authentication hang using an iterative approach.

## Iterative Process Guidelines
1. **Test First**: Always start by running tests to observe current behavior
2. **Diagnose**: Analyze logs, network requests, and code execution paths
3. **Fix**: Implement targeted fixes based on diagnosis
4. **Test Again**: Verify fixes work, repeat if necessary

## Key Diagnostics to Perform

### 1. Authentication Flow Analysis
- Check if `supabase.auth.getUser()` completes or hangs
- Measure execution time: should be < 2 seconds
- Verify session exists and is valid
- Test in browser console: `await supabase.auth.getUser()`

### 2. Network Request Analysis
- Check browser Network tab for `supabase.co` requests
- Look for CORS errors (status 0 or CORS policy errors)
- Check response status codes: 200 (OK), 401 (Unauthorized), 403 (Forbidden), 500 (Server error)
- Verify request/response timing

### 3. Database Permission Analysis
- Verify RLS policies are correctly configured
- Test if `auth.uid()` returns correct user ID
- Check if database queries succeed when run manually

### 4. Code Execution Analysis
- Check for unhandled Promise rejections
- Look for circular dependencies or deadlocks
- Verify async/await patterns are correct

## Common Issues and Solutions

### A. Network/CORS Issues
- **Symptoms**: Requests fail with CORS errors or timeout
- **Fix**:
  1. Check Supabase console CORS settings, add `http://localhost:5173`
  2. Add fetch timeout in `supabaseClient.ts`
  3. Verify network connectivity

### B. Invalid/Expired Auth Tokens
- **Symptoms**: `getUser()` returns null user, RLS policies block access
- **Fix**:
  1. Implement auth retry mechanism
  2. Add auth health check
  3. Clear localStorage and re-login

### C. RLS Policy Issues
- **Symptoms**: Auth works but database queries fail
- **Fix**:
  1. Verify `supabase-schema.sql` RLS policies are applied
  2. Test `auth.uid()` function in Supabase SQL editor
  3. Add debug queries to verify permissions

### D. Async Code Issues
- **Symptoms**: Functions start but never complete
- **Fix**:
  1. Add execution tracing
  2. Ensure all Promises have error handling
  3. Avoid nested async operations

## Testing Commands
```bash
# Start dev server
cd "D:\MyPrograms\LingoPet\LingoPet"
npm run dev

# Browser tests:
# 1. Open http://localhost:5173
# 2. Check console logs (F12)
# 3. Test word save: enter "test" in dictionary
# 4. Test review: click "Daily Review" button
```

## Success Criteria
- ✅ `saveWord()` completes successfully and saves to Supabase
- ✅ `getWords()` retrieves word list for reviews
- ✅ All `supabase.auth.getUser()` calls complete in < 2 seconds
- ✅ No UI loading spinners stuck indefinitely
- ✅ Console shows no auth-related errors

## Completion Promise
When all issues are resolved and success criteria met, output:
```
<promise>SUPABASE FIXED</promise>
```

## Workflow Rules
1. **Preserve existing functionality**: Don't break working features
2. **Keep debug logs**: Maintain useful logging but clean up excessive noise
3. **Document changes**: Note what was fixed and why
4. **Iterate**: If problem persists, go back to diagnosis phase
5. **Verify**: Always test after making changes

## Available Tools
- Browser developer tools (F12)
- Network request interceptor in `supabaseClient.ts`
- Detailed logging throughout the codebase
- Supabase console for configuration checks
- Git for version control

## Start Now
Begin with step 1: Start dev server and test current behavior. Observe logs, diagnose issues, then implement fixes iteratively.