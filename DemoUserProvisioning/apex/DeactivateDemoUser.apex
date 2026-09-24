String username = '{{USERNAME}}';
List<User> us = [SELECT Id, IsActive FROM User WHERE Username = :username LIMIT 1];
if (us.isEmpty()) { System.debug('NOT FOUND: ' + username); }
else if (!us[0].IsActive) { System.debug('ALREADY INACTIVE: ' + username); }
else { us[0].IsActive = false; update us[0]; System.debug('DEACTIVATED: ' + username); }
