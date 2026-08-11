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
        
        # -> Fill the email field (placeholder 'nombre@muttu.co') with testsprite@muttu.co, fill the password field (placeholder '••••••••••••') with the provided password, then click the 'Entrar' button to log in.
        # nombre@muttu.co email field
        elem = page.get_by_label('Correo corporativo', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("testsprite@muttu.co")
        
        # -> Fill the email field (placeholder 'nombre@muttu.co') with testsprite@muttu.co, fill the password field (placeholder '••••••••••••') with the provided password, then click the 'Entrar' button to log in.
        # •••••••••••• password field
        elem = page.get_by_label('ContraseñaVer', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("TestSprite2026*!")
        
        # -> Fill the email field (placeholder 'nombre@muttu.co') with testsprite@muttu.co, fill the password field (placeholder '••••••••••••') with the provided password, then click the 'Entrar' button to log in.
        # Entrar button
        elem = page.get_by_text('Correo corporativo', exact=True).locator("xpath=ancestor-or-self::*[.//button][1]").get_by_role('button', name='Entrar', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the printable pipeline report page by navigating to /print/dashboard/pipeline.
        await page.goto("http://localhost:3000/print/dashboard/pipeline")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # --> Assertions to verify final state
        
        # --> Verify the printable pipeline report is displayed
        # Assert: The 'Volver al dashboard' link is visible.
        await expect(page.locator("xpath=/html/body/main/div[1]/div/a").nth(0)).to_have_text("Volver al dashboard", timeout=15000), "The 'Volver al dashboard' link is visible."
        # Assert: The 'Imprimir' button is visible.
        await expect(page.locator("xpath=/html/body/main/div[1]/button").nth(0)).to_have_text("Imprimir", timeout=15000), "The 'Imprimir' button is visible."
        # Assert: The pipeline table header is visible and contains 'Etapa'.
        await expect(page.locator("xpath=/html/body/main/div[2]/table/thead/tr").nth(0)).to_contain_text("Etapa", timeout=15000), "The pipeline table header is visible and contains 'Etapa'."
        
        # --> Verify pipeline summary data is visible
        # Assert: Pipeline table header with 'Etapa' and 'Oportunidades' is visible.
        await expect(page.locator("xpath=/html/body/main/div[2]/table/thead/tr").nth(0)).to_have_text("Etapa\nOportunidades", timeout=15000), "Pipeline table header with 'Etapa' and 'Oportunidades' is visible."
        # Assert: Pipeline stage 'Diseñando propuesta' is visible.
        await expect(page.locator("xpath=/html/body/main/div[2]/table/tbody/tr[1]/td[1]").nth(0)).to_have_text("Dise\u00f1ando propuesta", timeout=15000), "Pipeline stage 'Dise\u00f1ando propuesta' is visible."
        # Assert: The pipeline count for 'Diseñando propuesta' is visible and shows 0.
        await expect(page.locator("xpath=/html/body/main/div[2]/table/tbody/tr[1]/td[2]").nth(0)).to_have_text("0", timeout=15000), "The pipeline count for 'Dise\u00f1ando propuesta' is visible and shows 0."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    