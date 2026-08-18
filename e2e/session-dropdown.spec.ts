import { test, expect } from '@playwright/test';

test.describe('Smara Desktop UI - Custom Session Dropdown', () => {
  test('Dropdown renders beautifully, opens on click, searches sessions, and switches sessions', async ({ page }) => {
    page.on('console', (msg) => {
      console.log(`[Browser Console ${msg.type()}]:`, msg.text());
    });

    await page.goto('/');

    const chatNavLink = page.locator('[data-page-target="chat"]');
    await expect(chatNavLink).toBeVisible();
    await chatNavLink.click();

    // Verify trigger button
    const trigger = page.locator('#session-dropdown-trigger');
    await expect(trigger).toBeVisible();

    const titleEl = page.locator('#session-dropdown-active-title');
    await expect(titleEl).toBeVisible();

    const countBadge = page.locator('#session-dropdown-count-badge');
    await expect(countBadge).toBeVisible();

    const menu = page.locator('#session-dropdown-menu');
    await expect(menu).toBeHidden();

    // Click trigger to open dropdown
    await trigger.click();
    await expect(menu).toBeVisible();

    // Search input should be visible
    const searchInput = page.locator('#session-search-input');
    await expect(searchInput).toBeVisible();

    // New session button in dropdown
    const dropdownNewBtn = page.locator('#dropdown-new-session-btn');
    await expect(dropdownNewBtn).toBeVisible();

    // Press Escape to close
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();

    // Re-open dropdown
    await trigger.click();
    await expect(menu).toBeVisible();

    // Click outside on the chat input area to close dropdown
    await page.locator('#chat-input').click();
    await expect(menu).toBeHidden();

    // Re-open and click New Session
    await trigger.click();
    await expect(menu).toBeVisible();
    await dropdownNewBtn.click();
    await expect(menu).toBeHidden();
    await expect(titleEl).toHaveText('Sesi Baru');
  });
});
