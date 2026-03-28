@IsTest
private class LlmOutputSanitizerTest {
    @IsTest
    static void stripClosingCourtesy_removes_trailing_phrase() {
        String raw = 'Summary line one.\n\nThank you for your attention to this comprehensive review.';
        String out = LlmOutputSanitizer.stripClosingCourtesy(raw);
        System.assert(!out.contains('Thank you for your attention'), out);
        System.assert(out.contains('Summary line one'), out);
    }

    @IsTest
    static void stripClosingCourtesy_removes_without_trailing_period() {
        String raw = 'Done.\nThank you for your attention to this comprehensive review\n';
        String out = LlmOutputSanitizer.stripClosingCourtesy(raw);
        System.assert(!out.contains('Thank you'), out);
    }

    @IsTest
    static void stripClosingCourtesy_case_insensitive() {
        String raw = 'X.\nthank YOU for your attention to this comprehensive review.';
        System.assert(!LlmOutputSanitizer.stripClosingCourtesy(raw).contains('attention'));
    }
}
