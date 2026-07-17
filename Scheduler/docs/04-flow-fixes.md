# Schedule Appointment Flow — All Fixes

## Summary

The `*Schedule Appointment` flow is now fully functional end-to-end. Eight issues were identified and fixed across multiple sessions.

## Flow Path (Final)

```
Start → Set Initial Values → Select Topic (flowWorkType) → Select Appointment Type (flowApptType)
  → Get Service Territory → Get Default Service Resource → Select Time Slot (flowTimeslot)
  → Set Review Stage → Review Appointment (flowReview) → Save Appointment (saveAppointment)
  → Set Confirmation Stage → Confirmation (flowConfirm) → End
```

## Issues Fixed

### Issue 1: No Next/Previous Buttons (API Version)
- **Symptom**: Flow rendered but no navigation buttons appeared
- **Root Cause**: API version 62.0 suppresses navigation buttons for `Appointments` processType flows
- **Fix**: Reverted to API version **49.0**

### Issue 2: AttendeesScreen Blocked Progress
- **Symptom**: Flow stuck on first screen with no selectable resources
- **Root Cause**: The `flowTriage` component's resource search returned no results
- **Fix**: Skipped the AttendeesScreen by routing `SetInitialValues` directly to `SetTopicStage`

### Issue 3: TimeSlotScreen Crash (Missing Resource)
- **Symptom**: Flow crashed when reaching time slot selection
- **Root Cause**: The `flowTimeslot` component requires a `serviceResourceId` input
- **Fix**: Added `Get_Default_Service_Resource` record lookup to auto-assign the primary resource from Market St Branch territory

### Issue 4: Appointment Booked Under Wrong Customer
- **Symptom**: After booking, the appointment appeared under a completely different customer (Lead "Ron Abelin")
- **Root Cause**: Post-confirmation steps contained hardcoded demo logic:
  - `Get_Lead` — Queried Lead using an Account ID (wrong object type)
  - `Update_Julie` — Hardcoded update to Lead.254
  - `Send_to_Julie_SubFlow` — Demo sub-flow reference
- **Fix**: Removed all three steps entirely

### Issue 5: Unhandled Fault on Business Accounts
- **Symptom**: "An unhandled fault has occurred" error after clicking Finish
- **Root Cause**: `Update_Churn` step tried to set `SDO_Cust360_ChurnRisk__pc` (a Person Account field) on a Business Account
- **Fix**: Removed the `Update_Churn` step

### Issue 6: No ServiceAppointment Record Created
- **Symptom**: Flow showed "Your appointment's all set" confirmation but no ServiceAppointment record existed in the database
- **Root Cause**: Flow was missing the `saveAppointment` action call and `flowReview` screen. The `flowConfirm` component only displays a confirmation UI — it does NOT create records
- **Fix**: Added three elements:
  - `SetReviewStage` assignment (sets `$Flow.CurrentStage` to `ReviewStage`)
  - `ReviewScreen` with `flowReview` component (gathers all appointment data and outputs `serviceAppointmentFields`)
  - `Save_Appointment` action call (`saveAppointment` actionType) that actually creates the ServiceAppointment record
  - Changed `TimeSlotScreen` connector from `SetConfirmationStage` to `SetReviewStage`

### Issue 7: ContactId Fault on ReviewScreen
- **Symptom**: "The flow failed to access the value for ServiceAppointment.ContactId because it hasn't been set or assigned"
- **Root Cause**: By skipping the AttendeesScreen (which normally sets ContactId via `flowTriage`), `ServiceAppointment.ContactId` was never initialized
- **Fix**: Added `ServiceAppointment.ContactId` initialization in `SetInitialValues`

### Issue 8: False Error Banner on Review Screen
- **Symptom**: "Hmm, that didn't work" error banner with validation JSON displayed on the Review screen
- **Root Cause**: The `saveErrors` input on `flowReview` was incorrectly bound to `validationErrors` (which contained `{"workTypeGroupId":false,...}`)
- **Fix**: Changed `saveErrors` binding from `validationErrors` to `$Flow.FaultMessage` (empty on normal flow, only populated after a save failure)

## Key Technical Notes

- **`flowConfirm` vs `saveAppointment`**: `flowConfirm` ONLY displays confirmation UI. The `saveAppointment` action MUST run before `flowConfirm` to actually create the record.
- **`flowReview` outputs `serviceAppointmentFields`**: This serialized string is the critical input for `saveAppointment`. Without it, no record is created.
- **`$Flow.FaultMessage`**: The correct binding for `saveErrors` on `flowReview`. Only populated when the flow has faulted.
- **API Version 49.0**: Required for Appointments processType flows to render navigation buttons.
