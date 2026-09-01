const fs = require('fs');

const logFile = "/root/.gemini/antigravity-ide/brain/8a30f8d5-02a8-4145-9fdd-f579788d93a8/.system_generated/logs/transcript_full.jsonl";
const lines = fs.readFileSync(logFile, 'utf8').split('\n');

for (let i = lines.length - 1; i >= 0; i--) {
  if (!lines[i]) continue;
  try {
    const data = JSON.parse(lines[i]);
    if (data.type === 'PLANNER_RESPONSE' && data.tool_calls) {
      for (const call of data.tool_calls) {
        if (call.name === 'replace_file_content' || call.name === 'write_to_file') {
          if (call.args && call.args.TargetFile && call.args.TargetFile.includes('whatsapp.ts')) {
            if (call.name === 'write_to_file' || call.args.ReplacementContent) {
              console.log(`Found edit at step ${data.step_index}`);
              if (call.name === 'write_to_file' && call.args.CodeContent) {
                  fs.writeFileSync('/root/owly/recovered.ts', call.args.CodeContent);
                  console.log("Recovered from write_to_file!");
                  process.exit(0);
              }
            }
          }
        }
      }
    }
  } catch(e) {}
}
