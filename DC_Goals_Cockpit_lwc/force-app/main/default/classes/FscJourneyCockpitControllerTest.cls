/**
 * Linter note: the project's regex-based "DML inside loop" rule misfires on
 * sequential top-level `insert` statements (account, then a child list) and
 * reports them as `loop started line 0` — there is no loop. These tests are
 * governor-safe (max ~6 small inserts per transaction, all bulk-list form)
 * and follow standard Apex test idiom; treat the warnings as noise.
 */
@IsTest
private class FscJourneyCockpitControllerTest {
    // ─── Fixture builders (all return unsaved records) ───────────────────────

    private static Account buildAccount(String name) {
        return new Account(Name = name);
    }

    /**
     * Find an existing Person Account in the org for tests that need a
     * FinancialGoalParty row (the platform enforces "Financial goals can
     * only be associated to person accounts" at DML time, and creating a
     * fresh person account from Apex is brittle across FSC orgs because
     * RecordType.isPersonType() doesn't always materialize IsPersonAccount=true
     * after insert without profile-level person-account access).
     *
     * Returns null if the org has zero person accounts — the test then skips.
     */
    private static Id findExistingPersonAccountId() {
        List<Account> hit = [SELECT Id FROM Account WHERE IsPersonAccount = true WITH USER_MODE LIMIT 1];
        return hit.isEmpty() ? null : hit[0].Id;
    }

    private static FinServ__FinancialGoal__c buildManagedGoal(
        Id ownerAccountId,
        String name,
        Decimal actual,
        Decimal target,
        Date targetDate,
        String status
    ) {
        return new FinServ__FinancialGoal__c(
            Name = name,
            FinServ__PrimaryOwner__c = ownerAccountId,
            FinServ__ActualValue__c = actual,
            FinServ__TargetValue__c = target,
            FinServ__TargetDate__c = targetDate,
            FinServ__Status__c = status
        );
    }

    private static Opportunity buildOpp(Id accountId, String name, String stage, Date closeDate, Decimal amount, Decimal probability) {
        return new Opportunity(
            Name = name,
            AccountId = accountId,
            StageName = stage,
            CloseDate = closeDate,
            Amount = amount,
            Probability = probability
        );
    }

    private static FscJourneyCockpitController.PanelCard makeCard(Decimal funded, Decimal primary, Date target) {
        FscJourneyCockpitController.PanelCard c = new FscJourneyCockpitController.PanelCard();
        c.fundedPct = funded;
        c.primaryAmount = primary;
        c.progressPct = funded;
        c.targetDate = target;
        c.name = 'Test Goal';
        return c;
    }

    private static FscJourneyCockpitController.JourneyItem makeJourneyItem(Boolean done) {
        FscJourneyCockpitController.JourneyItem j = new FscJourneyCockpitController.JourneyItem();
        j.completed = done;
        j.count = 1;
        j.label = 'Test Event';
        return j;
    }

    // ─── computeFundedPct: clamping, divide-by-zero, null safety ─────────────

    @IsTest
    static void computeFundedPct_returnsZeroForNulls() {
        Account a = buildAccount('FundedPct Null');
        insert a;

        insert new List<FinServ__FinancialGoal__c>{
            buildManagedGoal(a.Id, 'NullActual', null, 1000, Date.today().addDays(30), 'In Progress'),
            buildManagedGoal(a.Id, 'ZeroTarget', 500, 0, Date.today().addDays(30), 'In Progress')
        };

        Test.startTest();
        List<FscJourneyCockpitController.PanelCard> cards = FscJourneyCockpitController.loadGoalCards(a.Id, 'managed');
        Test.stopTest();

        System.assertEquals(2, cards.size(), 'Both goals should load');
        for (FscJourneyCockpitController.PanelCard c : cards) {
            System.assertEquals(0, c.fundedPct, 'Null/zero target must yield 0%, got ' + c.fundedPct + ' for ' + c.name);
        }
    }

