import base64
import os
import subprocess

# 1. Read Cairo TTF fonts as base64
fonts_dir = "/root/owly/public/fonts"
with open(os.path.join(fonts_dir, "Cairo-Regular.ttf"), "rb") as f:
    cairo_reg_b64 = base64.b64encode(f.read()).decode("utf-8")

with open(os.path.join(fonts_dir, "Cairo-SemiBold.ttf"), "rb") as f:
    cairo_semi_b64 = base64.b64encode(f.read()).decode("utf-8")

with open(os.path.join(fonts_dir, "Cairo-Bold.ttf"), "rb") as f:
    cairo_bold_b64 = base64.b64encode(f.read()).decode("utf-8")

with open(os.path.join(fonts_dir, "Cairo-ExtraBold.ttf"), "rb") as f:
    cairo_extrabold_b64 = base64.b64encode(f.read()).decode("utf-8")

with open(os.path.join(fonts_dir, "Cairo-Black.ttf"), "rb") as f:
    cairo_black_b64 = base64.b64encode(f.read()).decode("utf-8")

html_content = f"""<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>دليل المجيب الآلي الذكي - الجامعة الوطنية للتعليم FNE</title>
  <style>
    @font-face {{
      font-family: 'Cairo';
      font-style: normal;
      font-weight: 400;
      src: url('data:font/truetype;charset=utf-8;base64,{cairo_reg_b64}') format('truetype');
    }}
    @font-face {{
      font-family: 'Cairo';
      font-style: normal;
      font-weight: 600;
      src: url('data:font/truetype;charset=utf-8;base64,{cairo_semi_b64}') format('truetype');
    }}
    @font-face {{
      font-family: 'Cairo';
      font-style: normal;
      font-weight: 700;
      src: url('data:font/truetype;charset=utf-8;base64,{cairo_bold_b64}') format('truetype');
    }}
    @font-face {{
      font-family: 'Cairo';
      font-style: normal;
      font-weight: 800;
      src: url('data:font/truetype;charset=utf-8;base64,{cairo_extrabold_b64}') format('truetype');
    }}
    @font-face {{
      font-family: 'Cairo';
      font-style: normal;
      font-weight: 900;
      src: url('data:font/truetype;charset=utf-8;base64,{cairo_black_b64}') format('truetype');
    }}

    @page {{
      size: A4 portrait;
      margin: 12mm 10mm 12mm 10mm;
      @bottom-right {{
        content: "الجامعة الوطنية للتعليم FNE - منصة الدعم والمجيب الآلي الذكي";
        font-family: 'Cairo', sans-serif !important;
        font-size: 9pt;
        color: #64748b;
      }}
      @bottom-left {{
        content: "صفحة " counter(page);
        font-family: 'Cairo', sans-serif !important;
        font-size: 9pt;
        color: #64748b;
      }}
    }}

    *, *::before, *::after {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Cairo', sans-serif !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }}

    html, body {{
      font-family: 'Cairo', sans-serif !important;
      background-color: #f8fafc;
      color: #1e293b;
      line-height: 1.65;
      font-size: 13.5px;
      direction: rtl;
    }}

    .page {{
      background: #ffffff;
      padding: 22px;
      border-radius: 12px;
      margin-bottom: 24px;
      border: 1px solid #e2e8f0;
      position: relative;
    }}

    @media print {{
      body {{
        background: #ffffff;
      }}
      .page {{
        padding: 0;
        margin-bottom: 0;
        border: none;
        border-radius: 0;
        page-break-after: always;
      }}
      .page:last-child {{
        page-break-after: auto;
      }}
    }}

    /* Header Banner */
    .header-banner {{
      background: linear-gradient(135deg, #b91c1c 0%, #991b1b 60%, #7f1d1d 100%);
      color: #ffffff;
      padding: 22px 26px;
      border-radius: 12px;
      margin-bottom: 18px;
      position: relative;
      overflow: hidden;
      box-shadow: 0 8px 22px -4px rgba(185, 28, 28, 0.3);
      border-bottom: 4px solid #f59e0b;
    }}

    .header-banner::before {{
      content: "";
      position: absolute;
      top: -35px;
      left: -35px;
      width: 130px;
      height: 130px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 50%;
    }}

    .header-top {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }}

    .logo-box {{
      width: 76px;
      height: 76px;
      background: #ffffff;
      border-radius: 12px;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      border: 2px solid #fecaca;
    }}

    .logo-box img {{
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      border-radius: 8px;
    }}

    .header-titles {{
      flex: 1;
      text-align: right;
    }}

    .sub-union {{
      font-size: 12.5px;
      color: #fef08a;
      font-weight: 800;
      letter-spacing: 0.5px;
      margin-bottom: 3px;
    }}

    .main-title {{
      font-size: 22px;
      font-weight: 900;
      color: #ffffff;
      line-height: 1.3;
      margin-bottom: 5px;
    }}

    .slogan-pill {{
      display: inline-block;
      background: rgba(0, 0, 0, 0.25);
      padding: 3px 12px;
      border-radius: 18px;
      font-size: 11.5px;
      color: #f8fafc;
      font-weight: 800;
      border: 1px solid rgba(255, 255, 255, 0.2);
    }}

    /* Section Styles */
    .section-title {{
      font-size: 16.5px;
      font-weight: 900;
      color: #991b1b;
      margin: 16px 0 10px 0;
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 2.5px solid #fee2e2;
      padding-bottom: 4px;
    }}

    .section-title span.badge {{
      background: #dc2626;
      color: #ffffff;
      font-size: 11.5px;
      padding: 2px 8px;
      border-radius: 5px;
      font-weight: 900;
    }}

    /* Grid Layouts */
    .grid-2 {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 12px;
    }}

    .grid-3 {{
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 10px;
      margin-bottom: 12px;
    }}

    .card {{
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 12px 14px;
      border-right: 4.5px solid #dc2626;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
      break-inside: avoid;
    }}

    .card.blue {{
      border-right-color: #0284c7;
    }}

    .card.green {{
      border-right-color: #16a34a;
    }}

    .card.amber {{
      border-right-color: #d97706;
    }}

    .card.purple {{
      border-right-color: #7c3aed;
    }}

    .card-header {{
      font-size: 14px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }}

    .card-body {{
      font-size: 12.5px;
      color: #475569;
      line-height: 1.6;
    }}

    .card-body ul {{
      list-style-type: none;
      padding-right: 2px;
      margin-top: 4px;
    }}

    .card-body li {{
      margin-bottom: 4px;
      position: relative;
      padding-right: 13px;
    }}

    .card-body li::before {{
      content: "•";
      color: #dc2626;
      font-size: 14px;
      position: absolute;
      right: 0;
      top: -1px;
    }}

    /* Highlight Banner */
    .highlight-box {{
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 10px;
      padding: 12px 16px;
      margin: 12px 0;
      font-size: 12.5px;
      color: #991b1b;
      line-height: 1.6;
      display: flex;
      align-items: flex-start;
      gap: 10px;
      break-inside: avoid;
    }}

    /* Step Boxes */
    .step-box {{
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 12px 15px;
      margin-bottom: 11px;
      position: relative;
      border-right: 5px solid #991b1b;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.02);
      break-inside: avoid;
    }}

    .step-header {{
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14.5px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 6px;
    }}

    .step-num {{
      background: #991b1b;
      color: #ffffff;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 900;
      flex-shrink: 0;
    }}

    .step-content {{
      font-size: 13px;
      color: #334155;
      line-height: 1.65;
    }}

    .step-content ul {{
      list-style-type: none;
      padding-right: 4px;
      margin-top: 5px;
    }}

    .step-content li {{
      margin-bottom: 4px;
      position: relative;
      padding-right: 14px;
    }}

    .step-content li::before {{
      content: "✔";
      color: #16a34a;
      font-size: 11px;
      position: absolute;
      right: 0;
      top: 1px;
    }}

    /* Menu Numbers Table */
    .menu-badge-table {{
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
      font-size: 12px;
    }}

    .menu-badge-table td {{
      padding: 5px 8px;
      border: 1px solid #e2e8f0;
    }}

    .menu-badge-table tr:nth-child(even) {{
      background: #f8fafc;
    }}

    .num-pill {{
      display: inline-block;
      background: #dc2626;
      color: #ffffff;
      font-weight: 800;
      padding: 2px 7px;
      border-radius: 5px;
      font-size: 11px;
      text-align: center;
      min-width: 20px;
    }}

    /* Questions Catalog Box (Two Columns Grid) */
    .questions-grid-2 {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 11px;
      margin-bottom: 12px;
    }}

    .question-category {{
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 9px;
      padding: 11px 13px;
      border-right: 4.5px solid #b91c1c;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
      break-inside: avoid;
    }}

    .question-category-title {{
      font-size: 13.5px;
      font-weight: 800;
      color: #991b1b;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
      border-bottom: 1.5px dashed #fecaca;
      padding-bottom: 4px;
    }}

    .question-list {{
      display: flex;
      flex-direction: column;
      gap: 4px;
    }}

    .q-item {{
      background: #f8fafc;
      border: 1px solid #edf2f7;
      border-radius: 6px;
      padding: 5px 8px;
      font-size: 12px;
      color: #334155;
      font-weight: 600;
      line-height: 1.5;
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }}

    .q-item::before {{
      content: "❓";
      font-size: 10px;
      margin-top: 2px;
      flex-shrink: 0;
    }}

    .btn-link {{
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: #991b1b;
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 800;
      font-size: 11.5px;
      padding: 4px 10px;
      border-radius: 6px;
      margin-top: 5px;
      border: 1px solid #7f1d1d;
    }}

    /* Channels Bar */
    .channels-bar {{
      display: flex;
      gap: 9px;
      margin: 10px 0;
    }}

    .channel-item {{
      flex: 1;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 9px;
      padding: 9px;
      text-align: center;
      break-inside: avoid;
    }}

    .channel-item.active {{
      border: 2px solid #dc2626;
      background: #fff5f5;
    }}

    .channel-icon {{
      font-size: 22px;
      margin-bottom: 2px;
    }}

    .channel-title {{
      font-size: 12.5px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 2px;
    }}

    .channel-desc {{
      font-size: 11px;
      color: #64748b;
    }}

    /* Footer stamp */
    .doc-footer {{
      border-top: 2px solid #e2e8f0;
      padding-top: 10px;
      margin-top: 14px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 11.5px;
      color: #475569;
      break-inside: avoid;
    }}

    .doc-footer .org-info {{
      font-weight: 800;
      color: #991b1b;
    }}
  </style>
</head>
<body>

  <!-- ==================== PAGE 1 ==================== -->
  <div class="page">
    <!-- Header -->
    <div class="header-banner">
      <div class="header-top">
        <div class="logo-box">
          <img src="https://flowise.taalim.org/fne-wa-thumb.jpg" alt="شعار الجامعة الوطنية للتعليم FNE">
        </div>
        <div class="header-titles">
          <div class="sub-union">
            <span>الجامعة الوطنية للتعليم FNE</span>
            <span>•</span>
            <span>التوجه الديمقراطي</span>
          </div>
          <h1 class="main-title">دليل المجيب الآلي الذكي ومنصة الدعم الرقمي</h1>
          <div class="slogan-pill">الديمقراطية • الجماهيرية • الاستقلالية • التقدمية • الوحدوية</div>
        </div>
      </div>
    </div>

    <!-- Section 1: Presentation -->
    <h2 class="section-title">
      <span class="badge">01</span>
      <span>ما هي منصة المجيب الآلي الذكي للجامعة؟</span>
    </h2>
    <p style="margin-bottom: 10px; font-size: 13px; color: #334155;">
      منصة استشارية وتفاعلية ذكية رائدة ومجانية، طوّرتها <strong>الجامعة الوطنية للتعليم FNE</strong> لخدمة نساء ورجال التعليم بمختلف فئاتهم وأسلاكهم التعليمية والإدارية عبر التراب الوطني. تعمل المنصة على مدار <strong>24 ساعة / 7 أيام في الأسبوع</strong> لتقديم استشارات قانونية وتنظيمية فورية، وتوجيه المنخرطين، وتوفير كافة الوثائق والمقررات الرسمية بضغطة زر.
    </p>

    <!-- Channels Grid -->
    <div class="channels-bar">
      <div class="channel-item active">
        <div class="channel-icon">🌐</div>
        <div class="channel-title">بوابة المحادثة (Web Chat)</div>
        <div class="channel-desc">مباشرة من المتصفح دون تطبيق أو تسجيل</div>
        <a href="https://hub.taalim.org/askfne" class="btn-link" target="_blank">فتح المحادثة ↗</a>
      </div>
      <div class="channel-item" style="border-color: #0284c7; background: #f0f9ff;">
        <div class="channel-icon">📱</div>
        <div class="channel-title" style="color: #0369a1;">تطبيق تيليغرام (Telegram)</div>
        <div class="channel-desc">بوت تفاعلي سريع ومجاني مع قوائم الأزرار</div>
        <a href="https://t.me/askfne_bot" class="btn-link" target="_blank" style="background: #0284c7; border-color: #0369a1;">@askfne_bot ↗</a>
      </div>
      <div class="channel-item" style="border-color: #16a34a; background: #f0fdf4;">
        <div class="channel-icon">💬</div>
        <div class="channel-title" style="color: #15803d;">واتساب التفاعلي (WhatsApp)</div>
        <div class="channel-desc">تواصل سلس ومباشر عبر حساب الجامعة المعتمد</div>
        <span class="btn-link" style="background: #16a34a; border-color: #15803d; cursor: default;">حساب واتساب: @askfne</span>
      </div>
    </div>

    <!-- Section 2: Core Philosophy -->
    <h2 class="section-title">
      <span class="badge">02</span>
      <span>الخدمات الرقمية الذاتية المدمجة (منصة Hub)</span>
    </h2>

    <div class="grid-3">
      <div class="card">
        <div class="card-header">🤝 استمارة الانخراط الرقمي</div>
        <div class="card-body">
          تسجيل طلب العضوية وتأدية الواجب واستلام البطاقة الإلكترونية.
          <a href="https://hub.taalim.org/adherer" class="btn-link" target="_blank">الانخراط الآن ↗</a>
        </div>
      </div>

      <div class="card green">
        <div class="card-header">🧮 حاسبة نقط الترقية</div>
        <div class="card-body">
          حساب دقيق لنقط الترقية بالاختيار والتسقيف لجميع الأسلاك التعليمية.
          <a href="https://hub.taalim.org/calc_promotion_points.php" class="btn-link" target="_blank">حساب النقط ↗</a>
        </div>
      </div>

      <div class="card blue">
        <div class="card-header">📄 مولّد الطلبات الإدارية</div>
        <div class="card-body">
          توليد طلبات الانتقال والرخص والتظلمات بصيغة قانونية جاهزة للطباعة.
          <a href="https://hub.taalim.org/generate_request.php" class="btn-link" target="_blank">توليد طلب ↗</a>
        </div>
      </div>

      <div class="card amber">
        <div class="card-header">📁 الترافع والملف النقابي</div>
        <div class="card-body">
          إيداع الملفات والنزاعات ليترافع عنها مسؤولو الجامعة لدى الإدارة.
          <a href="https://hub.taalim.org/milaf" class="btn-link" target="_blank">إيداع ملف ↗</a>
        </div>
      </div>

      <div class="card purple">
        <div class="card-header">📣 التبليغ عن الخروقات</div>
        <div class="card-body">
          استمارة موثوقة للتبليغ عن الشطط في استعمال السلطة بالمؤسسات.
          <a href="https://hub.taalim.org/participation_form.php" class="btn-link" target="_blank">تبليغ عن خرق ↗</a>
        </div>
      </div>

      <div class="card blue">
        <div class="card-header">🗺️ الخريطة المدرسية</div>
        <div class="card-body">
          أداة التخطيط التربوي والمعطيات المجالية لدراسة حركية الأطر والتلاميذ.
          <a href="https://hub.taalim.org/carte_scolaire.php" class="btn-link" target="_blank">فتح الخريطة ↗</a>
        </div>
      </div>
    </div>
  </div>

  <!-- ==================== PAGE 2 ==================== -->
  <div class="page">
    <h2 class="section-title">
      <span class="badge">03</span>
      <span>كيف يشتغل البوت؟ (آلية المعالجة والذكاء المتقاطع)</span>
    </h2>

    <div class="grid-2">
      <div class="card">
        <div class="card-header">🧠 المزامنة الحية والربط مع Taalim.org</div>
        <div class="card-body">
          يتصل البوت بمحرك مزامنة آلي مستمر مع البوابة الرسمية للجامعة <strong>Taalim.org</strong>. بمجرد صدور أي بيان للمكتب الوطني، بلاغ مشترك، دعوة لإضراب، أو مستجدات الحوار القطاعي، تُدمج فوراً في ذاكرة البوت لتصبح متاحة لجميع السائلين في نفس اللحظة.
        </div>
      </div>

      <div class="card green">
        <div class="card-header">📑 استخراج وتحليل وثائق الوزارة (PDF)</div>
        <div class="card-body">
          يتوفر البوت على تقنية متطورة لقراءة واستخراج النصوص الرسمية من المذكرات الوزارية وبلاغات الدخول المدرسي والمنح حتى وإن كانت بصيغة <strong>PDF</strong> أو مرفقات وزارية رسمية، مما يضمن تزويد المنخرط بالتواريخ والآجال الدقيقة.
        </div>
      </div>
    </div>

    <!-- Section 4: Union Stances -->
    <h2 class="section-title">
      <span class="badge">04</span>
      <span>كيف يوضح البوت المواقف النقابية المبدئية للجامعة FNE؟</span>
    </h2>
    <p style="margin-bottom: 8px; font-size: 13px; color: #334155;">
      لا يقدم المجيب الآلي مجرد سرد إداري جاف، بل يؤطر الإجابات ضمن <strong>الرؤية النقابية المبدئية والديمقراطية للجامعة الوطنية للتعليم</strong>:
    </p>

    <div class="grid-2">
      <div class="card amber">
        <div class="card-header">✊ الدفاع عن الملف المطلبي الشامل</div>
        <div class="card-body">
          يوضح البوت مواقف الجامعة من قضايا: إسقاط مخطط التعاقد والإدماج الفعلي في أسلاك الوظيفة العمومية، رفض الإجهاز على صناديق التقاعد، إنصاف ضحايا الزنزانة 10، المبرزين، حاملي الشهادات، الدكاترة، والأطر المشتركة وأطر التوجيه والتخطيط والمساعدين التربويين.
        </div>
      </div>

      <div class="card purple">
        <div class="card-header">🛡️ مجابهة الشطط الإداري والتكليفات التعسفية</div>
        <div class="card-body">
          في حالات النزاعات الإدارية، يوضح البوت للمنخرط حدوده القانونية ومساطر رفض التكليفات التعسفية خارج الجماعة، ويؤكد على عدم دستورية الاقتطاع من أجور المضربين، ويوجهه نحو خطوات الطعن وإيداع الملف النقابي للترافع الميداني.
        </div>
      </div>
    </div>

    <div class="highlight-box">
      <span style="font-size: 22px;">📢</span>
      <div>
        <strong>متابعة البيانات الحية:</strong> يمكن للأستاذ أن يسأل البوت في أي وقت عن: <em>«ما هو آخر بيان للمكتب الوطني؟»</em>، <em>«ما هو موقف الجامعة من القانون التنظيمي للإضراب؟»</em>، أو <em>«هل هناك بلاغ مشترك بخصوص الدخول المدرسي؟»</em> وسيعرض له ملخص البيان مع نصه المرجعي.
      </div>
    </div>
  </div>

  <!-- ==================== PAGE 3 ==================== -->
  <div class="page">
    <h2 class="section-title">
      <span class="badge">05</span>
      <span>كيفية استخدام والتواصل مع المجيب الآلي الذكي بالتفصيل (خطوة بخطوة)</span>
    </h2>

    <p style="margin-bottom: 10px; font-size: 13px; color: #334155;">
      يتيح المجيب الآلي للشغيلة التعليمية تجربة تواصل مرنة وذكية، سواء من خلال المحادثة الحرة المباشرة أو عبر التصفح الموجه بالقوائم:
    </p>

    <!-- Channel 1: Web Chat -->
    <div class="step-box">
      <div class="step-header">
        <span class="step-num">1</span>
        <span>طريقة الاستخدام عبر بوابة المحادثة الفورية (Web Chat - hub.taalim.org/askfne)</span>
      </div>
      <div class="step-content">
        <ul>
          <li><strong>الولوج السريع:</strong> ادخل مباشرة إلى الرابط <a href="https://hub.taalim.org/askfne" target="_blank" style="color: #991b1b; font-weight: 800;">hub.taalim.org/askfne</a> من متصفح الهاتف أو الحاسوب دون الحاجة لإنشاء حساب أو تثبيت أي تطبيق.</li>
          <li><strong>طرح الاستفسارات الحرة:</strong> اكتب سؤالك بأي لغة تفضلها (باللغة العربية الفصحى، الدارجة المغربية، أو الفرنسية) في خانة الكتابة ثم اضغط على زر الإرسال.</li>
          <li><strong>الاستفادة من الأدوات والمرفقات:</strong> يرفق المجيب الآلي إجاباته بروابط مباشرة وموثوقة لتحميل المذكرات المعنية بصيغة PDF، أو روابط فتح حاسبة الترقية واستمارات الانخراط بضغطة زر واحدة.</li>
        </ul>
      </div>
    </div>

    <!-- Channel 2: WhatsApp -->
    <div class="step-box">
      <div class="step-header">
        <span class="step-num">2</span>
        <span>طريقة الاستخدام عبر تطبيق واتساب (WhatsApp Assistant - @askfne)</span>
      </div>
      <div class="step-content">
        <p style="margin-bottom: 5px;">
          يوفر روبوت واتساب طريقتين متكاملتين للتعامل:
        </p>
        <ul>
          <li><strong>أولاً - القائمة التفاعلية بالأرقام:</strong> أرسل كلمة <code>سلام</code> أو <code>مرحبا</code> أو الرقم <code>0</code> لتظهر لك القائمة الرئيسية، ثم أرسل رقم الموضوع المطلوب مباشرة:</li>
        </ul>

        <table class="menu-badge-table">
          <tr>
            <td style="width: 12%; text-align: center;"><span class="num-pill">1</span></td>
            <td><strong>المكاتب والتنظيم النقابي:</strong> دليل هواتف وبيانات الكتاب الإقليميين والجهويين بكافة مدن المملكة.</td>
          </tr>
          <tr>
            <td style="width: 12%; text-align: center;"><span class="num-pill">2</span></td>
            <td><strong>القانون الأساسي للجامعة:</strong> مواد وفصول القانون الداخلي، مبادئ النقابة، وشروط العضوية.</td>
          </tr>
          <tr>
            <td style="width: 12%; text-align: center;"><span class="num-pill">3</span></td>
            <td><strong>مقرر السنة الدراسية:</strong> تواريخ الدخول والخروج، العطل المدرسية، ومواعيد الامتحانات.</td>
          </tr>
          <tr>
            <td style="width: 12%; text-align: center;"><span class="num-pill">4</span></td>
            <td><strong>الوظيفة العمومية والنظام الأساسي:</strong> الرخص الإدارية والصحية، الترقية، والمساطر التأديبية.</td>
          </tr>
          <tr>
            <td style="width: 12%; text-align: center;"><span class="num-pill">5</span></td>
            <td><strong>إجراءات الدخول المدرسي:</strong> تدبير الفائض والخصاص، التكليفات، وجداول الحصص.</td>
          </tr>
          <tr>
            <td style="width: 12%; text-align: center;"><span class="num-pill">6</span></td>
            <td><strong>المستجدات والبيانات الحية:</strong> تصفح مقالات موقع Taalim.org وقراءتها كاملة عبر واتساب.</td>
          </tr>
          <tr>
            <td style="width: 12%; text-align: center;"><span class="num-pill">7</span></td>
            <td><strong>الانخراط والخدمات الرقمية:</strong> روابط حاسبة الترقية، مولد الطلبات، وإيداع الملف النقابي.</td>
          </tr>
        </table>

        <ul style="margin-top: 5px;">
          <li><strong>ثانياً - طرح الأسئلة المباشرة:</strong> يمكنك في أي وقت كتابة سؤالك بالتفصيل (مثال: <em>«ما هي مسطرة رخصة المرض المتوسطة؟»</em>) وسيجيبك الشات بوت فوراً بشكل تحليلي مدعم بالنصوص.</li>
          <li><strong>العودة للقائمة الرئيسية:</strong> أرسل الرقم <span class="num-pill" style="background: #334155;">0</span> في أي وقت للرجوع فوراً إلى القائمة الأساسية.</li>
        </ul>
      </div>
    </div>

    <!-- Channel 3: Telegram -->
    <div class="step-box">
      <div class="step-header">
        <span class="step-num">3</span>
        <span>طريقة الاستخدام عبر تطبيق تيليغرام (Telegram Bot - @askfne_bot)</span>
      </div>
      <div class="step-content">
        <ul>
          <li>افتح الرابط المباشر <a href="https://t.me/askfne_bot" target="_blank" style="color: #0284c7; font-weight: 800;">t.me/askfne_bot</a> واضغط على <strong>Start</strong> لتفعيل البوت.</li>
          <li>استخدم الأزرار التفاعلية المدمجة لتصفح الأقسام بنقرة واحدة، أو اكتب استفسارك مباشرة في المحادثة.</li>
        </ul>
      </div>
    </div>
  </div>

  <!-- ==================== PAGE 4 ==================== -->
  <div class="page">
    <h2 class="section-title">
      <span class="badge">06</span>
      <span>نماذج وأنواع الأسئلة التي يستقبلها ويجيب عنها المجيب الآلي (بدون إعطاء الأجوبة)</span>
    </h2>
    <p style="margin-bottom: 10px; font-size: 12.5px; color: #475569;">
      تغطي قاعدة البيانات مئات المواضيع والوضعيات الإدارية والنقابية. إليكم عينة من <strong>أنواع وتصنيفات الأسئلة</strong> التي يمكن للموظف والأستاذ طرحها على المنصة للحصول على استشارة قانونية فورية:
    </p>

    <!-- Two-Columns Questions Grid -->
    <div class="questions-grid-2">
      <!-- Column 1: Category 1 -->
      <div class="question-category">
        <div class="question-category-title">📂 1. المسار المهني، الترقية والتعويضات النظامية</div>
        <div class="question-list">
          <div class="q-item">ما هي الشروط النظامية المطلوبة للترقية بالاختيار من السلم 10 إلى السلم 11؟</div>
          <div class="q-item">كيف يتم احتساب نقط الأقدمية العامة والأقدمية في الدرجة وتفتيش الترقية؟</div>
          <div class="q-item">ما هو سقف السنوات المحدد للاستفادة من الترقية بالتسقيف (4 سنوات)؟</div>
          <div class="q-item">ما هي مسطرة وآجال الطعن في اللوائح الأولية للترقية بالاختيار؟</div>
          <div class="q-item">ما هي مقادير وشروط الاستفادة من التعويض عن العمل بالمناطق الصعبة والنائية؟</div>
        </div>
      </div>

      <!-- Column 2: Category 2 -->
      <div class="question-category">
        <div class="question-category-title">📂 2. الرخص الإدارية، المرضية والوضعيات الصحية</div>
        <div class="question-list">
          <div class="q-item">ما هي الضمانات القانونية في رخص المرض متوسطة وطويلة الأمد ونسب الأجرة؟</div>
          <div class="q-item">هل يحق للإدارة توقيف أجرة الموظف بعد الإدلاء بشهادة طبية وما شروط المراقبة؟</div>
          <div class="q-item">ما هي المدة المحددة قانوناً لرخصة الولادة والأبوة وتسهيلات الرضاعة؟</div>
          <div class="q-item">ما هي شروط الاستفادة من الرخص الاستثنائية (الحج، الزواج، والوفاة)؟</div>
          <div class="q-item">كيف تتم تسوية وضعية التغيب للمشاركة في الأنشطة النقابية والجموع العامة؟</div>
        </div>
      </div>

      <!-- Column 1: Category 3 -->
      <div class="question-category">
        <div class="question-category-title">📂 3. المساطر التأديبية، التظلمات والضمانات القانونية</div>
        <div class="question-list">
          <div class="q-item">ما هي مساطر الإحالة على المجلس التأديبي ومهل الاستدعاء والاطلاع على الملف؟</div>
          <div class="q-item">هل يحق للموظف الاستعانة بممثل نقابي أو محامٍ لمؤازرته أمام اللجان الثنائية؟</div>
          <div class="q-item">كيف تتم صياغة تظلم استعطافي ضد نقطة التفتيش أو تقرير إداري مجحف؟</div>
          <div class="q-item">ما هي الآجال القانونية والمسطرة المتبعة لمحو عقوبة الإنذار أو التوبيخ؟</div>
          <div class="q-item">ما هي سبل الطعن في قرارات الاقتطاع من الأجور بسبب ممارسة الإضراب؟</div>
        </div>
      </div>

      <!-- Column 2: Category 4 -->
      <div class="question-category">
        <div class="question-category-title">📂 4. تدبير الفائض والخصاص، التكليفات والحركات الانتقالية</div>
        <div class="question-list">
          <div class="q-item">ما هي المعايير المعتمدة في المذكرات الوزارية لتحديد الأستاذ الفائض بالمؤسسة؟</div>
          <div class="q-item">هل يحق للأستاذ رفض تكليف بالتدريس خارج جماعته الأصلية أو في غير سلكه؟</div>
          <div class="q-item">ما هي القواعد المنظمة لجداول الحصص واستعمالات الزمن والحد الأقصى للساعات؟</div>
          <div class="q-item">ما هي ضوابط ومعايير الاستفادة من الحركة الانتقالية لأسباب صحية أو للالتحاق بالزوج؟</div>
          <div class="q-item">كيف يقدم الأستاذ طعناً في نتائج الحركة الانتقالية الوطنية أو الجهوية؟</div>
        </div>
      </div>

      <!-- Column 1: Category 5 -->
      <div class="question-category">
        <div class="question-category-title">📂 5. مقرر السنة الدراسية، المذكرات والدعم الاجتماعي</div>
        <div class="question-list">
          <div class="q-item">ما هي المواعيد الدقيقة لتوقيع محاضر الدخول والخروج لمختلف الأطر وهيئات التفتيش؟</div>
          <div class="q-item">ما هي جدولة العطل المدرسية والامتحانات الإشهادية الموحدة برسم الموسم الدراسي؟</div>
          <div class="q-item">ما هي الآجال المحددة لتمديد طلبات الإيواء والإطعام والنقل المدرسي (فضاء المتمدرس)؟</div>
          <div class="q-item">ما هي مساطر الاستفادة من منح التعليم العالي والتكوين المهني عبر البوابة؟</div>
        </div>
      </div>

      <!-- Column 2: Category 6 -->
      <div class="question-category">
        <div class="question-category-title">📂 6. التنظيم النقابي، الاتصال بالكتاب الإقليميين والبيانات</div>
        <div class="question-list">
          <div class="q-item">من هو الكاتب الإقليمي للجامعة الوطنية للتعليم FNE بإقليمي وما رقم هاتفه؟</div>
          <div class="q-item">ما هي تشكيلة المكتب الجهوي لجهتي وأين توجد مقرات الفروع الإقليمية؟</div>
          <div class="q-item">ما هو الموقف المبدئي للجامعة وبيانها الأخير حول قضايا الحوار وقانون الإضراب؟</div>
          <div class="q-item">كيف أقوم بإيداع ملف نزاع إداري لدى المكتب الوطني للترافع عنه لدى الوزارة؟</div>
        </div>
      </div>
    </div>

    <!-- Footer with Official Address -->
    <div class="doc-footer">
      <div>
        <span class="org-info">المقر المركزي للجامعة الوطنية للتعليم FNE (التوجه الديمقراطي):</span>
        رقم 3 مكرر، شارع طونكان، حي ديور الجامع، الرباط.
      </div>
      <div>
        🌐 الموقع الرسمي: <a href="https://taalim.org" style="color: #991b1b; text-decoration: none; font-weight: 800;">Taalim.org</a> | 
        البوابة الذكية: <a href="https://hub.taalim.org" style="color: #991b1b; text-decoration: none; font-weight: 800;">hub.taalim.org</a> | 
        تيليغرام: <strong>@askfne_bot</strong> | واتساب: <strong>@askfne</strong>
      </div>
    </div>
  </div>

</body>
</html>
"""

# Write HTML file
output_html_path = "/root/owly/public/guide-fne-chatbot.html"
with open(output_html_path, "w", encoding="utf-8") as f:
    f.write(html_content)

print(f"Wrote HTML to {output_html_path} ({len(html_content)} bytes)")

# Convert to PDF via Chromium
output_pdf_path = "/root/owly/public/guide-fne-chatbot.pdf"
cmd = [
    "chromium",
    "--headless",
    "--no-sandbox",
    "--disable-gpu",
    "--run-all-compositor-stages-before-draw",
    f"--print-to-pdf={output_pdf_path}",
    f"file://{output_html_path}"
]
subprocess.run(cmd, check=True)

# Copy to brain artifact directory
artifact_pdf = "/root/.gemini/antigravity-ide/brain/8a30f8d5-02a8-4145-9fdd-f579788d93a8/guide-fne-chatbot.pdf"
with open(output_pdf_path, "rb") as f_in:
    with open(artifact_pdf, "wb") as f_out:
        f_out.write(f_in.read())

print("Successfully generated 4-page comprehensive PDF guide with Union Stances and Live Statements sections!")
