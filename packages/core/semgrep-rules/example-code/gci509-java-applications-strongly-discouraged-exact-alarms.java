// Non-compliant examples
AlarmManager alarmManager = (AlarmManager) this.getSystemService(Context.ALARM_SERVICE);
alarmManager.setRepeating(alarmType, triggerAtMillis, intervalMillis, operation);

AlarmManager alarmManager = (AlarmManager) this.getSystemService(Context.ALARM_SERVICE);
alarmManager.setExact(type,triggerAtMillis,operation);

AlarmManager alarmManager = (AlarmManager) this.getSystemService(Context.ALARM_SERVICE);
alarmManager.setExact(type,triggerAtMillis,tag,listener,targetHandler);

AlarmManager alarmManager = (AlarmManager) this.getSystemService(Context.ALARM_SERVICE);
alarmManager.setExactAndAllowWhileIdle(type,triggerAtMilllis,operation);


// Compliant solutions
AlarmManager alarmManager = (AlarmManager) this.getSystemService(Context.ALARM_SERVICE);
alarmManager.setInexactRepeating(alarmType, triggerAtMillis, intervalMillis, operation);
