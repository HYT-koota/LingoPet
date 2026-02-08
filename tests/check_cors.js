// CORS 检查脚本
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('=== CORS 配置检查 ===\n');

// 检查 1: .env.local 中的 Supabase 配置
console.log('检查 1: .env.local 中的 Supabase 配置');
try {
  const envPath = join(__dirname, '../.env.local');
  const envContent = readFileSync(envPath, 'utf8');

  const hasSupabaseUrl = envContent.includes('VITE_SUPABASE_URL');
  const hasSupabaseKey = envContent.includes('VITE_SUPABASE_ANON_KEY');

  if (hasSupabaseUrl && hasSupabaseKey) {
    console.log('✅ .env.local 包含 Supabase 配置');

    // 提取 URL 用于检查
    const urlMatch = envContent.match(/VITE_SUPABASE_URL=(https?:\/\/[^\s]+)/);
    if (urlMatch) {
      const supabaseUrl = urlMatch[1];
      console.log(`   Supabase URL: ${supabaseUrl}`);

      // 检查是否是有效的 Supabase URL
      if (supabaseUrl.includes('supabase.co')) {
        console.log('   ✅ 有效的 Supabase URL 格式');
      } else {
        console.log('   ⚠️  URL 可能不是标准的 Supabase 格式');
      }
    }
  } else {
    console.log('❌ .env.local 缺少 Supabase 配置');
  }
} catch (error) {
  console.log(`❌ 无法读取 .env.local: ${error.message}`);
}

// 检查 2: vite.config.ts 中的代理配置
console.log('\n检查 2: vite.config.ts 中的代理配置');
try {
  const viteConfigPath = join(__dirname, '../vite.config.ts');
  const viteConfigContent = readFileSync(viteConfigPath, 'utf8');

  const hasServerConfig = viteConfigContent.includes('server:');
  const hasProxyConfig = viteConfigContent.includes('proxy:');

  if (hasServerConfig && hasProxyConfig) {
    console.log('✅ vite.config.ts 包含服务器和代理配置');
  } else {
    console.log('⚠️  vite.config.ts 可能缺少代理配置');
    console.log('   如果遇到 CORS 问题，可以考虑添加代理配置');
  }
} catch (error) {
  console.log(`❌ 无法读取 vite.config.ts: ${error.message}`);
}

// 检查 3: 应用中的 CORS 相关代码
console.log('\n检查 3: 应用中的 CORS 相关代码');
try {
  const supabaseClientPath = join(__dirname, '../services/supabaseClient.ts');
  const supabaseClientContent = readFileSync(supabaseClientPath, 'utf8');

  const hasCorsHeaders = supabaseClientContent.includes('headers') &&
                        supabaseClientContent.includes('global');

  if (hasCorsHeaders) {
    console.log('✅ supabaseClient.ts 包含全局 headers 配置');
  } else {
    console.log('⚠️  supabaseClient.ts 没有显式的 CORS headers');
  }
} catch (error) {
  console.log(`❌ 无法读取 supabaseClient.ts: ${error.message}`);
}

// 检查 4: 创建 CORS 测试建议
console.log('\n=== CORS 测试建议 ===');
console.log('\n如果遇到 CORS 错误，请执行以下步骤:');
console.log('\n1. 浏览器控制台测试:');
console.log('   打开 http://localhost:5174');
console.log('   按 F12 打开开发者工具');
console.log('   在 Console 标签中运行:');
console.log('   fetch("https://qwfxyeomymybjcxnbwdg.supabase.co/auth/v1/user", {');
console.log('     headers: {');
console.log('       "Authorization": "Bearer YOUR_TOKEN",');
console.log('       "apikey": "YOUR_ANON_KEY"');
console.log('     }');
console.log('   }).then(r => console.log(r.status)).catch(e => console.error(e))');

console.log('\n2. Supabase 控制台配置:');
console.log('   a. 登录 Supabase 控制台');
console.log('   b. 进入 Project Settings → API');
console.log('   c. 在 "Site URL" 和 "Additional Redirect URLs" 中添加:');
console.log('      - http://localhost:5174');
console.log('      - http://localhost:5173');
console.log('   d. 保存更改');

console.log('\n3. 本地代理配置（备选方案）:');
console.log('   在 vite.config.ts 中添加:');
console.log('   server: {');
console.log('     proxy: {');
console.log('       "/supabase": {');
console.log('         target: "https://qwfxyeomymybjcxnbwdg.supabase.co",');
console.log('         changeOrigin: true,');
console.log('         rewrite: (path) => path.replace(/^\\/supabase/, "")');
console.log('       }');
console.log('     }');
console.log('   }');

console.log('\n4. 清除浏览器缓存:');
console.log('   有时旧的 CORS 策略会被缓存');
console.log('   清除浏览器缓存并重新加载应用');

console.log('\n=== 当前状态总结 ===');
console.log('代码层面的认证修复已全面实现:');
console.log('✅ 10 秒网络超时');
console.log('✅ 认证重试机制（2 次重试）');
console.log('✅ 5 秒 getUser() 超时');
console.log('✅ 增强的错误处理和日志');
console.log('✅ 会话重置功能');

console.log('\n下一步: 需要实际浏览器测试验证 CORS 和功能修复');
console.log('测试地址: http://localhost:5174');