// Non-compliant examples
void setAlarm(Context context) {
    AlarmManager alarmManager = (AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
    Intent intent = new Intent(context, Alarm.class);
    PendingIntent pendingIntent = PendingIntent.getBroadcast(context, 0, intent, 0);
    alarmManager.setRepeating(AlarmManager.RTC_WAKEUP, System.currentTimeMillis(), 1000 * 60 * 10, pendingIntent);
}

Alarm alarm = new Alarm();
alarm.setAlarm(this);

JobInfo info = new JobInfo.Builder(123, COMPONENT_NAME)
                          .setRequiresCharging(true)
                          .setRequiredNetworkType(JobInfo.NETWORK_TYPE_UNMETERED)
                          .setPersisted(true)
                          .setPeriodic(10 * 60 * 1000)
                          .build();
JobScheduler scheduler = (JobScheduler) getSystemService(JOB_SCHEDULER_SERVICE);
scheduler.schedule(info);
