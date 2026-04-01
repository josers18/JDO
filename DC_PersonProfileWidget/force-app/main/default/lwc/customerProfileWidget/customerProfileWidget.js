import { LightningElement, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getProfileData from '@salesforce/apex/CustomerProfileWidgetController.getProfileData';
import generateSummary from '@salesforce/apex/CustomerProfileWidgetController.generateSummary';

const RING_CIRC = 175.9;

export default class CustomerProfileWidget extends LightningElement {
    // Group 1 — Data source
    /** Data graph developer API name (not named data* — LWC1503). */
    @api graphApiName = '';
    @api recordIdFieldName = 'accountId__c';
    @api flowApiName = '';
    @api flowRecordIdVariable = 'recordId';
    @api flowPredictionVariable = 'prediction';
    @api flowRecommendationsVariable = 'recommendations';
    @api promptTemplateId = '';
    @api promptInputApiName = 'Input:Prediction_Context';
    @api autoGenerateSummary;

    // Group 2 — Titles
    @api cardTitle = 'Client profile';
    @api overviewTabLabel = 'Overview';
    @api signalsTabLabel = 'AI Signals';
    @api portfolioTabLabel = 'Portfolio';
    @api servicesTabLabel = 'Services';
    @api locationTabLabel = 'Location';
    @api insightTabLabel = 'Insight';

    // Group 3 — Section visibility (LWC1503: no @api Boolean = true)
    @api showOverviewTab;
    @api showSignalsTab;
    @api showPortfolioTab;
    @api showServicesTab;
    @api showLocationTab;
    @api showInsightTab;
    @api showKpiStrip;
    @api showEnrollmentFlags;
    @api showSparkline;
    @api showBranchProximity;
    @api showAiActions;

    // Group 4 — Theme colors
    @api backgroundPrimary = '#0b0c14';
    @api backgroundSecondary = '#0f1020';
    @api accentColor = '#d4b469';
    @api accentColorSecondary = '#1d9e75';
    @api textPrimary = '#f0ebe0';
    @api textSecondary = 'rgba(240,235,224,0.4)';
    @api positiveColor = '#5dcaa5';
    @api negativeColor = '#d4537e';
    @api warningColor = '#e09840';

    // Group 5 — Gradient
    @api headerGradientStyle = 'radial';
    @api headerGradientColor1 = 'rgba(100,80,200,0.25)';
    @api headerGradientColor2 = 'rgba(29,158,117,0.12)';
    @api avatarRingStyle = 'gold';

    // Group 6 — Field mappings
    @api fieldFirstName = 'firstName';
    @api fieldLastName = 'lastName';
    @api fieldCity = 'mailingCity';
    @api fieldState = 'mailingState';
    @api fieldIndustry = 'industry';
    @api fieldEmployees = 'numberOfEmployees';
    @api fieldPhone = 'phone';
    @api fieldEmail = 'email';
    @api fieldWebsite = 'website';
    @api fieldRevenue = 'annualRevenue';
    @api fieldTierSegment = 'customerTier';
    @api fieldPropensityScore = 'propensityScore';
    @api fieldEngagementScore = 'engagementScore';
    @api fieldChurnScore = 'churnScore';
    @api fieldLtvScore = 'lifetimeValueScore';
    @api fieldInvestmentBalance = 'investmentBalance';
    @api fieldLoanBalance = 'loanBalance';
    @api fieldDepositYtd = 'depositYtd';
    @api fieldLoanLimit = 'loanLimit';
    @api fieldRiskProfile = 'riskProfile';
    @api fieldCustomerSince = 'customerSince';
    @api fieldLastInteraction = 'lastInteractionDate';
    @api fieldMobileEnrolled = 'mobileEnrolled';
    @api fieldOnlineEnrolled = 'onlineEnrolled';
    @api fieldKycStatus = 'kycStatus';
    @api fieldTwoFaStatus = 'twoFaStatus';
    @api fieldPaperlessEnrolled = 'paperlessEnrolled';
    @api fieldAlertsEnrolled = 'alertsEnrolled';
    @api fieldWireEnabled = 'wireTransferEnabled';
    @api fieldStreet = 'billingStreet';
    @api fieldZip = 'billingPostalCode';
    @api fieldAssignedBranch = 'assignedBranch';
    @api fieldBranchDistance = 'assignedBranchDistance';
    @api fieldNearbyBranches = 'nearbyBranches';

    profileData = null;
    loading = false;
    errorMessage = null;
    summaryText = null;
    summaryLoading = false;
    summaryError = null;
    activeTab = 'overview';
    _recordId;

    @api
    get recordId() {
        return this._recordId;
    }
    set recordId(value) {
        this._recordId = value;
        if (value) {
            this.loadProfile();
        }
    }

    connectedCallback() {
        this.applyHostThemeVars();
        this.ensureActiveTab();
        if (this._recordId) {
            this.loadProfile();
        }
    }

    ensureActiveTab() {
        const ids = this.visibleTabs.map((t) => t.id);
        if (!ids.includes(this.activeTab) && ids.length) {
            this.activeTab = ids[0];
        }
    }

    applyHostThemeVars() {
        const h = this.template.host;
        h.style.setProperty('--wp-bg-primary', this.backgroundPrimary);
        h.style.setProperty('--wp-bg-secondary', this.backgroundSecondary);
        h.style.setProperty('--wp-accent', this.accentColor);
        h.style.setProperty('--wp-accent-2', this.accentColorSecondary);
        h.style.setProperty('--wp-text-primary', this.textPrimary);
        h.style.setProperty('--wp-text-secondary', this.textSecondary);
        h.style.setProperty('--wp-positive', this.positiveColor);
        h.style.setProperty('--wp-negative', this.negativeColor);
        h.style.setProperty('--wp-warning', this.warningColor);
        h.style.setProperty('--wp-gradient-1', this.headerGradientColor1);
        h.style.setProperty('--wp-gradient-2', this.headerGradientColor2);
    }

    buildFieldMappings() {
        return JSON.stringify({
            firstName: this.fieldFirstName,
            lastName: this.fieldLastName,
            city: this.fieldCity,
            state: this.fieldState,
            industry: this.fieldIndustry,
            employees: this.fieldEmployees,
            phone: this.fieldPhone,
            email: this.fieldEmail,
            website: this.fieldWebsite,
            revenue: this.fieldRevenue,
            tierSegment: this.fieldTierSegment,
            propensityScore: this.fieldPropensityScore,
            engagementScore: this.fieldEngagementScore,
            churnScore: this.fieldChurnScore,
            ltvScore: this.fieldLtvScore,
            investmentBalance: this.fieldInvestmentBalance,
            loanBalance: this.fieldLoanBalance,
            depositYtd: this.fieldDepositYtd,
            loanLimit: this.fieldLoanLimit,
            riskProfile: this.fieldRiskProfile,
            customerSince: this.fieldCustomerSince,
            lastInteraction: this.fieldLastInteraction,
            mobileEnrolled: this.fieldMobileEnrolled,
            onlineEnrolled: this.fieldOnlineEnrolled,
            kycStatus: this.fieldKycStatus,
            twoFaStatus: this.fieldTwoFaStatus,
            paperlessEnrolled: this.fieldPaperlessEnrolled,
            alertsEnrolled: this.fieldAlertsEnrolled,
            wireEnabled: this.fieldWireEnabled,
            street: this.fieldStreet,
            zip: this.fieldZip,
            assignedBranch: this.fieldAssignedBranch,
            branchDistance: this.fieldBranchDistance,
            nearbyBranches: this.fieldNearbyBranches
        });
    }

    async loadProfile() {
        if (!this._recordId) {
            return;
        }
        this.loading = true;
        this.errorMessage = null;
        this.summaryText = null;
        this.summaryError = null;
        try {
            const result = await getProfileData({
                graphApiName: this.graphApiName,
                recordId: this._recordId,
                fieldMappingsJson: this.buildFieldMappings(),
                flowApiName: this.flowApiName,
                flowRecordIdVariable: this.flowRecordIdVariable,
                flowPredictionVariable: this.flowPredictionVariable,
                flowRecommendationsVariable: this.flowRecommendationsVariable,
                recordIdFieldName: this.recordIdFieldName
            });
            this.profileData = result;
            this.ensureActiveTab();
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            setTimeout(() => {
                this.animateBars();
            }, 400);
            if (this.promptTemplateId && this.autoGenerateSummary !== false) {
                this.loadSummary();
            }
        } catch (e) {
            this.errorMessage = this.reduceError(e);
            this.profileData = null;
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Profile load failed',
                    message: this.errorMessage,
                    variant: 'error',
                    mode: 'sticky'
                })
            );
        } finally {
            this.loading = false;
        }
    }

    reduceError(e) {
        if (e.body && e.body.message) {
            return e.body.message;
        }
        if (e.message) {
            return e.message;
        }
        return 'Unknown error';
    }

    async loadSummary() {
        if (!this.promptTemplateId || !this.profileData) {
            return;
        }
        this.summaryLoading = true;
        this.summaryError = null;
        try {
            const text = await generateSummary({
                promptTemplateId: this.promptTemplateId,
                promptInputApiName: this.promptInputApiName,
                predictionLabel: this.profileData.predictionLabel,
                recommendationsJson: this.profileData.recommendationsJson || '[]'
            });
            this.summaryText = text;
        } catch (e) {
            this.summaryError = this.reduceError(e);
        } finally {
            this.summaryLoading = false;
        }
    }

    handleTabClick(event) {
        const tab = event.currentTarget.dataset.tab;
        if (tab) {
            this.activeTab = tab;
        }
    }

    animateBars() {
        const fills = this.template.querySelectorAll('.wp-bar-fill');
        fills.forEach((el) => {
            const scale = el.dataset.scale || '0';
            el.style.transition = 'transform 1.1s cubic-bezier(0.22, 1, 0.36, 1)';
            el.style.transform = `scaleX(${scale})`;
        });
    }

    get visibleTabs() {
        const defs = [
            { id: 'overview', label: this.overviewTabLabel, on: this.showOverviewTab },
            { id: 'signals', label: this.signalsTabLabel, on: this.showSignalsTab },
            { id: 'portfolio', label: this.portfolioTabLabel, on: this.showPortfolioTab },
            { id: 'services', label: this.servicesTabLabel, on: this.showServicesTab },
            { id: 'location', label: this.locationTabLabel, on: this.showLocationTab },
            { id: 'insight', label: this.insightTabLabel, on: this.showInsightTab }
        ];
        return defs
            .filter((t) => t.on !== false)
            .map((t) => ({
                id: t.id,
                label: t.label,
                tabClass: `wp-tab${this.activeTab === t.id ? ' wp-tab--active' : ''}`,
                ariaSelected: this.activeTab === t.id ? 'true' : 'false'
            }));
    }

    get d() {
        return this.profileData;
    }

    get fullName() {
        return this.d?.fullName || '';
    }

    get location() {
        const city = this.d?.city || '';
        const st = this.d?.state || '';
        return [city, st].filter(Boolean).join(', ');
    }

    get initials() {
        const n = this.fullName.trim();
        if (!n) {
            return '—';
        }
        const parts = n.split(/\s+/).filter(Boolean);
        if (parts.length === 1) {
            return parts[0].slice(0, 2).toUpperCase();
        }
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    get tierSegment() {
        return this.d?.tierSegment || 'Standard';
    }

    get kpiRevenue() {
        return this.fmtCurrency(this.d?.revenue);
    }

    get kpiInvestments() {
        return this.fmtCurrency(this.d?.investmentBalance);
    }

    get kpiLoan() {
        return this.fmtCurrency(this.d?.loanBalance);
    }

    get kpiLoanLimit() {
        return this.fmtCurrency(this.d?.loanLimit);
    }

    get kpiDepositYtd() {
        return this.fmtCurrency(this.d?.depositYtd);
    }

    get propensityScore() {
        return this.scoreNum(this.d?.propensityScore);
    }

    get engagementScore() {
        return this.scoreNum(this.d?.engagementScore);
    }

    get churnScore() {
        return this.scoreNum(this.d?.churnScore);
    }

    get ltvScore() {
        return this.scoreNum(this.d?.ltvScore);
    }

    get propensityDash() {
        return this.ringDash(this.propensityScore);
    }

    get engagementDash() {
        return this.ringDash(this.engagementScore);
    }

    get churnDash() {
        return this.ringDash(this.churnScore);
    }

    get ltvDash() {
        return this.ringDash(this.ltvScore);
    }

    ringDash(pct) {
        const p = Math.min(100, Math.max(0, pct));
        return RING_CIRC * (1 - p / 100);
    }

    scoreNum(v) {
        if (v === null || v === undefined || v === '') {
            return 0;
        }
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    }

    get allSignalRows() {
        const rows = [
            { key: 'Propensity', pct: this.propensityScore, kind: 'propensity' },
            { key: 'Engagement', pct: this.engagementScore, kind: 'engagement' },
            { key: 'Churn risk', pct: this.churnScore, kind: 'churn' },
            { key: 'Lifetime value', pct: this.ltvScore, kind: 'ltv' }
        ];
        return rows.map((r) => {
            const color = this.signalBarColor(r.kind, r.pct);
            return {
                key: r.key,
                pct: Math.round(r.pct),
                color,
                scale: String(Math.min(1, Math.max(0, r.pct / 100))),
                barStyle: `background-color:${color}`
            };
        });
    }

    signalBarColor(kind, pct) {
        if (kind === 'churn' && pct > 40) {
            return 'var(--wp-negative)';
        }
        if (kind === 'propensity' || kind === 'engagement' || kind === 'ltv') {
            return pct >= 50 ? 'var(--wp-positive)' : 'var(--wp-warning)';
        }
        return 'var(--wp-accent)';
    }

    get allEnrollmentFlags() {
        const d = this.d;
        if (!d) {
            return [];
        }
        const rows = [];
        const add = (label, val, warn) => {
            let flag = 'wp-flag wp-flag--off';
            let dot = 'wp-flag-dot wp-flag-dot--off';
            let status = 'Off';
            if (val === true) {
                flag = 'wp-flag wp-flag--on';
                dot = 'wp-flag-dot wp-flag-dot--on';
                status = 'On';
            } else if (warn) {
                flag = 'wp-flag wp-flag--warn';
                dot = 'wp-flag-dot wp-flag-dot--warn';
                status = 'Review';
            }
            rows.push({ label, status, cssClass: flag, dotClass: dot });
        };
        add('Mobile', d.mobileEnrolled, false);
        add('Online', d.onlineEnrolled, false);
        add('KYC', d.kycStatus === 'Verified' || d.kycStatus === 'Complete', d.kycStatus && d.kycStatus !== 'Verified');
        add('2FA', d.twoFaStatus === 'Enabled', d.twoFaStatus && d.twoFaStatus !== 'Enabled');
        add('Paperless', d.paperlessEnrolled, false);
        add('Alerts', d.alertsEnrolled, false);
        add('Wire', d.wireEnabled, false);
        return rows;
    }

    get allServiceCards() {
        const d = this.d;
        const cards = [
            {
                name: 'Mobile banking',
                detail: 'App access, biometric login, transfers',
                status: d?.mobileEnrolled === true ? 'Active' : 'Not enrolled',
                cardClass: this.svcCardClass(d?.mobileEnrolled),
                statusClass: this.svcStatusClass(d?.mobileEnrolled),
                iconTypeMobile: true
            },
            {
                name: 'Online banking',
                detail: 'Web portal, bill pay, statements',
                status: d?.onlineEnrolled === true ? 'Active' : 'Not enrolled',
                cardClass: this.svcCardClass(d?.onlineEnrolled),
                statusClass: this.svcStatusClass(d?.onlineEnrolled),
                iconTypeWeb: true
            },
            {
                name: 'Wire transfers',
                detail: 'Domestic & international wires',
                status: d?.wireEnabled === true ? 'Enabled' : 'Restricted',
                cardClass: this.svcCardClass(d?.wireEnabled),
                statusClass: this.svcStatusClass(d?.wireEnabled),
                iconTypeWire: true
            },
            {
                name: 'Paperless',
                detail: 'E-statements and notices',
                status: d?.paperlessEnrolled === true ? 'Active' : 'Not enrolled',
                cardClass: this.svcCardClass(d?.paperlessEnrolled),
                statusClass: this.svcStatusClass(d?.paperlessEnrolled),
                iconTypeDoc: true
            },
            {
                name: 'Account alerts',
                detail: 'Balance and security notifications',
                status: d?.alertsEnrolled === true ? 'Active' : 'Not enrolled',
                cardClass: this.svcCardClass(d?.alertsEnrolled),
                statusClass: this.svcStatusClass(d?.alertsEnrolled),
                iconTypeBell: true
            },
            {
                name: 'KYC / compliance',
                detail: 'Identity verification status',
                status: d?.kycStatus || 'Pending',
                cardClass:
                    d?.kycStatus === 'Verified' || d?.kycStatus === 'Complete'
                        ? 'wp-svc-card wp-svc-card--on'
                        : 'wp-svc-card wp-svc-card--warn',
                statusClass:
                    d?.kycStatus === 'Verified' || d?.kycStatus === 'Complete'
                        ? 'wp-svc-status wp-svc-status--on'
                        : 'wp-svc-status wp-svc-status--warn',
                iconTypeShield: true
            }
        ];
        return cards;
    }

    svcCardClass(on) {
        if (on === true) {
            return 'wp-svc-card wp-svc-card--on';
        }
        if (on === false) {
            return 'wp-svc-card wp-svc-card--off';
        }
        return 'wp-svc-card wp-svc-card--na';
    }

    svcStatusClass(on) {
        if (on === true) {
            return 'wp-svc-status wp-svc-status--on';
        }
        if (on === false) {
            return 'wp-svc-status wp-svc-status--off';
        }
        return 'wp-svc-status wp-svc-status--na';
    }

    get portfolioAllocations() {
        const d = this.d;
        const inv = this.scoreNum(d?.investmentBalance);
        const loan = this.scoreNum(d?.loanBalance);
        const dep = this.scoreNum(d?.depositYtd);
        const total = inv + loan + dep;
        if (total <= 0) {
            return [
                { name: 'Equities', pct: 35, color: 'var(--wp-accent)' },
                { name: 'Fixed income', pct: 25, color: 'var(--wp-accent-2)' },
                { name: 'Alternatives', pct: 22, color: '#7fb3e8' },
                { name: 'Cash & MM', pct: 18, color: 'rgba(240,235,224,0.35)' }
            ].map((a) => ({ ...a, dotStyle: `background-color:${a.color}` }));
        }
        const p1 = Math.round((inv / total) * 100);
        const p2 = Math.round((loan / total) * 100);
        const p3 = Math.max(0, 100 - p1 - p2);
        return [
            { name: 'Investments', pct: p1, color: 'var(--wp-accent)' },
            { name: 'Lending', pct: p2, color: 'var(--wp-negative)' },
            { name: 'Liquidity', pct: p3, color: 'var(--wp-accent-2)' }
        ].map((a) => ({ ...a, dotStyle: `background-color:${a.color}` }));
    }

    get donutSegments() {
        const all = this.portfolioAllocations;
        const r = 36;
        const circ = 2 * Math.PI * r;
        let cumFrac = 0;
        return all.map((a) => {
            const frac = Math.min(1, Math.max(0, a.pct / 100));
            const arcLen = frac * circ;
            const gap = Math.max(0.001, circ - arcLen);
            const dasharray = `${arcLen} ${gap}`;
            const rotation = -90 + cumFrac * 360;
            cumFrac += frac;
            return {
                name: a.name,
                pct: a.pct,
                color: a.color,
                dasharray,
                transform: `rotate(${rotation})`
            };
        });
    }

    get accountCards() {
        const d = this.d;
        return [
            {
                type: 'Investment accounts',
                number: '•••• 4821',
                balance: this.fmtCurrency(d?.investmentBalance),
                delta: '+4.2%',
                deltaClass: 'wp-account-delta wp-delta-up'
            },
            {
                type: 'Credit & lending',
                number: '•••• 9920',
                balance: this.fmtCurrency(d?.loanBalance),
                delta: 'On schedule',
                deltaClass: 'wp-account-delta wp-delta-up'
            }
        ];
    }

    get allBranchCards() {
        const d = this.d;
        const list = [];
        if (d?.assignedBranch) {
            const st = (d.assignedBranchStatus || 'Open').toLowerCase();
            list.push({
                name: d.assignedBranch,
                detail: d.assignedBranchAddress || 'Primary relationship branch',
                dist: d.assignedBranchDistance || '—',
                hours: d.assignedBranchHours || 'Lobby 9–5',
                status: d.assignedBranchStatus || 'Open',
                assigned: true,
                nameClass: 'wp-branch-name wp-branch-name--gold',
                distClass: 'wp-branch-dist wp-branch-dist--gold',
                cardClass: 'wp-branch-card wp-branch-card--assigned',
                statusClass: st === 'open' ? 'wp-branch-status--open' : 'wp-branch-status--closed'
            });
        }
        const near = d?.nearbyBranches;
        if (Array.isArray(near)) {
            near.forEach((b) => {
                if (!b) {
                    return;
                }
                const st = (b.status || 'Open').toLowerCase();
                list.push({
                    name: b.name || 'Branch',
                    detail: b.address || '',
                    dist: b.distance || '',
                    hours: b.hours || '',
                    status: b.status || 'Open',
                    assigned: false,
                    nameClass: 'wp-branch-name',
                    distClass: 'wp-branch-dist',
                    cardClass: 'wp-branch-card',
                    statusClass: st === 'open' ? 'wp-branch-status--open' : 'wp-branch-status--closed'
                });
            });
        }
        if (list.length === 0) {
            list.push({
                name: 'Downtown Financial Center',
                detail: '1200 Market St',
                dist: '2.4 mi',
                hours: 'Mon–Fri 9–5',
                status: 'Open',
                assigned: false,
                nameClass: 'wp-branch-name',
                distClass: 'wp-branch-dist',
                cardClass: 'wp-branch-card',
                statusClass: 'wp-branch-status--open'
            });
        }
        return list.map((b, i) => ({ ...b, rowKey: `wp-br-${i}` }));
    }

    get serviceRecommendations() {
        return this.allServiceCards
            .filter((c) => c.statusClass && c.statusClass.includes('off'))
            .slice(0, 3)
            .map((c, i) => ({
                key: `rec-${i}-${c.name}`,
                title: `Enroll in ${c.name}`,
                sub: c.detail
            }));
    }

    get aiActionRows() {
        if (this.showAiActions === false) {
            return [];
        }
        const raw = this.d?.recommendationsJson;
        if (!raw) {
            return [];
        }
        try {
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) {
                return [];
            }
            return arr.slice(0, 5).map((item, i) => ({
                key: `ai-${i}-${item.title || i}`,
                title: item.title || item.action || item.name || `Recommendation ${i + 1}`,
                sub: item.detail || item.description || item.body || '',
                iconClass: `wp-ai-action-icon wp-ai-action-icon--t${i % 3}`
            }));
        } catch (e) {
            return [];
        }
    }

    get hasData() {
        return this.profileData != null && !this.loading;
    }

    get hasError() {
        return Boolean(this.errorMessage);
    }

    get isLoading() {
        return this.loading;
    }

    get isTabOverview() {
        return this.activeTab === 'overview';
    }

    get isTabSignals() {
        return this.activeTab === 'signals';
    }

    get isTabPortfolio() {
        return this.activeTab === 'portfolio';
    }

    get isTabServices() {
        return this.activeTab === 'services';
    }

    get isTabLocation() {
        return this.activeTab === 'location';
    }

    get isTabInsight() {
        return this.activeTab === 'insight';
    }

    get accentColorStyle() {
        return `color:${this.accentColor}`;
    }

    get headerBgStyle() {
        const c1 = this.headerGradientColor1;
        const c2 = this.headerGradientColor2;
        const bg = this.backgroundPrimary;
        if (this.headerGradientStyle === 'linear') {
            return `background:linear-gradient(135deg,${c1},${c2});`;
        }
        if (this.headerGradientStyle === 'solid') {
            return `background:${bg};`;
        }
        return `background:radial-gradient(ellipse 120% 80% at 20% 0%,${c1} 0%,transparent 55%),radial-gradient(ellipse 100% 60% at 100% 100%,${c2} 0%,transparent 50%);`;
    }

    get avatarRingClass() {
        const s = (this.avatarRingStyle || 'gold').toLowerCase();
        if (s === 'silver') {
            return 'wp-avatar-ring wp-avatar-ring--silver';
        }
        if (s === 'teal') {
            return 'wp-avatar-ring wp-avatar-ring--teal';
        }
        if (s === 'custom') {
            return 'wp-avatar-ring wp-avatar-ring--custom';
        }
        return 'wp-avatar-ring wp-avatar-ring--gold';
    }

    get predictionLabel() {
        return this.d?.predictionLabel || '—';
    }

    fmtCurrency(v) {
        if (v === null || v === undefined || v === '') {
            return '—';
        }
        const n = Number(v);
        if (!Number.isFinite(n)) {
            return '—';
        }
        return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
    }

    get showKpiStripResolved() {
        return this.showKpiStrip !== false;
    }

    get showEnrollmentFlagsResolved() {
        return this.showEnrollmentFlags !== false;
    }

    get showSparklineResolved() {
        return this.showSparkline !== false;
    }

    get showBranchProximityResolved() {
        return this.showBranchProximity !== false;
    }

    get showAiActionsResolved() {
        return this.showAiActions !== false;
    }
}
