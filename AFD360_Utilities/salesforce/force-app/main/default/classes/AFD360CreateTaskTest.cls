@IsTest
private class AFD360CreateTaskTest {
    @IsTest
    static void createsTaskWithRelatedRecords() {
        Account a = new Account(Name = 'AFD360 Task Test Account');
        insert a;
        Contact c = new Contact(LastName = 'Miller', FirstName = 'Al', AccountId = a.Id);
        insert c;
        AFD360CreateTask.CreateTaskRequest req = new AFD360CreateTask.CreateTaskRequest();
        req.subject = 'Speak with Al about pricing';
        req.whatId = a.Id;
        req.whoId = c.Id;
        req.priority = 'High';
        req.activityDate = '2030-01-15';
        req.details = 'Finalize pricing';
        AFD360CreateTask.TaskCard card = AFD360CreateTask.createTask(new List<AFD360CreateTask.CreateTaskRequest>{ req })[0].task;
        Assert.isTrue(card.created, card.message);
        Assert.areEqual('Not Started', card.status);
        Assert.areEqual('High', card.priority);
        Assert.areEqual('Jan 15, 2030', card.dueDate);
        Assert.areEqual('AFD360 Task Test Account', card.relatedTo);
        Assert.areEqual('Al Miller', card.name);
        Task t = [SELECT Description, OwnerId FROM Task WHERE Id = :card.taskId];
        Assert.areEqual('Finalize pricing', t.Description);
        Assert.areEqual(UserInfo.getUserId(), t.OwnerId);
    }

    @IsTest
    static void reportsTheRealErrorOnFailure() {
        AFD360CreateTask.CreateTaskRequest req = new AFD360CreateTask.CreateTaskRequest();
        req.subject = 'Wrong related-to type';
        req.whatId = UserInfo.getUserId(); // a User can't be a Task's Related To
        AFD360CreateTask.TaskCard card = AFD360CreateTask.createTask(new List<AFD360CreateTask.CreateTaskRequest>{ req })[0].task;
        Assert.isFalse(card.created);
        Assert.isTrue(card.message.startsWith('Task not created: '));
    }
}
