"""Design, privacy, and offline demo invariants for the public workspace."""
from html.parser import HTMLParser
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class IDs(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key == 'id':
                self.ids.append(value)


class FrontendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.site = (ROOT / 'site.html').read_text()
        cls.demo = (ROOT / 'dashboard-preview.html').read_text()
        cls.worker = (ROOT / 'worker.js').read_text()

    def test_controls_unique(self):
        found = IDs()
        found.feed(self.site)
        for name in ('login', 'login-form', 'password', 'login-button', 'app',
                     'refresh', 'logout', 'projects', 'search', 'source',
                     'overlay', 'dialog-title', 'close'):
            self.assertEqual(found.ids.count(name), 1, name)
        self.assertEqual(len(found.ids), len(set(found.ids)))

    def test_demo_exactly_matches_production(self):
        self.assertIn('data-demo="false"', self.site)
        self.assertEqual(self.demo, self.site.replace('data-demo="false"', 'data-demo="true"', 1))

    def test_minimalist_design_language(self):
        for required in ('--bg: #fafaf8', '--ink: #252724', '--line: #e6e8e3',
                         '--green: #39775a', 'Georgia', 'SF Pro Display',
                         'class="brand"', 'class="intro"'):
            self.assertIn(required, self.site)
        for forbidden in ('color-scheme:dark', 'box-shadow:', 'linear-gradient(',
                          'radial-gradient(', 'font-family:Inter', 'Map.groupBy('):
            self.assertNotIn(forbidden, self.site)

    def test_accessible_private_ui(self):
        self.assertIn('role="dialog"', self.site)
        self.assertIn('prefers-reduced-motion: reduce', self.site)
        self.assertIn("credentials: 'same-origin'", self.site)
        self.assertIn('node.textContent = text', self.site)
        self.assertNotIn('innerHTML', self.site)
        self.assertNotIn('https://cdn.', self.site)

    def test_worker_is_built_with_workspace(self):
        self.assertIn('Activity across your projects.', self.worker)
        self.assertIn('Worker', self.worker)
        self.assertNotIn('__EMBEDDED_SITE_HTML__', self.worker)


if __name__ == '__main__':
    unittest.main()
