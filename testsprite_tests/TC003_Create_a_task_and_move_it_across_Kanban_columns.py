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
        
        # -> Click the 'Tablero' link in the left menu to open the Board
        # Tablero 27 link
        elem = page.get_by_role('link', name='Tablero 27', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Nueva tarea' button to open the create-task form
        # Nueva tarea button
        elem = page.get_by_role('button', name='Nueva tarea', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the 'Título' field with a new task name and click the 'Responsable' dropdown to open the selection list.
        # Ej. Entregar informe trimestral text field
        elem = page.locator('[id="tarea-titulo"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Tarea de prueba TestSprite QA")
        
        # -> Fill the 'Título' field with a new task name and click the 'Responsable' dropdown to open the selection list.
        # Selecciona un responsable ▼ button
        elem = page.locator('[id="base-ui-_r_10_"]')
        await elem.click(timeout=10000)
        
        # -> Select 'TestSprite QA' from the 'Responsable' dropdown and click the 'Crear tarea' button to save the new task.
        # TestSprite QA option
        elem = page.get_by_role('option', name='TestSprite QA', exact=True)
        await elem.click(timeout=10000)
        
        # -> Select 'TestSprite QA' from the 'Responsable' dropdown and click the 'Crear tarea' button to save the new task.
        # Crear tarea button
        elem = page.get_by_role('button', name='Crear tarea', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the task card titled 'Tarea de prueba TestSprite QA' to open its details so it can be moved to the 'En curso' column.
        # Tarea de prueba TestSprite QA — Sin fecha TQ button
        elem = page.get_by_text('Tarea de prueba TestSprite QA — Sin fecha TQ', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the 'Estado' dropdown in the Editar tarea modal so the status options (including 'En curso') become visible.
        # POR_HACER ▼ button
        elem = page.locator('[id="base-ui-_r_1q_"]')
        await elem.click(timeout=10000)
        
        # -> Select 'En curso' from the 'Estado' dropdown and click the 'Guardar cambios' button to update the task status.
        # En curso option
        elem = page.get_by_role('option', name='En curso', exact=True)
        await elem.click(timeout=10000)
        
        # -> Select 'En curso' from the 'Estado' dropdown and click the 'Guardar cambios' button to update the task status.
        # Guardar cambios button
        elem = page.get_by_role('button', name='Guardar cambios', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the task is displayed on the board
        # Assert: The task 'Tarea de prueba TestSprite QA' is visible on the board.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/main/div[2]/div[3]/div[2]/div[2]/div/div").nth(0)).to_contain_text("Tarea de prueba TestSprite QA", timeout=15000), "The task 'Tarea de prueba TestSprite QA' is visible on the board."
        
        # --> Verify the task appears in the new status column
        await page.locator("xpath=/html/body/div[2]/div/div/main/div[2]/div[3]/div[2]/div[2]/div/div").nth(0).scroll_into_view_if_needed()
        # Assert: The task card 'Tarea de prueba TestSprite QA' is visible in the 'En curso' column.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/main/div[2]/div[3]/div[2]/div[2]/div/div").nth(0)).to_be_visible(timeout=15000), "The task card 'Tarea de prueba TestSprite QA' is visible in the 'En curso' column."
        # Assert: The column header is 'En curso'.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/main/div[2]/div[3]/div[2]/div[1]/span[1]/span[2]").nth(0)).to_have_text("En curso", timeout=15000), "The column header is 'En curso'."
        # Assert: The 'En curso' column shows 1 task.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/main/div[2]/div[3]/div[2]/div[1]/span[2]").nth(0)).to_have_text("1", timeout=15000), "The 'En curso' column shows 1 task."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    