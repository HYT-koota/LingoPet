// 简单的验证脚本 - 检查关键修复是否到位
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('=== 验证 Supabase 认证修复 ===\n');

// 检查 1: supabaseClient.ts 中的 fetch 超时
console.log('检查 1: supabaseClient.ts 中的 fetch 超时配置');
try {
  const supabaseClientPath = join(__dirname, '../services/supabaseClient.ts');
  const supabaseClientContent = readFileSync(supabaseClientPath, 'utf8');

  const hasFetchTimeout = supabaseClientContent.includes('AbortController') &&
                         supabaseClientContent.includes('10000');

  if (hasFetchTimeout) {
    console.log('✅ supabaseClient.ts 包含 10 秒 fetch 超时配置');
  } else {
    console.log('❌ supabaseClient.ts 缺少 fetch 超时配置');
  }
} catch (error) {
  console.log(`❌ 无法读取 supabaseClient.ts: ${error.message}`);
}

// 检查 2: supabaseDataService.ts 中的重试机制
console.log('\n检查 2: supabaseDataService.ts 中的认证重试机制');
try {
  const dataServicePath = join(__dirname, '../services/supabaseDataService.ts');
  const dataServiceContent = readFileSync(dataServicePath, 'utf8');

  const hasRetryFunction = dataServiceContent.includes('getUserWithRetry');
  const hasTimeout = dataServiceContent.includes('5000') && dataServiceContent.includes('timeout');
  const hasRetryLogic = dataServiceContent.includes('maxRetries');

  if (hasRetryFunction && hasTimeout && hasRetryLogic) {
    console.log('✅ supabaseDataService.ts 包含完整的认证重试机制');
  } else {
    console.log('❌ supabaseDataService.ts 缺少部分重试机制');
    console.log(`   - 有 getUserWithRetry: ${hasRetryFunction}`);
    console.log(`   - 有 5 秒超时: ${hasTimeout}`);
    console.log(`   - 有重试逻辑: ${hasRetryLogic}`);
  }

  // 检查关键函数是否使用了重试包装器
  const functionsUsingRetry = [
    { name: 'getWords', pattern: /getWords.*getUserWithRetry/ },
    { name: 'saveWord', pattern: /saveWord.*getUserWithRetry/ },
    { name: 'getPetState', pattern: /getPetState.*getUserWithRetry/ },
    { name: 'savePetState', pattern: /savePetState.*getUserWithRetry/ },
    { name: 'getDailyStats', pattern: /getDailyStats.*getUserWithRetry/ },
    { name: 'updateDailyStats', pattern: /updateDailyStats.*getUserWithRetry/ }
  ];

  console.log('\n检查关键函数是否使用重试包装器:');
  functionsUsingRetry.forEach(({ name, pattern }) => {
    if (pattern.test(dataServiceContent)) {
      console.log(`  ✅ ${name}() 使用 getUserWithRetry`);
    } else {
      // 尝试更宽松的匹配
      const funcContent = dataServiceContent.split(`export const ${name} =`)[1]?.split('export const')[0] || '';
      if (funcContent.includes('getUserWithRetry')) {
        console.log(`  ✅ ${name}() 使用 getUserWithRetry (宽松匹配)`);
      } else {
        console.log(`  ❌ ${name}() 未使用 getUserWithRetry`);
      }
    }
  });

} catch (error) {
  console.log(`❌ 无法读取 supabaseDataService.ts: ${error.message}`);
}

// 检查 3: App.tsx 中的增强认证检查
console.log('\n检查 3: App.tsx 中的增强认证检查');
try {
  const appPath = join(__dirname, '../App.tsx');
  const appContent = readFileSync(appPath, 'utf8');

  const hasHealthCheck = appContent.includes('healthElapsed') ||
                        appContent.includes('healthStart');
  const hasEnhancedLogging = appContent.includes('Auth health check');

  if (hasHealthCheck && hasEnhancedLogging) {
    console.log('✅ App.tsx 包含增强的认证健康检查');
  } else {
    console.log('❌ App.tsx 缺少增强的认证检查');
  }
} catch (error) {
  console.log(`❌ 无法读取 App.tsx: ${error.message}`);
}

// 检查 4: 新增的调试函数
console.log('\n检查 4: 新增的调试和工具函数');
try {
  const dataServicePath = join(__dirname, '../services/supabaseDataService.ts');
  const dataServiceContent = readFileSync(dataServicePath, 'utf8');

  const hasCheckAuthHealth = dataServiceContent.includes('checkAuthHealth');
  const hasDebugDatabaseAccess = dataServiceContent.includes('debugDatabaseAccess');
  const hasResetAuthSession = dataServiceContent.includes('resetAuthSession');

  console.log(`✅ checkAuthHealth 函数: ${hasCheckAuthHealth}`);
  console.log(`✅ debugDatabaseAccess 函数: ${hasDebugDatabaseAccess}`);
  console.log(`✅ resetAuthSession 函数: ${hasResetAuthSession}`);

} catch (error) {
  console.log(`❌ 无法检查调试函数: ${error.message}`);
}

// 检查 5: 测试脚本
console.log('\n检查 5: 测试脚本和文档');
const testFiles = [
  '../test_supabase_auth_fix.js',
  '../simple_test.html',
  '../test-auth.js',
  '../ITERATION_1_SUMMARY.md'
];

testFiles.forEach(file => {
  const filePath = join(__dirname, file);
  try {
    readFileSync(filePath, 'utf8');
    console.log(`✅ ${file} 存在`);
  } catch {
    console.log(`❌ ${file} 不存在`);
  }
});

console.log('\n=== 验证总结 ===');
console.log('请手动测试以下项目:');
console.log('1. 打开 http://localhost:5174');
console.log('2. 检查控制台是否有 Supabase 配置日志');
console.log('3. 测试单词保存功能（输入 "test"）');
console.log('4. 验证保存过程在 10 秒内完成');
console.log('5. 测试复习功能（点击 "Daily Review"）');
console.log('6. 检查网络请求中的 Supabase 调用');
console.log('\n如果仍有问题，请检查:');
console.log('1. Supabase CORS 设置（添加 http://localhost:5174）');
console.log('2. 浏览器控制台的具体错误信息');
console.log('3. 网络请求的状态码和响应时间');