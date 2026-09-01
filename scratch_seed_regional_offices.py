import subprocess
import json
import uuid

# Delete previous draft
sql_del = """DELETE FROM "KnowledgeEntry" WHERE title LIKE 'عدد المكاتب الجهوية للجامعة الوطنية للتعليم%';"""
subprocess.run(['docker', 'exec', 'owly-db-1', 'psql', '-U', 'postgres', '-d', 'owly', '-c', sql_del], stdin=subprocess.DEVNULL)

sql_fetch = """
SELECT title, content
FROM "KnowledgeEntry"
WHERE title LIKE '%المكتب الجهوي لـ%' AND title LIKE '%(جهوي)%'
ORDER BY title ASC;
"""

cmd = ['docker', 'exec', 'owly-db-1', 'psql', '-U', 'postgres', '-d', 'owly', '-t', '-A', '-F', '|||', '-c', sql_fetch]
proc = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
stdout, stderr = proc.communicate()

lines = stdout.strip().split('\n')
offices = []
curr_title = None
curr_content_lines = []

for line in lines:
    if '|||' in line:
        if curr_title:
            # process previous
            fields = {}
            for l in curr_content_lines:
                if ':' in l:
                    k, v = l.split(':', 1)
                    fields[k.strip()] = v.strip()
            offices.append({
                'title': curr_title,
                'region': curr_title.replace('المكتب الجهوي لـ ', '').replace(' (جهوي)', ''),
                'katib': fields.get('الكاتب المسؤول', '—'),
                'katib_tel': fields.get('هاتف الكاتب', '—'),
                'amine': fields.get('أمين المال', '—'),
                'amine_tel': fields.get('هاتف الأمين', '—')
            })
        parts = line.split('|||', 1)
        curr_title = parts[0].strip()
        curr_content_lines = [parts[1].strip()]
    else:
        if curr_title:
            curr_content_lines.append(line.strip())

if curr_title:
    fields = {}
    for l in curr_content_lines:
        if ':' in l:
            k, v = l.split(':', 1)
            fields[k.strip()] = v.strip()
    offices.append({
        'title': curr_title,
        'region': curr_title.replace('المكتب الجهوي لـ ', '').replace(' (جهوي)', ''),
        'katib': fields.get('الكاتب المسؤول', '—'),
        'katib_tel': fields.get('هاتف الكاتب', '—'),
        'amine': fields.get('أمين المال', '—'),
        'amine_tel': fields.get('هاتف الأمين', '—')
    })

print(f"Parsed {len(offices)} offices:")
for off in offices:
    print(f"{off['region']}: كاتب: {off['katib']} ({off['katib_tel']}) | أمين: {off['amine']} ({off['amine_tel']})")

table_md = """تضم الجامعة الوطنية للتعليم FNE اثنا عشر (12) مكتباً جهوياً يغطون كافة جهات المملكة المغربية الاثنتي عشرة وفق التقسيم الجهوي الرسمي، وفيما يلي المعطيات واللائحة الكاملة للمكاتب الجهوية وأسماء وهواتف الكتاب الجهويين وأمناء المال:

| الرقم | الجهة | الكاتب الجهوي المسؤول | هاتف الكاتب الجهوي | أمين المال الجهوي | هاتف أمين المال |
|---|---|---|---|---|---|
"""

for i, off in enumerate(offices):
    table_md += f"| {i+1} | **جهة {off['region']}** | {off['katib']} | {off['katib_tel']} | {off['amine']} | {off['amine_tel']} |\n"

table_md += """
---
- **العدد الإجمالي للمكاتب الجهوية**: **12 مكتباً جهوياً** تغطي كامل التراب الوطني.
- **الكاتب الوطني للجامعة الوطنية للتعليم FNE**: الرفيق **عبد الله اغميمط** (📞 الهاتف: **0662075277**).
- **أمين المال الوطني**: الرفيق **أحمد السباعي** (📞 الهاتف: **0671716559**).
- **الموقع الرسمي للجامعة**: https://Taalim.org
- **منصة الخدمات الرقمية النقابية**: https://hub.taalim.org
"""

title = "عدد المكاتب الجهوية للجامعة الوطنية للتعليم FNE (12 جهة): اللائحة الكاملة، أسماء وهواتف الكتاب الجهويين وأمناء المال"
cat_id = "5faea423-e3af-4c8b-b6e7-1a97fb782a12"
new_id = str(uuid.uuid4())

escaped_content = table_md.replace("'", "''")
escaped_title = title.replace("'", "''")

sql_insert = f"""
INSERT INTO "KnowledgeEntry" (id, "categoryId", title, content, "createdAt", "updatedAt")
VALUES ('{new_id}', '{cat_id}', '{escaped_title}', '{escaped_content}', NOW(), NOW());
"""

cmd_insert = ['docker', 'exec', 'owly-db-1', 'psql', '-U', 'postgres', '-d', 'owly', '-c', sql_insert]
p2 = subprocess.Popen(cmd_insert, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
out2, err2 = p2.communicate()
print("Insert result:", out2, err2)
