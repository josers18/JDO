/**
 * FscJourneyCockpitController
 * ----------------------------
 * Single-round-trip controller for the fscJourneyCockpit LWC. Returns a
 * pre-computed CockpitView so the component is a dumb renderer: KPI math,
 * priority-chip mapping, journey-rail completion logic, and stage-progress
 * fall-through to Opportunity.Probability all happen here.
 *
 * Bindings are admin-configurable per FlexiPage via design attributes:
 *   goalBinding      = 'managed' | 'standard'
 *   lifeEventBinding = 'managed' | 'standard'
 *
 * The 'managed' default points at the FSC managed package
 * (FinServ__FinancialGoal__c, FinServ__LifeEvent__c) — the only stack with
 * meaningful row volume in jdo-uqj0jr at scaffold time.
 */
public with sharing class FscJourneyCockpitController {
    private static final Set<String> VALID_BINDINGS = new Set<String>{ 'managed', 'standard' };
    private static final String BINDING_MANAGED = 'managed';
    private static final String BINDING_STANDARD = 'standard';
    // Default binding is 'standard' because the FSC native widget reads from
    // the FinancialGoal+FinancialGoalParty junction, not the managed
    // FinServ__FinancialGoal__c+PrimaryOwner/Household chain. Matching the
    // native widget out-of-the-box prevents user confusion.
    private static final String DEFAULT_BINDING = BINDING_STANDARD;
    private static final Integer MAX_RAIL_ITEMS = 50;

    // Managed-binding chip vocabulary: source is FinServ__Status__c.
    private static final Map<String, String> MANAGED_STATUS_TO_CHIP_VARIANT = new Map<String, String>{
        'Not Started' => 'neutral',
        'In Progress' => 'Medium',
        'Completed' => 'green'
    };

    // Standard-binding chip vocabulary: FinancialGoal.Priority API values
    // are HIGH/MEDIUM/LOW (uppercase) but the chip CSS classes are
    // High/Medium/Low (title case). Map both ways.
    private static final Map<String, String> STANDARD_PRIORITY_TO_LABEL = new Map<String, String>{
        'HIGH' => 'High',
        'MEDIUM' => 'Medium',
        'LOW' => 'Low'
    };

    /**
     * Single LWC entry point. cacheable=true; FLS/CRUD enforced by WITH USER_MODE
     * on every SOQL string in this class.
     */
    @AuraEnabled(cacheable = true)
    public static CockpitView getCockpit(Id recordId, String goalBinding, String lifeEventBinding) {
        if (recordId == null) {
            throw buildAuraException('A record Id is required.');
        }
        String gb = normalizeBinding(goalBinding);
        String lb = normalizeBinding(lifeEventBinding);

        try {
            Account acct = loadAccount(recordId);
            CockpitView view = new CockpitView();
            view.recordType = acct.IsPersonAccount ? 'person' : 'business';

            if (acct.IsPersonAccount) {
                view.journeyLabel = 'Life Events';
                view.journey = loadPersonJourney(recordId, lb);
                view.panelTitle = 'Goals';
                view.cards = loadGoalCards(recordId, gb);
                view.kpis = computeGoalKpis(view.cards, view.journey);
            } else {
                view.journeyLabel = 'Business Milestones';
                view.journey = loadBusinessJourney(recordId);
                view.panelTitle = 'Opportunities';
                view.cards = loadOpportunityCards(recordId);
                view.kpis = computeOpportunityKpis(view.cards);
            }
            return view;
        } catch (AuraHandledException ahe) {
            throw ahe;
        } catch (Exception e) {
            throw buildAuraException('Could not load cockpit: ' + e.getMessage());
        }
    }

    // ─── Account ──────────────────────────────────────────────────────────────

    private static Account loadAccount(Id recordId) {
        List<Account> rows = [
            SELECT Id, Name, IsPersonAccount
            FROM Account
            WHERE Id = :recordId
            WITH USER_MODE
            LIMIT 1
        ];
        if (rows.isEmpty()) {
            throw buildAuraException('Account not found or you lack access.');
        }
        return rows[0];
    }

    // ─── Goals ────────────────────────────────────────────────────────────────

    @TestVisible
    private static List<PanelCard> loadGoalCards(Id recordId, String goalBinding) {
        return goalBinding == BINDING_STANDARD ? loadStandardGoals(recordId) : loadManagedGoals(recordId);
    }

    private static List<PanelCard> loadManagedGoals(Id recordId) {
        List<FinServ__FinancialGoal__c> rows = [
            SELECT
                Id,
                Name,
                FinServ__ActualValue__c,
                FinServ__TargetValue__c,
                FinServ__TargetDate__c,
                FinServ__Status__c
            FROM FinServ__FinancialGoal__c
            WHERE FinServ__PrimaryOwner__c = :recordId OR FinServ__Household__c = :recordId
            WITH USER_MODE
            ORDER BY FinServ__TargetDate__c ASC NULLS LAST
            LIMIT 50
        ];

        List<PanelCard> out = new List<PanelCard>();
        for (FinServ__FinancialGoal__c g : rows) {
            PanelCard c = new PanelCard();
            c.recordId = g.Id;
            c.recordUrl = '/lightning/r/FinServ__FinancialGoal__c/' + g.Id + '/view';
            c.name = g.Name;
            c.icon = goalIconFor(g.Name);
            c.primaryAmount = g.FinServ__ActualValue__c;
            c.targetAmount = g.FinServ__TargetValue__c;
            c.fundedPct = computeFundedPct(g.FinServ__ActualValue__c, g.FinServ__TargetValue__c);
            c.progressPct = c.fundedPct;
            c.ringPct = c.fundedPct;
            c.ringVariant = c.fundedPct >= 99.9 ? 'full' : 'gold';
            c.targetDate = g.FinServ__TargetDate__c;
            c.chipLabel = g.FinServ__Status__c;
            c.chipVariant = MANAGED_STATUS_TO_CHIP_VARIANT.containsKey(g.FinServ__Status__c)
                ? MANAGED_STATUS_TO_CHIP_VARIANT.get(g.FinServ__Status__c)
                : 'neutral';
            c.footRight = footTextForGoal(g.FinServ__TargetDate__c);
            out.add(c);
        }
        sortGoalCardsByFunded(out);
        return out;
    }

    private static List<PanelCard> loadStandardGoals(Id recordId) {
        // Resolve goals via the FinancialGoalParty junction — this is what
        // the FSC native FinancialGoals component reads. The legacy chain
        // (`WHERE FinancialPlan.AccountId = :recordId`) is incorrect: it
        // misses goals that have no FinancialPlan but ARE party-linked
        // (the canonical FSC scope).
        List<FinancialGoal> rows = [
            SELECT Id, Name, ActualAmount, TargetAmount, TargetDate, Priority
            FROM FinancialGoal
            WHERE Id IN (
                SELECT FinancialGoalId
                FROM FinancialGoalParty
                WHERE AccountId = :recordId
            )
            WITH USER_MODE
            ORDER BY TargetDate ASC NULLS LAST
            LIMIT 50
        ];

        List<PanelCard> out = new List<PanelCard>();
        for (FinancialGoal g : rows) {
            PanelCard c = new PanelCard();
            c.recordId = g.Id;
            c.recordUrl = '/lightning/r/FinancialGoal/' + g.Id + '/view';
            c.name = g.Name;
            c.icon = goalIconFor(g.Name);
            c.primaryAmount = g.ActualAmount;
            c.targetAmount = g.TargetAmount;
            c.fundedPct = computeFundedPct(g.ActualAmount, g.TargetAmount);
            c.progressPct = c.fundedPct;
            c.ringPct = c.fundedPct;
            c.ringVariant = c.fundedPct >= 99.9 ? 'full' : 'gold';
            c.targetDate = g.TargetDate;
            // FinancialGoal.Priority API values are HIGH/MEDIUM/LOW; render
            // user-friendly labels and use them directly as CSS variant.
            String priorityLabel = String.isBlank(g.Priority)
                ? null
                : STANDARD_PRIORITY_TO_LABEL.get(g.Priority);
            c.chipLabel = priorityLabel == null ? '' : priorityLabel;
            c.chipVariant = priorityLabel == null ? 'neutral' : priorityLabel;
            c.footRight = footTextForGoal(g.TargetDate);
            out.add(c);
        }
        sortGoalCardsByFunded(out);
        return out;
    }

    /**
     * Decimal.divide with explicit scale + HALF_UP avoids the binary-float
     * artifacts that Decimal.valueOf((Double)) produces (e.g. 0.7 → 0.6999...).
     * Result is clamped to [0, 100].
     */
    @TestVisible
    private static Decimal computeFundedPct(Decimal actual, Decimal target) {
        if (actual == null || target == null || target == 0) {
            return 0;
        }
        Decimal pct = actual.divide(target, 4, System.RoundingMode.HALF_UP) * 100;
        if (pct < 0) {
            return 0;
        }
        if (pct > 100) {
            return 100;
        }
        return pct;
    }

    private static String footTextForGoal(Date targetDate) {
        if (targetDate == null) {
            return '';
        }
        String prefix = targetDate < Date.today() ? 'Reached ' : 'Target ';
        return prefix + formatShortDate(targetDate);
    }

    private static void sortGoalCardsByFunded(List<PanelCard> cards) {
        // Sort funded% desc by computing a sortable wrapper since List.sort()
        // requires Comparable on the element itself.
        Map<Decimal, List<PanelCard>> bucket = new Map<Decimal, List<PanelCard>>();
        List<Decimal> keys = new List<Decimal>();
        for (PanelCard c : cards) {
            Decimal k = c.fundedPct == null ? 0 : c.fundedPct;
            if (!bucket.containsKey(k)) {
                bucket.put(k, new List<PanelCard>());
                keys.add(k);
            }
            bucket.get(k).add(c);
        }
        keys.sort();
        cards.clear();
        for (Integer i = keys.size() - 1; i >= 0; i--) {
            cards.addAll(bucket.get(keys[i]));
        }
    }

    // ─── Opportunities ───────────────────────────────────────────────────────

    @TestVisible
    private static List<PanelCard> loadOpportunityCards(Id recordId) {
        List<Opportunity> rows = [
            SELECT Id, Name, Amount, StageName, Probability, CloseDate
            FROM Opportunity
            WHERE AccountId = :recordId AND IsClosed = FALSE
            WITH USER_MODE
            ORDER BY Probability DESC NULLS LAST, CloseDate ASC NULLS LAST
            LIMIT 50
        ];

        List<PanelCard> out = new List<PanelCard>();
        for (Opportunity o : rows) {
            PanelCard c = new PanelCard();
            c.recordId = o.Id;
            c.recordUrl = '/lightning/r/Opportunity/' + o.Id + '/view';
            c.name = o.Name;
            c.icon = opportunityIconFor(o.Name);
            c.primaryAmount = o.Amount;
            c.targetAmount = null;
            c.fundedPct = null;
            // Bar fill = probability (per design decision: org has 94 active
            // stages, hand-rolled stage map is brittle; Probability is
            // already auto-synced from each stage's configured probability).
            c.progressPct = o.Probability == null ? 0 : o.Probability;
            c.ringPct = c.progressPct;
            c.ringVariant = 'blue';
            c.targetDate = o.CloseDate;
            c.chipLabel = o.StageName;
            c.chipVariant = 'blue';
            c.footRight = o.CloseDate == null ? '' : 'Close ' + formatShortDate(o.CloseDate);
            out.add(c);
        }
        return out;
    }

    // ─── Journey rail ────────────────────────────────────────────────────────

    @TestVisible
    private static List<JourneyItem> loadPersonJourney(Id recordId, String lifeEventBinding) {
        return lifeEventBinding == BINDING_STANDARD
            ? loadStandardLifeEvents(recordId)
            : loadManagedLifeEvents(recordId);
    }

    private static List<JourneyItem> loadManagedLifeEvents(Id recordId) {
        List<FinServ__LifeEvent__c> rows = [
            SELECT Id, Name, FinServ__EventDate__c, FinServ__EventType__c
            FROM FinServ__LifeEvent__c
            WHERE FinServ__Client__c = :recordId
            WITH USER_MODE
            ORDER BY FinServ__EventDate__c DESC NULLS LAST
            LIMIT :MAX_RAIL_ITEMS
        ];
        Date today = Date.today();
        Map<String, JourneyItem> grouped = new Map<String, JourneyItem>();
        List<String> order = new List<String>();
        for (FinServ__LifeEvent__c e : rows) {
            String label = String.isBlank(e.FinServ__EventType__c) ? e.Name : e.FinServ__EventType__c;
            String key = (label == null ? '' : label) + '|' + (e.FinServ__EventDate__c == null ? 'null' : String.valueOf(e.FinServ__EventDate__c));
            JourneyMember m = new JourneyMember();
            m.recordId = e.Id;
            m.recordUrl = '/lightning/r/FinServ__LifeEvent__c/' + e.Id + '/view';
            m.name = e.Name;
            m.eventDate = e.FinServ__EventDate__c;

            JourneyItem existing = grouped.get(key);
            if (existing == null) {
                JourneyItem j = new JourneyItem();
                j.recordId = e.Id;
                j.recordUrl = m.recordUrl;
                j.label = label;
                j.description = e.Name;
                j.eventDate = e.FinServ__EventDate__c;
                j.completed = e.FinServ__EventDate__c != null && e.FinServ__EventDate__c < today;
                j.count = 1;
                j.members = new List<JourneyMember>{ m };
                grouped.put(key, j);
                order.add(key);
            } else {
                existing.count = existing.count + 1;
                existing.members.add(m);
            }
        }
        List<JourneyItem> out = new List<JourneyItem>();
        for (String k : order) {
            out.add(grouped.get(k));
        }
        return out;
    }

    private static List<JourneyItem> loadStandardLifeEvents(Id recordId) {
        List<PersonLifeEvent> rows = [
            SELECT Id, Name, EventDate, EventType, PrimaryPersonId
            FROM PersonLifeEvent
            WHERE PrimaryPerson.AccountId = :recordId
            WITH USER_MODE
            ORDER BY EventDate DESC NULLS LAST
            LIMIT :MAX_RAIL_ITEMS
        ];
        Date today = Date.today();
        Map<String, JourneyItem> grouped = new Map<String, JourneyItem>();
        List<String> order = new List<String>();
        for (PersonLifeEvent e : rows) {
            String label = String.isBlank(e.EventType) ? e.Name : e.EventType;
            Date dt = e.EventDate == null ? null : e.EventDate.date();
            String key = (label == null ? '' : label) + '|' + (dt == null ? 'null' : String.valueOf(dt));
            JourneyMember m = new JourneyMember();
            m.recordId = e.Id;
            m.recordUrl = '/lightning/r/PersonLifeEvent/' + e.Id + '/view';
            m.name = e.Name;
            m.eventDate = dt;

            JourneyItem existing = grouped.get(key);
            if (existing == null) {
                JourneyItem j = new JourneyItem();
                j.recordId = e.Id;
                j.recordUrl = m.recordUrl;
                j.label = label;
                j.description = e.Name;
                j.eventDate = dt;
                j.completed = dt != null && dt < today;
                j.count = 1;
                j.members = new List<JourneyMember>{ m };
                grouped.put(key, j);
                order.add(key);
            } else {
                existing.count = existing.count + 1;
                existing.members.add(m);
            }
        }
        List<JourneyItem> out = new List<JourneyItem>();
        for (String k : order) {
            out.add(grouped.get(k));
        }
        return out;
    }

    @TestVisible
    private static List<JourneyItem> loadBusinessJourney(Id recordId) {
        List<BusinessMilestone> rows = [
            SELECT Id, Name, MilestoneDate, MilestoneType
            FROM BusinessMilestone
            WHERE PrimaryAccountId = :recordId
            WITH USER_MODE
            ORDER BY MilestoneDate DESC NULLS LAST
            LIMIT :MAX_RAIL_ITEMS
        ];
        Date today = Date.today();
        Map<String, JourneyItem> grouped = new Map<String, JourneyItem>();
        List<String> order = new List<String>();
        for (BusinessMilestone bm : rows) {
            String label = String.isBlank(bm.MilestoneType) ? bm.Name : bm.MilestoneType;
            Date dt = bm.MilestoneDate == null ? null : bm.MilestoneDate.date();
            String key = (label == null ? '' : label) + '|' + (dt == null ? 'null' : String.valueOf(dt));
            JourneyMember mem = new JourneyMember();
            mem.recordId = bm.Id;
            mem.recordUrl = '/lightning/r/BusinessMilestone/' + bm.Id + '/view';
            mem.name = bm.Name;
            mem.eventDate = dt;

            JourneyItem existing = grouped.get(key);
            if (existing == null) {
                JourneyItem j = new JourneyItem();
                j.recordId = bm.Id;
                j.recordUrl = mem.recordUrl;
                j.label = label;
                j.description = bm.Name;
                j.eventDate = dt;
                j.completed = dt != null && dt < today;
                j.count = 1;
                j.members = new List<JourneyMember>{ mem };
                grouped.put(key, j);
                order.add(key);
            } else {
                existing.count = existing.count + 1;
                existing.members.add(mem);
            }
        }
        List<JourneyItem> out = new List<JourneyItem>();
        for (String k : order) {
            out.add(grouped.get(k));
        }
        return out;
    }

    // ─── KPIs ────────────────────────────────────────────────────────────────

    @TestVisible
    private static List<Kpi> computeGoalKpis(List<PanelCard> cards, List<JourneyItem> journey) {
        Integer goalCount = cards == null ? 0 : cards.size();
        Decimal totalTracked = 0;
        Decimal sumPct = 0;
        Integer pctCount = 0;
        Integer completedEvents = 0;

        if (cards != null) {
            for (PanelCard c : cards) {
                if (c.primaryAmount != null) {
                    totalTracked += c.primaryAmount;
                }
                if (c.fundedPct != null) {
                    sumPct += c.fundedPct;
                    pctCount++;
                }
            }
        }
        if (journey != null) {
            for (JourneyItem j : journey) {
                if (j.completed) {
                    completedEvents++;
                }
            }
        }
        Decimal avgPct = pctCount == 0 ? 0 : (sumPct / pctCount);

        // Next deadline = the upcoming target date among goals not yet at 100%.
        Date today = Date.today();
        PanelCard nextGoal = null;
        if (cards != null) {
            for (PanelCard c : cards) {
                if (c.targetDate == null || c.targetDate < today) {
                    continue;
                }
                if (c.fundedPct != null && c.fundedPct >= 99.9) {
                    continue;
                }
                if (nextGoal == null || c.targetDate < nextGoal.targetDate) {
                    nextGoal = c;
                }
            }
        }

        List<Kpi> out = new List<Kpi>();
        out.add(buildKpi('Goals', 'target', String.valueOf(goalCount), completedEvents + ' life events recorded'));
        out.add(buildKpi('Avg funded', 'gauge', avgPct.setScale(0, System.RoundingMode.HALF_UP).toPlainString() + '%', 'across all goals'));
        out.add(buildKpi('Total tracked', 'wallet', formatCompactUsd(totalTracked), 'in goal balances'));
        out.add(
            buildKpi(
                'Next deadline',
                'calendar-clock',
                nextGoal == null ? '—' : formatShortDate(nextGoal.targetDate),
                nextGoal == null ? 'all reached' : nextGoal.name
            )
        );
        return out;
    }

    @TestVisible
    private static List<Kpi> computeOpportunityKpis(List<PanelCard> cards) {
        Integer count = cards == null ? 0 : cards.size();
        Decimal pipeline = 0;
        Decimal weighted = 0;
        PanelCard nextClose = null;
        if (cards != null) {
            for (PanelCard c : cards) {
                if (c.primaryAmount != null) {
                    pipeline += c.primaryAmount;
                    Decimal prob = c.progressPct == null ? 0 : c.progressPct;
                    weighted += (c.primaryAmount * prob / 100);
                }
                if (c.targetDate != null) {
                    if (nextClose == null || c.targetDate < nextClose.targetDate) {
                        nextClose = c;
                    }
                }
            }
        }
        List<Kpi> out = new List<Kpi>();
        out.add(buildKpi('Open deals', 'target', String.valueOf(count), 'in active pipeline'));
        out.add(buildKpi('Pipeline', 'wallet', formatCompactUsd(pipeline), 'total opportunity value'));
        out.add(buildKpi('Weighted', 'gauge', formatCompactUsd(weighted), 'probability-adjusted'));
        out.add(
            buildKpi(
                'Next close',
                'calendar-clock',
                nextClose == null ? '—' : formatShortDate(nextClose.targetDate),
                nextClose == null ? 'no upcoming close' : nextClose.name
            )
        );
        return out;
    }

    private static Kpi buildKpi(String label, String icon, String value, String meta) {
        Kpi k = new Kpi();
        k.label = label;
        k.icon = icon;
        k.value = value;
        k.meta = meta;
        return k;
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private static String normalizeBinding(String raw) {
        if (String.isBlank(raw)) {
            return DEFAULT_BINDING;
        }
        String lower = raw.toLowerCase();
        return VALID_BINDINGS.contains(lower) ? lower : DEFAULT_BINDING;
    }

    private static String formatShortDate(Date d) {
        if (d == null) {
            return '';
        }
        Datetime dt = Datetime.newInstance(d.year(), d.month(), d.day());
        return dt.format('MMM d, yyyy');
    }

    private static String formatCompactUsd(Decimal v) {
        if (v == null) {
            return '$0';
        }
        Decimal abs = v < 0 ? -v : v;
        String sign = v < 0 ? '-' : '';
        if (abs >= 1000000) {
            Decimal m = abs.divide(1000000, 1, System.RoundingMode.HALF_UP);
            String s = m.setScale(m.scale(), System.RoundingMode.HALF_UP).toPlainString();
            if (s.endsWith('.0')) {
                s = s.substring(0, s.length() - 2);
            }
            return sign + '$' + s + 'M';
        }
        if (abs >= 1000) {
            Integer k = (Integer) abs.divide(1000, 0, System.RoundingMode.HALF_UP);
            return sign + '$' + String.valueOf(k) + 'K';
        }
        return sign + '$' + String.valueOf(abs.setScale(0, System.RoundingMode.HALF_UP));
    }

    private static String goalIconFor(String name) {
        if (String.isBlank(name)) {
            return 'utility:goals';
        }
        String n = name.toLowerCase();
        if (n.contains('college') || n.contains('education') || n.contains('school') || n.contains('tuition')) {
            return 'utility:education';
        }
        if (n.contains('wedding') || n.contains('engagement')) {
            return 'utility:ribbon';
        }
        if (n.contains('charit') || n.contains('giving') || n.contains('philanth') || n.contains('donat')) {
            return 'utility:heart';
        }
        if (n.contains('vacation') || n.contains('travel') || n.contains('trip')) {
            return 'utility:world';
        }
        if (n.contains('home') || n.contains('house') || n.contains('property') || n.contains('mortgage')) {
            return 'utility:home';
        }
        if (n.contains('retire') || n.contains('pension') || n.contains('401')) {
            return 'utility:moneybag';
        }
        if (n.contains('estate') || n.contains('legacy') || n.contains('trust') || n.contains('plan')) {
            return 'utility:knowledge_base';
        }
        if (n.contains('emergency') || n.contains('reserve') || n.contains('safety')) {
            return 'utility:shield';
        }
        if (n.contains('debt') || n.contains('loan')) {
            return 'utility:moneybag';
        }
        if (n.contains('investment') || n.contains('portfolio')) {
            return 'utility:trending';
        }
        if (n.contains('healthcare') || n.contains('health') || n.contains('medical')) {
            return 'utility:advanced_function';
        }
        if (n.contains('car') || n.contains('vehicle') || n.contains('auto')) {
            return 'utility:travel_and_places';
        }
        return 'utility:goals';
    }

    private static String opportunityIconFor(String name) {
        if (String.isBlank(name)) {
            return 'utility:opportunity';
        }
        String n = name.toLowerCase();
        if (n.contains('treasury')) {
            return 'utility:bank';
        }
        if (n.contains('term loan') || n.contains('equipment')) {
            return 'utility:agent_session';
        }
        if (n.contains('cre') || n.contains('construction')) {
            return 'utility:builder';
        }
        if (n.contains('fx') || n.contains('global pay')) {
            return 'utility:world';
        }
        if (n.contains('working capital') || n.contains('credit')) {
            return 'utility:money';
        }
        return 'utility:opportunity';
    }

    /**
     * AuraHandledException only surfaces a custom message to the LWC when both
     * the constructor argument AND setMessage() are populated. Without
     * setMessage() the toast falls back to the generic
     * "Script-thrown exception" string.
     */
    private static AuraHandledException buildAuraException(String msg) {
        String safe = String.isBlank(msg) ? 'Operation failed.' : msg;
        AuraHandledException ahe = new AuraHandledException(safe);
        ahe.setMessage(safe);
        return ahe;
    }

    // ─── DTOs ────────────────────────────────────────────────────────────────

    public class CockpitView {
        @AuraEnabled
        public String recordType;
        @AuraEnabled
        public String journeyLabel;
        @AuraEnabled
        public List<JourneyItem> journey;
        @AuraEnabled
        public List<Kpi> kpis;
        @AuraEnabled
        public String panelTitle;
        @AuraEnabled
        public List<PanelCard> cards;
    }

    public class JourneyItem {
        @AuraEnabled
        public Id recordId;
        @AuraEnabled
        public String recordUrl;
        @AuraEnabled
        public String label;
        // Descriptive Name from the underlying record (e.g. PersonLifeEvent.Name
        // = "Appointed CEO Morris Roasters" when EventType = "Job"). LWC shows
        // this between the title and date when it's set AND different from the
        // label, so users see what the event ACTUALLY was, not just its type.
        @AuraEnabled
        public String description;
        @AuraEnabled
        public Date eventDate;
        @AuraEnabled
        public Boolean completed;
        @AuraEnabled
        public Integer count;
        // Members of this group (always populated; size==1 for ungrouped rows,
        // size>1 when multiple events share the same (label, date)). Lets the
        // LWC hover popover list every event in the group with its own link.
        @AuraEnabled
        public List<JourneyMember> members;
    }

    public class JourneyMember {
        @AuraEnabled
        public Id recordId;
        @AuraEnabled
        public String recordUrl;
        @AuraEnabled
        public String name;
        @AuraEnabled
        public Date eventDate;
    }

    public class Kpi {
        @AuraEnabled
        public String label;
        @AuraEnabled
        public String icon;
        @AuraEnabled
        public String value;
        @AuraEnabled
        public String meta;
    }

    public class PanelCard {
        @AuraEnabled
        public Id recordId;
        @AuraEnabled
        public String recordUrl;
        @AuraEnabled
        public String name;
        @AuraEnabled
        public String icon;
        @AuraEnabled
        public Decimal primaryAmount;
        @AuraEnabled
        public Decimal targetAmount;
        @AuraEnabled
        public Decimal fundedPct;
        @AuraEnabled
        public Decimal progressPct;
        @AuraEnabled
        public Decimal ringPct;
        @AuraEnabled
        public String ringVariant;
        @AuraEnabled
        public String chipLabel;
        @AuraEnabled
        public String chipVariant;
        @AuraEnabled
        public Date targetDate;
        @AuraEnabled
        public String footRight;
    }
}
