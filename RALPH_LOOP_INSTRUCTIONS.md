# Ralph Loop Task: Fix Supabase Authentication in LingoPet

## ⚠️ 重要警告 - 工作目录限制
1. **所有工作仅在**: `D:\MyPrograms\LingoPet\LingoPet\` (子目录) 中进行
2. **根目录严禁修改**: `D:\MyPrograms\LingoPet\` (上级目录) 禁止任何更改
3. **分支架构**: 当前在login分支，体现为`LingoPet\`子文件夹结构
4. **文件影响**: 只修改`LingoPet\`子目录中的文件，不接触上级目录文件

## Ralph Loop Configuration
- **Max Iterations**: 10
- **Completion Promise**: `SUPABASE FIXED`
- **Project Path**: `D:\MyPrograms\LingoPet\LingoPet\`
- **State File**: `.claude/.ralph-loop.local.md`

## Core Concept
This is a Ralph Wiggum iterative loop. You will receive this same prompt repeatedly. On each iteration:
1. You see your previous work in the files and git history
2. You work on diagnosing and fixing the Supabase authentication issue
3. You try to exit
4. The stop hook intercepts and feeds this same prompt again
5. You iterate until the problem is solved or max iterations reached

## Problem Statement (from 0205待办.md)

### Symptoms
1. **Word save hangs**: `[Dictionary] Attempting to save word` → no `[saveWord]` logs
2. **Review fails**: `[Review] Starting new review` → no follow-up
3. **Root cause**: `supabase.auth.getUser()` hangs in multiple data service functions

### Already Enhanced Debugging
- `supabaseClient.ts`: Network interceptors, auth listeners, timing logs
- `supabaseDataService.ts`: Detailed `getUser()` timing and logging
- Timeouts: 10s for `saveWord()` and `getWords()`
- Error handling: Full `try-catch` wrappers

## Ralph Loop Workflow

### Iteration 0: Setup (First Run Only)
1. Start dev server: `npm run dev`
2. Open browser to `http://localhost:5173`
3. Enable browser dev tools (F12 → Console)
4. Test word save with "test"
5. Test review with "Daily Review"
6. Collect initial diagnostic data

### Iteration 1-N: Diagnostic & Repair Cycle

#### Phase A: Test & Observe (Every Iteration)
```bash
# Start/Restart dev server if needed
cd "D:\MyPrograms\LingoPet\LingoPet"
npm run dev
```

**Browser Tests:**
1. **Auth Test**: `await supabase.auth.getUser()` in console
2. **Word Save**: Enter "test" in dictionary, observe logs
3. **Review Test**: Click "Daily Review", observe logs
4. **Network**: Check Network tab for `supabase.co` requests

**Key Metrics to Log:**
- `getUser()` execution time (should be < 2s)
- Network request status codes
- Console error messages
- UI state (loading spinners stuck?)

#### Phase B: Diagnose
**Check these common issues:**

1. **CORS/Network Issues**
   - Status 0 or CORS errors in Network tab
   - Supabase CORS settings missing `http://localhost:5173`
   - Network connectivity problems

2. **Auth Token Issues**
   - `getUser()` returns null or empty user
   - Session expired or invalid
   - RLS policies blocking due to missing `auth.uid()`

3. **Database/RLS Issues**
   - Queries fail with permission errors
   - RLS policies not applied correctly
   - `supabase-schema.sql` not fully executed

4. **Async Code Issues**
   - Unhandled Promise rejections
   - Circular dependencies
   - Missing error handling

#### Phase C: Fix
**Implement targeted fixes based on diagnosis:**

**For CORS Issues:**
```typescript
// In supabaseClient.ts - add fetch timeout
global: {
  fetch: (url, options) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    return fetch(url, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(timeoutId));
  }
}
```

**For Auth Issues:**
```typescript
// Auth retry wrapper
const getUserWithRetry = async (maxRetries = 2) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await supabase.auth.getUser();
      if (result.data.user) return result;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    } catch (error) {
      if (i === maxRetries - 1) throw error;
    }
  }
  throw new Error('Auth failed after retries');
};
```

**For RLS Issues:**
- Execute `supabase-schema.sql` in Supabase SQL Editor
- Verify RLS policies: `SELECT * FROM pg_policies WHERE tablename = 'words';`
- Test `auth.uid()`: `SELECT auth.uid();`

**For Async Issues:**
- Add execution tracing with timing
- Ensure all Promises have `.catch()` or `try-catch`
- Use `Promise.all()` for parallel independent operations

#### Phase D: Test Fix
- Restart dev server if needed
- Repeat Phase A tests
- Verify improvements
- If not fixed, document findings and prepare for next iteration

### Iteration N+1: Completion
When all success criteria are met:

**Success Criteria:**
- [ ] `saveWord()` saves words to Supabase successfully
- [ ] `getWords()` retrieves word list for reviews
- [ ] All `getUser()` calls complete in < 2 seconds
- [ ] No UI loading spinners stuck indefinitely
- [ ] Console shows no auth-related errors

**Completion Signal:**
```
<promise>SUPABASE FIXED</promise>
```

## Ralph Loop Notes

### Self-Reference Mechanism
- You see your previous work in modified files
- Each iteration builds on previous attempts
- Git history shows progression of fixes
- Console logs accumulate across iterations

### File Persistence Strategy
1. **Keep diagnostic logs** during active debugging
2. **Clean up excessive logs** before completion
3. **Document changes** in code comments
4. **Preserve working functionality**

### Error Recovery
- If dev server crashes, restart it
- If browser session expires, reload page
- If Supabase connection fails, check service status
- If stuck, add more debugging and continue next iteration

## Start Now

**First Iteration:**
1. Run initial tests (Iteration 0)
2. Collect diagnostic data
3. Identify the most likely root cause
4. Implement first targeted fix
5. Test and document results

**Remember:** This same prompt will repeat. Build incrementally. Learn from previous attempts. Converge on solution.