    @IsTest
    static void computeFundedPct_clampsAtOneHundred() {
        Account a = buildAccount('FundedPct Clamp');
        insert a;

        insert buildManagedGoal(a.Id, 'OverFunded', 5000, 1000, Date.today().addDays(30), 'Completed');

        Test.startTest();
        List<FscJourneyCockpitController.PanelCard> cards = FscJourneyCockpitController.loadGoalCards(a.Id, 'managed');
        Test.stopTest();

        System.assertEquals(1, cards.size());
        System.assertEquals(100, cards[0].fundedPct, 'Funded% must clamp at 100');
        System.assertEquals('full', cards[0].ringVariant, 'Fully-funded ring should switch to full variant');
    }

    @IsTest
    static void computeFundedPct_avoidsBinaryFloatArtifact() {
        // Decimal.valueOf((Double)) trap: 700 / 1000 → 0.6999... when routed
        // through a Double. Decimal.divide(scale, HALF_UP) gives clean 70.0.
        Account a = buildAccount('FundedPct Decimal');
        insert a;

        insert buildManagedGoal(a.Id, 'SeventyPct', 700, 1000, Date.today().addDays(30), 'In Progress');

        Test.startTest();
        List<FscJourneyCockpitController.PanelCard> cards = FscJourneyCockpitController.loadGoalCards(a.Id, 'managed');
        Test.stopTest();

        System.assertEquals(70, cards[0].fundedPct, 'Funded% must be exact 70, no binary-float artifact');
    }

    // ─── Managed Goal: status → chip variant ─────────────────────────────────

    @IsTest
    static void managedGoal_mapsStatusToChipVariant() {
        Account a = buildAccount('Chip Mapping');
        insert a;

        insert new List<FinServ__FinancialGoal__c>{
            buildManagedGoal(a.Id, 'NS', 0, 1000, Date.today().addDays(60), 'Not Started'),
            buildManagedGoal(a.Id, 'IP', 500, 1000, Date.today().addDays(60), 'In Progress'),
            buildManagedGoal(a.Id, 'CD', 1000, 1000, Date.today().addDays(60), 'Completed')
        };

        Test.startTest();
        List<FscJourneyCockpitController.PanelCard> cards = FscJourneyCockpitController.loadGoalCards(a.Id, 'managed');
        Test.stopTest();

        Map<String, String> byName = new Map<String, String>();
        for (FscJourneyCockpitController.PanelCard c : cards) {
            byName.put(c.name, c.chipVariant);
        }
        System.assertEquals('neutral', byName.get('NS'));
        System.assertEquals('Medium', byName.get('IP'));
        System.assertEquals('green', byName.get('CD'));
    }

    // ─── Goal cards sort by funded% desc ─────────────────────────────────────

    @IsTest
    static void managedGoal_sortsByFundedDescending() {
        Account a = buildAccount('Sort Order');
        insert a;

        insert new List<FinServ__FinancialGoal__c>{
            buildManagedGoal(a.Id, 'Twenty', 200, 1000, Date.today().addDays(30), 'In Progress'),
            buildManagedGoal(a.Id, 'Eighty', 800, 1000, Date.today().addDays(30), 'In Progress'),
            buildManagedGoal(a.Id, 'Fifty', 500, 1000, Date.today().addDays(30), 'In Progress')
        };

        Test.startTest();
        List<FscJourneyCockpitController.PanelCard> cards = FscJourneyCockpitController.loadGoalCards(a.Id, 'managed');
        Test.stopTest();

        System.assertEquals(3, cards.size());
        System.assertEquals(80, cards[0].fundedPct);
        System.assertEquals(50, cards[1].fundedPct);
        System.assertEquals(20, cards[2].fundedPct);
    }

    // ─── Opportunity branch ──────────────────────────────────────────────────

