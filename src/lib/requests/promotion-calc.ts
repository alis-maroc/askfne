/**
 * Moroccan National Education Promotion Points Calculator Module
 * Follows the official criteria and https://hub.taalim.org/calc_promotion_points.php
 */

export interface PromotionCalcState {
  active: boolean;
  step: number; // 0: year, 1: hire date, 2: grade date, 3: admin points
  data: {
    promotionYear?: number;
    hireDate?: string; // YYYY-MM-DD or DD/MM/YYYY
    gradeDate?: string; // YYYY-MM-DD or DD/MM/YYYY
    pointsDirector?: number;
    pointsInspector?: number;
    pointsRegional?: number;
    adminPointsTotal?: number;
  };
}

export const PROMO_CALC_META_KEY = "promotionCalcWizard";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializePromoCalcState(state: PromotionCalcState | null): any {
  if (state === null) return null;
  return JSON.parse(JSON.stringify(state));
}

export function parseDateInput(input: string): { day: number; month: number; year: number } | null {
  const clean = input
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[\-\.\s]/g, "/");

  // Patterns: DD/MM/YYYY or YYYY/MM/DD or MM/YYYY or YYYY
  const parts = clean.split("/").map((p) => parseInt(p, 10)).filter((p) => !isNaN(p));
  if (parts.length === 3) {
    if (parts[0] > 1900 && parts[0] <= 2030) {
      // YYYY/MM/DD
      return { year: parts[0], month: parts[1], day: parts[2] };
    }
    // DD/MM/YYYY
    return { day: parts[0], month: parts[1], year: parts[2] };
  }
  if (parts.length === 2) {
    // MM/YYYY
    if (parts[1] > 1900) {
      return { day: 1, month: parts[0], year: parts[1] };
    }
  }
  if (parts.length === 1 && parts[0] > 1960 && parts[0] <= 2030) {
    return { day: 1, month: 9, year: parts[0] };
  }
  return null;
}

export function calculatePromotionResult(
  promotionYear: number,
  hireDate: { day: number; month: number; year: number },
  gradeDate: { day: number; month: number; year: number },
  pointsDirector: number,
  pointsInspector: number,
  pointsRegional: number,
) {
  // Seniority is calculated until 31 December of promotionYear
  const hireYears = promotionYear - hireDate.year;
  const gradeYears = promotionYear - gradeDate.year;

  const adminSeniorityYears = Math.max(0, hireYears);
  const adminSeniorityPoints = adminSeniorityYears * 1;

  const gradeSeniorityYears = Math.max(0, gradeYears);
  const gradeSeniorityPoints = gradeSeniorityYears * 2;

  const adminPointsSum = Number((pointsDirector + pointsInspector + pointsRegional).toFixed(2));
  const totalPoints = Number((adminSeniorityPoints + gradeSeniorityPoints + adminPointsSum).toFixed(2));

  return {
    promotionYear,
    adminSeniorityYears,
    adminSeniorityPoints,
    gradeSeniorityYears,
    gradeSeniorityPoints,
    pointsDirector,
    pointsInspector,
    pointsRegional,
    adminPointsSum,
    totalPoints,
  };
}

export function getPromoQuestion(state: PromotionCalcState): string {
  switch (state.step) {
    case 0:
      return [
        "🧮 *حاسبة وتدقيق نقط الترقية (بالاختيار / السلم)*",
        "━━━━━━━━━━━━━━━━━━━━",
        "1️⃣ *يرجى تحديد سنة الترقي المطلوبة:*",
        "_(مثال: 2024 أو 2025)_",
        "",
        "_(أرسل *0* للإلغاء والرجوع للقائمة الرئيسية)_",
      ].join("\n");

    case 1:
      return [
        `سنة الترقي: *${state.data.promotionYear}* ✅`,
        "━━━━━━━━━━━━━━━━━━━━",
        "2️⃣ *يرجى إدخال تاريخ التوظيف (الأقدمية في الإدارة):*",
        "_(اليوم/الشهر/السنة مثل: 16/09/2014 أو السنة فقط 2014)_",
        "",
        "_(أرسل *0* للقائمة الرئيسية)_",
      ].join("\n");

    case 2:
      return [
        "3️⃣ *يرجى إدخال تاريخ التسمية في الدرجة الحالية (الأقدمية في الدرجة):*",
        "_(اليوم/الشهر/السنة مثل: 01/01/2018 أو 2018)_",
        "",
        "_(أرسل *0* للقائمة الرئيسية)_",
      ].join("\n");

    case 3:
      return [
        "4️⃣ *يرجى إدخال النقط الإدارية (نقطة المدير، المفتش، والمدير الإقليمي):*",
        "• إذا كانت كل نقطة تساوي 20 (أو نقطتك الإدارية الإجمالية 60)، أرسل فقط: *20* أو *60*",
        "• أو أرسلها مفصلة مفصولة بمسافة (مثال: *20 19.5 20*)",
        "",
        "_(أرسل *0* للقائمة الرئيسية)_",
      ].join("\n");

    default:
      return "";
  }
}

