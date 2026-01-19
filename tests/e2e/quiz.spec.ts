import { expect, test } from '@playwright/test';

test('builds and completes a quiz', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Validate & Preview' }).click();
  await page.getByRole('button', { name: 'Publish Quiz' }).click();
  await page.getByRole('button', { name: /quiz/ }).click();

  await expect(page.getByRole('heading', { name: 'Product Basics' })).toBeVisible();
  await page.getByRole('button', { name: 'Start Quiz' }).click();

  await page.getByLabel('DAU/MAU').check();
  await page.getByRole('button', { name: 'Submit Quiz' }).click();

  await expect(page.getByRole('heading', { name: 'Quiz Results' })).toBeVisible();
});
