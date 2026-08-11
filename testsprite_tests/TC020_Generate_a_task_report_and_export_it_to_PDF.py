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
        
        # -> Fill 'testsprite@muttu.co' into the 'Correo corporativo' field, fill the password, and click the 'Entrar' button to log in.
        # nombre@muttu.co email field
        elem = page.get_by_label('Correo corporativo', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("testsprite@muttu.co")
        
        # -> Fill 'testsprite@muttu.co' into the 'Correo corporativo' field, fill the password, and click the 'Entrar' button to log in.
        # •••••••••••• password field
        elem = page.get_by_label('ContraseñaVer', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("TestSprite2026*!")
        
        # -> Fill 'testsprite@muttu.co' into the 'Correo corporativo' field, fill the password, and click the 'Entrar' button to log in.
        # Entrar button
        elem = page.get_by_text('Correo corporativo', exact=True).locator("xpath=ancestor-or-self::*[.//button][1]").get_by_role('button', name='Entrar', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Reportes' link in the left navigation to open the Reports page.
        # Reportes link
        elem = page.get_by_role('link', name='Reportes', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'PDF' button in the report header to export the report to PDF.
        # PDF button
        elem = page.get_by_role('button', name='PDF', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the task report is displayed
        # Assert: The print view shows an 'Imprimir' button.
        await expect(page.locator("xpath=/html/body/main/div[1]/button").nth(0)).to_have_text("Imprimir", timeout=15000), "The print view shows an 'Imprimir' button."
        # Assert: The report displays the 'Persona' table header.
        await expect(page.locator("xpath=/html/body/main/div[2]/section[2]/table/thead/tr").nth(0)).to_contain_text("Persona", timeout=15000), "The report displays the 'Persona' table header."
        
        # --> Verify the PDF export is initiated
        # Assert: The current URL contains '/print/reportes/tareas', confirming the print view (PDF export) was opened.
        await expect(page).to_have_url(re.compile("/print/reportes/tareas"), timeout=15000), "The current URL contains '/print/reportes/tareas', confirming the print view (PDF export) was opened."
        await page.locator("xpath=/html/body/main/div[1]/button").nth(0).scroll_into_view_if_needed()
        # Assert: The 'Imprimir' button is visible on the print view, indicating the PDF export/print flow was initiated.
        await expect(page.locator("xpath=/html/body/main/div[1]/button").nth(0)).to_be_visible(timeout=15000), "The 'Imprimir' button is visible on the print view, indicating the PDF export/print flow was initiated."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    