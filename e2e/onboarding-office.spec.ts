import { expect, test } from "@playwright/test";

test.describe("SEO Office onboarding smoke", () => {
  test("creates a client vault and opens the office, chat, vault, and note preview", async ({
    page,
    request,
  }) => {
    const empty = await request.get("/api/clients");
    expect(empty.ok()).toBeTruthy();
    const initialClients = await empty.json();
    expect(Array.isArray(initialClients.clients)).toBeTruthy();

    const crossOriginCreate = await request.post("/api/clients", {
      headers: { Origin: "https://evil.example" },
      data: {},
    });
    expect(crossOriginCreate.status()).toBe(403);
    expect(await crossOriginCreate.json()).toMatchObject({ ok: false });

    const invalidPayload = await request.post("/api/clients", {
      data: { clientName: "Only Name" },
    });
    expect(invalidPayload.status()).toBe(400);
    expect(await invalidPayload.json()).toMatchObject({ ok: false });

    await page.goto("/clients/new");
    await expect(page.getByText("new client")).toBeVisible();

    const createButton = page.getByRole("button", { name: /create vault/i });
    await expect(createButton).toBeDisabled();

    const inputs = page.locator("form input:not([type=checkbox])");
    const textareas = page.locator("form textarea");
    const selects = page.locator("form select");

    await inputs.nth(0).fill("Playwright Audit Client");
    await inputs.nth(1).fill("not-a-url");
    await inputs.nth(2).fill("Playwright Audit");
    await inputs.nth(3).fill("SEO automation QA");
    await inputs.nth(4).fill("QA Editorial Team");
    await selects.nth(0).selectOption("Booked calls / lead generation");
    await textareas
      .nth(0)
      .fill("Marketing operators who need automated SEO execution and auditable client setup.");
    await inputs.nth(5).fill("QA");
    await selects.nth(1).selectOption("saas");
    await selects.nth(2).selectOption("United States");
    await selects.nth(3).selectOption("English");
    await selects.nth(4).selectOption("America/New_York");
    await textareas.nth(1).fill("competitor-a.example\ncompetitor-b.example");
    const form = page.locator("form");
    // Playwright 1.60 can hang on the "stable" actionability check for these
    // labels after the form auto-scrolls to the GitHub field, even though the
    // label is visible, topmost, and static. Force only the click; keep the
    // checked assertions below so the interaction is still verified.
    await form.getByText("Search Console", { exact: true }).click({ force: true });
    await form.getByText("GA4", { exact: true }).click({ force: true });
    await expect(form.getByRole("checkbox", { name: "Search Console" })).toBeChecked();
    await expect(form.getByRole("checkbox", { name: "GA4" })).toBeChecked();

    await expect(createButton).toBeEnabled();
    await createButton.click();
    await expect
      .poll(() => inputs.nth(1).evaluate((el) => (el as HTMLInputElement).validationMessage))
      .not.toBe("");

    await inputs.nth(1).fill("https://playwright-audit.example.com");
    await createButton.click();

    await expect(page.getByText("Vault ready")).toBeVisible();
    await expect(page.getByRole("button", { name: /build the brain/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /skip/i })).toBeVisible();

    const list = await request.get("/api/clients");
    const clients = (await list.json()).clients as Array<{ name: string; slug: string }>;
    const created = clients.find((client) => client.name === "Playwright Audit Client");
    expect(created?.slug).toBe("playwright-audit-client");

    const snapshot = await request.get(`/api/clients/${created!.slug}`);
    expect(snapshot.ok()).toBeTruthy();
    expect(await snapshot.json()).toMatchObject({
      client: { slug: created!.slug },
      manifest: {
        site_under_audit: "https://playwright-audit.example.com",
        site_brand: "Playwright Audit",
        niche: "SEO automation QA",
      },
    });

    const lint = await request.get(`/api/clients/${created!.slug}/lint`);
    expect(lint.ok()).toBeTruthy();
    expect(await lint.json()).toMatchObject({ ok: true });

    await page.getByRole("button", { name: /skip/i }).click();
    await expect(page).toHaveURL(new RegExp(`/office\\?client=${created!.slug}`));
    await expect(page.locator("canvas").first()).toBeVisible();
    await expect(
      page.getByText(/build brain · \d+ specialists · \d+ ready/i),
    ).toBeVisible();

    const sidePanel = page.getByRole("complementary");
    await expect(sidePanel.getByRole("button", { name: /^Chat$/i })).toBeVisible();
    await expect(sidePanel.locator("textarea")).toBeVisible();
    await expect(sidePanel.getByRole("button", { name: /send/i })).toBeVisible();

    await sidePanel.getByRole("button", { name: /^Vault$/i }).click();
    await expect(sidePanel.getByPlaceholder(/search title/i)).toBeVisible();
    await expect(sidePanel.getByText(/vault/i).first()).toBeVisible();

    await sidePanel.getByRole("button", { name: /Current Site Findings/i }).click();
    const noteDialog = page.getByRole("dialog", { name: /Current Site Findings/i });
    await expect(noteDialog).toBeVisible();
    await expect(noteDialog.getByText(/link context/i).first()).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: /Current Site Findings/i })).toHaveCount(0);

    const switchTarget = await request.post("/api/clients", {
      data: {
        clientName: "Client Switch Target",
        siteUrl: "https://client-switch.example.com",
        owner: "QA Editorial Team",
        businessType: "saas",
        niche: "SEO office switch testing",
        siteBrand: "Client Switch",
        authorByline: "QA",
        monetizationModel: "Lead generation",
        targetPersona: "Operators validating client switching.",
        primaryCompetitors: ["switch-competitor.example"],
        measurementAccess: ["search-console"],
        githubUrl: "https://github.com/example/switch",
        locale: {
          location_name: "United States",
          language_name: "English",
          timezone: "America/New_York",
        },
      },
    });
    expect(switchTarget.status()).toBe(201);
    const switchBody = (await switchTarget.json()) as { slug: string };

    const clientPicker = page.locator("header button[aria-haspopup=menu]");
    await clientPicker.click();
    await expect(page.getByRole("menuitem", { name: /Client Switch Target/i })).toBeVisible();

    const historyForSwitchedClient = page.waitForResponse((response) =>
      response
        .url()
        .includes(`/api/chat/history?slug=${encodeURIComponent(switchBody.slug)}`),
    );
    await page.getByRole("menuitem", { name: /Client Switch Target/i }).click();
    await expect(page).toHaveURL(new RegExp(`/office\\?client=${switchBody.slug}`));
    await historyForSwitchedClient;
    await expect(clientPicker).toContainText("Client Switch Target");

    await page.goto("/office?client=does-not-exist");
    await expect(page).toHaveURL(/\/office\?client=/);
    await expect(page).not.toHaveURL(/does-not-exist/);
  });
});
