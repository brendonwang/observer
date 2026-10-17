"""Optional real-browser regression checks (requires Playwright and Chromium)."""
import asyncio
import os
import shutil
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
try:
    from playwright.async_api import async_playwright
except ImportError:
    async_playwright = None

CHROMIUM = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('google-chrome')
SHOT_DIR = Path(os.environ.get('OBSERVER_SCREENSHOT_DIR', tempfile.gettempdir()))


async def preview_checks(browser):
    page = await browser.new_page(viewport={'width': 390, 'height': 844})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    await page.set_content((ROOT / 'dashboard-preview.html').read_text(), wait_until='domcontentloaded')
    await page.locator('button.thread').first.wait_for()
    assert await page.locator('button.thread').count() == 4
    assert not await page.evaluate('document.documentElement.scrollWidth > innerWidth')
    assert 'Threads' in await page.locator('.main-head h1').inner_text()
    await page.screenshot(path=str(SHOT_DIR / 'observer-reviewed-mobile.png'))
    await page.locator('button.thread').nth(1).click()
    assert await page.locator('.detail-title').inner_text() == 'Implement authentication flow'
    assert await page.locator('.list-panel').is_hidden()
    assert await page.locator('.response a[href="https://example.com/"]').count() == 1
    await page.locator('.disclosure summary').click()
    assert await page.locator('.disclosure').evaluate('(e) => e.open')
    assert not errors, errors
    await page.screenshot(path=str(SHOT_DIR / 'observer-reviewed-mobile-detail.png'))
    await page.locator('.mobile-back').click()
    await page.wait_for_timeout(150)
    assert await page.locator('.list-panel').is_visible()
    assert not errors, errors
    await page.close()


async def hosted_checks(browser):
    page = await browser.new_page(viewport={'width': 1250, 'height': 840})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    html = (ROOT / 'site.html').read_text()
    now = 1792195200000
    tid = '3b9aa460-78e9-4e8f-a693-fd91d0000002'
    events = [{'at': now, 'kind': 'start', 'label': 'Codex started a turn'}]
    state = {'devices': [{'last_seen_at': 9999999999999}], 'threads': [{
        'id': tid, 'title': 'Implement auth', 'project': 'api-service',
        'status': 'completed', 'updated_at': 9999999999999, 'events': events,
        'final_response': 'Done. [Open preview](https://example.com/demo)', 'has_preview': False,
    }]}
    signed_in = False
    force_logout_error = False
    async def handler(route):
        nonlocal signed_in
        if route.request.url.endswith('/api/state'):
            await route.fulfill(status=200 if signed_in else 401, content_type='application/json', body=__import__('json').dumps(state if signed_in else {'error': 'Unauthorized'}))
        elif route.request.url.endswith('/api/login'):
            signed_in = True
            await route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
        elif route.request.url.endswith('/api/logout'):
            if force_logout_error:
                await route.fulfill(status=500, content_type='application/json', body='{"error":"Unavailable"}')
            else:
                signed_in = False
                await route.fulfill(status=200, content_type='application/json', body='{"ok":true}')
        else:
            await route.fulfill(status=200, content_type='text/html', body=html)
    await page.route('http://127.0.0.1:8765/**', handler)
    html = html.replace('<head>', '<head><base href="http://127.0.0.1:8765/"><script>history.replaceState = () => {};</script>', 1)
    await page.set_content(html)
    await page.locator('#password').fill('sample')
    await page.locator('#login-button').click()
    await page.locator('button.thread').first.wait_for()
    await page.locator('button.thread').first.click()
    assert await page.locator('.response a').inner_text() == 'Open preview'
    assert await page.locator('.response a').get_attribute('href') == 'https://example.com/demo'
    await page.locator('.disclosure summary').click()
    assert await page.locator('.disclosure').evaluate('(e) => e.open')
    await page.locator('.detail-header').evaluate('(e) => {e.dataset.testSentinel = "persist";}')
    state['threads'][0]['events'].append({'at': now+3000, 'kind':'tool','label':'Tool: apply_patch'})
    state['threads'][0]['updated_at'] = 9999999999998
    await page.locator('#refresh').click()
    await page.get_by_text('Editing files').first.wait_for()
    assert await page.locator('.disclosure').evaluate('(e) => e.open'), 'Activity collapsed after refresh'
    assert await page.locator('.detail-header').get_attribute('data-test-sentinel') == 'persist', 'Thread replaced during refresh'
    assert await page.locator('.response a').count() == 1
    await page.screenshot(path=str(SHOT_DIR / 'observer-reviewed-desktop.png'))
    force_logout_error = True
    await page.locator('#logout').click()
    await page.get_by_text("Couldn't sign out. Try again.").wait_for()
    assert await page.locator('#app-shell').is_visible(), 'Logout failure incorrectly hid dashboard'
    force_logout_error = False
    await page.locator('#logout').click()
    await page.locator('#auth-screen').wait_for(state='visible')
    assert not errors, errors
    await page.close()


async def main():
    async with async_playwright() as api:
        browser = await api.chromium.launch(executable_path=CHROMIUM, headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
        try:
            await preview_checks(browser)
            await hosted_checks(browser)
            print('Browser checks passed: mobile navigation, URLs, refresh stability, logout errors, overflow')
        finally:
            await browser.close()

if __name__ == '__main__':
    if not async_playwright or not CHROMIUM:
        print('Playwright or Chromium unavailable; skipping browser tests')
    else:
        asyncio.run(main())
