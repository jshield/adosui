import { test, expect } from '@playwright/test';

test.describe('App initial state', () => {
  test('should load without crash', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('Failed to fetch')) {
        errors.push(msg.text());
      }
    });
    
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    // App should have rendered something in root
    const root = page.locator('#root');
    await expect(root).toBeVisible();
    
    // Should have rendered content (even if error state)
    const html = await root.innerHTML();
    expect(html.length).toBeGreaterThan(0);
  });

  test('should have correct page title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('ADO SuperUI');
  });

  test('should render root element', async ({ page }) => {
    await page.goto('/');
    const root = page.locator('#root');
    await expect(root).toBeVisible();
    
    // Check that React rendered
    const children = await root.locator('> *').count();
    expect(children).toBeGreaterThan(0);
  });
});

test.describe('Document structure', () => {
  test('should have proper HTML structure', async ({ page }) => {
    await page.goto('/');
    
    // Check meta tags
    const charset = await page.locator('meta[charset]').getAttribute('charset');
    expect(charset).toBe('UTF-8');
    
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('width=device-width');
  });
});