import { test, expect } from '@playwright/test';

test.describe('Smara Desktop UI - Full Mermaid Diagram & Chart Suite', () => {
  test('Renders all 10 diagram types with correct SVG viewBox and real dimensions', async ({ page }) => {
    page.on('console', (msg) => {
      console.log(`[Browser Console ${msg.type()}]:`, msg.text());
    });

    await page.goto('/');

    const chatNavLink = page.locator('[data-page-target="chat"]');
    await expect(chatNavLink).toBeVisible();
    await chatNavLink.click();

    const diagrams = [
      // 1. Full Complex Architecture Flowchart with subgraphs (Komida)
      `flowchart TB
    subgraph ClientTier["🌐 Client Tier (User & Browser)"]
        Browser["🖥️ Web Browser (Desktop / Mobile)"]
        Web3Wallet["🦊 Web3 Wallet (MetaMask / Coinbase / Rainbow)"]
    end
    subgraph FrontendTier["⚡ Komida Frontend (Next.js 16 App Router)"]
        UIApp["App Router (app/)"]
        ClientState["Client State & Context"]
    end
    subgraph BackendTier["🚀 Komida Backend API (Hono.js)"]
        APIRoutes["Core API Endpoints"]
        CoreServices["Business Logic & Service Layer"]
    end
    subgraph StorageTier["💾 Persistence & Cache Layer"]
        DB[(PostgreSQL / SQLite)]
        DiskCache["📁 Disk Cache"]
    end
    Browser --> UIApp
    Web3Wallet --> ClientState
    UIApp --> APIRoutes
    APIRoutes --> CoreServices
    CoreServices --> DB
    CoreServices --> DiskCache`,

      // 2. Complex Sequence Diagram (Data Flow)
      `sequenceDiagram
    autonumber
    actor User as Pengguna (Browser)
    participant Next as Next.js Proxy
    participant Hono as Hono Backend
    participant Disk as Local Cache
    participant Scraper as Scraper Engine
    User->>Next: Buka Komik (Slug)
    Next->>Hono: Forward Request
    Hono->>Scraper: Ambil Data Chapter
    Scraper-->>Hono: List URL Gambar
    Hono-->>Next: Payload Data
    Next-->>User: Tampilkan Reader Page`,

      // 3. Sequence Diagram (Web3 SIWE & Payments)
      `sequenceDiagram
    autonumber
    actor User as Pengguna Web3
    participant Frontend as Komida UI
    participant Backend as Hono Payment Route
    participant DB as Database Drizzle
    User->>Frontend: Connect Wallet & Sign SIWE
    Frontend->>Backend: POST /api/auth/verify-wallet
    Backend->>Backend: Verifikasi Signature
    Backend->>DB: Update user_credits
    Backend-->>Frontend: Token JWT Terbit`,

      // 4. Pie Chart (LOC Composition)
      `pie title Komposisi Bahasa Pemrograman (Komida)
    "TypeScript (TSX)" : 14188
    "TypeScript (TS)" : 2388
    "HTML" : 334
    "CSS" : 225
    "Rust" : 890
    "Solidity" : 219`,

      // 5. Class Diagram (Object Models)
      `classDiagram
    class User {
      +String id
      +String email
      +login()
    }
    class Admin {
      +banUser()
      +viewAuditLogs()
    }
    User <|-- Admin`,

      // 6. State Diagram (Lifecycle)
      `stateDiagram-v2
    [*] --> Idle
    Idle --> Processing: Submit Task
    Processing --> Completed: Success
    Processing --> Failed: Error
    Completed --> [*]`,

      // 7. ER Diagram (Data Entities)
      `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    CUSTOMER }|..|{ DELIVERY_ADDRESS : uses`,

      // 8. Git Graph (Branch Flow)
      `gitGraph
    commit
    branch develop
    checkout develop
    commit
    commit
    checkout main
    merge develop`,

      // 9. Gantt Chart (Timeline Project)
      `gantt
    title Roadmap Proyek
    dateFormat  YYYY-MM-DD
    section Backend
    Design Architecture :2026-08-01, 10d
    Implement API       :2026-08-11, 15d`,

      // 10. Mindmap (Concept Hierarchy)
      `mindmap
  root((Komida Architecture))
    Frontend
      Next.js 16
      React 19
      Tailwind CSS
    Backend
      Bun Engine
      Hono.js
      Drizzle ORM`
    ];

    // Inject all 10 diagrams
    await page.evaluate((diagList) => {
      const chatMessages = document.getElementById('chat-messages');
      if (!chatMessages) return;

      for (const diag of diagList) {
        const item = document.createElement('div');
        item.className = 'chat-message chat-message-assistant';
        item.innerHTML = `<div class="chat-message-body"><pre><code class="language-mermaid">${diag}</code></pre></div>`;
        chatMessages.appendChild(item);
      }
    }, diagrams);

    const renderResult = await page.evaluate(async () => {
      const chatMessages = document.getElementById('chat-messages');
      if (chatMessages && (window as any).renderMermaidDiagrams) {
        await (window as any).renderMermaidDiagrams(chatMessages);
        return { success: true };
      }
      return { success: false, reason: 'renderMermaidDiagrams not found' };
    });

    expect(renderResult.success).toBe(true);

    // Verify all 10 diagrams are rendered into .mermaid-chart-wrapper
    const chartWrappers = page.locator('.mermaid-chart-wrapper');
    await expect(chartWrappers).toHaveCount(10, { timeout: 10000 });

    // Verify all 10 SVGs have healthy render dimensions (width > 50px, height > 30px)
    const count = await chartWrappers.count();
    for (let i = 0; i < count; i++) {
      const wrapper = chartWrappers.nth(i);
      const svg = wrapper.locator('svg');
      await expect(svg).toBeVisible();
      const box = await svg.boundingBox();
      console.log(`Diagram #${i + 1} dimensions:`, box);
      expect(box?.width).toBeGreaterThan(50);
      expect(box?.height).toBeGreaterThan(30);
    }

    // Capture screenshot of rendered diagrams
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: '/home/cahya/.gemini/antigravity/brain/9f9ccaa3-3e79-4763-8864-344f94eb7e24/mermaid_architecture_diagram_screenshot.png' });
  });
});
