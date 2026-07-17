# Salesforce Scheduler — Cumulus Bank

Complete implementation of Salesforce Scheduler for Cumulus Bank, transforming a field-service/turbine configuration into a purpose-built **banking appointment booking system**.

## Overview

Customers can book appointments with banking advisors across **10 branch locations** for **15 different banking services**, with **22 advisors** assigned across the network.

| Metric | Value |
|--------|-------|
| Appointment Types | 15 |
| Branch Locations | 10 |
| Banking Advisors | 22 |
| Skill Assignments | 72 |
| Territory-Service Links | 83 |
| Service Groups | 15 |

## Appointment Services

### General Banking
- General Banking Consultation (30 min)
- Account Opening (30 min)
- Credit Card Consultation (30 min)
- Financial Health Checkup (45 min)
- Safe Deposit Box (15 min)
- Notary Services (30 min)

### Wealth & Investment
- Wealth Advisory Consultation (45 min)
- Retirement Planning (60 min)
- Investment Review (60 min)
- Estate Planning Consultation (60 min)

### Lending
- Mortgage Consultation (45 min)
- Loan Application Review (45 min)

### Business Banking
- Business Banking Consultation (30 min)
- Small Business Banking (45 min)
- Treasury Management Consultation (60 min)

## Branch Network

| Branch | City | State | Advisors | Services |
|--------|------|-------|----------|----------|
| Market St Branch (Flagship) | San Francisco | CA | 4 | All 15 |
| San Francisco Main (BR100) | San Francisco | CA | 3 | 10 |
| New York Financial Center (BR200) | New York | NY | 3 | 10 |
| Chicago Financial Center (BR300) | Chicago | IL | 2 | 7 |
| Boston Financial Center (BR400) | Boston | MA | 2 | 7 |
| Miami Financial Center (BR500) | Miami | FL | 2 | 7 |
| Los Angeles Branch (BR110) | Los Angeles | CA | 2 | 7 |
| Seattle Branch (BR210) | Seattle | WA | 1 | 7 |
| Houston Branch (BR310) | Houston | TX | 1 | 7 |
| Digital Banking Hub (BR700) | San Francisco | CA | 2 | 6 (virtual) |

## Operating Hours

| Schedule | Mon-Fri | Saturday |
|----------|---------|----------|
| Branch Banking Hours | 9:00 AM – 5:00 PM | 9:00 AM – 1:00 PM |
| Extended Branch Hours | 8:00 AM – 6:00 PM | 9:00 AM – 3:00 PM |
| Financial Center Hours | 8:00 AM – 7:00 PM | 9:00 AM – 4:00 PM |

## Banking Skills

Advisors are assigned 3-4 skills each with proficiency levels (50-95):

- General Banking
- Account Services
- Mortgage
- Loan Processing
- Wealth Advisory
- Investment Banking
- Retirement Planning
- Estate Planning
- Business Banking
- Treasury Management

## Schedule Appointment Flow

The `*Schedule Appointment` flow is launched via a Quick Action on Account pages. It follows the Salesforce Scheduler `Appointments` processType with these managed LWC components:

```
Start → Set Initial Values → Select Topic (flowWorkType) → Select Appointment Type (flowApptType)
  → Get Service Territory → Get Default Service Resource → Select Time Slot (flowTimeslot)
  → Review Appointment (flowReview) → Save Appointment (saveAppointment) → Confirmation (flowConfirm)
```

### Key Flow Details

- **API Version**: 49.0 (required for Appointments processType navigation buttons)
- **Process Type**: `Appointments`
- **Quick Action**: `Account.FINS_Retail_Banking_Starter_Schedule_Appointment`
- **Flow API Name**: `FINS_Retail_Banking_Starter_Julie_Morris_Wealth_Referral`

### Flow Files

- `flow-metadata/FINS_Retail_Banking_Starter_Julie_Morris_Wealth_Referral.flow-meta.xml` — Main flow
- `flow-metadata/Account.FINS_Retail_Banking_Starter_Schedule_Appointment.quickAction-meta.xml` — Quick Action

