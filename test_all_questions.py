import json
import time
import urllib.request

questions = [
    "ما هي الشروط النظامية المطلوبة للترقية بالاختيار من السلم 10 إلى السلم 11؟",
    "ما هي الضمانات القانونية في رخص المرض متوسطة وطويلة الأمد ونسب الأجرة؟",
    "ما هي مساطر الإحالة على المجلس التأديبي والضمانات القانونية المخولة للموظف؟",
    "ما هي المعايير المعتمدة في المذكرات الوزارية لتحديد الأستاذ الفائض بالمؤسسة؟",
    "ما هي المواعيد الدقيقة لتوقيع محاضر الدخول والخروج لمختلف الأطر التربوية؟",
    "من هو الكاتب الإقليمي للجامعة الوطنية للتعليم FNE بورزازات؟",
    "ما هو موقف الجامعة من إصلاح التقاعد ومشروع قانون الإضراب؟",
]

print("=== TESTING CHATBOT QUESTIONS WITH LIVE SYSTEM ===")
for idx, q in enumerate(questions, 1):
    print(f"\n[{idx}] Question: {q}")
    data = json.dumps({"message": q}).encode("utf-8")
    req = urllib.request.Request(
        "http://localhost:3000/api/chat",
        data=data,
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            res_json = json.loads(resp.read().decode("utf-8"))
            answer = res_json.get("response", "")
            print(f"-> SUCCESS (Response length: {len(answer)} chars)")
            print(f"-> Preview: {answer[:220]}...")
    except Exception as e:
        print(f"-> ERROR: {e}")
    time.sleep(3)
