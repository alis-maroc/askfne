import json
import re

with open('/root/owly/scratch/statuts.json', 'r') as f:
    data = json.load(f)

# Parse article numbers
entries = []
for entry in data:
    title = entry['title']
    # If the title contains a number, use it for sorting
    match = re.search(r'\d+', title)
    num = int(match.group()) if match else 9999
    
    # In case there's a range like "Articles 15-17", just use the first number
    entries.append({'num': num, 'entry': entry})

entries.sort(key=lambda x: x['num'])

chunks = []
current_chunk = []

for item in entries:
    current_chunk.append(item)
    if len(current_chunk) == 10:
        chunks.append(current_chunk)
        current_chunk = []

if current_chunk:
    chunks.append(current_chunk)

sql_statements = []

for i, chunk in enumerate(chunks):
    start_num = chunk[0]['num']
    end_num = chunk[-1]['num']
    
    if start_num == end_num:
        title = f"Statuts FNE - Article {start_num}"
    else:
        title = f"Statuts FNE - Articles {start_num}-{end_num}"
        
    combined_content = "\n\n".join([item['entry']['content'] for item in chunk])
    category_id = chunk[0]['entry']['categoryId']
    
    # Escape quotes for SQL
    escaped_title = title.replace("'", "''")
    escaped_content = combined_content.replace("'", "''")
    
    # Add insert statement
    sql_statements.append(
        f"INSERT INTO \"KnowledgeEntry\" (id, \"categoryId\", title, content, priority, \"isActive\", version, metadata, \"createdAt\", \"updatedAt\") "
        f"VALUES (gen_random_uuid(), '{category_id}', '{escaped_title}', '{escaped_content}', 0, true, 1, '{{}}', NOW(), NOW());"
    )

# Delete old entries
delete_stmt = f"DELETE FROM \"KnowledgeEntry\" WHERE \"categoryId\" = '{entries[0]['entry']['categoryId']}';"

with open('/root/owly/scratch/update_statuts.sql', 'w') as f:
    f.write(delete_stmt + "\n")
    for stmt in sql_statements:
        f.write(stmt + "\n")

print(f"Generated {len(sql_statements)} chunks from {len(entries)} entries.")
