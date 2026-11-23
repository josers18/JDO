@IsTest
private class StoryTemplatesTest {
    private static final Id ACCT = '001000000000001AAA';

    private static StoryTemplates.Signals sig(String kyc, Integer cases, Boolean camp, String tier) {
        StoryTemplates.Signals s = new StoryTemplates.Signals();
        s.kycStatus = kyc;
        s.openCases = cases;
        s.campaignResponder = camp;
        s.tier = tier;
        return s;
    }

    @IsTest
    static void sameInputsSameStory() {
        StoryTemplates.Signals s = sig('Current', 2, true, 'Gold');
        StoryTemplates.Story a = StoryTemplates.build(ACCT, s, Date.newInstance(2026, 11, 20));
        StoryTemplates.Story b = StoryTemplates.build(ACCT, s, Date.newInstance(2026, 11, 20));
        System.assertEquals(a.transcript, b.transcript);
        System.assertEquals(a.recap, b.recap);
        System.assertEquals(a.title, b.title);
    }

    @IsTest
    static void noSignalsGetsRoutineCheckIn() {
        StoryTemplates.Story st = StoryTemplates.build(ACCT, sig(null, null, null, null), Date.newInstance(2026, 11, 20));
        System.assert(String.isNotBlank(st.transcript));
        System.assertEquals('Relationship Review', st.purpose);
        StoryTemplates.Story st2 = StoryTemplates.build(ACCT, null, null);
        System.assertEquals('Relationship Review', st2.purpose);
    }

    @IsTest
    static void kycExpiredMentionsReview() {
        StoryTemplates.Story st = StoryTemplates.build(ACCT, sig('Expired', null, null, null), Date.newInstance(2026, 11, 20));
        System.assert(st.recap.contains('KYC'), st.recap);
        System.assertEquals('KYC Refresh', st.purpose);
    }

    @IsTest
    static void signalsSelectPurpose() {
        Date d = Date.newInstance(2026, 11, 20);
        System.assertEquals('KYC Refresh', StoryTemplates.build(ACCT, sig('Overdue', 3, true, null), d).purpose);
        System.assertEquals('Service Follow-up', StoryTemplates.build(ACCT, sig('Current', 1, true, null), d).purpose);
        System.assertEquals('Campaign Follow-up', StoryTemplates.build(ACCT, sig(null, 0, true, null), d).purpose);
    }

    @IsTest
    static void htmlSafe() {
        List<StoryTemplates.Signals> combos = new List<StoryTemplates.Signals>{
            sig(null, null, null, null), sig('Expired', null, null, null), sig(null, 2, null, null),
            sig(null, 0, true, null), sig('Current', 0, false, 'Gold'), sig('Current', 0, false, 'Platinum'),
            sig('Current', 0, false, 'Silver')
        };
        Set<String> purposes = new Set<String>();
        for (StoryTemplates.Signals s : combos) {
            for (Integer i = 0; i < 40; i++) {
                String suffix = String.valueOf(100 + i);
                Id a = (Id) ('001000000000' + suffix + 'AAA');
                StoryTemplates.Story st = StoryTemplates.build(a, s, Date.newInstance(2026, 11, 20));
                purposes.add(st.purpose);
                for (String t : new List<String>{ st.interactionType, st.title, st.transcript, st.recap, st.nextSteps, st.purpose }) {
                    System.assert(String.isNotBlank(t));
                    System.assert(!t.contains('<') && !t.contains('&'), t);
                }
            }
        }
        System.assert(purposes.size() >= 5, String.valueOf(purposes));
    }
}