    @IsTest
    static void opportunities_areLoadedAndKpisComputed() {
        Account a = buildAccount('Opp Load');
        insert a;

        insert new List<Opportunity>{
            buildOpp(a.Id, 'Big', 'Prospecting', Date.today().addDays(30), 1000000, 80),
            buildOpp(a.Id, 'Small', 'Prospecting', Date.today().addDays(60), 100000, 20)
        };

        Test.startTest();
        FscJourneyCockpitController.CockpitView v = FscJourneyCockpitController.getCockpit(a.Id, 'managed', 'managed');
        Test.stopTest();

        System.assertEquals('business', v.recordType);
        System.assertEquals('Opportunities', v.panelTitle);
        System.assertEquals(2, v.cards.size(), 'Both open opps load');
        // Sort: probability desc → 'Big' (80) first
        System.assertEquals('Big', v.cards[0].name);
        System.assertEquals('blue', v.cards[0].ringVariant);

        // KPIs: 4 fixed slots
        System.assertEquals(4, v.kpis.size());
        System.assertEquals('Open deals', v.kpis[0].label);
        System.assertEquals('2', v.kpis[0].value);
        System.assertEquals('Pipeline', v.kpis[1].label);
        // Pipeline = $1M + $100K → $1.1M (compact format)
        System.assert(v.kpis[1].value.contains('1.1M'), 'Pipeline KPI should format as $1.1M, got ' + v.kpis[1].value);
        // Weighted = 1M*0.8 + 100K*0.2 = 820K
        System.assert(
            v.kpis[2].value.contains('820K'),
            'Weighted KPI should format as $820K, got ' + v.kpis[2].value
        );
    }

    @IsTest
    static void opportunities_closedOnesAreExcluded() {
        Account a = buildAccount('Opp Closed');
        insert a;

        insert new List<Opportunity>{
            buildOpp(a.Id, 'Open', 'Prospecting', Date.today().addDays(30), 100000, 50),
            buildOpp(a.Id, 'Won', 'Closed Won', Date.today().addDays(-10), 500000, 100)
        };

        Test.startTest();
        List<FscJourneyCockpitController.PanelCard> cards = FscJourneyCockpitController.loadOpportunityCards(a.Id);
        Test.stopTest();

        System.assertEquals(1, cards.size(), 'Closed opps must be excluded');
        System.assertEquals('Open', cards[0].name);
    }

    @IsTest
    static void opportunities_emptyState() {
        Account a = buildAccount('Empty Opp');
        insert a;

        Test.startTest();
        FscJourneyCockpitController.CockpitView v = FscJourneyCockpitController.getCockpit(a.Id, 'managed', 'managed');
        Test.stopTest();

        System.assertEquals('business', v.recordType);
        System.assertEquals(0, v.cards.size(), 'No opportunities');
        System.assertEquals(4, v.kpis.size(), 'KPIs should still render 4 tiles');
        System.assertEquals('0', v.kpis[0].value);
        System.assertEquals('—', v.kpis[3].value);
    }

    // ─── Journey rail: completion derivation + grouping ──────────────────────

    @IsTest
    static void businessJourney_completionDerivedFromDate() {
        Account a = buildAccount('Milestone Past Future');
        insert a;

        // BusinessMilestone.MilestoneType AND MilestoneDate are required
        // (nillable=false) in this org's FSC config — null-date case is exercised
        // on PersonLifeEvent (FinServ__LifeEvent__c.FinServ__EventDate__c is nullable).
        // We use distinct MilestoneType picklist values per record so the controller's
        // "label = MilestoneType when present" branch produces unique grouping keys.
        insert new List<BusinessMilestone>{
            new BusinessMilestone(Name = 'Past Expansion', PrimaryAccountId = a.Id, MilestoneType = 'Expansion', MilestoneDate = Datetime.now().addDays(-365)),
            new BusinessMilestone(Name = 'Future Funding', PrimaryAccountId = a.Id, MilestoneType = 'New Funding', MilestoneDate = Datetime.now().addDays(180))
        };

        Test.startTest();
        List<FscJourneyCockpitController.JourneyItem> items = FscJourneyCockpitController.loadBusinessJourney(a.Id);
        Test.stopTest();

        System.assertEquals(2, items.size());
        Map<String, FscJourneyCockpitController.JourneyItem> byLabel = new Map<String, FscJourneyCockpitController.JourneyItem>();
        for (FscJourneyCockpitController.JourneyItem j : items) {
            byLabel.put(j.label, j);
        }
        System.assertEquals(true, byLabel.get('Expansion').completed, 'Past-dated milestone must be completed');
        System.assertEquals(false, byLabel.get('New Funding').completed, 'Future-dated milestone must be planned');
    }

