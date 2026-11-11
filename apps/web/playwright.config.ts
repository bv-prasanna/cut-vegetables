import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'./e2e',
 timeout:30_000,
 expect:{timeout:10_000},
 retries:process.env.CI?1:0,
 workers:process.env.CI?2:undefined,
 reporter:process.env.CI?[['list'],['html',{open:'never'}]]:'list',
 outputDir:'./test-results',
 use:{...devices['Desktop Chrome'],baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure',screenshot:'only-on-failure'},
 webServer:{
  command:'npm run preview --workspace @freshprep/web -- --port 4173 --strictPort',
  url:'http://127.0.0.1:4173',
  reuseExistingServer:!process.env.CI,
  timeout:35_000
 }
});
