"""Static invariants for the mobile-first, dependency-free UI."""
from html.parser import HTMLParser
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class IDs(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if 'id' in attributes:
            self.ids.append(attributes['id'])


class FrontendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.site = (ROOT / 'site.html').read_text()
        cls.demo = (ROOT / 'dashboard-preview.html').read_text()
        cls.worker = (ROOT / 'worker.js').read_text()

    def test_controls_exist_once(self):
        parsed = IDs()
        parsed.feed(self.site)
        for name in ('app-shell', 'auth-screen', 'auth-form', 'password', 'login-button',
                     'logout', 'refresh', 'session-list', 'detail', 'search',
                     'connection-text', 'error-notice'):
            self.assertEqual(parsed.ids.count(name), 1, name)
        self.assertEqual(len(parsed.ids), len(set(parsed.ids)))

    def test_demo_is_built_from_same_source(self):
        self.assertEqual(self.demo, self.site.replace('data-demo="false"', 'data-demo="true"'))

    def test_mobile_navigation_and_accessibility(self):
        self.assertIn('body:not(.detail-open) .detail{display:none}', self.site)
        self.assertIn('body.detail-open .main-head,body.detail-open .list-panel{display:none}', self.site)
        self.assertIn('prefers-reduced-motion:reduce', self.site)
        self.assertIn('aria-label="Search threads"', self.site)
        self.assertIn("window.addEventListener('popstate'", self.site)

    def test_no_clutter_or_external_dependencies(self):
        self.assertNotIn('class="rail"', self.site)
        self.assertNotIn('class="metrics"', self.site)
        self.assertNotIn('radial-gradient(', self.site)
        self.assertNotIn('box-shadow:', self.site)
        self.assertNotIn('https://cdn.', self.site)
        self.assertNotIn('Only configured data leaves your Mac', self.site)
        self.assertNotIn('thread-count', self.site)

    def test_worker_bundles_current_frontend(self):
        self.assertIn('Codex thread monitor', self.worker)
        self.assertIn('No response synced', self.worker)


if __name__ == '__main__':
    unittest.main()
