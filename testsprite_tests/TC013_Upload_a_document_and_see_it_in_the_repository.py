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
        
        # -> Fill the 'Correo corporativo' and 'Contraseña' fields and click the 'Entrar' button to log in.
        # nombre@muttu.co email field
        elem = page.get_by_label('Correo corporativo', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("testsprite@muttu.co")
        
        # -> Fill the 'Correo corporativo' and 'Contraseña' fields and click the 'Entrar' button to log in.
        # •••••••••••• password field
        elem = page.get_by_label('ContraseñaVer', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("TestSprite2026*!")
        
        # -> Fill the 'Correo corporativo' and 'Contraseña' fields and click the 'Entrar' button to log in.
        # Entrar button
        elem = page.get_by_text('Correo corporativo', exact=True).locator("xpath=ancestor-or-self::*[.//button][1]").get_by_role('button', name='Entrar', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Documentos' link in the left navigation to open the document repository page.
        # Documentos 118 link
        elem = page.get_by_role('link', name='Documentos 118', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Subir documento' button to open the new document upload form.
        # Subir documento button
        elem = page.get_by_role('button', name='Subir documento', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the category dropdown labeled 'Selecciona una categoría' after uploading a PDF and filling the Title field.
        # file upload
        elem = page.locator('xpath=/html/body/div[3]/div[3]/div/div[2]/input')
        await elem.wait_for(state="attached", timeout=10000)
        if await elem.evaluate("e => e.tagName === 'INPUT' && (e.type || '').toLowerCase() === 'file'"):
            await elem.set_input_files("./fixtures/test-document.pdf")
        else:
            await elem.wait_for(state="visible", timeout=10000)
            async with page.expect_file_chooser() as fc_info:
                await elem.click()
            chooser = await fc_info.value
            await chooser.set_files("./fixtures/test-document.pdf")
        
        # -> Open the category dropdown labeled 'Selecciona una categoría' after uploading a PDF and filling the Title field.
        # Nombre del documento text field
        elem = page.locator('[id="doc-titulo"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("TestSprite QA Document")
        
        # -> Open the category dropdown labeled 'Selecciona una categoría' after uploading a PDF and filling the Title field.
        # Selecciona una categoría ▼ button
        elem = page.locator('[id="base-ui-_r_1c_"]')
        await elem.click(timeout=10000)
        
        # -> Select the 'Comercial' option from the 'Categoría' dropdown in the upload modal.
        # Comercial option
        elem = page.get_by_role('option', name='Comercial', exact=True)
        await elem.click(timeout=10000)
        
        # -> Add the tag 'qa-test' in the 'Etiquetas' field and open the 'Cliente vinculado' dropdown.
        # Agregar etiqueta text field
        elem = page.locator('[id="base-ui-_r_1f_"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("qa-test")
        
        # -> Add the tag 'qa-test' in the 'Etiquetas' field and open the 'Cliente vinculado' dropdown.
        # Sin cliente ▼ button
        elem = page.locator('[id="base-ui-_r_1g_"]')
        await elem.click(timeout=10000)
        
        # -> Select the 'Sin cliente' option from the 'Cliente vinculado' dropdown and click the 'Subir' button to upload the document.
        # Sin cliente option
        elem = page.get_by_role('option', name='Sin cliente', exact=True)
        await elem.click(timeout=10000)
        
        # -> Select the 'Sin cliente' option from the 'Cliente vinculado' dropdown and click the 'Subir' button to upload the document.
        # Subir button
        elem = page.get_by_role('button', name='Subir', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the document details by clicking the 'Abrir ficha de TestSprite QA Document' button to verify the document metadata.
        # Abrir ficha de TestSprite QA Document button
        elem = page.get_by_role('button', name='Abrir ficha de TestSprite QA Document', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the uploaded document is displayed in the repository
        # Assert: The uploaded document 'TestSprite QA Document' is visible in the repository.
        await expect(page.locator("xpath=/html/body/div[4]").nth(0)).to_contain_text("TestSprite QA Document", timeout=15000), "The uploaded document 'TestSprite QA Document' is visible in the repository."
        
        # --> Verify the new document metadata is visible
        # Assert: Document title 'TestSprite QA Document' is visible in the document details.
        await expect(page.locator("xpath=/html/body/div[4]/div[3]").nth(0)).to_contain_text("TestSprite QA Document", timeout=15000), "Document title 'TestSprite QA Document' is visible in the document details."
        # Assert: Document category 'Comercial' is visible in the document details.
        await expect(page.locator("xpath=/html/body/div[4]/div[3]").nth(0)).to_contain_text("Comercial", timeout=15000), "Document category 'Comercial' is visible in the document details."
        # Assert: Document tag 'qa-test' is visible in the document details.
        await expect(page.locator("xpath=/html/body/div[4]/div[3]").nth(0)).to_contain_text("qa-test", timeout=15000), "Document tag 'qa-test' is visible in the document details."
        # Assert: Document author 'TestSprite QA' is visible in the document details.
        await expect(page.locator("xpath=/html/body/div[4]/div[3]").nth(0)).to_contain_text("TestSprite QA", timeout=15000), "Document author 'TestSprite QA' is visible in the document details."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    