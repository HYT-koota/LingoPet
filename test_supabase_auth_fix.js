// 文件名: test_supabase_auth_fix.js
// 测试目标: 验证 Supabase 认证修复是否解决了挂起问题
import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  const testStartTime = Date.now();

  try {
    console.log(`[TEST START] 开始测试 Supabase 认证修复 - ${new Date().toISOString()}`);

    // 步骤1: 打开应用主页
    console.log('[TEST STEP 1] 打开应用主页: http://localhost:5174');
    await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });

    // 等待应用加载
    await page.waitForTimeout(2000);

    // 捕获控制台日志
    page.on('console', msg => {
      const text = msg.text();
      // 过滤重要的认证相关日志
      if (text.includes('[Auth') || text.includes('[Supabase') ||
          text.includes('[saveWord]') || text.includes('[getWords]') ||
          text.includes('[Review]') || text.includes('[Dictionary]')) {
        console.log(`[CONSOLE] ${msg.type()}: ${text}`);
      }
    });

    // 捕获页面错误
    page.on('pageerror', error => {
      console.log(`[PAGE ERROR] ${error.message}`);
    });

    // 步骤2: 检查初始状态
    console.log('[TEST STEP 2] 检查应用初始状态');

    // 检查是否显示登录界面或主界面
    const loginVisible = await page.locator('text=/登录|Login/i').isVisible().catch(() => false);
    const dictionaryVisible = await page.locator('text=/字典|Dictionary/i').isVisible().catch(() => false);

    console.log(`[STATUS] 登录界面可见: ${loginVisible}, 字典界面可见: ${dictionaryVisible}`);

    // 步骤3: 如果需要登录，先测试登录功能
    if (loginVisible) {
      console.log('[TEST STEP 3] 测试登录功能');

      // 假设使用测试账户（需要根据实际应用调整）
      await page.fill('input[type="email"]', 'test@example.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button:has-text("登录")');

      // 等待登录完成
      await page.waitForTimeout(3000);
    }

    // 步骤4: 导航到字典页面
    console.log('[TEST STEP 4] 导航到字典页面');
    const dictButton = page.locator('button, a').filter({ hasText: /字典|Dictionary|搜索|Search/i }).first();
    if (await dictButton.isVisible()) {
      await dictButton.click();
      await page.waitForTimeout(1000);
    }

    // 步骤5: 测试单词保存功能
    console.log('[TEST STEP 5] 测试单词保存功能 - 输入 "test"');

    // 查找搜索/输入框
    const searchInput = page.locator('input[type="text"], input[placeholder*="单词"], input[placeholder*="word"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('test');
      await searchInput.press('Enter');

      // 等待查询和保存过程（最多15秒，因为有10秒超时+缓冲）
      const saveStartTime = Date.now();
      console.log('[TEST] 开始等待单词保存过程...');

      // 监控加载状态
      let loadingSpinnerVisible = true;
      const loadingCheckInterval = setInterval(async () => {
        const spinner = page.locator('.spinner, .loader, [class*="loading"], [class*="spin"]').first();
        loadingSpinnerVisible = await spinner.isVisible().catch(() => false);
      }, 500);

      // 等待保存完成或超时
      await page.waitForTimeout(15000); // 15秒最大等待

      clearInterval(loadingCheckInterval);
      const saveElapsed = Date.now() - saveStartTime;

      console.log(`[TEST RESULT] 单词保存耗时: ${saveElapsed}ms`);
      console.log(`[TEST RESULT] 加载动画是否消失: ${!loadingSpinnerVisible}`);

      if (saveElapsed < 12000) { // 12秒内完成（10秒超时+缓冲）
        console.log('[TEST RESULT] ✅ 单词保存在预期时间内完成');
      } else {
        console.log('[TEST RESULT] ❌ 单词保存可能超时');
      }
    } else {
      console.log('[TEST WARNING] 未找到搜索输入框，跳过单词保存测试');
    }

    // 步骤6: 测试复习功能
    console.log('[TEST STEP 6] 测试复习功能');

    // 导航回主页或找到复习按钮
    const homeButton = page.locator('button, a').filter({ hasText: /主页|Home|首页/i }).first();
    if (await homeButton.isVisible()) {
      await homeButton.click();
      await page.waitForTimeout(1000);
    }

    const reviewButton = page.locator('button').filter({ hasText: /每日复习|Daily Review|复习|Review/i }).first();
    if (await reviewButton.isVisible()) {
      console.log('[TEST] 点击复习按钮...');
      await reviewButton.click();

      // 等待复习功能启动
      await page.waitForTimeout(5000);

      // 检查是否进入复习模式
      const reviewModeVisible = await page.locator('text=/复习|Review|单词|word/i').isVisible().catch(() => false);
      console.log(`[TEST RESULT] 复习模式是否启动: ${reviewModeVisible}`);

      if (reviewModeVisible) {
        console.log('[TEST RESULT] ✅ 复习功能正常启动');
      } else {
        console.log('[TEST RESULT] ❌ 复习功能可能未正常启动');
      }
    } else {
      console.log('[TEST WARNING] 未找到复习按钮，跳过复习功能测试');
    }

    // 步骤7: 检查网络请求
    console.log('[TEST STEP 7] 检查网络请求状态');

    // 获取所有网络请求
    const requests = await page.evaluate(() => {
      return performance.getEntriesByType('resource')
        .filter(r => r.name.includes('supabase.co'))
        .map(r => ({
          url: r.name,
          duration: r.duration,
          startTime: r.startTime
        }));
    });

    console.log(`[NETWORK] Supabase 请求数量: ${requests.length}`);
    requests.forEach((req, i) => {
      console.log(`[NETWORK ${i}] ${req.url} - 耗时: ${req.duration.toFixed(0)}ms`);
    });

    // 总体测试结果评估
    const testDuration = Date.now() - testStartTime;
    console.log(`\n[TEST SUMMARY] 测试总耗时: ${testDuration}ms`);

    // 检查是否有明显的错误迹象
    const pageContent = await page.content();
    const hasErrorText = pageContent.includes('error') || pageContent.includes('Error') ||
                         pageContent.includes('失败') || pageContent.includes('超时');

    if (!hasErrorText && testDuration < 30000) {
      console.log('[TEST RESULT]: PASS - 认证修复测试通过，未发现明显错误');
    } else {
      console.log('[TEST RESULT]: FAIL - 测试发现潜在问题');
    }

  } catch (error) {
    console.log(`[TEST RESULT]: FAIL - 测试执行错误: ${error.message}`);
  } finally {
    // 保持浏览器打开以便查看结果
    console.log('\n[TEST COMPLETE] 测试完成，浏览器保持打开状态供检查');
    console.log('请手动关闭浏览器窗口');
    // await browser.close();
  }
})();