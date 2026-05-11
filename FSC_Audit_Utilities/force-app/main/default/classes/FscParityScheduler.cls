/**
 * FscParityScheduler
 * ------------------
 * Schedulable wrapper that fires FscParityBatch.runOnDemand() on a cron.
 * Per audit decision §6.1 D1, the parity batch runs hourly. To activate:
 *
 *   System.schedule(
 *     'FscParityHourly',
 *     '0 0 * * * ?',
 *     new FscParityScheduler()
 *   );
 *
 * Cron string '0 0 * * * ?' fires at the top of every hour (00:00, 01:00,
 * ...). Adjust as demo cadence requires; document any change in the
 * project README.
 *
 * To unschedule: System.abortJob('<jobId of CronTrigger>'). Find the Id
 * with: SELECT Id FROM CronTrigger WHERE CronJobDetail.Name = 'FscParityHourly'.
 */
public with sharing class FscParityScheduler implements Schedulable {

    /**
     * @description Schedulable entry point. Submits a fresh FscParityBatch
     *              chain on each cron tick.
     */
    public void execute(SchedulableContext sc) {
        FscParityBatch.runOnDemand();
    }
}
