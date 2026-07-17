# Implementation Plan — Salesforce Scheduler Banking Transformation

## Summary

Transform the Salesforce Scheduler configuration from field-service/turbine-oriented to a banking-specific appointment booking system for Cumulus Bank. This covers WorkTypes, WorkTypeGroups, Service Territories, Service Resources (repurposed as banking advisors), Skills, Operating Hours, and all junction records.

## Current State (Before)

- **43 WorkTypes** — mostly field-service (Battery Replacement, Turbine Performance, etc.) with 5 banking ones
- **13 WorkTypeGroups** — mix of turbine/training groups and banking groups
- **12 Service Territories** — field-service focused plus 1 banking (Market St Branch)
- **50 Service Resources** — all field-service technicians (ResourceType='T')
- **29 Skills** — mix of FSL and banking skills
- **29 OperatingHours** — mostly field-service, with 1 "Branch Banking Hours"

## Phase 1: Cleanup — Remove Non-Banking Data

1. Delete all 19 WorkTypeGroupMember records (junction records first)
2. Delete all 29 ServiceTerritoryWorkType records
3. Delete non-banking WorkTypeGroups (keep Wealth Advisory, Business Banking, General Banking, Insurance, KYC, Mortgage, Notary)
4. Delete 38 field-service/turbine WorkTypes (keep 5 banking ones)
5. Deactivate non-banking Service Territories (IsActive=false)

## Phase 2: Create Banking WorkTypes

### Rename existing
| Current Name | New Name | Duration |
|---|---|---|
| General Banking West Coast | General Banking Consultation | 30 min |
| Business Banking West Coast | Business Banking Consultation | 30 min |
| Mortgage West Coast | Mortgage Consultation | 45 min |
| Wealth Advisory West Coast | Wealth Advisory Consultation | 45 min |
| Notary | Notary Services | 30 min |

### Create new
Account Opening (30m), Loan Application Review (45m), Credit Card Consultation (30m), Retirement Planning (60m), Investment Review (60m), Estate Planning Consultation (60m), Financial Health Checkup (45m), Small Business Banking (45m), Treasury Management Consultation (60m), Safe Deposit Box (15m).

## Phase 3: Create Banking Branch Territories & Operating Hours

Created 3 OperatingHours profiles (Branch Banking, Extended, Financial Center) and 10 Service Territories with addresses and geo-coordinates across San Francisco, New York, Chicago, Boston, Miami, Los Angeles, Seattle, Houston, and a Digital Banking Hub.

## Phase 4: Configure Skills, Resources & Territory Memberships

- Created 6 new banking Skills (deployed as metadata XML)
- Repurposed 22 Service Resources as banking advisors
- Created ServiceTerritoryMember records linking advisors to branches
- Assigned 72 ServiceResourceSkill records with proficiency levels (50-95)

## Phase 5: Wire Up Relationships

- Updated WorkTypeGroups with banking services
- Created WorkTypeGroupMember junction records
- Created 83 ServiceTerritoryWorkType junction records

## Critical Requirements

- Skills must be deployed as metadata XML files (`.skill-meta.xml`), not via DML
- `DurationType` accepts 'Minutes' or 'Hours' (case-sensitive)
- `ServiceTerritoryWorkType` WorkTypeId+ServiceTerritoryId must be unique
- Delete junction records before parent records
- `ServiceResourceSkill.SkillLevel` range is 0-99.99 (not 100)
- `ServiceResourceSkill.EffectiveStartDate` is required (Date type)
