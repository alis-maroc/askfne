import subprocess
import json

sql = """
COPY (
  SELECT json_build_object(
    'id', m.id,
    'conversationId', m."conversationId",
    'role', m.role,
    'content', m.content,
    'createdAt', m."createdAt",
    'channel', c.channel,
    'customerName', c."customerName"
  )::text
  FROM "Message" m
  JOIN "Conversation" c ON m."conversationId" = c.id
  WHERE c."customerName" ILIKE '%mustapha%' OR c."customerName" ILIKE '%nhaily%'
  ORDER BY m."createdAt" ASC
) TO STDOUT;
"""

cmd = ['docker', 'exec', 'owly-db-1', 'psql', '-U', 'postgres', '-d', 'owly', '-c', sql]
proc = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
stdout, stderr = proc.communicate()

messages = []
for line in stdout.strip().split('\n'):
    if not line.strip(): continue
    try:
        messages.append(json.loads(line))
    except:
        pass

pairs = []
curr_user_msg = None

for m in messages:
    if m['role'] in ('customer', 'user'):
        curr_user_msg = m
    elif m['role'] == 'assistant' and curr_user_msg:
        pairs.append({
            'channel': m['channel'],
            'q': curr_user_msg['content'],
            'q_time': curr_user_msg['createdAt'],
            'a': m['content'],
            'a_time': m['createdAt'],
            'conv_id': m['conversationId']
        })
        curr_user_msg = None

with open('/root/owly/scratch/mustapha_recent_qa.txt', 'w', encoding='utf-8') as out:
    out.write(f"Total Q&A pairs: {len(pairs)}\n\n")
    # write the last 20 pairs in full
    for i, p in enumerate(pairs[-20:]):
        idx = len(pairs) - 20 + i + 1
        out.write(f"================================================================================\n")
        out.write(f"[{idx}] Channel: {p['channel']} | Date: {p['q_time']}\n")
        out.write(f"USER QUESTION:\n{p['q']}\n\n")
        out.write(f"ASSISTANT ANSWER:\n{p['a']}\n\n")

print("WROTE TO /root/owly/scratch/mustapha_recent_qa.txt")