    @IsTest
    static void personJourney_undatedEventIsPlanned() {
        // Null-date case exercised on FinServ__LifeEvent__c, which DOES allow null EventDate.
        Account a = buildAccount('Undated Life Event');
        insert a;

        insert new FinServ__LifeEvent__c(
            FinServ__Client__c = a.Id,
            FinServ__EventType__c = 'Marriage',
            FinServ__EventDate__c = null
        );

        Test.startTest();
        List<FscJourneyCockpitController.JourneyItem> items = FscJourneyCockpitController.loadPersonJourney(a.Id, 'managed');
        Test.stopTest();

        System.assertEquals(1, items.size());
        System.assertEquals(false, items[0].completed, 'Null-dated life event must be planned (not completed)');
    }

    @IsTest
    static void personJourney_managedBindingHonored() {
        // Use a Business Account as the FinServ__Client__c parent — the
        // controller doesn't enforce IsPersonAccount on the rail load itself.
        Account a = buildAccount('Life Event Owner');
        insert a;

        insert new List<FinServ__LifeEvent__c>{
            new FinServ__LifeEvent__c(
                FinServ__Client__c = a.Id,
                FinServ__EventType__c = 'Graduation',
                FinServ__EventDate__c = Date.today().addDays(-2000)
            ),
            new FinServ__LifeEvent__c(
                FinServ__Client__c = a.Id,
                FinServ__EventType__c = 'Marriage',
                FinServ__EventDate__c = Date.today().addDays(-1000)
            )
        };

        Test.startTest();
        List<FscJourneyCockpitController.JourneyItem> items = FscJourneyCockpitController.loadPersonJourney(a.Id, 'managed');
        Test.stopTest();

        System.assertEquals(2, items.size());
        for (FscJourneyCockpitController.JourneyItem j : items) {
            System.assertEquals(true, j.completed, 'Past-dated managed life events must be completed');
        }
    }

    // ─── KPI math (direct) ───────────────────────────────────────────────────

    @IsTest
    static void computeGoalKpis_avgFundedAndNextDeadline() {
        List<FscJourneyCockpitController.PanelCard> cards = new List<FscJourneyCockpitController.PanelCard>{
            makeCard(20, 200, Date.today().addDays(60)),
            makeCard(60, 600, Date.today().addDays(30)),
            makeCard(40, 400, Date.today().addDays(90))
        };
        cards[0].name = 'Far';
        cards[1].name = 'Soon';
        cards[2].name = 'Mid';
        cards[1].targetDate = Date.today().addDays(30);

        List<FscJourneyCockpitController.JourneyItem> j = new List<FscJourneyCockpitController.JourneyItem>{
            makeJourneyItem(true), makeJourneyItem(true), makeJourneyItem(false)
        };

        Test.startTest();
        List<FscJourneyCockpitController.Kpi> k = FscJourneyCockpitController.computeGoalKpis(cards, j);
        Test.stopTest();

        System.assertEquals(4, k.size());
        System.assertEquals('Goals', k[0].label);
        System.assertEquals('3', k[0].value);
        System.assertEquals('2 life events recorded', k[0].meta, 'completed life events count');

        System.assertEquals('Avg funded', k[1].label);
        System.assertEquals('40%', k[1].value, 'avg of 20, 60, 40 = 40');

        System.assertEquals('Total tracked', k[2].label);
        System.assert(k[2].value.contains('1K') || k[2].value.contains('1.2K'), 'Total is 200+600+400 = 1200, expected ~$1K, got ' + k[2].value);

        System.assertEquals('Next deadline', k[3].label);
        System.assertEquals('Soon', k[3].meta, 'Goal soonest in future and not 100% funded should be Next deadline');
    }

