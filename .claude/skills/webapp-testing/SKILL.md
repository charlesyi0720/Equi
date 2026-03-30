# webapp-testing

Testing strategies for modern web applications including unit, integration, and E2E testing.

## When to Use

- Setting up test infrastructure
- Writing component tests
- API testing
- E2E test scenarios
- Test debugging

## Testing Stack Recommendations

### React/Next.js
- **Unit/Integration**: Vitest + React Testing Library
- **E2E**: Playwright
- **API**: Supertest or MSW (Mock Service Worker)

### Setup Commands

```bash
# Vitest + React Testing Library
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom

# Playwright
npm install -D @playwright/test
npx playwright install

# MSW for API mocking
npm install -D msw
```

## Testing Patterns

### 1. Component Testing

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { expect, test } from 'vitest';

test('button click updates state', async () => {
  render(<Counter />);
  const button = screen.getByRole('button', { name: /increment/i });

  fireEvent.click(button);

  expect(screen.getByText('Count: 1')).toBeInTheDocument();
});
```

### 2. API Route Testing (Next.js)

```ts
import { POST } from '@/app/api/users/route';

test('creates user successfully', async () => {
  const request = new Request('http://localhost/api/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'Test' })
  });

  const response = await POST(request);
  const data = await response.json();

  expect(response.status).toBe(201);
  expect(data.name).toBe('Test');
});
```

### 3. E2E Testing (Playwright)

```ts
import { test, expect } from '@playwright/test';

test('user can login', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name="email"]', 'user@example.com');
  await page.fill('[name="password"]', 'password123');
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL('/dashboard');
});
```

### 4. Database Testing with Supabase

```ts
import { createClient } from '@supabase/supabase-js';

// Use test database
const supabase = createClient(
  process.env.TEST_SUPABASE_URL!,
  process.env.TEST_SUPABASE_KEY!
);

beforeEach(async () => {
  // Clean up test data
  await supabase.from('users').delete().neq('id', '');
});
```

## Best Practices

1. **Test user behavior, not implementation**
2. **Use data-testid sparingly** (prefer accessible queries)
3. **Mock external services** (APIs, third-party SDKs)
4. **Keep tests isolated** (no shared state)
5. **Test error states** (not just happy paths)
6. **Use fixtures** for consistent test data

## Configuration Files

### vitest.config.ts
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
});
```

### playwright.config.ts
```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3000',
  },
  webServer: {
    command: 'npm run dev',
    port: 3000,
  },
});
```

## Common Queries (Testing Library)

```ts
// By role (preferred)
screen.getByRole('button', { name: /submit/i })

// By label
screen.getByLabelText('Email')

// By text
screen.getByText('Welcome')

// By test ID (last resort)
screen.getByTestId('custom-element')
```

## Resources

- [Testing Library Docs](https://testing-library.com/)
- [Vitest Docs](https://vitest.dev/)
- [Playwright Docs](https://playwright.dev/)
