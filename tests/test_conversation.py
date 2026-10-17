"""Cross-adapter, privacy and branch tests for opt-in conversation mirroring."""
import json
import unittest

import conversation


class TranscriptTests(unittest.TestCase):
    def row(self, typ, payload):
        return {"type": typ, "timestamp": "2026-10-17T14:00:00Z", "payload": payload}

    def test_codex_messages_commands_results_and_no_private_reasoning(self):
        rows = [
            self.row("event_msg", {"type": "user_message", "message": "Fix the dashboard layout"}),
            self.row("event_msg", {"type": "agent_reasoning", "text": "PRIVATE CHAIN OF THOUGHT"}),
            self.row("response_item", {"type": "function_call", "name": "exec_command",
                "arguments": json.dumps({"cmd": "npm test"}), "call_id": "a1"}),
            self.row("response_item", {"type": "function_call_output",
                "call_id": "a1", "output": "Tests passed: 18"}),
            self.row("response_item", {"type": "message", "role": "assistant",
                "content": [{"type": "output_text", "text": "Updated the layout."},
                            {"type": "reasoning", "text": "PRIVATE TEXT"}]}),
            self.row("event_msg", {"type": "agent_message", "message": "Updated the layout."}),
        ]
        items, truncated, summary = conversation.codex(rows)
        self.assertEqual([x["role"] for x in items], ["user", "tool", "assistant"])
        self.assertEqual(items[1]["title"], "Ran npm test")
        self.assertEqual(items[1]["output"], "Tests passed: 18")
        self.assertFalse(truncated)
        self.assertIn("Updated the layout.", summary)
        self.assertNotIn("PRIVATE", json.dumps(items))

    def test_claude_user_tool_result_and_visible_assistant(self):
        rows = [
            {"type": "user", "timestamp": "2026-10-17T14:00:00Z",
             "message": {"role": "user", "content": "Implement the login page"}},
            {"type": "assistant", "timestamp": "2026-10-17T14:00:01Z",
             "message": {"role": "assistant", "content": [
                 {"type": "thinking", "thinking": "PRIVATE THINKING"},
                 {"type": "text", "text": "I'll update the component."},
                 {"type": "tool_use", "id": "c1", "name": "Read",
                  "input": {"file_path": "src/login.tsx"}},
             ]}},
            {"type": "user", "timestamp": "2026-10-17T14:00:02Z",
             "message": {"role": "user", "content": [
                 {"type": "tool_result", "tool_use_id": "c1",
                  "content": "export const Login = () => null;"}
             ]}},
            {"type": "assistant", "timestamp": "2026-10-17T14:00:03Z",
             "message": {"role": "assistant", "content": [
                 {"type": "text", "text": "Done. Tests pass."}
             ], "stop_reason": "end_turn"}},
        ]
        items, _, summary = conversation.claude(rows)
        self.assertEqual([x["role"] for x in items], ["user", "assistant", "tool", "assistant"])
        self.assertEqual(items[2]["title"], "Read src/login.tsx")
        self.assertIn("export const", items[2]["output"])
        self.assertEqual(summary, "Done. Tests pass.")
        self.assertNotIn("PRIVATE", json.dumps(items))

    def test_pi_follows_active_branch_instead_of_abandoned_one(self):
        rows = [
            {"type": "session", "id": "a1a1a1a1", "timestamp": "2026-10-17T14:00:00Z"},
            {"type": "message", "id": "u1", "parentId": None,
             "timestamp": "2026-10-17T14:00:01Z",
             "message": {"role": "user", "content": "Write tests"}},
            {"type": "message", "id": "a1", "parentId": "u1",
             "timestamp": "2026-10-17T14:00:02Z",
             "message": {"role": "assistant", "stopReason": "stop",
                         "content": [{"type": "text", "text": "Outdated branch"}]}},
            {"type": "message", "id": "u2", "parentId": "u1",
             "timestamp": "2026-10-17T14:00:03Z",
             "message": {"role": "user", "content": "Actually fix parsing"}},
            {"type": "message", "id": "a2", "parentId": "u2",
             "timestamp": "2026-10-17T14:00:04Z",
             "message": {"role": "assistant", "stopReason": "toolUse",
                         "content": [
                             {"type": "thinking", "thinking": "SECRET"},
                             {"type": "toolCall", "name": "bash", "id": "run",
                              "arguments": {"command": "pytest -q"}}
                         ]}},
            {"type": "message", "id": "o2", "parentId": "a2",
             "timestamp": "2026-10-17T14:00:05Z",
             "message": {"role": "toolResult", "toolCallId": "run",
                         "content": [{"type": "text", "text": "passed"}]}},
            {"type": "message", "id": "a3", "parentId": "o2",
             "timestamp": "2026-10-17T14:00:06Z",
             "message": {"role": "assistant", "stopReason": "stop",
                         "content": [{"type": "text", "text": "Fixed parsing"}]}},
        ]
        items, _, summary = conversation.pi(rows)
        body = json.dumps(items)
        self.assertIn("Write tests", body)
        self.assertIn("Actually fix parsing", body)
        self.assertNotIn("Outdated branch", body)
        self.assertNotIn("SECRET", body)
        self.assertEqual(items[-1]["text"], "Fixed parsing")
        self.assertEqual(summary, "Fixed parsing")
        self.assertEqual(items[-2]["output"], "passed")

    def test_tool_names_reflect_actual_work_and_sleep_is_ignored(self):
        title, detail = conversation.tool_label("functions.exec", {
            "code": "const r = await tools.mcp__GitHub__fetch_file({path:'README.md'});"
        })
        self.assertIn("GitHub", title)
        self.assertIn("fetch_file", title)
        self.assertIn("README.md", detail)
        self.assertEqual(conversation.tool_label("sleep", {"seconds": 2}), ("", ""))

    def test_bounded_output_and_custom_content(self):
        items = [{"role": "user", "text": "Prompt"},
                 {"role": "assistant", "text": "A" * 300000}]
        rows, _, _ = conversation.custom(items)
        self.assertEqual(len(rows), 2)
        self.assertLess(len(json.dumps(rows)), 4000)
        transcript = conversation.Transcript()
        transcript.message("user", "Original prompt")
        for i in range(100):
            transcript.tool("exec_command", {"cmd": "echo " + str(i)})
        result, omitted, _ = transcript.finish()
        self.assertTrue(omitted)
        self.assertLessEqual(len(result), conversation.MAX_ITEMS + 1)
        self.assertEqual(result[0]["role"], "user")
        self.assertEqual(result[0]["text"], "Original prompt")

    def test_user_content_and_image_bytes_are_not_exported_in_other_modes(self):
        rows = [{"type": "message", "id": "one", "parentId": None,
                 "message": {"role": "user", "content": [
                     {"type": "text", "text": "Visible prompt"},
                     {"type": "image", "data": "PRIVATE_BASE64", "mimeType": "image/png"},
                 ]}}]
        transcript, _, _ = conversation.pi(rows)
        self.assertEqual(transcript[0]["text"], "Visible prompt")
        self.assertNotIn("PRIVATE_BASE64", json.dumps(transcript))


if __name__ == "__main__":
    unittest.main()
