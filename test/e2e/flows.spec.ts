/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Playwright End-to-End Test Suite: Critical Flows
 * 1. App boot & city switching
 * 2. Core Citizen Science Workflow (Missions -> Micro-Check -> Receipt)
 * 3. Trace drill and upstream bisection
 * 4. Join a Crew
 * 5. Dispatch Queue sign-in (volunteer joins, coordinator issues a mission)
 * 6. Theme switch (light and dark, remembered across a reload)
 * 7. Keyboard (dialogs hold focus, Escape closes them, map reaches are buttons)
 * 8. Demo controls (storm, offline queue and sync, coordinator role)
 * 9. Progress and points (a repeat check earns nothing, a streak counts weeks, a city keeps its state)
 *
 * The app must run on the seeded demo database (`npm run db:seed`); the Playwright
 * config does that for the server it starts.
 */

import { test, expect, type Page } from '@playwright/test';

/**
 * On phones the navigation and the demo controls (city, role) sit in a drawer behind the menu
 * button. Opens it when that button is showing, and says whether it did.
 */
async function openDrawer(page: Page): Promise<boolean> {
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (!(await menu.isVisible())) return false;
  await menu.click();
  return true;
}

/** Goes to a page through the navigation. Choosing a page closes the drawer. */
async function openPage(page: Page, name: string) {
  await openDrawer(page);
  await page.getByRole('navigation').getByRole('button', { name }).click();
}

/** Switches the demo role, which is in the top bar or, on phones, in the drawer. */
async function switchRole(page: Page, role: 'Volunteer' | 'Coordinator') {
  const inDrawer = await openDrawer(page);
  await page.getByRole('button', { name: role, exact: true }).click();
  if (inDrawer) await page.keyboard.press('Escape');
}