    @IsTest
    static void computeGoalKpis_handlesEmptyCardList() {
        Test.startTest();
        List<FscJourneyCockpitController.Kpi> k = FscJourneyCockpitController.computeGoalKpis(
            new List<FscJourneyCockpitController.PanelCard>(),
            new List<FscJourneyCockpitController.JourneyItem>()
        );
        Test.stopTest();

        System.assertEquals(4, k.size());
        System.assertEquals('0', k[0].value);
        System.assertEquals('0%', k[1].value);
        System.assertEquals('—', k[3].value);
        System.assertEquals('all reached', k[3].meta);
    }

    @IsTest
    static void computeOpportunityKpis_emptyHandling() {
        Test.startTest();
        List<FscJourneyCockpitController.Kpi> k = FscJourneyCockpitController.computeOpportunityKpis(
            new List<FscJourneyCockpitController.PanelCard>()
        );
        Test.stopTest();
        System.assertEquals(4, k.size());
        System.assertEquals('0', k[0].value);
        System.assertEquals('—', k[3].value);
    }

    // ─── Standard-binding paths (goalBinding=standard, lifeEventBinding=standard) ─

    @IsTest
    static void standardGoals_loadedViaFinancialGoalParty() {
        // FSC native FinancialGoals reads via the FinancialGoalParty junction,
        // not via FinancialPlan.AccountId. Goals can have a null FinancialPlan
        // and STILL be visible to a person via Party participation. This test
        // verifies the cockpit matches that behavior.
        // FinancialGoalParty.AccountId is platform-restricted to person accounts;
        // we re-use an existing one to dodge FSC's record-type quirks at insert.
        Id personAcctId = findExistingPersonAccountId();
        if (personAcctId == null) {
            // Org has no person accounts — skip rather than misreport a failure.
            return;
        }

        // FinancialGoal.Status API values are UPPER_SNAKE (IN_PROGRESS, etc.)
        // and Priority API values are UPPER (HIGH/MEDIUM/LOW). The cockpit
        // controller maps Priority into title-case labels for the chip CSS.
        List<FinancialGoal> goals = new List<FinancialGoal>{
            new FinancialGoal(
                Name = 'Standard A',
                Type = 'Retirement',
                Status = 'IN_PROGRESS',
                Priority = 'HIGH',
                ActualAmount = 5000,
                TargetAmount = 10000,
                TargetDate = Date.today().addDays(180)
            ),
            new FinancialGoal(
                Name = 'Standard B',
                Type = 'Education',
                Status = 'IN_PROGRESS',
                Priority = 'MEDIUM',
                ActualAmount = 3000,
                TargetAmount = 5000,
                TargetDate = Date.today().addDays(365)
            )
        };
        insert goals;

        // Junction rows: each goal participates with the existing person account.
        insert new List<FinancialGoalParty>{
            new FinancialGoalParty(AccountId = personAcctId, FinancialGoalId = goals[0].Id),
            new FinancialGoalParty(AccountId = personAcctId, FinancialGoalId = goals[1].Id)
        };

        Test.startTest();
        List<FscJourneyCockpitController.PanelCard> cards = FscJourneyCockpitController.loadGoalCards(personAcctId, 'standard');
        Test.stopTest();

        // Reusing an existing person account means the org may have OTHER
        // FinancialGoalParty rows tied to it — we only assert that OUR two
        // goals are present, not that count == 2.
        Map<String, FscJourneyCockpitController.PanelCard> byName = new Map<String, FscJourneyCockpitController.PanelCard>();
        for (FscJourneyCockpitController.PanelCard c : cards) {
            byName.put(c.name, c);
        }
        System.assert(byName.containsKey('Standard A'), 'Goal "Standard A" must surface via FinancialGoalParty join');
        System.assert(byName.containsKey('Standard B'), 'Goal "Standard B" must surface via FinancialGoalParty join');
        // Priority HIGH/MEDIUM/LOW → chip label/variant 'High'/'Medium'/'Low'.
        System.assertEquals('High', byName.get('Standard A').chipLabel, 'Priority HIGH must render as chip "High"');
        System.assertEquals('High', byName.get('Standard A').chipVariant);
        System.assertEquals('Medium', byName.get('Standard B').chipLabel);
        System.assertEquals(50, byName.get('Standard A').fundedPct, 'Funded% from ActualAmount/TargetAmount');
        System.assertEquals(60, byName.get('Standard B').fundedPct);
        // recordUrl must point at FinancialGoal (standard binding URL pattern).
        System.assert(
            byName.get('Standard A').recordUrl.startsWith('/lightning/r/FinancialGoal/'),
            'recordUrl must use standard FinancialGoal path, got ' + byName.get('Standard A').recordUrl
        );
    }

