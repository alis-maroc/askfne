import json
import os
import re

log_file = "/root/.gemini/antigravity-ide/brain/8a30f8d5-02a8-4145-9fdd-f579788d93a8/.system_generated/logs/transcript_full.jsonl"
whatsapp_path = "/root/owly/src/lib/channels/whatsapp.ts"

content = ""
with open(log_file, "r") as f:
    for line in f:
        try:
            data = json.loads(line)
            if data.get("type") == "TOOL_RESPONSE":
                # Check if it was a read or write that contains the file content
                if whatsapp_path in data.get("content", ""):
                    # If it's view_file output, it might have line numbers
                    if "The following code has been modified to include a line number" in data.get("content", ""):
                        lines = data["content"].split("\n")
                        extracted = []
                        for l in lines:
                            match = re.match(r"^\d+:\s(.*)", l)
                            if match:
                                extracted.append(match.group(1))
                        if len(extracted) > 100:
                            print(f"Found {len(extracted)} lines from view_file")
                            content = "\n".join(extracted)
                            with open("/root/owly/recovered.ts", "w") as out:
                                out.write(content)
                                print("Wrote to recovered.ts")
        except json.JSONDecodeError:
            pass
