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
        
        # -> Fill the Correo corporativo field with 'testsprite@muttu.co', fill the Contraseña field with the provided password, then click the 'Entrar' button to sign in.
        # nombre@muttu.co email field
        elem = page.get_by_label('Correo corporativo', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("testsprite@muttu.co")
        
        # -> Fill the Correo corporativo field with 'testsprite@muttu.co', fill the Contraseña field with the provided password, then click the 'Entrar' button to sign in.
        # •••••••••••• password field
        elem = page.get_by_label('ContraseñaVer', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("TestSprite2026*!")
        
        # -> Fill the Correo corporativo field with 'testsprite@muttu.co', fill the Contraseña field with the provided password, then click the 'Entrar' button to sign in.
        # Entrar button
        elem = page.get_by_text('Correo corporativo', exact=True).locator("xpath=ancestor-or-self::*[.//button][1]").get_by_role('button', name='Entrar', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Documentos' link in the left sidebar to open the Documents page.
        # Documentos 118 link
        elem = page.get_by_role('link', name='Documentos 118', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Abrir ficha de TestSprite QA Document' button to open the document details.
        # Abrir ficha de TestSprite QA Document button
        elem = page.get_by_role('button', name='Abrir ficha de TestSprite QA Document', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Descargar v1' button in the document details dialog to download the single document.
        # Download: Descargar v1 button
        elem = page.get_by_role('button', name='Descargar v1', exact=True)
        async with page.expect_download(timeout=30000) as dl_info:
            await elem.click(timeout=10000)
        download = await dl_info.value
        assert download.suggested_filename  # verify file was downloaded
        await download.save_as(f"./downloads/{download.suggested_filename}")
        
        # -> Search the page for the word 'Descarg' to find any download confirmation, then close the document detail modal by clicking the 'Close' button.
        # Close button
        elem = page.get_by_role('button', name='Close', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Descargar TestSprite QA Document' button in the document row to initiate a single-document download, then search the page for 'Descarg' to check for a confirmation message.
        # Download: Descargar TestSprite QA Document button
        elem = page.get_by_role('button', name='Descargar TestSprite QA Document', exact=True)
        async with page.expect_download(timeout=30000) as dl_info:
            await elem.click(timeout=10000)
        download = await dl_info.value
        assert download.suggested_filename  # verify file was downloaded
        await download.save_as(f"./downloads/{download.suggested_filename}")
        
        # -> Click the 'Descargar TestSprite QA Document' button and check the page for a download confirmation message.
        # Download: Descargar TestSprite QA Document button
        elem = page.get_by_role('button', name='Descargar TestSprite QA Document', exact=True)
        async with page.expect_download(timeout=30000) as dl_info:
            await elem.click(timeout=10000)
        download = await dl_info.value
        assert download.suggested_filename  # verify file was downloaded
        await download.save_as(f"./downloads/{download.suggested_filename}")
        
        # -> Click the 'Descargar TestSprite QA Document' button and check the page for a download confirmation message.
        # Seleccionar TestSprite QA Document checkbox
        elem = page.locator('[id="base-ui-_r_14_"]')
        await elem.click(timeout=10000)
        
        # -> Click the 'Descargar TestSprite QA Document' button and check the page for a download confirmation message.
        # Seleccionar... checkbox
        elem = page.locator('[id="base-ui-_r_17_"]')
        await elem.click(timeout=10000)
        
        # -> Click the 'Descargar' button for 'TestSprite QA Document' and check for any visible download confirmation on the page.
        # Download: Descargar TestSprite QA Document button
        elem = page.get_by_role('button', name='Descargar TestSprite QA Document', exact=True)
        async with page.expect_download(timeout=30000) as dl_info:
            await elem.click(timeout=10000)
        download = await dl_info.value
        assert download.suggested_filename  # verify file was downloaded
        await download.save_as(f"./downloads/{download.suggested_filename}")
        
        # -> Click the 'Descargar' button for 'TestSprite QA Document' and check for any visible download confirmation on the page.
        # Descargar selección (.zip) button
        elem = page.get_by_role('button', name='Descargar selección (.zip)', exact=True)
        await elem.click(timeout=10000)
        
        # -> Unselect the 'TestSprite QA Document' checkbox, then click the 'Descargar' button for 'TestSprite QA Document' and look for a download confirmation message on the page.
        # Seleccionar TestSprite QA Document checkbox
        elem = page.locator('[id="base-ui-_r_14_"]')
        await elem.click(timeout=10000)
        
        # -> Unselect the 'TestSprite QA Document' checkbox, then click the 'Descargar' button for 'TestSprite QA Document' and look for a download confirmation message on the page.
        # Download: Descargar TestSprite QA Document button
        elem = page.get_by_role('button', name='Descargar TestSprite QA Document', exact=True)
        async with page.expect_download(timeout=30000) as dl_info:
            await elem.click(timeout=10000)
        download = await dl_info.value
        assert download.suggested_filename  # verify file was downloaded
        await download.save_as(f"./downloads/{download.suggested_filename}")
        
        # -> Click the 'Descargar TestSprite QA Document' button to initiate a single-document download and verify UI feedback in the next step.
        # Download: Descargar TestSprite QA Document button
        elem = page.get_by_role('button', name='Descargar TestSprite QA Document', exact=True)
        async with page.expect_download(timeout=30000) as dl_info:
            await elem.click(timeout=10000)
        download = await dl_info.value
        assert download.suggested_filename  # verify file was downloaded
        await download.save_as(f"./downloads/{download.suggested_filename}")
        
        # -> Click the 'Descargar TestSprite QA Document' button to trigger a single-document download, then search the page for 'Descarg' to verify a download confirmation.
        # Download: Descargar TestSprite QA Document button
        elem = page.get_by_role('button', name='Descargar TestSprite QA Document', exact=True)
        async with page.expect_download(timeout=30000) as dl_info:
            await elem.click(timeout=10000)
        download = await dl_info.value
        assert download.suggested_filename  # verify file was downloaded
        await download.save_as(f"./downloads/{download.suggested_filename}")
        
        # -> Click the 'Descargar TestSprite QA Document' button to trigger a single-document download and verify UI feedback by searching the page for 'Descarg'.
        # Download: Descargar TestSprite QA Document button
        elem = page.get_by_role('button', name='Descargar TestSprite QA Document', exact=True)
        async with page.expect_download(timeout=30000) as dl_info:
            await elem.click(timeout=10000)
        download = await dl_info.value
        assert download.suggested_filename  # verify file was downloaded
        await download.save_as(f"./downloads/{download.suggested_filename}")
        
        # --> Assertions to verify final state
        
        # --> Verify the document download is initiated
        await page.locator("xpath=/html/body/div[2]/div/div/main/div[2]/section[2]/div[1]/div/table/tbody/tr[1]/td[5]/div/button[1]").nth(0).scroll_into_view_if_needed()
        # Assert: The per-row 'Descargar' button for the document is visible, allowing the download to be initiated.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/main/div[2]/section[2]/div[1]/div/table/tbody/tr[1]/td[5]/div/button[1]").nth(0)).to_be_visible(timeout=15000), "The per-row 'Descargar' button for the document is visible, allowing the download to be initiated."
        # Assert: The page displays the text 'Descarg', indicating UI feedback for a download action was shown.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/main/div[2]/div[2]/div/button[1]").nth(0)).to_contain_text("Descarg", timeout=15000), "The page displays the text 'Descarg', indicating UI feedback for a download action was shown."
        
        # --> Verify the ZIP download is initiated
        await page.locator("xpath=/html/body/div[2]/div/div/main/div[2]/div[2]/div/button[1]").nth(0).scroll_into_view_if_needed()
        # Assert: The 'Descargar selección (.zip)' button is visible.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/main/div[2]/div[2]/div/button[1]").nth(0)).to_be_visible(timeout=15000), "The 'Descargar selecci\u00f3n (.zip)' button is visible."
        # Assert: A notification containing 'Descarg' is visible, indicating the ZIP download was initiated.
        await expect(page.locator("xpath=/html/body/section").nth(0)).to_contain_text("Descarg", timeout=15000), "A notification containing 'Descarg' is visible, indicating the ZIP download was initiated."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    