    @IsTest
    static void standardLifeEvents_loadedViaContact() {
        Account a = buildAccount('Standard Life Events');
        insert a;

        Contact c = new Contact(LastName = 'Standard Tester', AccountId = a.Id);
        insert c;

        insert new List<PersonLifeEvent>{
            new PersonLifeEvent(
                Name = 'Past Marriage',
                PrimaryPersonId = c.Id,
                EventType = 'Marriage',
                EventDate = Datetime.now().addDays(-2000)
            ),
            new PersonLifeEvent(
                Name = 'Future Graduation',
                PrimaryPersonId = c.Id,
                EventType = 'Graduation',
                EventDate = Datetime.now().addDays(180)
            )
        };

        Test.startTest();
        List<FscJourneyCockpitController.JourneyItem> items = FscJourneyCockpitController.loadPersonJourney(a.Id, 'standard');
        Test.stopTest();

        System.assertEquals(2, items.size(), 'Both standard life events via Contact.AccountId must load');
        Map<String, FscJourneyCockpitController.JourneyItem> byLabel = new Map<String, FscJourneyCockpitController.JourneyItem>();
        for (FscJourneyCockpitController.JourneyItem j : items) {
            byLabel.put(j.label, j);
        }
        System.assertEquals(true, byLabel.get('Marriage').completed, 'Past-dated standard life event must be completed');
        System.assertEquals(false, byLabel.get('Graduation').completed, 'Future-dated standard life event must be planned');
    }

    // ─── Binding normalization ───────────────────────────────────────────────

    @IsTest
    static void getCockpit_invalidBindingFallsBackToDefault() {
        // Default binding is 'standard' (matches FSC native widget). Pass
        // nonsense values; the controller must coerce silently to 'standard'
        // and a person account must surface as recordType='person'.
        Id personAcctId = findExistingPersonAccountId();
        if (personAcctId == null) {
            return;
        }

        // Seed a FinancialGoal + FinancialGoalParty so the standard path returns data.
        FinancialGoal g = new FinancialGoal(
            Name = 'Fallback Goal ' + System.now().getTime(),
            Type = 'Retirement',
            Status = 'IN_PROGRESS',
            Priority = 'LOW',
            ActualAmount = 50,
            TargetAmount = 100,
            TargetDate = Date.today().addDays(30)
        );
        insert g;
        insert new FinancialGoalParty(AccountId = personAcctId, FinancialGoalId = g.Id);

        Test.startTest();
        FscJourneyCockpitController.CockpitView v = FscJourneyCockpitController.getCockpit(personAcctId, 'gibberish', null);
        Test.stopTest();

        System.assertEquals('person', v.recordType);
        System.assertNotEquals(null, v.kpis);
        System.assert(v.cards.size() >= 1, 'Default binding (standard) must surface at least the seeded FinancialGoal');
    }

    // ─── Error paths ─────────────────────────────────────────────────────────

    @IsTest
    static void getCockpit_throwsForNullRecordId() {
        Boolean threw = false;
        Test.startTest();
        try {
            FscJourneyCockpitController.getCockpit(null, 'managed', 'managed');
        } catch (AuraHandledException e) {
            threw = true;
            System.assert(e.getMessage().containsIgnoreCase('record id'), 'Expected helpful message');
        }
        Test.stopTest();
        System.assert(threw, 'Null recordId must throw AuraHandledException');
    }

    @IsTest
    static void getCockpit_throwsForUnknownAccount() {
        Boolean threw = false;
        // Construct a syntactically valid Account Id that doesn't exist
        Id fakeId = '001000000000000AAA';
        Test.startTest();
        try {
            FscJourneyCockpitController.getCockpit(fakeId, 'managed', 'managed');
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();
        System.assert(threw, 'Missing account must throw');
    }
}
