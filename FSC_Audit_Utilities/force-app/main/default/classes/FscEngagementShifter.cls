/**
 * FscEngagementShifter
 * --------------------
 * Schedulable companion to FscEngagementSeed (Phase B1).
 *
 * On each cron tick (designed for monthly cadence), shifts every seeded
 * engagement record's date forward by 30 days so the rolling 60-past +
 * 30-future window stays current. Filters strictly on
 * IsSeededEngagement__c = TRUE — never touches historical data.
 *
 * To activate:
 *   System.schedule(
 *     'FscEngagementShiftMonthly',
 *     '0 0 4 1 * ?',                       // 04:00 UTC on the 1st of each month
 *     new FscEngagementShifter()
 *   );
 *
 * To unschedule: find the CronTrigger Id and call System.abortJob(...).
 *
 * Companion to FscEngagementSeed; closes audit finding §4.1 C1.
 */
public with sharing class FscEngagementShifter implements Schedulable {

    private static final Integer SHIFT_DAYS = 30;

    /**
     * @description Schedulable entry point. Runs the +30-day shift across
     *              all seeded Events, Tasks, Interactions in one transaction.
     */
    public void execute(SchedulableContext sc) {
        runOnDemand();
    }

    /**
     * @description Public entry that admins can invoke manually if the
     *              org needs an immediate refresh outside of cron.
     */
    @AuraEnabled
    public static String runOnDemand() {
        Integer eventCount = shiftEvents();
        Integer taskCount  = shiftTasks();
        Integer interactionCount = shiftInteractions();
        return 'OK: shifted '
             + eventCount + ' Events + '
             + taskCount + ' Tasks + '
             + interactionCount + ' Interactions forward by '
             + SHIFT_DAYS + ' days.';
    }

    @TestVisible
    private static Integer shiftEvents() {
        List<Event> rows = [
            SELECT Id, ActivityDate, ActivityDateTime
            FROM Event WHERE IsSeededEngagement__c = TRUE
        ];
        for (Event e : rows) {
            if (e.ActivityDate != null) {
                e.ActivityDate = e.ActivityDate.addDays(SHIFT_DAYS);
            }
            if (e.ActivityDateTime != null) {
                e.ActivityDateTime = e.ActivityDateTime.addDays(SHIFT_DAYS);
            }
        }
        Database.SaveResult[] results = Database.update(rows, false);
        return countOk(results);
    }

    @TestVisible
    private static Integer shiftTasks() {
        List<Task> rows = [
            SELECT Id, ActivityDate
            FROM Task WHERE IsSeededEngagement__c = TRUE
        ];
        for (Task t : rows) {
            if (t.ActivityDate != null) {
                t.ActivityDate = t.ActivityDate.addDays(SHIFT_DAYS);
            }
        }
        Database.SaveResult[] results = Database.update(rows, false);
        return countOk(results);
    }

    @TestVisible
    private static Integer shiftInteractions() {
        List<Interaction> rows = [
            SELECT Id, StartTime, EndTime
            FROM Interaction WHERE IsSeededEngagement__c = TRUE
        ];
        for (Interaction i : rows) {
            if (i.StartTime != null) {
                i.StartTime = i.StartTime.addDays(SHIFT_DAYS);
            }
            if (i.EndTime != null) {
                i.EndTime = i.EndTime.addDays(SHIFT_DAYS);
            }
        }
        Database.SaveResult[] results = Database.update(rows, false);
        return countOk(results);
    }

    @TestVisible
    private static Integer countOk(Database.SaveResult[] results) {
        Integer ok = 0;
        for (Database.SaveResult r : results) {
            if (r.isSuccess()) {
                ok++;
            }
        }
        return ok;
    }
}
