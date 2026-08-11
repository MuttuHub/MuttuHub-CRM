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
        
        # -> Fill the email and password fields and click the 'Entrar' button to log in.
        # nombre@muttu.co email field
        elem = page.get_by_label('Correo corporativo', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("testsprite@muttu.co")
        
        # -> Fill the email and password fields and click the 'Entrar' button to log in.
        # •••••••••••• password field
        elem = page.get_by_label('ContraseñaVer', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("TestSprite2026*!")
        
        # -> Fill the email and password fields and click the 'Entrar' button to log in.
        # Entrar button
        elem = page.get_by_text('Correo corporativo', exact=True).locator("xpath=ancestor-or-self::*[.//button][1]").get_by_role('button', name='Entrar', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Reportes' link in the sidebar to open the Reports page.
        # Reportes link
        elem = page.get_by_role('link', name='Reportes', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Excel' button to export the displayed task report and wait for download/UI feedback.
        # Download: Excel button
        elem = page.get_by_role('button', name='Excel', exact=True)
        async with page.expect_download(timeout=30000) as dl_info:
            await elem.click(timeout=10000)
        download = await dl_info.value
        assert download.suggested_filename  # verify file was downloaded
        await download.save_as(f"./downloads/{download.suggested_filename}")
        
        # --> Assertions to verify final state
        
        # --> Verify the task report is displayed
        # Assert: The task report header 'Reporte de tareas del equipo' is visible.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/main/div[2]/div/div[2]").nth(0)).to_contain_text("Reporte de tareas del equipo", timeout=15000), "The task report header 'Reporte de tareas del equipo' is visible."
        # Assert: The report shows the 'TestSprite QA' row in the 'Por persona' table.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/main/div[2]/div/div[2]/div/div[2]/section[2]/div[2]/table/tbody/tr[2]/td[1]").nth(0)).to_have_text("TestSprite QA", timeout=15000), "The report shows the 'TestSprite QA' row in the 'Por persona' table."
        
        # --> Verify the Excel export is initiated
        # Assert: The export completion notification 'Exportación completada: tareas.xlsx' is visible.
        await expect(page.locator("xpath=/html/body/section/ol/li").nth(0)).to_have_text("Exportaci\u00f3n completada: tareas.xlsx", timeout=15000), "The export completion notification 'Exportaci\u00f3n completada: tareas.xlsx' is visible."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    