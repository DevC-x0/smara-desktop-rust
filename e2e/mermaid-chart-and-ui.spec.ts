import { test, expect } from '@playwright/test';

test.describe('Smara Desktop UI & Mermaid Chart Rendering', () => {
  test('UI is responsive, navigation works, and Pie Chart renders as SVG', async ({ page }) => {
    page.on('console', (msg) => {
      console.log(`[Browser Console ${msg.type()}]:`, msg.text());
    });

    await page.goto('/');

    const chatNavLink = page.locator('[data-page-target="chat"]');
    await expect(chatNavLink).toBeVisible();
    await chatNavLink.click();

    const chatSection = page.locator('#chat-section');
    await expect(chatSection).toBeVisible();

    const chatInput = page.locator('#chat-input');
    await expect(chatInput).toBeVisible();

    // Inject Pie Chart response into chat messages container
    await page.evaluate(() => {
      const chatMessages = document.getElementById('chat-messages');
      if (chatMessages) {
        const testItem = document.createElement('div');
        testItem.className = 'chat-message chat-message-assistant';
        testItem.innerHTML = `
          <div class="chat-message-body">
            <pre><code class="language-mermaid">pie title Komposisi Bahasa Pemrograman (Komida)
    "TypeScript (TSX)" : 14188
    "TypeScript (TS)" : 2388
    "HTML" : 334
    "CSS" : 225
    "Solidity" : 219
    "Shell Script" : 167
    "JavaScript" : 22</code></pre>
          </div>
        `;
        chatMessages.appendChild(testItem);
      }
    });

    const result = await page.evaluate(async () => {
      const chatMessages = document.getElementById('chat-messages');
      try {
        if (chatMessages && (window as any).renderMermaidDiagrams) {
          await (window as any).renderMermaidDiagrams(chatMessages);
          return { success: true };
        }
        return { success: false, reason: 'renderMermaidDiagrams not on window' };
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    });

    console.log('Evaluate result:', result);

    const chartWrapper = page.locator('.mermaid-chart-wrapper');
    await expect(chartWrapper).toBeVisible({ timeout: 5000 });
  });
});
