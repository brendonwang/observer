import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import agent

THREAD_ID = '54f114f4-aaaa-4e12-8888-000000000001'


class AgentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.dir = Path(self.temp.name)
        self.root = self.dir / 'sessions'
        self.root.mkdir()
        self.path = self.root / f'rollout-2026-10-16T21-00-00-{THREAD_ID}.jsonl'
        self.index = self.dir / 'session_index.jsonl'
        self.index.write_text(json.dumps({'id': THREAD_ID, 'thread_name': 'Fix testing pipeline'}) + '\n')

    def tearDown(self):
        self.temp.cleanup()

    def write_events(self, *events):
        self.path.write_text('\n'.join(json.dumps(e) for e in events) + '\n')

    def row(self, typ, payload):
        return {'type': typ, 'timestamp': '2026-10-16T21:10:00Z', 'payload': payload}

    def test_completed_session_and_no_reasoning_exposure(self):
        self.write_events(
            self.row('session_meta', {'type':'session_meta','cwd':'/Users/abc/projects/website'}),
            self.row('event_msg', {'type':'task_started'}),
            self.row('event_msg', {'type':'agent_reasoning','text':'Do not disclose private reasoning'}),
            self.row('response_item', {'type':'function_call','name':'apply_patch','arguments':'SECRET'}),
            self.row('event_msg', {'type':'agent_message','message':'Built the landing page. https://example.com'}),
            self.row('event_msg', {'type':'task_complete'}),
        )
        result = agent.gather_sessions(self.root, self.index, content_mode='final')
        self.assertEqual(len(result), 1)
        item = result[0]
        self.assertEqual(item['id'], THREAD_ID)
        self.assertEqual(item['title'], 'Fix testing pipeline')
        self.assertEqual(item['project'], 'website')
        self.assertEqual(item['status'], 'completed')
        self.assertIn('Built the landing page', item['final_response'])
        self.assertNotIn('SECRET', json.dumps(item))
        self.assertNotIn('Do not disclose', json.dumps(item))
        self.assertIn('Tool: apply_patch', json.dumps(item))

    def test_new_turn_does_not_show_stale_completed_response(self):
        self.write_events(
            self.row('event_msg', {'type':'task_started'}),
            self.row('event_msg', {'type':'agent_message','message':'Old answer'}),
            self.row('event_msg', {'type':'task_complete'}),
            self.row('event_msg', {'type':'task_started'}),
            self.row('event_msg', {'type':'agent_message','message':'Working on the new request'}),
        )
        item = agent.gather_sessions(self.root, self.index, content_mode='final')[0]
        self.assertEqual(item['status'], 'working')
        self.assertEqual(item['final_response'], '')

    def test_metadata_only_default(self):
        self.write_events(self.row('event_msg', {'type':'agent_message','message':'confidential details'}),
                          self.row('event_msg', {'type':'task_complete'}))
        item = agent.gather_sessions(self.root, self.index)[0]
        self.assertEqual(item['final_response'], '')
        self.assertNotIn('confidential', json.dumps(item))

    def test_truncated_last_record_ignored(self):
        self.path.write_bytes((json.dumps(self.row('event_msg',{'type':'task_started'})) + '\n{"bad":').encode())
        item = agent.gather_sessions(self.root, self.index)[0]
        self.assertEqual(item['status'], 'working')

    def test_old_active_session_is_quiet(self):
        oldtime = int(time.time()) - 600
        # timestamp older than file mtime (may be today), then alter file time.
        self.write_events({'type':'event_msg', 'timestamp':'2020-01-01T00:00:00Z', 'payload':{'type':'task_started'}})
        os.utime(self.path, (oldtime,oldtime))
        item = agent.gather_sessions(self.root, self.index)[0]
        self.assertEqual(item['status'], 'quiet')

    def test_preview_only_from_explicit_folder_with_signature(self):
        images = self.dir / 'allowed'
        images.mkdir()
        screenshot = images / f'{THREAD_ID}.png'
        screenshot.write_bytes(b'\x89PNG\r\n\x1a\n' + b'abc')
        output = agent.preview_file(images, THREAD_ID)
        self.assertEqual(output[1], 'image/png')
        screenshot.write_bytes(b'<script>malicious</script>')
        self.assertIsNone(agent.preview_file(images, THREAD_ID))
        screenshot.unlink()
        screenshot.symlink_to(self.index)
        self.assertIsNone(agent.preview_file(images, THREAD_ID))

    def test_https_required(self):
        with self.assertRaises(ValueError):
            agent.validate_endpoint('http://example.com')
        self.assertEqual(agent.validate_endpoint('https://abc.workers.dev/'), 'https://abc.workers.dev')

    def test_config_file_is_private(self):
        config = self.dir / 'my-config.json'
        obj={'endpoint':'https://abc.workers.dev','agent_token':'x'*40,'device_id':'mac-'+'3'*12,'content_mode':'metadata'}
        agent.write_config(obj, config)
        self.assertEqual(config.stat().st_mode & 0o777, 0o600)
        self.assertEqual(agent.read_config(config)['device_id'],obj['device_id'])


if __name__ == '__main__':
    unittest.main()
