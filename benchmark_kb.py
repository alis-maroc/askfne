import urllib.request
import json
import time

queries = [
    "ماهي أهداف الجامعة الوطنية للتعليم وفق قوانينها الأساسية؟",
    "ما هي شروط الترقية بالاختيار في النظام الأساسي الجديد؟",
    "تاريخ توقيع محاضر الدخول المدرسي 2026/2027؟",
    "ما هي المكاتب الإقليمية بجهة فاس مكناس ومن هم كتابها؟",
    "رابط الخريطة المدرسية والتخطيط"
]

print("=== BENCHMARKING KNOWLEDGE BASE QUERIES ===")
for q in queries:
    t0 = time.time()
    req = urllib.request.Request(
        "http://localhost:3000/api/chat",
        data=json.dumps({"message": q}).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=35) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            elapsed = time.time() - t0
            ans = data.get("response", "")
            print(f"\n[Q]: {q} ({elapsed:.1f}s)")
            print(f"[A snippet]: {ans[:250]}...")
    except Exception as e:
        print(f"\n[Q]: {q} -> ERROR: {e}")
