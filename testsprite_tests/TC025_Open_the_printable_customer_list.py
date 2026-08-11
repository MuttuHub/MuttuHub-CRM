import asyncio
import re
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None

    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()

        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",
                "--disable-dev-shm-usage",
                "--ipc=host",
                "--single-process"
            ],
        )

        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        # Wider default timeout to match the agent's DOM-stability budget;
        # auto-waiting Playwright APIs (expect, locator.wait_for) inherit this.
        context.set_default_timeout(15000)

        # Open a new page in the browser context
        page = await context.new_page()

        # Interact with the page elements to simulate user flow
        # -> navigate
        await page.goto("http://localhost:3000/login")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Click the 'Entrar' button on the login form after filling the corporate email and password fields to sign in.
        # nombre@muttu.co email field
        elem = page.get_by_label('Correo corporativo', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("testsprite@muttu.co")
        
        # -> Click the 'Entrar' button on the login form after filling the corporate email and password fields to sign in.
        # •••••••••••• password field
        elem = page.get_by_label('ContraseñaVer', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("TestSprite2026*!")
        
        # -> Click the 'Entrar' button on the login form after filling the corporate email and password fields to sign in.
        # Entrar button
        elem = page.get_by_text('Correo corporativo', exact=True).locator("xpath=ancestor-or-self::*[.//button][1]").get_by_role('button', name='Entrar', exact=True)
        await elem.click(timeout=10000)
        
        # -> Navigate to the printable customer list page by going to the URL '/print/clientes' and observe whether the printable customer list and customer entries are displayed.
        await page.goto("http://localhost:3000/print/clientes")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # --> Assertions to verify final state
        
        # --> Verify the printable customer list is displayed
        await page.locator("xpath=/html/body/main/div/button").nth(0).scroll_into_view_if_needed()
        # Assert: The print button 'Imprimir' is visible, indicating the printable view UI is present.
        await expect(page.locator("xpath=/html/body/main/div/button").nth(0)).to_be_visible(timeout=15000), "The print button 'Imprimir' is visible, indicating the printable view UI is present."
        await page.locator("xpath=/html/body/main/table/thead/tr").nth(0).scroll_into_view_if_needed()
        # Assert: The table header is visible, confirming the printable customer list columns are shown.
        await expect(page.locator("xpath=/html/body/main/table/thead/tr").nth(0)).to_be_visible(timeout=15000), "The table header is visible, confirming the printable customer list columns are shown."
        await page.locator("xpath=/html/body/main/table/tbody/tr[1]/td[1]").nth(0).scroll_into_view_if_needed()
        # Assert: At least one customer entry is visible in the printable list.
        await expect(page.locator("xpath=/html/body/main/table/tbody/tr[1]/td[1]").nth(0)).to_be_visible(timeout=15000), "At least one customer entry is visible in the printable list."
        
        # --> Verify customer entries are visible
        # Assert: Verify the customer 'Cliente de prueba para editar (editado)' is visible in the list.
        await expect(page.locator("xpath=/html/body/main/table/tbody/tr[1]/td[1]").nth(0)).to_contain_text("Cliente de prueba para editar (editado)", timeout=15000), "Verify the customer 'Cliente de prueba para editar (editado)' is visible in the list."
        # Assert: Verify the customer 'TestSprite Cliente' is visible in the list.
        await expect(page.locator("xpath=/html/body/main/table/tbody/tr[2]/td[1]").nth(0)).to_contain_text("TestSprite Cliente", timeout=15000), "Verify the customer 'TestSprite Cliente' is visible in the list."
        # Assert: Verify the customer 'TestSprite Cliente 2026-08-09' is visible in the list.
        await expect(page.locator("xpath=/html/body/main/table/tbody/tr[3]/td[1]").nth(0)).to_contain_text("TestSprite Cliente 2026-08-09", timeout=15000), "Verify the customer 'TestSprite Cliente 2026-08-09' is visible in the list."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    