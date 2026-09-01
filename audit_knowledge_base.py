import subprocess
import json
import re

sql = """
COPY (
  SELECT json_build_object(
    'id', e.id,
    'title', e.title,
    'category', c.name,
    'content_len', LENGTH(e.content),
    'priority', e.priority,
    'isActive', e."isActive",
    'updatedAt', e."updatedAt"::text,
    'snippet', LEFT(e.content, 150)
  )::text
  FROM "KnowledgeEntry" e
  JOIN "Category" c ON e."categoryId" = c.id
  ORDER BY e.priority DESC, e."updatedAt" DESC
) TO STDOUT;
"""

cmd = ['docker', 'exec', 'owly-db-1', 'psql', '-U', 'postgres', '-d', 'owly', '-c', sql]
proc = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
stdout, stderr = proc.communicate()

entries = []
for line in stdout.strip().split('\n'):
    if not line.strip(): continue
    try:
        entries.append(json.loads(line))
    except Exception:
        pass

print(f"=== KNOWLEDGE BASE AUDIT REPORT ===")
print(f"Total Entries: {len(entries)}")

# 1. Check inactive entries
inactive = [e for e in entries if not e['isActive']]
print(f"\n[1] Inactive Entries: {len(inactive)}")
for e in inactive:
    print(f"  - ({e['category']}) {e['title']}")

# 2. Check short content (< 80 chars)
short = [e for e in entries if e['content_len'] < 80]
print(f"\n[2] Suspicious Short Entries (<80 chars): {len(short)}")
for e in short:
    print(f"  - ({e['category']}) {e['title']} [Length: {e['content_len']}] -> {e['snippet']}")

# 3. Check duplicate titles
titles = {}
for e in entries:
    t = e['title'].strip()
    titles.setdefault(t, []).append(e)

duplicates = {k: v for k, v in titles.items() if len(v) > 1}
print(f"\n[3] Duplicate Titles: {len(duplicates)}")
for t, dup_list in duplicates.items():
    print(f"  - '{t}': {len(dup_list)} occurrences (IDs: {[d['id'][:8] for d in dup_list]})")

# 4. Priority breakdown
prio_high = [e for e in entries if e['priority'] >= 200]
prio_med = [e for e in entries if 100 <= e['priority'] < 200]
prio_low = [e for e in entries if e['priority'] < 100]
print(f"\n[4] Priority Breakdown:")
print(f"  - High Priority (>=200): {len(prio_high)} (Master summaries, statutory texts, official rosters)")
print(f"  - Standard/Medium (100-199): {len(prio_med)} (Individual offices, articles)")
print(f"  - Low/Background (<100): {len(prio_low)} (Scraped news articles, communiqués)")

# 5. Top Categories with count and avg content length
cat_stats = {}
for e in entries:
    cat = e['category']
    cat_stats.setdefault(cat, []).append(e['content_len'])

print(f"\n[5] Category Content Health:")
for cat, lens in sorted(cat_stats.items(), key=lambda x: len(x[1]), reverse=True):
    avg_len = sum(lens) // len(lens)
    max_len = max(lens)
    min_len = min(lens)
    print(f"  - {cat:35} | {len(lens):3} items | Avg: {avg_len:4} chars | Range: [{min_len} - {max_len}]")
