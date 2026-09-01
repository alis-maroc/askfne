import json
import os

log_file = "/root/.gemini/antigravity-ide/brain/8a30f8d5-02a8-4145-9fdd-f579788d93a8/.system_generated/logs/transcript_full.jsonl"
whatsapp_path = "/root/owly/src/lib/channels/whatsapp.ts"

with open(log_file, "r") as f:
    lines = f.readlines()

for line in reversed(lines):
    try:
        data = json.loads(line)
        if data.get("type") == "PLANNER_RESPONSE" and "tool_calls" in data:
            for call in data["tool_calls"]:
                name = call.get("name")
                if name in ["replace_file_content", "write_to_file"]:
                    args = call.get("args", {})
                    target = args.get("TargetFile", "")
                    if "whatsapp.ts" in target:
                        if name == "write_to_file" and "CodeContent" in args:
                            print(f"Found write_to_file at step {data.get('step_index')}")
                            with open("/root/owly/recovered.ts", "w") as out:
                                out.write(args["CodeContent"])
                                print("Recovered from write_to_file!")
                            exit(0)
    except json.JSONDecodeError:
        pass

print("Not found in write_to_file")
