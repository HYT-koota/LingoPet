# Supabase 全局变量与生产部署指南

## 📋 大纲

1. [问题回顾：为什么 supabase 不在全局作用域？](#1-问题回顾为什么-supabase-不在全局作用域)
2. [模块化设计的优势](#2-模块化设计的优势)
3. [生产环境（Vercel）的工作原理](#3-生产环境vercel的工作原理)
4. [调试与监控方案](#4-调试与监控方案)
5. [部署准备检查清单](#5-部署准备检查清单)
6. [后续学习路径建议](#6-后续学习路径建议)

---

## 1. 问题回顾：为什么 supabase 不在全局作用域？

### 1.1 你遇到的现象
```javascript
// 在浏览器控制台输入：
await supabase.auth.getUser()
// 错误：Uncaught ReferenceError: supabase is not defined
```

### 1.2 根本原因
- **模块化设计**：现代 JavaScript/TypeScript 应用使用 ES6 模块系统
- **作用域隔离**：变量只在导入它们的模块内可见
- **构建优化**：打包工具（Vite/Webpack）对模块代码进行优化

### 1.3 应用内的正常工作流程
```typescript
// services/supabaseDataService.ts
import { supabase } from './supabaseClient'; // ✅ 正确导入

const getUserWithRetry = async () => {
  const result = await supabase.auth.getUser(); // ✅ 正常工作
  return result;
};
```

## 2. 模块化设计的优势

| 优势 | 说明 | 对生产环境的好处 |
|------|------|----------------|
| **命名空间隔离** | 避免全局变量冲突 | 多库共存不会互相影响 |
| **Tree Shaking** | 构建时移除未使用的代码 | 减少 bundle 大小，提升加载速度 |
| **依赖清晰** | 每个文件显式声明依赖 | 便于维护和重构 |
| **代码复用** | 模块可以被多处导入 | 提高开发效率 |
| **测试友好** | 容易模拟和替换依赖 | 便于单元测试 |

### 2.1 实际案例对比

**❌ 传统全局变量方式：**
```html
<script src="supabase.js"></script>
<script>
  // supabase 全局可用
  // 问题：可能与其他库冲突
  window.supabase = createClient(...);
</script>
```

**✅ 现代模块化方式：**
```typescript
// 每个文件按需导入
import { supabase } from './supabaseClient';
// 构建时优化，运行时安全
```

## 3. 生产环境（Vercel）的工作原理

### 3.1 构建流程
```
源代码 (.ts/.tsx)
    ↓ (npm run build)
Vite 打包 + 优化
    ↓
静态文件 (dist/)
    ↓
部署到 Vercel CDN
    ↓
用户访问 https://your-app.vercel.app
```

### 3.2 为什么生产环境不会遇到 ReferenceError

| 环境 | 开发模式 | 生产模式 |
|------|---------|----------|
| **代码形式** | 原始模块文件 | 打包后的单个/多个 chunk 文件 |
| **变量访问** | 模块作用域 | 所有模块打包在一起 |
| **调试体验** | 源代码映射 | 压缩代码，需要 sourcemap |
| **全局变量** | 按需暴露 | 内部实现，不暴露 |

### 3.3 用户视角的加载过程
```
1. 浏览器请求 https://your-app.vercel.app
2. 返回 HTML + JS bundle
3. JS 执行，初始化应用
4. supabase 在应用内部初始化
5. 用户与正常功能交互
```

**关键点**：用户永远不需要在控制台直接访问 `supabase` 变量。

## 4. 调试与监控方案

### 4.1 开发环境调试（推荐）

**方案 A：条件性全局暴露**
```typescript
// services/supabaseClient.ts 末尾添加：
if (import.meta.env.DEV) {
  // 仅在开发环境暴露到 window
  (window as any).supabase = supabase;
  console.log('[Dev] supabase 已暴露到全局，可用于控制台调试');
}
```

**方案 B：调试页面**
```typescript
// 创建 /src/pages/Debug.tsx
export const DebugPage = () => {
  const testAuth = async () => {
    const result = await supabase.auth.getUser();
    console.log('认证测试:', result);
  };

  return <button onClick={testAuth}>测试认证</button>;
};
```

### 4.2 生产环境监控

**方案 A：增强日志系统**
```typescript
// 服务中添加性能监控
const logAuthPerformance = async (fn: () => Promise<any>, name: string) => {
  const start = performance.now();
  try {
    const result = await fn();
    const elapsed = performance.now() - start;
    console.log(`[${name}] 完成: ${elapsed.toFixed(2)}ms`);
    return result;
  } catch (error) {
    console.error(`[${name}] 失败:`, error);
    throw error;
  }
};

// 使用方式
const result = await logAuthPerformance(
  () => supabase.auth.getUser(),
  '认证'
);
```

**方案 B：错误追踪集成**
```typescript
// 集成 Sentry/LogRocket 等工具
import * as Sentry from '@sentry/react';

try {
  await supabase.auth.getUser();
} catch (error) {
  console.error('认证错误:', error);
  Sentry.captureException(error);
}
```

**方案 C：健康检查端点**
```typescript
// 创建公开的健康检查 API
export const checkSystemHealth = async () => {
  const checks = {
    supabase: { status: 'unknown', time: 0 },
    database: { status: 'unknown', time: 0 },
  };

  // 测试 Supabase 连接
  const authStart = Date.now();
  try {
    await supabase.auth.getUser();
    checks.supabase = { status: 'healthy', time: Date.now() - authStart };
  } catch {
    checks.supabase = { status: 'unhealthy', time: Date.now() - authStart };
  }

  return checks;
};
```

## 5. 部署准备检查清单

### 5.1 环境变量配置
```bash
# Vercel 环境变量设置（通过 Dashboard 或 CLI）
VITE_SUPABASE_URL=xxx
VITE_SUPABASE_ANON_KEY=xxx
VITE_TEXT_API_KEY=xxx
VITE_IMAGE_API_KEY=xxx
```

### 5.2 构建配置验证
```json
// vite.config.ts 检查项
{
  "build": {
    "outDir": "dist",
    "sourcemap": true, // 生产环境建议开启
    "minify": "terser"
  }
}
```

### 5.3 CORS 配置
1. **Supabase Dashboard** → Project Settings → API
2. 添加生产域名到 "Allowed Origins"
3. 例如：`https://your-app.vercel.app`

### 5.4 测试流程
| 测试阶段 | 测试内容 | 预期结果 |
|---------|---------|----------|
| **本地构建** | `npm run build` | 无 TypeScript 错误 |
| **本地预览** | `npm run preview` | 功能正常 |
| **Vercel 预览** | PR 部署 | 自动部署验证 |
| **生产部署** | 主分支部署 | 所有功能正常 |

## 6. 后续学习路径建议

### 6.1 前端架构深入学习
- **模块化与打包**：Webpack/Vite 工作原理
- **状态管理**：React Context, Zustand, Redux
- **性能优化**：代码分割、懒加载、缓存策略

### 6.2 Supabase 高级特性
- **Row Level Security (RLS)**：数据库权限控制
- **实时订阅**：`supabase.from('table').on('*', ...)`
- **存储管理**：文件上传与 CDN
- **边缘函数**：Supabase Edge Functions

### 6.3 生产监控与运维
- **错误追踪**：Sentry, LogRocket
- **性能监控**：Lighthouse, Web Vitals
- **日志管理**：结构化日志、日志聚合
- **CI/CD**：自动化测试与部署

### 6.4 安全最佳实践
- **环境变量管理**：不同环境的配置隔离
- **密钥轮换**：定期更新 API 密钥
- **访问控制**：基于角色的权限管理
- **输入验证**：防止注入攻击

### 6.5 实际项目练习建议

**项目 1：监控仪表板**
- 目标：创建一个显示应用健康状态的页面
- 技术：React + Charts + 定时轮询
- 功能：显示认证状态、API 延迟、错误率

**项目 2：管理员工具**
- 目标：只有管理员能访问的调试工具
- 技术：权限控制 + 调试接口
- 功能：手动触发认证测试、查看日志、清除缓存

**项目 3：自动化测试套件**
- 目标：创建端到端测试
- 技术：Playwright/Cypress
- 功能：自动化测试关键用户流程

---

## 📝 快速参考命令

### 开发命令
```bash
# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview

# 检查 TypeScript 类型
npx tsc --noEmit
```

### 调试命令
```bash
# 检查端口占用
netstat -ano | findstr "5173 5174 5175"

# 测试 Supabase 连接
curl https://YOUR_SUPABASE_URL.supabase.co/auth/v1/health

# 检查环境变量
node -e "console.log(process.env.VITE_SUPABASE_URL || '未设置')"
```

### Vercel 部署
```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录 Vercel
vercel login

# 部署到预览环境
vercel

# 部署到生产环境
vercel --prod
```

---

## 🔄 当遇到问题时

### 问题排查流程
1. **检查控制台日志** - 前端错误信息
2. **检查网络请求** - Supabase 请求状态
3. **验证环境变量** - 配置是否正确
4. **检查 Supabase 控制台** - 服务状态与日志
5. **本地重现问题** - 开发环境调试

### 常见问题解决方案

| 问题 | 可能原因 | 解决方案 |
|------|---------|----------|
| **认证失败** | CORS 配置、网络问题 | 检查 Supabase CORS 设置 |
| **数据库无数据** | RLS 策略问题 | 检查数据库权限策略 |
| **构建失败** | TypeScript 错误、依赖问题 | 检查 `npm run build` 输出 |
| **部署后空白** | 路由配置、环境变量 | 检查 Vercel 环境变量配置 |

---

## 📚 推荐学习资源

### 官方文档
- [Supabase Documentation](https://supabase.com/docs)
- [Vite Documentation](https://vitejs.dev/guide/)
- [Vercel Documentation](https://vercel.com/docs)

### 教程与课程
- [Supabase Masterclass](https://www.youtube.com/watch?v=92yH2_qqFgg)
- [Modern React Patterns](https://ui.dev/react)
- [Frontend Architecture](https://frontendmasters.com/courses/web-app-performance/)

### 工具与库
- [React Query](https://tanstack.com/query) - 数据获取与缓存
- [Zustand](https://github.com/pmndrs/zustand) - 状态管理
- [React Hook Form](https://react-hook-form.com/) - 表单处理

---

**最后更新**: 2026-02-08
**相关文件**: `services/supabaseClient.ts`, `services/supabaseDataService.ts`
**Ralph Loop 状态**: ✅ 已完成 (`<promise>SUPABASE FIXED</promise>`)

> **提示**: 这个文档是动态的，随着项目发展应该持续更新。建议定期回顾并根据实际经验添加新的内容。
