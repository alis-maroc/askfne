import subprocess
import json

# 1. Delete the 7-character micro-entry
sql_micro = """DELETE FROM "KnowledgeEntry" WHERE title = 'كم عدد اعضاء المكتب الوطني' AND LENGTH(content) < 20;"""
subprocess.run(['docker', 'exec', 'owly-db-1', 'psql', '-U', 'postgres', '-d', 'owly', '-c', sql_micro], stdin=subprocess.DEVNULL)
print("Deleted micro-entry 'كم عدد اعضاء المكتب الوطني'.")

# 2. Deduplicate duplicate scraped posts
sql_find_dups = """
SELECT id, title, "createdAt"
FROM "KnowledgeEntry"
WHERE "categoryId" IN (SELECT id FROM "Category" WHERE name = 'الموقع الإلكتروني للجامعة')
ORDER BY title, "createdAt" DESC;
"""
cmd = ['docker', 'exec', 'owly-db-1', 'psql', '-U', 'postgres', '-d', 'owly', '-t', '-A', '-F', '|||', '-c', sql_find_dups]
proc = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
stdout, _ = proc.communicate()

seen = set()
to_delete = []
for line in stdout.strip().split('\n'):
    if not line.strip(): continue
    parts = line.split('|||')
    if len(parts) >= 2:
        eid = parts[0]
        title = parts[1].strip()
        if title in seen:
            to_delete.append(eid)
        else:
            seen.add(title)

if to_delete:
    ids_str = "', '".join(to_delete)
    sql_del = f"""DELETE FROM "KnowledgeEntry" WHERE id IN ('{ids_str}');"""
    subprocess.run(['docker', 'exec', 'owly-db-1', 'psql', '-U', 'postgres', '-d', 'owly', '-c', sql_del], stdin=subprocess.DEVNULL)
    print(f"Removed {len(to_delete)} duplicate news articles.")

# 3. Differentiate parallel organizations in KnowledgeEntry with province
sql_parallel = """
UPDATE "KnowledgeEntry"
SET title = title || ' - ' || (string_to_array(content, E'\n'))[4]
WHERE title LIKE '%(موازي)%' AND title NOT LIKE '% - %' AND content LIKE '%الإقليم:%';
"""
subprocess.run(['docker', 'exec', 'owly-db-1', 'psql', '-U', 'postgres', '-d', 'owly', '-c', sql_parallel], stdin=subprocess.DEVNULL)
print("Differentiated parallel organizations titles.")

# 4. Final Count
sql_count = "SELECT COUNT(*) FROM \"KnowledgeEntry\";"
res = subprocess.check_output(['docker', 'exec', 'owly-db-1', 'psql', '-U', 'postgres', '-d', 'owly', '-t', '-A', '-c', sql_count], stdin=subprocess.DEVNULL, text=True)
print(f"Cleaned Knowledge Base Total: {res.strip()} entries.")
