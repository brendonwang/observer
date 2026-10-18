import json
import sys
import unittest
import urllib.error
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import service_adapter


class Response:
    status = 204
    def __enter__(self): return self
    def __exit__(self, *args): return False


class ServiceTests(unittest.TestCase):
    def test_endpoint_restrictions(self):
        self.assertTrue(service_adapter.allowed('http://localhost:3000/health'))
        self.assertTrue(service_adapter.allowed('https://example.com/health'))
        for url in ('http://example.com', 'ftp://localhost', 'http://user:pass@localhost/',
                    'https://example.com/#fragment', 'file:///etc/passwd', 'http://[::1]:oops/'):
            self.assertFalse(service_adapter.allowed(url), url)

    def test_success_and_error_are_preserved(self):
        item = {'name':'Web app', 'url':'http://localhost:3000/health', 'project':'observer'}
        healthy = service_adapter.monitor_service(item, opener=lambda *a, **kw: Response())
        self.assertEqual(healthy['status'], 'completed')
        self.assertEqual(healthy['project'], 'observer')
        self.assertTrue(healthy['id'].startswith('service-'))

        def redirect(*args, **kwargs):
            raise urllib.error.HTTPError(item['url'], 302, 'Redirect', {}, None)
        self.assertEqual(service_adapter.monitor_service(item, opener=redirect)['status'], 'failed')

        def unavailable(*args, **kwargs):
            raise urllib.error.URLError('Refused')
        self.assertEqual(service_adapter.monitor_service(item, opener=unavailable)['status'], 'failed')

    def test_metadata_mode_removes_details(self):
        with TemporaryDirectory() as directory:
            config = Path(directory) / 'services.json'
            config.write_text(json.dumps([{'name':'Web','url':'http://localhost:3000'}]))
            with patch.object(service_adapter, 'monitor_service', return_value={'final_response':'HTTP 200', 'status':'completed'}):
                self.assertEqual(service_adapter.gather_services(config,content_mode='metadata')[0]['final_response'], '')

if __name__ == '__main__':
    unittest.main()