export function processPromoAnswer(
  state: PromotionCalcState,
  rawAnswer: string,
): { state: PromotionCalcState; isDone: boolean; error?: string } {
  const answer = rawAnswer
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));

  if (state.step === 0) {
    const yearMatch = answer.match(/\b(20[1-3][0-9])\b/);
    if (!yearMatch) {
      return {
        state,
        isDone: false,
        error: "⚠️ يرجى إدخال سنة صحيحة (مثال: 2024 أو 2025).",
      };
    }
    return {
      state: {
        ...state,
        step: 1,
        data: { ...state.data, promotionYear: parseInt(yearMatch[1], 10) },
      },
      isDone: false,
    };
  }

  if (state.step === 1) {
    const parsed = parseDateInput(answer);
    if (!parsed) {
      return {
        state,
        isDone: false,
        error: "⚠️ يرجى إدخال تاريخ توظيف صحيح (مثال: 16/09/2014 أو 2014).",
      };
    }
    return {
      state: {
        ...state,
        step: 2,
        data: {
          ...state.data,
          hireDate: `${parsed.day}/${parsed.month}/${parsed.year}`,
        },
      },
      isDone: false,
    };
  }

  if (state.step === 2) {
    const parsed = parseDateInput(answer);
    if (!parsed) {
      return {
        state,
        isDone: false,
        error: "⚠️ يرجى إدخال تاريخ تسمية في الدرجة صحيح (مثال: 01/01/2018 أو 2018).",
      };
    }
    return {
      state: {
        ...state,
        step: 3,
        data: {
          ...state.data,
          gradeDate: `${parsed.day}/${parsed.month}/${parsed.year}`,
        },
      },
      isDone: false,
    };
  }

  if (state.step === 3) {
    const numbers = answer
      .split(/[\s,;]+/)
      .map((n) => parseFloat(n))
      .filter((n) => !isNaN(n));

    let pDir = 20;
    let pInsp = 20;
    let pReg = 20;

    if (numbers.length >= 3) {
      pDir = Math.min(20, Math.max(0, numbers[0]));
      pInsp = Math.min(20, Math.max(0, numbers[1]));
      pReg = Math.min(20, Math.max(0, numbers[2]));
    } else if (numbers.length === 1) {
      if (numbers[0] > 20 && numbers[0] <= 60) {
        const each = Number((numbers[0] / 3).toFixed(2));
        pDir = each;
        pInsp = each;
        pReg = Number((numbers[0] - each * 2).toFixed(2));
      } else {
        const val = Math.min(20, Math.max(0, numbers[0]));
        pDir = val;
        pInsp = val;
        pReg = val;
      }
    } else {
      pDir = 20;
      pInsp = 20;
      pReg = 20;
    }

    return {
      state: {
        ...state,
        step: 4,
        data: {
          ...state.data,
          pointsDirector: pDir,
          pointsInspector: pInsp,
          pointsRegional: pReg,
        },
      },
      isDone: true,
    };
  }

  return { state, isDone: true };
}

export function formatPromoSummary(state: PromotionCalcState): string {
  const pYear = state.data.promotionYear || new Date().getFullYear();
  const hDate = parseDateInput(state.data.hireDate || "01/09/2014") || { day: 1, month: 9, year: 2014 };
  const gDate = parseDateInput(state.data.gradeDate || "01/01/2018") || { day: 1, month: 1, year: 2018 };
  const pDir = state.data.pointsDirector ?? 20;
  const pInsp = state.data.pointsInspector ?? 20;
  const pReg = state.data.pointsRegional ?? 20;

  const res = calculatePromotionResult(pYear, hDate, gDate, pDir, pInsp, pReg);

  return [
    `📊 *نتيجة تدقيق وحساب نقط الترقية برسم سنة ${res.promotionYear}*`,
    "━━━━━━━━━━━━━━━━━━━━",
    `📅 الأقدمية المحتسبة حتى: *31 دجنبر ${res.promotionYear}*`,
    "",
    `🏢 *الأقدمية في الإدارة (عامة):*`,
    `• عدد السنوات: *${res.adminSeniorityYears}* سنة`,
    `• نقط الأقدمية: *${res.adminSeniorityPoints}* نقطة (1 نقطة عن كل سنة)`,
    "",
    `⭐ *الأقدمية في الدرجة الحالية:*`,
    `• عدد السنوات: *${res.gradeSeniorityYears}* سنة`,
    `• نقط الدرجة: *${res.gradeSeniorityPoints}* نقطة (2 نقطتان عن كل سنة)`,
    "",
    `📝 *النقط الإدارية:*`,
    `• نقطة المدير: *${res.pointsDirector} / 20*`,
    `• نقطة المفتش: *${res.pointsInspector} / 20*`,
    `• نقطة المدير الإقليمي: *${res.pointsRegional} / 20*`,
    `• مجموع النقط الإدارية: *${res.adminPointsSum} / 60*`,
    "",
    `🏆 *المجموع العام لنقاط الترقية:*`,
    `⭐️ *${res.totalPoints} نقطة* ⭐️`,
    "",
    "💡 *ملاحظات إرشادية:*",
    "• يتم الترتيب في جداول الترقي السنوية بناءً على هذا المجموع الإجمالي للنقاط.",
    "• في حال تساوي النقط، يُرجح المترشح(ة) الأكبر سناً أو الأقدم في الإدارة.",
    "",
    "🔗 يمكنك أيضاً استخدام حاسبة الموقع الرسمية: https://hub.taalim.org/calc_promotion_points.php",
    "",
    "📋 للرجوع للقائمة الرئيسية أرسل *0*",
  ].join("\n");
}
