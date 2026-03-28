@IsTest
private class LlmOutputSanitizerTest {
    @IsTest
    static void stripClosingCourtesy_removes_phrase() {
        String raw = 'Hello.\n\nThank you for your attention to this comprehensive review.';
        System.assert(!LlmOutputSanitizer.stripClosingCourtesy(raw).contains('Thank you for your attention'));
    }
}
