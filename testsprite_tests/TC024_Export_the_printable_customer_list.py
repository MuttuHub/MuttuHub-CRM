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
        
        # -> Fill the email and password fields and click the 'Entrar' button to sign in.
        # nombre@muttu.co email field
        elem = page.get_by_label('Correo corporativo', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("testsprite@muttu.co")
        
        # -> Fill the email and password fields and click the 'Entrar' button to sign in.
        # •••••••••••• password field
        elem = page.get_by_label('ContraseñaVer', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("TestSprite2026*!")
        
        # -> Fill the email and password fields and click the 'Entrar' button to sign in.
        # Entrar button
        elem = page.get_by_text('Correo corporativo', exact=True).locator("xpath=ancestor-or-self::*[.//button][1]").get_by_role('button', name='Entrar', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Clientes' link in the left sidebar to open the customers list page.
        # Clientes 34 link
        elem = page.get_by_role('link', name='Clientes 34', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'PDF' button to open/export the printable customer list.
        # PDF button
        elem = page.get_by_role('button', name='PDF', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the printable customer list is displayed
        # Assert: The print button labeled 'Imprimir' is visible on the print view.
        await expect(page.locator("xpath=/html/body/main/div/button").nth(0)).to_have_text("Imprimir", timeout=15000), "The print button labeled 'Imprimir' is visible on the print view."
        # Assert: The first client row 'Cliente de prueba para editar (editado)' is present in the printable list.
        await expect(page.locator("xpath=/html/body/main/table/tbody/tr[1]").nth(0)).to_contain_text("Cliente de prueba para editar (editado)", timeout=15000), "The first client row 'Cliente de prueba para editar (editado)' is present in the printable list."
        # Assert: The second client row 'TestSprite Cliente' is present in the printable list.
        await expect(page.locator("xpath=/html/body/main/table/tbody/tr[2]").nth(0)).to_contain_text("TestSprite Cliente", timeout=15000), "The second client row 'TestSprite Cliente' is present in the printable list."
        # Assert: The third client row 'TestSprite Cliente 2026-08-09' is present in the printable list.
        await expect(page.locator("xpath=/html/body/main/table/tbody/tr[3]").nth(0)).to_contain_text("TestSprite Cliente 2026-08-09", timeout=15000), "The third client row 'TestSprite Cliente 2026-08-09' is present in the printable list."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    