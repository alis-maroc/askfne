/**
 * Test script for Arabic consonantal skeleton normalization.
 * Tests the skeleton matching for Moroccan city names.
 * 
 * Run: npx ts-node scripts/test-arabic-skeleton.ts
 */

import { normalizeCitySkeleton, extractWordSkeleton, skeletonMatch } from "../src/lib/arabic-skeleton";

interface TestCase {
    input: string;
    expected: string;
    description: string;
}

const testCases: TestCase[] = [
    // Main test cases from the task requirements
    { input: "تيزنيت", expected: "تيزنت", description: "Tiznit standard spelling" },
    { input: "تزنيت", expected: "تيزنت", description: "Tiznit alternate spelling (missing alef)" },

    { input: "إيفني", expected: "افني", description: "Ifni with hamza on alef" },
    { input: "إفني", expected: "افني", description: "Ifni with separate hamza" },

    { input: "اشتوكة", expected: "شتوكه", description: "Shtoka with prosthetic alef" },
    { input: "شتوكة", expected: "شتوكه", description: "Shtoka without prosthetic alef" },

    { input: "ورزازات", expected: "ورزازات", description: "Ouarzazate with preposition prefix" },
    { input: "وارزازات", expected: "ورزازات", description: "Ouarzazate with doubled waw" },

    { input: "سيدي افني", expected: "سيدي افن", description: "Sidi Ifni with sidi prefix" },
    { input: "سيدي افنى", expected: "سيدي افن", description: "Sidi Ifni with ya maqsura" },

    // Additional test cases
    { input: "اكادير", expected: "اكادير", description: "Agadir standard" },
    { input: "أكادير", expected: "اكادير", description: "Agadir with madda" },

    { input: "انزكان", expected: "انزكان", description: "Inzegan standard" },
    { input: "إنزكان", expected: "انزكان", description: "Inzegan with hamza" },

    { input: "تارودانت", expected: "تارودانت", description: "Taroudant standard" },
    { input: "تارودانت", expected: "تارودانت", description: "Taroudant - check final vowel removal" },

    { input: "طاطا", expected: "طاط", description: "Tata" },

    { input: "كلميم", expected: "كلميم", description: "Guelmim" },
    { input: "كلميم", expected: "كلميم", description: "Guelmim - check final vowel" },

    { input: "العيون", expected: "عيون", description: "Laayoune with article" },
    { input: "عيون", expected: "عيون", description: "Laayoune without article" },
];

function runTests() {
    console.log("🧪 Arabic Skeleton Normalization Tests\n");
    console.log("=".repeat(70) + "\n");

    let passed = 0;
    let failed = 0;

    for (const test of testCases) {
        const result = normalizeCitySkeleton(test.input);
        const success = result === test.expected;

        if (success) {
            console.log(`✅ ${test.description}`);
            console.log(`   "${test.input}" → "${result}"`);
            passed++;
        } else {
            console.log(`❌ ${test.description}`);
            console.log(`   "${test.input}" → "${result}" (expected: "${test.expected}")`);
            failed++;
        }
        console.log("");
    }

    console.log("=".repeat(70));
    console.log(`\n📊 Normalization Results: ${passed} passed, ${failed} failed, ${testCases.length} total\n`);

    // Additional skeleton matching tests
    console.log("=".repeat(70));
    console.log("\n🔗 Skeleton Matching Tests\n");

    const matchTests = [
        { a: "تيزنيت", b: "تزنيت", shouldMatch: true, description: "Tiznit variants" },
        { a: "إيفني", b: "إفني", shouldMatch: true, description: "Ifni variants" },
        { a: "اشتوكة", b: "شتوكة", shouldMatch: true, description: "Shtoka variants" },
        { a: "ورزازات", b: "وارزازات", shouldMatch: true, description: "Ouarzazate variants" },
        { a: "سيدي افني", b: "سيدي افنى", shouldMatch: true, description: "Sidi Ifni variants" },
        { a: "تيزنيت", b: "اكادير", shouldMatch: false, description: "Different cities" },
    ];

    let matchPassed = 0;
    let matchFailed = 0;

    for (const test of matchTests) {
        const match = skeletonMatch(test.a, test.b);
        const success = match === test.shouldMatch;

        if (success) {
            console.log(`✅ ${test.description}`);
            console.log(`   "${test.a}" ${match ? "==" : "≠"} "${test.b}"`);
            matchPassed++;
        } else {
            console.log(`❌ ${test.description}`);
            console.log(`   "${test.a}" ${match ? "==" : "≠"} "${test.b}" (expected: ${test.shouldMatch ? "match" : "no match"})`);
            matchFailed++;
        }
        console.log("");
    }

    console.log("=".repeat(70));
    console.log(`\n📊 Matching Results: ${matchPassed} passed, ${matchFailed} failed\n`);

    // Summary
    const totalPassed = passed + matchPassed;
    const totalFailed = failed + matchFailed;
    console.log("=".repeat(70));
    console.log(`\n🎯 FINAL SUMMARY: ${totalPassed} passed, ${totalFailed} failed`);

    if (totalFailed === 0) {
        console.log("\n✨ All tests passed! The skeleton normalization is working correctly.\n");
    } else {
        console.log("\n⚠️ Some tests failed. Please review the output above.\n");
    }

    return totalFailed === 0;
}

runTests();
