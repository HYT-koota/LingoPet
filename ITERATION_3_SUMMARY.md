# Ralph Loop - Iteration 3 Summary

## Date: 2026-02-05
## Iteration: 3/10
## Previous: Iteration 2 (验证和测试工具创建)

## 问题诊断

### 发现的关键问题
通过代码分析，发现了 **超时机制冲突** 这一根本原因：

1. **多层超时竞争**：
   - 全局 fetch 超时：10 秒（`supabaseClient.ts`）
   - Per-attempt 超时：5 秒（`getUserWithRetry()` 中的 Promise.race）
   - UI 层超时：10 秒（`Dictionary.tsx` 和 `App.tsx`）

2. **超时冲突机制**：
   ```typescript
   // getUserWithRetry 中的 Promise.race
   const result = await Promise.race([
     supabase.auth.getUser(),
     new Promise((_, reject) =>
       setTimeout(() => reject(new Error('timeout')), 5000)
     )
   ]);
   ```
   问题：`setTimeout` 在 5 秒后 reject，但 **不会中止底层 fetch**。如果 fetch 仍在进行（< 10秒），它会继续并可能返回结果，导致 Promise.race 已经 reject 但后续代码仍在执行。

3. **网络层未中止**：
   - `setTimeout` 只 reject Promise，不 abort fetch
   - 全局 fetch 有自己的超时（10秒），独立于 5 秒超时
   - 两个超时互相竞争，不可预测哪个先触发

## 实施的修复

### 1. 统一全局超时为 5 秒
**文件**: `services/supabaseClient.ts`

**更改**:
```typescript
// 新增配置变量
const SUPABASE_REQUEST_TIMEOUT = 5000;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: (url, options) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn(`[Supabase] Request timeout after ${SUPABASE_REQUEST_TIMEOUT}ms:`, url);
        controller.abort();
      }, SUPABASE_REQUEST_TIMEOUT);
      return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timeoutId));
    }
  },
});
```

**原因**: 认证操作需要快速响应，5 秒超时更合适

### 2. 移除冗余的 Promise.race
**文件**: `services/supabaseDataService.ts`

**更改**:
```typescript
// 之前：双重超时保护
const result = await Promise.race([
  supabase.auth.getUser(),
  new Promise((_, reject) => setTimeout(..., 5000))
]);

// 现在：直接调用，依赖全局超时
const result = await supabase.auth.getUser();
```

**原因**: 避免超时竞争，让全局 fetch 超时统一处理

## 预期效果

### 修复前的问题
- `supabase.auth.getUser()` 可能卡住 10 秒（全局超时）
- Promise.race 5 秒超时后，fetch 仍在后台运行
- UI 显示超时错误，但底层请求可能还在进行
- 导致后续请求状态混乱

### 修复后的行为
- 所有 Supabase 请求在 5 秒后会被 abort
- 清晰的超时日志：`[Supabase] Request timeout after 5000ms`
- 重试机制正常工作（最多 2 次尝试）
- UI 层的 10 秒超时作为最后防线

## 超时层级说明

| 层级 | 超时时间 | 作用 |
|------|---------|------|
| **全局 fetch** | 5 秒 | 统一超时，abort 底层网络请求 |
| **重试逻辑** | 2 次尝试 | 认证失败后自动重试 |
| **UI 保护** | 10 秒 | 应用层最后防线，防止 UI 卡死 |

## 测试计划

### 手动测试步骤
1. 打开 http://localhost:5175
2. 检查控制台日志，确认加载正常
3. 测试单词保存：
   - 输入 "test"
   - 观察是否在 5-10 秒内完成
   - 检查控制台中的 `[Auth Retry]` 日志
4. 测试复习功能：
   - 点击 "Daily Review"
   - 观察是否正常启动

### 预期日志输出
```
[Auth Retry] Attempt 1/2 calling supabase.auth.getUser()
[Auth Retry] Attempt 1 completed in 500ms, user: ✅ Present
```

或者如果超时：
```
[Auth Retry] Attempt 1/2 calling supabase.auth.getUser()
[Supabase] Request timeout after 5000ms: https://...
[Auth Retry] Attempt 1 failed after 5000ms: DOMException: The operation was aborted
[Auth Retry] Attempt 2/2 calling supabase.auth.getUser()
```

## Git 状态
- 修改文件：`services/supabaseClient.ts`, `services/supabaseDataService.ts`
- 新增文件：`test_getuser_diagnosis.html`（诊断工具）
- 开发服务器：运行在 http://localhost:5175

## 下一步

需要手动测试验证修复效果。如果测试通过，可以：
1. 清理 excessive debug 日志
2. 优化代码结构
3. 准备部署

如果测试失败，根据具体错误继续迭代。

---

**状态**: 等待手动测试结果
**准备进入**: Iteration 4（如果需要）
**目标**: 所有 success criteria 达成后输出 `<promise>SUPABASE FIXED</promise>`