test.describe('Naiad Critical E2E Flows', () => {
  // -------------------------------------------------------------
  // FLOW 1: App boot & city switching
  // -------------------------------------------------------------
  test('Flow 1: App Boot & City Switching', async ({ page }) => {
    await page.goto('/');

    // The app opens on the Overview of the default city
    await expect(page.getByText('Naiad', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    await expect(page.getByText(/Coimbra, Portugal/)).toBeVisible();

    const inDrawer = await openDrawer(page);
    const citySelect = page.getByLabel('City');
    await expect(citySelect).toHaveValue('coimbra');

    // Switch to Toulouse: the page follows
    await citySelect.selectOption('toulouse');
    await expect(citySelect).toHaveValue('toulouse');
    await expect(page.getByText(/Toulouse, France/)).toBeVisible();

    // Switch back to Coimbra
    await citySelect.selectOption('coimbra');
    await expect(citySelect).toHaveValue('coimbra');
    await expect(page.getByText(/Coimbra, Portugal/)).toBeVisible();

    // The drawer closes on Escape and gives the page back
    if (inDrawer) {
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeHidden();
    }
  });

  // -------------------------------------------------------------
  // FLOW 2: Core Workflow (Missions -> Micro-Check -> Receipt)
  // -------------------------------------------------------------
  test('Flow 2: Core Workflow (Browse Missions -> Open Micro-Check -> Receipt)', async ({ page }) => {
    await page.goto('/');

    // Navigate to the missions page and open the top-ranked mission
    await openPage(page, '1-Minute Missions');
    await expect(page.getByRole('heading', { level: 1, name: '1-Minute Missions' })).toBeVisible();
    const topMission = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Check In' }) }).first();
    const advertised = (await topMission.textContent())?.match(/\+\d+ pts/)?.[0] ?? 'no points shown';
    await topMission.getByRole('button', { name: 'Check In' }).click();

    // Verify the Micro-Check dialog opens inside the access point geofence
    const checkDialog = page.getByRole('dialog');
    await expect(checkDialog).toBeVisible();
    await expect(checkDialog).toContainText('One-Minute Micro-Check');
    await expect(checkDialog).toContainText('Verified Inside Geofence');

    // Submit the check with the default answers
    await checkDialog.getByRole('button', { name: 'Complete Check & Receive Receipt' }).click();

    // Expect the celebratory receipt
    const receipt = page.getByRole('dialog');
    await expect(receipt).toContainText('Ground-Truth Recorded');
    await expect(receipt).toContainText('Reach Freshness Restored');
    // The receipt credits what the mission card advertised
    await expect(receipt).toContainText(advertised);

    // Closing it returns to the page, and the Overview lists the check
    await receipt.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await openPage(page, 'Overview');
    await expect(page.getByRole('heading', { name: 'Your recent checks' })).toBeVisible();
  });

  // -------------------------------------------------------------
  // FLOW 3: Trace Drill (Simulated Incident -> Bisection Check)
  // -------------------------------------------------------------
  test('Flow 3: Trace Drill & Upstream Bisection', async ({ page }) => {
    await page.goto('/');

    await openPage(page, 'Trace Hunts');
    await expect(page.getByRole('heading', { level: 1, name: 'Trace Hunts' })).toBeVisible();

    // Start a practice incident: it is labelled as a drill and opens a hunt with candidates
    await page.getByRole('button', { name: 'Start Simulated Trace Drill' }).click();
    await expect(page.getByText('Practice Drill')).toBeVisible();
    await expect(page.getByText(/Candidate Upstream Reaches \(\d+\)/)).toBeVisible();
    await expect(page.getByText(/Audit Trail of Observations \(1\)/)).toBeVisible();

    // The hunt asks volunteers for a check: answering that mission is recorded on the hunt
    await openPage(page, '1-Minute Missions');
    const traceMission = page.getByRole('listitem').filter({ hasText: 'Trace Hunt:' });
    await expect(traceMission).toContainText('+100 pts');
    await traceMission.getByRole('button', { name: 'Check In' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Complete Check & Receive Receipt' }).click();
    await expect(page.getByRole('dialog')).toContainText('A trace-hunt check pays a flat 100.');
    await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
    await openPage(page, 'Trace Hunts');
    await expect(page.getByText(/Audit Trail of Observations \(2\)/)).toBeVisible();
    await expect(page.getByText('Sign Absent', { exact: true })).toBeVisible();
    await expect(page.getByText('Status: watch')).toBeVisible();

    // A second positive check makes it an advisory. Approving it is the coordinator's step.
    await page.getByRole('button', { name: '+ Sign Present' }).first().click();
    await expect(page.getByText(/Audit Trail of Observations \(3\)/)).toBeVisible();
    await expect(page.getByText('Status: advisory')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm Downstream Advisory' })).toBeHidden();
    await expect(page.getByText("Approval is a coordinator's step.", { exact: false })).toBeVisible();

    await switchRole(page, 'Coordinator');
    await page.getByRole('button', { name: 'Confirm Downstream Advisory' }).click();
    await expect(page.getByText('Downstream Advisory Confirmed')).toBeVisible();
    await expect(page.getByText('Status: confirmed')).toBeVisible();
  });

  // -------------------------------------------------------------
  // FLOW 4: Join a Crew
  // -------------------------------------------------------------
  test('Flow 4: Crews & Team Streaks', async ({ page }) => {
    await page.goto('/');

    await openPage(page, 'Crews & Streaks');

    // Verify Crew view & Leaderboard
    await expect(page.getByRole('heading', { level: 1, name: 'Crews & Streaks' })).toBeVisible();
    await expect(page.getByText('City Reach Streak Board')).toBeVisible();

    // Join another crew with its join code
    await page.getByLabel('Join code').fill('CHOUPAL42');
    await page.getByRole('button', { name: 'Join Crew' }).click();
    await expect(page.getByText('Successfully joined crew with code CHOUPAL42!')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Choupal EcoRunners' })).toBeVisible();

    // A new crew gets a join code no other crew has, and starts without a reach
    await page.getByLabel('Crew name').fill('Coselhas Kids');
    await page.getByRole('button', { name: 'Create Crew & Generate Join Code' }).click();
    await expect(page.getByRole('heading', { name: 'Coselhas Kids' })).toBeVisible();
    await expect(page.getByText('COSELHAS27')).toBeVisible();
    await expect(page.getByText('No reach adopted yet.', { exact: false })).toBeVisible();
  });

  // -------------------------------------------------------------
  // FLOW 5: Dispatch Queue Sign-In
  // -------------------------------------------------------------
  test('Flow 5: Dispatch Sign-In (Volunteer Joins -> Coordinator Issues Mission)', async ({ page }, testInfo) => {
    await page.goto('/');
    await openPage(page, 'Dispatch Queue');

    // A volunteer joins with a nickname and sees the queue, but cannot issue missions
    await page.getByLabel('Nickname').fill(`E2E-${Date.now()}-${testInfo.project.name.slice(0, 6)}`);
    await page.getByRole('button', { name: 'Join' }).click();
    await expect(page.getByText('(citizen)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Issue Mission' })).toBeHidden();

    // Issuing a mission takes a coordinator account
    await switchRole(page, 'Coordinator');
    await page.getByLabel('Email').fill('manuel.silva@coimbra.example');
    await page.getByLabel('Password').fill('naiad-demo');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('(coordinator)')).toBeVisible();

    await page.getByRole('button', { name: 'Issue Mission' }).click();
    await page.getByLabel(/Inspection Objective/).fill('E2E: verify turbidity after rainfall');
    await page.getByRole('button', { name: 'Publish Mission' }).click();
    await expect(page.getByText('Mission Created')).toBeVisible();
  });

  // -------------------------------------------------------------
  // FLOW 6: Theme switch
  // -------------------------------------------------------------
  test('Flow 6: Theme Switch (Light <-> Dark, Remembered)', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');

    // Light is the default
    await expect(html).not.toHaveAttribute('data-theme', 'dark');
    const lightBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    const darkBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(darkBackground).not.toBe(lightBackground);

    // The choice survives a reload
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await expect(html).toHaveAttribute('data-theme', 'light');
  });

  // -------------------------------------------------------------
  // FLOW 7: Keyboard
  // -------------------------------------------------------------
  test('Flow 7: Keyboard (Dialogs Hold Focus, Escape Closes, Map Reaches Are Buttons)', async ({ page }) => {
    await page.goto('/');
    await openPage(page, '1-Minute Missions');

    // Opening a dialog from the keyboard moves focus into it
    const checkIn = page.getByRole('button', { name: 'Check In' }).first();
    await checkIn.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeFocused();

    // Focus stays inside: back from the top lands on the last control, forward wraps to the first
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'Complete Check & Receive Receipt' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeFocused();

    // If focus falls back to the page body (a focused control went away), Tab brings it back in
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeFocused();
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());

    // Escape closes the dialog and gives focus back to the button that opened it
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(checkIn).toBeFocused();

    // A reach on the map is a button: it takes focus and Enter selects it
    await openPage(page, 'Freshness Map');
    const reach = page.getByRole('button', { name: /^Mondego/ });
    await reach.focus();
    await page.keyboard.press('Enter');
    await expect(reach).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { level: 2, name: /^Mondego/ })).toBeVisible();
  });

  // -------------------------------------------------------------
  // FLOW 8: Demo controls
  // -------------------------------------------------------------
  test('Flow 8: Demo Controls (Storm, Offline Queue & Sync, Coordinator Role)', async ({ page }) => {
    await page.goto('/');

    // A simulated storm makes every reach stale and says so in a banner
    if (await openDrawer(page)) await page.locator('summary', { hasText: 'Weather' }).click();
    else await page.getByRole('button', { name: /^Weather:/ }).click();
    await page.getByRole('button', { name: 'Simulate 26mm Storm' }).click();
    await expect(page.getByText(/Heavy storm \(26 mm in 24 h, simulated\)/)).toBeVisible();
    await expect(page.getByText('0 fresh · 0 aging · 8 stale')).toBeVisible();

    // A check made after the rain is not discounted by it: the reach is fresh and its mission closes
    await openPage(page, '1-Minute Missions');
    await page.getByRole('button', { name: 'Check In' }).first().click();
    const stormDialog = page.getByRole('dialog');
    const stormReach = (await stormDialog.getByRole('heading', { level: 2 }).textContent()) ?? '';
    await stormDialog.getByRole('button', { name: 'Complete Check & Receive Receipt' }).click();
    await stormDialog.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: stormReach })).toHaveCount(0);
    await openPage(page, 'Overview');
    await expect(page.getByText('1 fresh · 0 aging · 7 stale')).toBeVisible();
    await expect(page.getByTitle('Open this reach on the map').filter({ hasText: stormReach })).toContainText('100%');

    await page.getByRole('button', { name: 'Clear Storm' }).click();
    await expect(page.getByText(/Heavy storm/)).toBeHidden();

    // Offline: a check is queued and changes nothing yet
    if (await openDrawer(page)) {
      await page.getByRole('button', { name: 'Simulate going offline' }).click();
      await page.keyboard.press('Escape');
    } else {
      await page.getByRole('button', { name: 'Offline mode (simulated)' }).click();
    }
    await openPage(page, '1-Minute Missions');
    await page.getByRole('button', { name: 'Check In' }).first().click();
    const dialog = page.getByRole('dialog');
    const reachName = (await dialog.getByRole('heading', { level: 2 }).textContent()) ?? '';
    await dialog.getByRole('button', { name: 'Complete Check & Receive Receipt' }).click();
    await expect(dialog).toContainText('this check waits in the queue');
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText('1 queued.')).toBeVisible();

    await openPage(page, 'Overview');
    const checkedReach = page.getByTitle('Open this reach on the map').filter({ hasText: reachName });
    await expect(checkedReach).not.toContainText('100%');

    // Reconnecting sends the queue: the reach is fresh again and the check is listed
    if (await openDrawer(page)) {
      await page.getByRole('button', { name: 'Simulate reconnecting' }).click();
      await page.keyboard.press('Escape');
    } else {
      await page.getByRole('button', { name: 'Offline mode (simulated)' }).click();
    }
    await expect(page.getByText(/Offline mode \(simulated\):/)).toBeHidden();
    await expect(checkedReach).toContainText('100%');
    await expect(checkedReach).toContainText('Fresh');
    await expect(page.getByRole('heading', { name: 'Your recent checks' })).toBeVisible();

    // The console belongs to the coordinator role; leaving the role leaves the console
    await switchRole(page, 'Coordinator');
    await openPage(page, 'Coordinator Console');
    await expect(page.getByRole('heading', { level: 1, name: 'Coordinator Console' })).toBeVisible();
    await switchRole(page, 'Volunteer');
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  });

  // -------------------------------------------------------------
  // FLOW 9: Progress and points
  // -------------------------------------------------------------
  test('Flow 9: Progress & Points (Repeat Check, Weekly Streak, City Round Trip)', async ({ page }) => {
    await page.goto('/');
    const points = page.getByTitle('Patrol points earned by addressing real demand');
    await expect(points).toContainText('240');

    // The top mission is on a reach last checked the week before: its check extends the streak
    await openPage(page, '1-Minute Missions');
    await page.getByRole('button', { name: 'Check In' }).first().click();
    const dialog = page.getByRole('dialog');
    const reachName = (await dialog.getByRole('heading', { level: 2 }).textContent()) ?? '';
    await dialog.getByRole('button', { name: 'Complete Check & Receive Receipt' }).click();
    await expect(dialog).toContainText('+84 pts');
    await expect(dialog).toContainText('Reach Watch Streak: 10 weeks running!');
    await expect(points).toContainText('324');

    // Checking the same reach again right away earns nothing and does not add a week
    await dialog.getByRole('button', { name: 'View on Freshness Map' }).click();
    await page.getByRole('button', { name: 'Perform Micro-Check Here' }).click();
    await dialog.getByRole('button', { name: 'Complete Check & Receive Receipt' }).click();
    await expect(dialog).toContainText('+0 pts');
    await expect(dialog).toContainText('Reach Watch Streak: 10 weeks running!');
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(points).toContainText('324');

    // Another city and back: the reach is as it was left, and so are the points
    const inDrawer = await openDrawer(page);
    await page.getByLabel('City').selectOption('toulouse');
    await page.getByLabel('City').selectOption('coimbra');
    if (inDrawer) await page.keyboard.press('Escape');
    await openPage(page, 'Overview');
    const row = page.getByTitle('Open this reach on the map').filter({ hasText: reachName });
    await expect(row).toContainText('100%');
    await expect(row).toContainText('Fresh');
    await expect(points).toContainText('324');
  });
});
