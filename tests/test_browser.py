"""Optional browser smoke tests for the project workspace and private login."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sync_playwright = None


def run():
    if sync_playwright is None:
        print("Playwright not installed; skipping browser smoke tests")
        return
    demo = (ROOT / "dashboard-preview.html").read_text()
    live = (ROOT / "site.html").read_text()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            for width, height in [(1280, 850), (390, 844)]:
                page = browser.new_page(viewport={"width":width, "height":height})
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.set_content(demo, wait_until="load")
                page.locator(".activity").first.wait_for()
                assert page.locator(".project").count() == 2
                assert page.locator(".activity").count() == 5
                assert page.locator("#heading").inner_text() == "Projects"
                assert page.locator("#running").inner_text() == "1"
                assert page.locator("body").evaluate(
                    "(e) => getComputedStyle(e).backgroundColor") == "rgb(250, 250, 248)"
                assert not page.evaluate(
                    "document.documentElement.scrollWidth > window.innerWidth")
                page.locator(".activity").first.click()
                assert page.locator('[role="dialog"]').is_visible()
                page.keyboard.press("Escape")
                assert page.locator("#overlay").is_hidden()
                page.locator('[data-tab="activity"]').click()
                assert page.locator(".project").count() == 1
                page.locator("#search").fill("npm")
                assert page.locator(".activity").count() == 1
                assert not errors, errors
                page.close()

            state = {
                "devices":[{"id":"mac-test", "last_seen_at":9999999999999}],
                "threads":[
                    {"id":"parent-123456", "project":"website", "title":"Build UI",
                     "source":"Codex", "status":"working", "updated_at":1792195200000},
                    {"id":"child-123456", "project":"website", "title":"Subagent task",
                     "source":"Codex", "parent_id":"parent-123456", "agent_label":"Layout",
                     "status":"completed", "updated_at":1792195200000},
                    {"id":"review-123456", "project":"website", "title":"Guardian review",
                     "source":"Codex", "status":"completed", "updated_at":1792195200000},
                    {"id":"job-123456", "project":"website", "title":"Unit tests",
                     "source":"Terminal", "status":"failed", "updated_at":1792195200000},
                ],
            }
            mock = """<script>
window.__loggedIn = false;
window.fetch = async (url, opts = {}) => {
  const route = String(url);
  if(route === '/api/login') {
    window.__loggedIn = JSON.parse(opts.body || '{}').password === 'demo-secret';
    return new Response('{}', {status:window.__loggedIn ? 200 : 401});
  }
  if(route === '/api/logout') {
    window.__loggedIn = false;
    return new Response('{}',{status:200});
  }
  if(route === '/api/state') {
    return new Response(window.__loggedIn ? JSON.stringify(window.__state) : '{}',
      {status:window.__loggedIn ? 200 : 401});
  }
  return new Response('{}',{status:404});
};
window.__state = __STATE__;
</script>""".replace("__STATE__", json.dumps(state))
            html = live.replace('<script nonce="__NONCE__">',
                                mock + '<script nonce="__NONCE__">', 1)
            page = browser.new_page(viewport={"width":1120,"height":840})
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.set_content(html, wait_until="load")
            page.locator("#login").wait_for(state="visible")
            page.locator("#password").fill("demo-secret")
            page.locator("#login-button").click()
            page.locator("#app").wait_for(state="visible")
            assert page.locator(".activity").count() == 2  # subagents and Guardian hidden
            page.locator(".activity").first.click()
            page.get_by_text("Subagents", exact=True).wait_for()
            page.locator(".subtask").first.click()
            assert page.locator("#dialog-title").inner_text() == "Subagent task"
            page.locator(".back-link").click()
            assert page.locator("#dialog-title").inner_text() == "Build UI"
            page.keyboard.press("Escape")
            page.locator("#logout").click()
            page.locator("#login").wait_for(state="visible")
            assert page.locator("#app").is_hidden()
            assert not errors, errors
            page.close()
        finally:
            browser.close()
    print("Browser checks passed for demo, mobile, auth, projects and subagents")


if __name__ == "__main__":
    run()
