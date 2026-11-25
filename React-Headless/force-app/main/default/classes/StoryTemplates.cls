/**
 * Deterministic banking relationship-manager story templates.
 * build() picks a purpose from account signals, then a variant by account Id hash.
 * No randomness and no clock reads: same inputs always give the same Story.
 */
public with sharing class StoryTemplates {

    public class Signals {
        public String kycStatus;
        public Integer openCases;
        public Boolean campaignResponder;
        public String tier;
        public Date nextReview;
    }

    public class Story {
        public String interactionType;
        public String title;
        public String transcript;
        public String recap;
        public String nextSteps;
        public String purpose;
    }

    private static final List<String> TYPES = new List<String>{
        'Call', 'Video Meeting', 'Call', 'In-Person Meeting', 'Call', 'Video Meeting'
    };

    // Each variant: {title, transcript, recap, nextSteps}
    private static List<String> v(String title, String transcript, String recap, String nextSteps) {
        return new List<String>{ title, transcript, recap, nextSteps };
    }

    private static final List<List<String>> RELATIONSHIP = new List<List<String>>{
        v('Annual relationship review',
          'RM: Thanks for making time. I would like to walk through how the past year went across your accounts.\nClient: Sure. Overall we are pleased, though our payables volume has grown faster than expected.\nRM: Understood. I will map that growth against your current structure and bring ideas next time.',
          'Annual relationship review. The client is satisfied with service and reports payables volume growing faster than planned. The RM committed to review the account structure against that growth.',
          'Send a one-page relationship summary. Schedule a follow-up on account structure within 30 days.'),
        v('Quarterly check-in',
          'RM: Quick check-in to see how the quarter is shaping up for you.\nClient: Steady. Our seasonal inflows start next month, so we expect balances to climb.\nRM: Good to know. I will make sure your sweep settings are ready before then.',
          'Routine quarterly check-in. The client expects seasonal inflows next month and higher balances. The RM will confirm sweep settings ahead of that period.',
          'Confirm sweep configuration. Share an updated balance and yield summary.'),
        v('Relationship touchpoint after leadership change',
          'RM: I heard there is a new finance lead on your side. I would love to be introduced.\nClient: Yes, they joined last month. They are reviewing all banking relationships right now.\nRM: Then let me prepare a clear overview of what we provide today so their review is easy.',
          'Touchpoint following a finance leadership change. The new finance lead is reviewing all banking relationships. The RM offered an overview of current services and asked for an introduction.',
          'Arrange an introduction with the new finance lead. Prepare a services overview document.'),
        v('Mid-year portfolio conversation',
          'RM: Looking at your activity, deposits are stable and card spend is up a little.\nClient: That matches what we see. We opened a second location and it is ramping up.\nRM: Congratulations. Let us talk about whether that location needs its own accounts or can share your existing setup.',
          'Mid-year portfolio conversation. Deposits are stable and card spend is rising because of a new second location. The RM will advise on account setup for the new site.',
          'Draft an account setup recommendation for the new location. Introduce the onboarding specialist.'),
        v('Strategic priorities discussion',
          'RM: What are your top priorities for the next twelve months?\nClient: Cutting manual work in finance and keeping our cash position visible across entities.\nRM: Both are areas where we can help. I will line up a short working session with our product team.',
          'Strategic priorities discussion. The client wants less manual finance work and better cash visibility across entities. The RM proposed a working session with the product team.',
          'Book a working session with the product team. Send examples of cash visibility reporting.'),
        v('Relationship health check',
          'RM: I want to be sure we are meeting your expectations. Anything we could do better?\nClient: Response times have been good. Statement formats are a little hard to reconcile, though.\nRM: Thank you for saying so. I will ask our operations team about alternative formats.',
          'Relationship health check. The client rates responsiveness highly but finds statement formats hard to reconcile. The RM will ask operations about alternative formats.',
          'Request alternative statement format options from operations. Report back within two weeks.')
    };

    private static final List<List<String>> TREASURY = new List<List<String>>{
        v('Treasury review: liquidity and sweeps',
          'RM: Your operating account is holding more idle cash than usual. Shall we look at a sweep?\nClient: Yes, we have been meaning to put that cash to work without losing access.\nRM: I will model a target balance structure and show you the expected yield.',
          'Treasury review focused on idle operating cash. The client wants to earn more without losing access to funds. The RM will model a target balance sweep structure with expected yield.',
          'Build a sweep and target balance model. Review it with the client next week.'),
        v('Treasury review: payments efficiency',
          'RM: Your team still issues a fair number of paper checks. Would you consider moving some to electronic payments?\nClient: We would like to, but some vendors resist.\nRM: We can run a vendor enrollment campaign for you, which usually moves most of them within a quarter.',
          'Treasury review on payments efficiency. The client still issues paper checks because some vendors resist electronic payments. The RM proposed a vendor enrollment effort.',
          'Send the vendor enrollment program details. Pull a list of top check payees.'),
        v('Treasury review: fraud controls',
          'RM: Let us confirm your positive pay and dual approval settings are still right for your volume.\nClient: Our approvers changed recently, so please check that.\nRM: Will do. I will send a review of user entitlements and flag anything outdated.',
          'Treasury review of fraud controls. Approvers have changed recently, so entitlements need verification. The RM will send an entitlement review and flag outdated users.',
          'Run an entitlement review for the client. Update approver lists after confirmation.'),
        v('Treasury review: cash forecasting',
          'RM: How accurate are your weekly cash forecasts right now?\nClient: They drift, mostly because of receivables timing.\nRM: Our reporting can show incoming receipts by day. That should tighten the forecast.',
          'Treasury review on cash forecasting. The client sees forecast drift because of receivables timing. The RM suggested daily incoming receipts reporting to improve accuracy.',
          'Set up a sample daily receipts report. Walk the client through it in a short demo.'),
        v('Treasury review: international payments',
          'RM: I see a rising number of cross-border payments from your account.\nClient: Yes, we added two overseas suppliers this year.\nRM: Let us review the fees and the currencies involved. There may be a better way to handle that flow.',
          'Treasury review on growing cross-border payments after two new overseas suppliers. The RM will review fees and currencies to find a lower cost approach.',
          'Analyze cross-border fees over the past two quarters. Present options for currency handling.'),
        v('Treasury review: account structure',
          'RM: You have several accounts that move small balances each day. Could we simplify?\nClient: That would help. Nobody wants to reconcile that many accounts.\nRM: I will propose a consolidated structure with sub-accounts for reporting.',
          'Treasury review of account structure. The client has many low-balance accounts that are hard to reconcile. The RM will propose a consolidated structure with sub-accounts.',
          'Prepare a consolidated account structure proposal. Confirm the client reporting needs first.')
    };

    private static final List<List<String>> CREDIT = new List<List<String>>{
        v('Credit renewal: facility review',
          'RM: Your revolving facility comes up for renewal soon. Do you expect to need the same limit?\nClient: Probably a bit more. We are planning inventory purchases for next season.\nRM: Understood. I will gather updated financials so we can size the request properly.',
          'Credit renewal discussion. The facility is approaching renewal and the client may need a higher limit for seasonal inventory. The RM requested updated financials to size the request.',
          'Collect updated financial statements. Start the renewal package with the credit team.'),
        v('Credit renewal: covenant check-in',
          'RM: Before we renew, I want to review where you stand on your covenants.\nClient: We are comfortable on leverage, but coverage is a little tighter than last year.\nRM: Good to hear it early. We can discuss that with our credit partners before the renewal is submitted.',
          'Credit renewal covenant check-in. Leverage is comfortable while coverage is somewhat tighter than last year. The RM will raise this with credit partners before submission.',
          'Review covenant calculations with the credit analyst. Prepare an explanation of the coverage trend.'),
        v('Credit renewal: term and pricing options',
          'RM: Would you prefer to extend the maturity or keep the current term?\nClient: A longer term would give us more certainty on our expansion plan.\nRM: I will bring back options for term and pricing so you can compare.',
          'Credit renewal on term and pricing. The client prefers a longer maturity to support an expansion plan. The RM will return with term and pricing alternatives.',
          'Prepare a term and pricing comparison. Share it with the client before the renewal meeting.'),
        v('Credit renewal: collateral update',
          'RM: Our records show your equipment appraisals are a few years old.\nClient: We have bought new equipment since then and retired some older items.\nRM: Then let us refresh the collateral list so the renewal reflects what you actually own.',
          'Credit renewal collateral update. Equipment appraisals are dated and the client has since bought and retired assets. The RM will refresh the collateral list for the renewal.',
          'Request a current equipment list from the client. Order updated appraisals where needed.'),
        v('Credit renewal: growth financing needs',
          'RM: Beyond the renewal, are there any projects that need separate financing?\nClient: We are considering a facility purchase within the year.\nRM: Then it makes sense to talk about structure now so the renewal and that project fit together.',
          'Credit renewal with a look at growth financing. The client is considering a facility purchase within the year. The RM wants renewal and project financing to be structured together.',
          'Schedule a financing structure discussion. Involve the commercial real estate team.'),
        v('Credit renewal: utilization review',
          'RM: Utilization on your line has averaged about half of the limit this year.\nClient: Right, we only draw heavily at quarter end.\nRM: Then we should look at whether the limit and the fee structure still fit that pattern.',
          'Credit renewal utilization review. Average line usage is about half the limit with heavy draws only at quarter end. The RM will test whether limit and fees still fit.',
          'Analyze monthly utilization and fees. Recommend a limit and fee structure at renewal.')
    };

    private static final List<List<String>> KYC = new List<List<String>>{
        v('KYC refresh: documentation update',
          'RM: Our records show your KYC review is past due, so I need to refresh a few items.\nClient: Understood. What do you need from us?\nRM: Current ownership documents and a list of authorized signers. I will send a secure checklist today.',
          'KYC refresh call. The client KYC review is expired and needs updated ownership documents and an authorized signer list. The RM will send a secure checklist.',
          'Send the secure KYC checklist today. Follow up in one week if documents are not received.'),
        v('KYC refresh: beneficial ownership',
          'RM: Regulations ask us to confirm beneficial owners periodically. Has anything changed?\nClient: One of our partners sold their stake earlier this year.\nRM: Thank you. Please send the updated ownership details so we can complete the KYC refresh.',
          'KYC refresh on beneficial ownership. A partner sold their stake this year, so ownership details must be updated. The client will send the revised information to complete the KYC refresh.',
          'Receive updated ownership details. Submit the KYC refresh to compliance for review.'),
        v('KYC refresh: expected activity confirmation',
          'RM: As part of the KYC refresh, I need to confirm your expected account activity.\nClient: Volumes are higher than a year ago and we now pay a few international suppliers.\nRM: I will record that so your profile matches how the accounts are really used.',
          'KYC refresh covering expected activity. The client reports higher volumes and new international supplier payments. The RM will update the profile to match actual usage.',
          'Update the expected activity profile. Route the KYC file to compliance.'),
        v('KYC refresh: overdue review follow-up',
          'RM: I am following up because the KYC review on your account is overdue.\nClient: Sorry, that slipped by us. Is there any impact on our services?\nRM: Not yet, but we should finish it soon to avoid any restrictions. I can help you gather what is needed.',
          'KYC overdue follow-up. The client missed the review window and asked about service impact. The RM explained that completing the KYC review soon avoids restrictions and offered help gathering documents.',
          'Provide a document list with deadlines. Escalate internally if no response in ten days.'),
        v('KYC refresh: signer and entitlement alignment',
          'RM: While refreshing KYC, I noticed our signer list differs from your current officers.\nClient: Yes, two people have left and two joined.\nRM: Let us update both the KYC file and the account entitlements together.',
          'KYC refresh with signer alignment. Two officers left and two joined, so the signer list and entitlements are out of date. The RM will update the KYC file and entitlements together.',
          'Collect signer authorization forms. Update entitlements once the KYC file is approved.'),
        v('KYC refresh: business profile verification',
          'RM: Let us verify your business profile: industry, locations, and primary customers.\nClient: We added a new product line, and most of its customers are outside the country.\nRM: That is useful to record. It will be part of the KYC refresh so your file is current.',
          'KYC refresh verifying the business profile. The client added a product line with mostly foreign customers. The RM will include this in the updated KYC file.',
          'Record the new product line and geography. Complete the KYC refresh package for review.')
    };

    private static final List<List<String>> SERVICE = new List<List<String>>{
        v('Service follow-up: open case status',
          'RM: I am calling about the open service cases on your account. I want to make sure they are moving.\nClient: One has been waiting a while. It is holding up our wire template setup.\nRM: Thank you for telling me. I will go to the service team today and get you a clear date.',
          'Service follow-up on open cases. One case is delaying the wire template setup. The RM will escalate to the service team and provide a firm date.',
          'Escalate the open case today. Update the client with a resolution date by tomorrow.'),
        v('Service follow-up: statement discrepancy',
          'RM: I saw your case about a fee on last month statement.\nClient: Yes, we did not expect that charge and nobody has explained it.\nRM: I will get the fee detail and, if it is an error, arrange a correction.',
          'Service follow-up on a fee discrepancy. The client did not expect a charge on last month statement and has no explanation. The RM will obtain fee detail and request a correction if needed.',
          'Obtain the fee breakdown. Request a refund if the charge was in error.'),
        v('Service follow-up: access and entitlements',
          'RM: Your open case mentions a user who cannot approve payments.\nClient: Right. They were promoted and their approval limit was never updated.\nRM: I will have the limit changed and confirm once it is done.',
          'Service follow-up on a user access case. A promoted user cannot approve payments because their limit was not updated. The RM will request the limit change and confirm completion.',
          'Submit the approval limit change. Confirm with the client when complete.'),
        v('Service follow-up: delayed payment investigation',
          'RM: I am following up on the payment trace you opened.\nClient: A supplier says they never received it, and we need an answer.\nRM: I have asked the operations team for the trace result. I will call you as soon as I hear back.',
          'Service follow-up on a payment trace. A supplier reports a missing payment. The RM asked operations for the trace result and will call the client once it arrives.',
          'Chase the trace result from operations. Share a written summary with the client.'),
        v('Service follow-up: recurring issue review',
          'RM: I see a few cases on your account with a similar theme. Let us find the root cause.\nClient: It is mostly with the file upload process for payroll.\nRM: I will bring in a product specialist so we can fix it rather than keep resolving cases one by one.',
          'Service follow-up on recurring cases. Several cases relate to the payroll file upload process. The RM will involve a product specialist to find the root cause.',
          'Book a product specialist session. Review all related cases and close duplicates.'),
        v('Service follow-up: resolution confirmation',
          'RM: Your cases were marked resolved. I want to be sure you agree.\nClient: One is fine. The other still shows the same error on our side.\nRM: Thank you. I will reopen it and track it personally until it is truly fixed.',
          'Service follow-up confirming case resolution. One case is truly resolved while the other still shows the same error. The RM will reopen it and track it to completion.',
          'Reopen the unresolved case. Check in with the client in three days.')
    };

    private static final List<List<String>> CAMPAIGN = new List<List<String>>{
        v('Campaign follow-up: treasury offer',
          'RM: You responded to our recent treasury outreach, so I wanted to follow up personally.\nClient: Yes, the sweep and yield offer looked relevant to us.\nRM: Good. I will review your balances and send a tailored proposal.',
          'Campaign follow-up on the treasury outreach. The client responded because the sweep and yield offer is relevant. The RM will review balances and send a tailored proposal.',
          'Review balances and prepare a tailored proposal. Send it within one week.'),
        v('Campaign follow-up: payments webinar',
          'RM: Thank you for joining our payments webinar. Did anything stand out?\nClient: The real-time payments section was useful. We have a use case in vendor disbursements.\nRM: Let us look at that. I can set up a short session with a payments specialist.',
          'Campaign follow-up after the payments webinar. The client found the real-time payments content useful for vendor disbursements. The RM will arrange a session with a payments specialist.',
          'Schedule a session with a payments specialist. Share the webinar materials.'),
        v('Campaign follow-up: credit offer response',
          'RM: I saw you opened our equipment financing email. Is that something you are considering?\nClient: Possibly. We need two new machines next year.\nRM: Then I will put together an indicative structure so you can compare it to other options.',
          'Campaign follow-up on the equipment financing email. The client may need two machines next year. The RM will prepare an indicative financing structure for comparison.',
          'Prepare an indicative equipment financing structure. Confirm timing of the purchase.'),
        v('Campaign follow-up: digital banking invitation',
          'RM: You clicked through our digital banking upgrade announcement.\nClient: We did. Our team wants better mobile approvals.\nRM: Great. I will arrange a walkthrough of the new features for your approvers.',
          'Campaign follow-up on the digital banking announcement. The client wants better mobile approvals. The RM will arrange a feature walkthrough for approvers.',
          'Book a walkthrough for the client approvers. Send the enablement checklist.'),
        v('Campaign follow-up: market insights event',
          'RM: It was good to see your team at our market insights event.\nClient: The rate outlook discussion was helpful. We are rethinking our hedging.\nRM: I would be glad to bring in our markets team to discuss options with you.',
          'Campaign follow-up after the market insights event. The client found the rate outlook useful and is rethinking hedging. The RM will bring in the markets team.',
          'Introduce the markets team. Send the event rate outlook summary.'),
        v('Campaign follow-up: sustainability financing interest',
          'RM: You requested information on our sustainability linked financing.\nClient: Yes, our board wants to report on energy upgrades next year.\nRM: I will send an overview and set up time with a specialist on how pricing and reporting work.',
          'Campaign follow-up on sustainability linked financing interest. The board wants to report on energy upgrades next year. The RM will send an overview and arrange a specialist discussion.',
          'Send the financing overview. Schedule a specialist call within two weeks.')
    };

    public static Story build(Id accountId, Signals s, Date onDate) {
        Signals sg = (s == null) ? new Signals() : s;
        Integer h = (accountId == null) ? 0 : Math.mod(Math.abs(String.valueOf(accountId).hashCode()), 6000);
        String purpose;
        List<List<String>> pool;
        Boolean kycBad = sg.kycStatus != null
            && (sg.kycStatus.equalsIgnoreCase('Expired') || sg.kycStatus.equalsIgnoreCase('Overdue'));
        // KYC leads only when the status is Overdue or the review is stale (over 60 days past due).
        // Otherwise every applicable purpose takes its turn by account hash.
        Boolean kycUrgent = (sg.kycStatus != null && sg.kycStatus.equalsIgnoreCase('Overdue'))
            || (kycBad && sg.nextReview != null && onDate != null && sg.nextReview < onDate.addDays(-60));
        if (kycUrgent) {
            purpose = 'KYC Refresh';
            pool = KYC;
        } else {
            List<String> options = new List<String>();
            if (kycBad) options.add('KYC Refresh');
            if (sg.openCases != null && sg.openCases > 0) options.add('Service Follow-up');
            if (sg.campaignResponder == true) options.add('Campaign Follow-up');
            if (sg.tier != null) {
                options.add('Treasury Review');
                options.add('Credit Renewal');
            }
            options.add('Relationship Review');
            // different slice than idx so all 6 variants of each pool stay reachable
            purpose = options[Math.mod(Integer.valueOf(Math.floor(h / 7.0)), options.size())];
            pool = purpose == 'KYC Refresh' ? KYC
                : purpose == 'Service Follow-up' ? SERVICE
                : purpose == 'Campaign Follow-up' ? CAMPAIGN
                : purpose == 'Treasury Review' ? TREASURY
                : purpose == 'Credit Renewal' ? CREDIT : RELATIONSHIP;
        }
        Integer idx = Math.mod(h, pool.size());
        List<String> pick = pool[idx];
        Story st = new Story();
        st.purpose = purpose;
        st.interactionType = TYPES[Math.mod(h, TYPES.size())];
        st.title = (onDate == null) ? pick[0] : pick[0] + ' (' + String.valueOf(onDate) + ')';
        st.transcript = pick[1];
        st.recap = pick[2];
        st.nextSteps = pick[3];
        return st;
    }
}
