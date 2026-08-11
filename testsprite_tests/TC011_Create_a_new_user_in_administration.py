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
        
        # -> Fill 'testsprite@muttu.co' into the 'Correo corporativo' field, fill 'TestSprite2026*!' into the 'Contraseña' field, then click the 'Entrar' button.
        # nombre@muttu.co email field
        elem = page.get_by_label('Correo corporativo', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("testsprite@muttu.co")
        
        # -> Fill 'testsprite@muttu.co' into the 'Correo corporativo' field, fill 'TestSprite2026*!' into the 'Contraseña' field, then click the 'Entrar' button.
        # •••••••••••• password field
        elem = page.get_by_label('ContraseñaVer', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("TestSprite2026*!")
        
        # -> Fill 'testsprite@muttu.co' into the 'Correo corporativo' field, fill 'TestSprite2026*!' into the 'Contraseña' field, then click the 'Entrar' button.
        # Entrar button
        elem = page.get_by_text('Correo corporativo', exact=True).locator("xpath=ancestor-or-self::*[.//button][1]").get_by_role('button', name='Entrar', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Administración' link in the left sidebar to open the administration area.
        # Administración link
        elem = page.get_by_role('link', name='Administración', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the '+ Nuevo usuario' button to open the user creation form
        # Nuevo usuario button
        elem = page.locator('[id="base-ui-_r_h_"]')
        await elem.click(timeout=10000)
        
        # -> Open the 'Rol' dropdown (the control currently showing 'COLABORADOR') to reveal available role options.
        # COLABORADOR ▼ button
        elem = page.locator('[id="base-ui-_r_24_"]')
        await elem.click(timeout=10000)
        
        # -> Select the 'Administrador' option from the 'Rol' dropdown in the 'Nuevo usuario' modal.
        # Administrador option
        elem = page.get_by_role('option', name='Administrador', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the 'Nombre completo' and 'Correo electrónico' fields with unique values, enter a password in 'Contraseña', then click the 'Crear usuario' button.
        # Nombre y apellido text field
        elem = page.locator('[id="nuevo-nombre"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("TestSprite QA User 20260809-0623")
        
        # -> Fill the 'Nombre completo' and 'Correo electrónico' fields with unique values, enter a password in 'Contraseña', then click the 'Crear usuario' button.
        # nombre@muttu.co email field
        elem = page.locator('[id="nuevo-email"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("testsprite+20260809-0623@muttu.co")
        
        # -> Fill the 'Nombre completo' and 'Correo electrónico' fields with unique values, enter a password in 'Contraseña', then click the 'Crear usuario' button.
        # Mínimo 8 caracteres, con letras y números password field
        elem = page.locator('[id="nuevo-password"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("UserPass2026!")
        
        # -> Fill the 'Nombre completo' and 'Correo electrónico' fields with unique values, enter a password in 'Contraseña', then click the 'Crear usuario' button.
        # Crear usuario button
        elem = page.get_by_role('button', name='Crear usuario', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the new user appears in the list
        # Assert: New user name 'TestSprite QA User 20260809-0623' is visible in the users list.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/main/div[2]/div[2]/div[2]/div/table/tbody/tr[1]/td[1]").nth(0)).to_contain_text("TestSprite QA User 20260809-0623", timeout=15000), "New user name 'TestSprite QA User 20260809-0623' is visible in the users list."
        # Assert: New user email 'testsprite+20260809-0623@muttu.co' is visible in the users list.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/main/div[2]/div[2]/div[2]/div/table/tbody/tr[1]/td[1]").nth(0)).to_contain_text("testsprite+20260809-0623@muttu.co", timeout=15000), "New user email 'testsprite+20260809-0623@muttu.co' is visible in the users list."
        
        # --> Verify the user is shown with the assigned role
        # Assert: The new user's name appears in the users table.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/main/div[2]/div[2]/div[2]/div/table/tbody/tr[1]/td[1]").nth(0)).to_contain_text("TestSprite QA User 20260809-0623", timeout=15000), "The new user's name appears in the users table."
        # Assert: The user's role is shown as 'Administrador'.
        await expect(page.locator("xpath=/html/body/div[2]/div/div/main/div[2]/div[2]/div[2]/div/table/tbody/tr[1]/td[2]").nth(0)).to_have_text("Administrador", timeout=15000), "The user's role is shown as 'Administrador'."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    