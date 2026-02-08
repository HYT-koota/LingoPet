// Simple test script to verify Supabase authentication
// This can be run in browser console to test the authentication fixes

console.log('=== LingoPet Authentication Test ===');

// Test 1: Check if Supabase client is configured
console.log('Test 1: Checking Supabase configuration...');
try {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  console.log(`Supabase URL: ${supabaseUrl ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`Supabase Anon Key: ${supabaseAnonKey ? '✅ Configured' : '❌ Not configured'}`);
} catch (error) {
  console.error('Error checking Supabase config:', error);
}

// Test 2: Test authentication health check
console.log('\nTest 2: Testing authentication health check...');
async function testAuthHealth() {
  try {
    const { checkAuthHealth } = await import('./services/supabaseDataService');
    const result = await checkAuthHealth();
    console.log('Auth health result:', result);
    if (result.healthy) {
      console.log('✅ Authentication is healthy');
    } else {
      console.log('❌ Authentication health check failed');
    }
  } catch (error) {
    console.error('Error testing auth health:', error);
  }
}

// Test 3: Test database access
console.log('\nTest 3: Testing database access...');
async function testDatabaseAccess() {
  try {
    const { debugDatabaseAccess } = await import('./services/supabaseDataService');
    const result = await debugDatabaseAccess();
    console.log('Database access result:', result);
    if (result.success) {
      console.log('✅ Database access successful');
    } else {
      console.log('❌ Database access failed');
    }
  } catch (error) {
    console.error('Error testing database access:', error);
  }
}

// Run tests
console.log('\n=== Running Tests ===');
setTimeout(() => {
  testAuthHealth().then(() => {
    setTimeout(testDatabaseAccess, 1000);
  });
}, 1000);

console.log('\n=== Test Instructions ===');
console.log('1. Open browser console (F12)');
console.log('2. Navigate to http://localhost:5174');
console.log('3. Copy and paste this test script');
console.log('4. Check results in console');
console.log('\n=== CORS Check ===');
console.log('If you see CORS errors in the Network tab:');
console.log('1. Go to Supabase Console → Project Settings → API');
console.log('2. Add "http://localhost:5174" to allowed origins');
console.log('3. Save and restart the app');