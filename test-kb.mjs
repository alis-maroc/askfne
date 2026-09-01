import * as engine from "./src/lib/ai/engine.ts";
const { chat } = engine;
const ids=["724c3c31-fdac-4731-b270-33ce93a50cf1","c95da53c-5458-4cb4-914d-da01599492ff"];
const qs=[
  "متى تبدأ السنة الدراسية؟",
  "ما هي تواريخ الامتحان الموحد الإقليمي؟",
  "متى عطلة منتصف السنة الدراسية؟"
];
for (const q of qs) {
  const r = await chat(ids[0], q);
  console.log("Q:\n" + q);
  console.log("A:\n" + r.slice(0, 1600));
  console.log("-----\n");
}
