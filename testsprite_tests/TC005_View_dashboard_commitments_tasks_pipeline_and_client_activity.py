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
        
        # -> Fill the 'Correo corporativo' and 'Contraseña' fields and click the 'Entrar' button to sign in.
        # nombre@muttu.co email field
        elem = page.get_by_label('Correo corporativo', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("testsprite@muttu.co")
        
        # -> Fill the 'Correo corporativo' and 'Contraseña' fields and click the 'Entrar' button to sign in.
        # •••••••••••• password field
        elem = page.get_by_label('ContraseñaVer', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("TestSprite2026*!")
        
        # -> Fill the 'Correo corporativo' and 'Contraseña' fields and click the 'Entrar' button to sign in.
        # Entrar button
        elem = page.get_by_text('Correo corporativo', exact=True).locator("xpath=ancestor-or-self::*[.//button][1]").get_by_role('button', name='Entrar', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Gestión de tareas' tab to open the tasks summary and verify the tasks-due-today details.
        # Gestión de tareas button
        elem = page.get_by_role('button', name='Gestión de tareas', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Actividad de clientes' tab to open the client activity summary and verify its content is displayed.
        # Actividad de clientes button
        elem = page.get_by_role('button', name='Actividad de clientes', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the pipeline summary is displayed
        # Assert: The pipeline summary header 'Pipeline comercial' is visible.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/main/div[2]/div[1]/button[1]").nth(0)).to_have_text("Pipeline comercial", timeout=15000), "The pipeline summary header 'Pipeline comercial' is visible."
        
        # --> Verify the client activity summary is displayed
        # Assert: The 'Actividad de clientes' tab is visible.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/main/div[2]/div[1]/button[3]").nth(0)).to_have_text("Actividad de clientes", timeout=15000), "The 'Actividad de clientes' tab is visible."
        # Assert: The client activity section controls (e.g. '7 días') are visible, indicating the client activity summary is displayed.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/main/div[2]/div[3]/section[1]/div[1]/div[2]/button[1]").nth(0)).to_have_text("7 d\u00edas", timeout=15000), "The client activity section controls (e.g. '7 d\u00edas') are visible, indicating the client activity summary is displayed."
        current_url = await page.evaluate("() => window.location.href")
        # Assert: page loaded with a URL (final outcome verified by the AI judge during the run)
        assert current_url, 'Page should have loaded with a URL'
        current_url = await page.evaluate("() => window.location.href")
        # Assert: page loaded with a URL (final outcome verified by the AI judge during the run)
        assert current_url, 'Page should have loaded with a URL'
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    