# Scheduler Fix — Complete Resolution

## Summary

All Salesforce Scheduler issues have been resolved. Advisors are now appearing as candidates, and time slots are fully visible in the booking flow. Five root causes were identified and fixed.

## Root Causes Identified & Fixed

### 1. Missing Scheduler Permission Sets
16 of the 22 advisor users were missing the "Scheduler - Schedulable Resource Permission" set. Without this, the system could not return them as candidates.

### 2. Missing Operating Hours on STM Records
All 22 ServiceTerritoryMember records had no OperatingHoursId assigned. The scheduling engine needs this to determine when each advisor is available at their territory.

### 3. Shift-Based Scheduling Conflict
The AppointmentSchedulingPolicy had `IsSvcTerritoryMemberShiftUsed = true` and `IsSvcTerrOpHoursWithShiftsUsed = true`. This forced the engine to intersect Shift records with Territory Operating Hours, producing zero available slots despite 34,000+ Shift records existing. Disabling both flags resolved the issue.

### 4. Visiting Hours Misconfiguration
`ShouldRespectVisitingHours = true` was set on the policy, but the test Account (Acme Partners) had no OperatingHoursId, meaning no valid visiting window existed. Setting this to false resolved the empty time slots.

### 5. Missing Territory Geo-Coordinates
All 10 Service Territories had no street address, city, state, or latitude/longitude set. The Scheduler flow uses geo-search to find nearby territories — without coordinates, no territories could be found during the location step.

## Scheduling Policy Settings

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
| Enforce Required Resource | Enabled |
| Enforce Excluded Resource | Enabled |

## Optional Enhancements

- **Skill Matching**: Create SkillRequirement records on WorkTypes, then set `ShouldMatchSkill = true`
- **Calendar Integration**: Set `ShouldConsiderCalendarEvents = true` to prevent double-booking
- **Visiting Hours**: Set `ShouldRespectVisitingHours = true` after assigning OperatingHoursId to customer Accounts
