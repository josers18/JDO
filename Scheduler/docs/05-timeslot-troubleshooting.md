# Time Slot Availability — Troubleshooting Guide

## Overview

This guide covers all requirements for time slots to appear in Salesforce Scheduler, common causes of "no availability on this date" errors, and debugging techniques.

---

## Core Configuration Requirements

### 1. ServiceTerritory must be ACTIVE
- `ServiceTerritory.IsActive = true` is required
- Without an active ServiceTerritory, scheduling flows return empty slot results
- **This is the #1 cause of "no availability on this date"**

### 2. WorkType must exist and be linked to ServiceTerritory
- WorkType defines categories of services with estimated duration
- Must be linked via `ServiceTerritoryWorkType` junction object
- Both `WorkTypeId` AND `ServiceTerritoryId` are required parameters for slot-fetching

### 3. ServiceResource must be ACTIVE
- Only active resources (`ServiceResource.IsActive = true`) are considered available
- Must be linked to ServiceTerritory via `ServiceTerritoryMember`

### 4. ServiceTerritoryMember (Junction Object)
- Links ServiceResource to ServiceTerritory
- Resource cannot serve appointments without this record
- No error on slot-fetching calls — just empty results

### 5. OperatingHours
- Defines business hours for the ServiceTerritory
- If linked via `ServiceTerritory.OperatingHoursId`, restricts availability to those hours
- Must also be assigned to `ServiceTerritoryMember.OperatingHoursId`

### 6. Scheduler Permission Set
- Resources need "Scheduler - Schedulable Resource Permission" assigned to their User
- Without this, the system cannot return them as candidates

---

## Troubleshooting Priority Order

1. **ServiceTerritory.IsActive = true** — Blocks everything if false
2. **ServiceTerritoryMember records exist** — Resource won't show if not linked
3. **ServiceResource.IsActive = true** — Inactive resources don't appear
4. **OperatingHours cover the requested date/time** — Business hours restriction
5. **No ResourceAbsence for the date** — Vacation/absence blocks resources
6. **ServiceTerritoryWorkType records exist** — WorkType must be linked to territory
7. **No conflicting ServiceAppointments** — All slots may be booked
8. **Scheduler Permission Set assigned** — Resources need the permission set

---

## Common Causes of Empty Slots

### Shift-Based Scheduling Conflict
If `IsSvcTerritoryMemberShiftUsed = true` on the scheduling policy, the engine intersects Shift records with Territory Operating Hours. If no matching Shifts exist for the resource, zero slots appear.

**Fix**: Set `IsSvcTerritoryMemberShiftUsed = false` and `IsSvcTerrOpHoursWithShiftsUsed = false`

### Visiting Hours Misconfiguration
If `ShouldRespectVisitingHours = true` but the Account has no `OperatingHoursId`, no valid visiting window exists.

**Fix**: Set `ShouldRespectVisitingHours = false` or assign OperatingHoursId to customer Accounts

### Missing STM Operating Hours
Even if ServiceTerritory has OperatingHours, each ServiceTerritoryMember may also need `OperatingHoursId` set.

### Missing Territory Geo-Coordinates
The Scheduler flow uses geo-search to find nearby territories. Without street address and coordinates, no territories are found.

---

## Relationship Chain

```
ServiceResource (person/advisor)
  ↓
ServiceTerritoryMember (junction — links resource to territory, has OperatingHoursId)
  ↓
ServiceTerritory (branch location — has OperatingHoursId, geo-coordinates)
  ↓
ServiceTerritoryWorkType (junction — links territory to service types)
  ↓
WorkType (appointment type with duration)
```

All five levels must be configured and linked correctly for slots to appear.

---

## Known Gotchas

| Issue | Details |
|-------|---------|
| SkillLevel cannot be 100 | Valid range is 0-99.99 |
| DurationType case-sensitive | Must be exactly 'Minutes' or 'Hours' |
| GanttLabel on STM, not ServiceResource | Field exists only on ServiceTerritoryMember |
| ServiceAppointment uses ParentRecordId | Not WorkOrderId |
| Flow DateTime type required | SchedStartTime/EndTime must be DateTime, not Date |
