/**
 * Removes common LLM closing boilerplate from strings shown in LWCs.
 */
public with sharing class LlmOutputSanitizer {
    private static final String CLOSING_PHRASE = 'Thank you for your attention to this comprehensive review';

    public static String stripClosingCourtesy(String input) {
        if (String.isBlank(input)) {
            return input;
        }
        String s = input.replaceAll(
            '(?i)\\s*' + Pattern.quote(CLOSING_PHRASE) + '\\.?\\s*',
            ''
        );
        s = s.replaceAll('(\\r?\\n){3,}', '\n\n');
        return s.trim();
    }
}