## Issues Fixed

### 1. API Version (62.0 → 49.0)
API version 62.0 suppressed Next/Previous navigation buttons for Appointments processType flows. Reverted to 49.0.

### 2. AttendeesScreen Blocked Progress
The `flowTriage` resource search returned no results. Resolved by skipping the AttendeesScreen and routing directly to TopicScreen.

### 3. TimeSlotScreen Crash (Missing Resource)
The `flowTimeslot` component requires a `serviceResourceId`. Added `Get_Default_Service_Resource` lookup to auto-assign the primary resource from Market St Branch territory.

### 4. Appointment Booked Under Wrong Customer
Post-confirmation steps contained hardcoded demo logic:
- `Get_Lead` — Queried Lead using an Account ID (wrong object type)
- `Update_Julie` — Hardcoded update to Lead "Ron Abelin" (External_ID = Lead.254)
- `Send_to_Julie_SubFlow` — Demo-specific sub-flow
- `Update_Churn` — Set `SDO_Cust360_ChurnRisk__pc` (Person Account field) on Business Accounts

**All four steps removed.** The flow now ends cleanly after confirmation.

### 5. No ServiceAppointment Record Created
The flow showed confirmation ("Your appointment's all set") but never actually created a ServiceAppointment record. Root cause: missing `saveAppointment` action and `flowReview` screen.

**Added:**
- `ReviewScreen` with `flowReview` component (gathers appointment data and outputs `serviceAppointmentFields`)
- `Save_Appointment` action call (`saveAppointment` actionType) that creates the actual record
- `SetReviewStage` assignment for flow stage navigation

### 6. ContactId Required by flowReview
After skipping the AttendeesScreen, `ServiceAppointment.ContactId` was never set, causing `flowReview` to fault. Fixed by initializing `ContactId` in `SetInitialValues`.

### 7. saveErrors Showed False Error Banner
The `saveErrors` input on `flowReview` was incorrectly bound to `validationErrors` (the validation JSON), causing a "Hmm, that didn't work" banner on first visit. Fixed by binding to `$Flow.FaultMessage` (empty on normal flow, only populated after a save failure).

## Scheduling Policy Configuration

| Setting | Value |
|---------|-------|
| Shift-Based Scheduling | Disabled |
| Territory OH + Shifts Intersection | Disabled |
| Respect Visiting Hours | Disabled |
| Use Primary Members | Enabled |
| Use Secondary Members | Enabled |
| Skill Matching | Disabled (can be re-enabled) |
| Calendar Event Check | Disabled (can be re-enabled) |
| Appointment Interval | 15 minutes |

## Troubleshooting — Time Slot Availability

If time slots don't appear, check these in order:

1. **ServiceTerritory.IsActive = true** — #1 cause of empty slots
2. **ServiceTerritoryMember records exist** — Links resources to territories
3. **ServiceResource.IsActive = true** — Inactive resources don't appear
4. **OperatingHours cover the requested date/time** — Business hours restriction
5. **No ResourceAbsence for the date** — Vacation/absence blocks resources
6. **ServiceTerritoryWorkType records exist** — WorkType must be linked to territory
7. **No conflicting ServiceAppointments** — All slots may be booked
8. **Scheduler Permission Set assigned** — Resources need "Scheduler - Schedulable Resource Permission"

## Documentation

See the `docs/` folder for detailed documentation:

- `01-implementation-plan.md` — 5-phase transformation plan
- `02-banking-transformation-report.md` — Results and branch coverage
- `03-scheduler-fix-resolution.md` — 5 root causes for scheduling issues
- `04-flow-fixes.md` — All 8 flow fixes documented in detail
- `05-timeslot-troubleshooting.md` — Time slot debugging guide

## Org Details

- **Org**: Cumulus Financial Services (00Dam00000Uo32q)
- **Instance**: storm-16a17dc388fbe6.demo.my.salesforce.com
- **Market St Branch Territory**: `0Hham000000MfzACAS`
- **Default Scheduling Policy**: `0Vram000000ED5RCAW`
