"""Email campaign catalog — single source of truth (spec §3).

Keyed by Campaign Name because new campaigns have no Id until created.
"""

ORG = "jdo-gj9q5q"

# Existing JDO email campaigns whose audience comes from CampaignMember.
CRM_CAMPAIGNS = {
    "Premier Checking Onboarding": ("Checking Account", "Deposits"),
    "Mobile Banking Adoption": ("Mobile Banking", "Digital Banking"),
    "HELOC Refi Outreach Q2": ("HELOC", "Loans"),
    "Auto Loan Rate Drop Promo": ("Auto Loan", "Loans"),
    "Multi-Persona Spring Newsletter": ("Newsletter", "Brand"),
    "Invitation to Annual Customer Conference": ("Annual Customer Conference", "Events"),
    "Referral Program Launch": ("Referral Program", "Brand"),
    "High Income Customer Outreach": ("Wealth Management", "Investments"),
    "Tier 1 High-Income Insurance Campaign 2026": ("Life Insurance", "Insurance"),
}

# Campaigns whose audience is simulated in Postgres only.
# audience: "all" | "uncovered+<share>" | <share of target segment>
SIMULATED_CAMPAIGNS = {
    "Treasury Modernization Brief": {
        "new": False, "target": "Business", "audience": 0.40,
        "product": ("Treasury Management", "Treasury Management"),
    },
    "Business Banking Quarterly — Q2 2026": {
        "new": True, "target": "Business", "audience": "all",
        "start": "2026-05-05", "end": "2026-05-12", "status": "Completed",
        "product": ("Newsletter", "Brand"),
    },
    "Business Line of Credit Offer 2026": {
        "new": True, "target": "Business", "audience": 0.40,
        "start": "2026-06-15", "end": "2026-06-30", "status": "Completed",
        "product": ("Business Line of Credit", "Loans"),
    },
    "Merchant Services Spotlight": {
        "new": True, "target": "Business", "audience": 0.40,
        "start": "2026-09-08", "end": "2026-09-19", "status": "Completed",
        "product": ("Merchant Services", "Treasury Management"),
    },
    "Retirement Readiness Series": {
        "new": True, "target": "Personal", "audience": "uncovered+0.20",
        "start": "2026-03-10", "end": "2026-03-24", "status": "Completed",
        "product": ("Retirement Account", "Investments"),
    },
    "Rewards Credit Card Offer": {
        "new": True, "target": "Personal", "audience": 0.30,
        "start": "2026-09-01", "end": "2026-09-15", "status": "Completed",
        "product": ("Credit Card", "Loans"),
    },
}

NEW_CAMPAIGN_DESCRIPTION = "Segment-based email campaign; engagement tracked in Fins.marketing_engagement."

# marketing_engagement.audience_source values (dashboard-facing).
MEMBER_SOURCE = "Campaign Member"
SEGMENT_SOURCE = "Segment"
