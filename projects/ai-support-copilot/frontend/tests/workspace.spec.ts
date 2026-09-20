import { expect, test } from "@playwright/test";

test("draft, inspect evidence, edit and review", async ({ page }) => {
  await page.goto("/");
  await expect(
    page
      .getByRole("heading", {
        name: "Reporting is still locked after our upgrade",
        exact: true,
      })
      .last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Prepare sample draft" }).click();
  await expect(page.getByLabel("Edit suggested reply")).toHaveValue(/sign out/);
  await expect(
    page.getByText("Citation IDs checked", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Edit suggested reply")
    .fill("Reviewed reply for this fictional customer.");
  await page
    .getByRole("button", { name: "Mark reviewed", exact: true })
    .click();
  await expect(
    page.getByText("Marked reviewed for this session. No reply was sent."),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /Reviewed/ })
    .click();
  await expect(page.locator(".ticket-card")).toHaveCount(1);
  await expect(
    page.getByText("Sample mode uses keyword matching", { exact: false }),
  ).toBeVisible();
});

test("search, empty state, unknown topic and responsive layout", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".ticket-card")).toHaveCount(4);
  await page.getByLabel("Search tickets").fill("zzzz-no-match");
  await expect(
    page.getByRole("heading", { name: "No conversations here" }),
  ).toBeVisible();
  await page.getByLabel("Search tickets").fill("outside");
  await page.locator(".ticket-card").click();
  await page.getByRole("button", { name: "Prepare sample draft" }).click();
  await expect(
    page.getByText("Needs a closer look", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

test("API failures stay visible and retryable", async ({ page }) => {
  await page.route("**/api/tickets?sample=true", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Temporary test outage" }),
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("alert").filter({ hasText: "Temporary test outage" }),
  ).toBeVisible();
  await page.unroute("**/api/tickets?sample=true");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator(".ticket-card")).toHaveCount(4);
});

test("invite key is memory-only and modes keep separate drafts", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".ticket-card")).toHaveCount(4);
  await page.getByRole("button", { name: "Prepare sample draft" }).click();
  await expect(page.getByLabel("Edit suggested reply")).toBeVisible();
  await page.route("**/api/tickets", async (route) => {
    expect(route.request().headers()["authorization"]).toBe(
      "Bearer test-invite",
    );
    const response = await page.request.get("/api/tickets?sample=true");
    const data = await response.json();
    await route.fulfill({ json: { ...data, mode: "live" } });
  });
  await page.getByRole("button", { name: "Demo access", exact: true }).click();
  await page.getByLabel("Demo access key").fill("test-invite");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.locator(".mode-pill")).toContainText("Live");
  await expect(page.getByLabel("Edit suggested reply")).toHaveCount(0);
  await page.getByRole("button", { name: "Demo access", exact: true }).click();
  await page
    .getByRole("button", { name: "Use sample mode", exact: true })
    .click();
  await expect(page.locator(".mode-pill")).toContainText("Sample");
  await page.reload();
  await expect(page.locator(".mode-pill")).toContainText("Sample");
  await page.getByRole("button", { name: "Demo access", exact: true }).click();
  await expect(page.getByLabel("Demo access key")).toHaveValue("");
});

test("complete review, simulated send, reload, reopen and reset", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".ticket-card")).toHaveCount(4);
  await page.getByRole("button", { name: "Prepare sample draft" }).click();
  const reply = page.getByLabel("Edit suggested reply");
  await expect(reply).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Simulate send", exact: true }),
  ).toBeDisabled();
  await reply.fill("A carefully reviewed fictional reply.");
  await page
    .getByRole("button", { name: "Mark reviewed", exact: true })
    .click();
  await reply.fill("An edit requires a new review.");
  await expect(
    page.getByRole("button", { name: "Simulate send", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Mark reviewed", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Simulate send", exact: true })
    .click();
  await expect(
    page.getByText("Simulated send complete. No email was sent."),
  ).toBeVisible();
  await expect(reply).toHaveAttribute("readonly", "");
  await page.reload();
  await expect(reply).toHaveValue("An edit requires a new review.");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /Sent/ })
    .click();
  await expect(page.locator(".ticket-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Reopen ticket", exact: true })
    .click();
  await expect(reply).not.toHaveAttribute("readonly", "");
  await expect(
    page.getByRole("button", { name: "Simulate send", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Refresh tickets", exact: true })
    .click();
  await expect(reply).toHaveValue("An edit requires a new review.");
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page.getByRole("button", { name: "Cancel reset", exact: true }).click();
  await expect(reply).toBeVisible();
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page
    .getByRole("button", { name: "Clear this session", exact: true })
    .click();
  await page.reload();
  await expect(reply).toHaveCount(0);
  await expect(page.locator(".ticket-card")).toHaveCount(4);
});

test("escalations cannot be sent and OpenAI keys are rejected locally", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Search tickets").fill("outside");
  await page.locator(".ticket-card").click();
  await page.getByRole("button", { name: "Prepare sample draft" }).click();
  await page
    .getByRole("button", { name: "Mark reviewed", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Simulate send", exact: true }),
  ).toBeDisabled();
  let submitted = false;
  await page.route("**/api/tickets", (route) => {
    submitted = true;
    return route.abort();
  });
  await page.getByRole("button", { name: "Demo access", exact: true }).click();
  await page.getByLabel("Demo access key").fill("sk-not-a-real-key");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.locator(".error-banner")).toContainText("Nothing was submitted");
  expect(submitted).toBe(false);
});

test("corrupt stored work does not crash the page and tabs are isolated", async ({
  page,
  context,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "harbor-session-v1:sample",
      '{"drafts":{"HBR-1042":{}}}',
    ),
  );
  await page.goto("/");
  await expect(page.locator(".ticket-card")).toHaveCount(4);
  await page.getByRole("button", { name: "Prepare sample draft" }).click();
  await expect(page.getByLabel("Edit suggested reply")).toBeVisible();
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.locator(".ticket-card")).toHaveCount(4);
  await expect(other.getByLabel("Edit suggested reply")).toHaveCount(0);
});

test("generation failure preserves edits and can be retried", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Prepare sample draft" }).click();
  await page
    .getByLabel("Edit suggested reply")
    .fill("Keep this manually edited draft.");
  await page.route("**/api/drafts?sample=true", (route) =>
    route.fulfill({
      status: 429,
      json: { detail: "Live demo allowance reached." },
    }),
  );
  await page.getByText("Try a different question", { exact: true }).click();
  await page
    .getByLabel(/Use this ticket/)
    .fill("Reporting dashboard access");
  await page.getByRole("button", { name: "Prepare another draft" }).click();
  await expect(page.locator(".error-banner")).toContainText("allowance reached");
  await expect(page.getByLabel("Edit suggested reply")).toHaveValue(
    "Keep this manually edited draft.",
  );
});
