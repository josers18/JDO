// Invocable action behind AFD360_HXL_Agent's create_task: inserts the Task directly (no page-layout lookup, so it works over the
// Agent API) and returns it for the afd360TaskCard HXL widget.
global with sharing class AFD360CreateTask {

    @InvocableMethod(label='Create Task' description='Creates a Task with a subject and optional related record (whatId), contact/lead (whoId), status, priority, due date (YYYY-MM-DD) and description')
    global static List<CreateTaskResponse> createTask(List<CreateTaskRequest> requests) {
        List<Task> tasks = new List<Task>();
        for (CreateTaskRequest req : requests) {
            Task t = new Task(
                Subject = req.subject,
                Status = String.isBlank(req.status) ? 'Not Started' : req.status,
                Priority = String.isBlank(req.priority) ? 'Normal' : req.priority,
                Description = req.details,
                OwnerId = UserInfo.getUserId()
            );
            if (String.isNotBlank(req.whatId)) t.WhatId = req.whatId.trim();
            if (String.isNotBlank(req.whoId)) t.WhoId = req.whoId.trim();
            if (String.isNotBlank(req.activityDate)) t.ActivityDate = Date.valueOf(req.activityDate.trim());
            tasks.add(t);
        }
        Database.SaveResult[] results = Database.insert(tasks, false, AccessLevel.USER_MODE);

        Set<Id> ids = new Set<Id>();
        for (Database.SaveResult r : results) if (r.isSuccess()) ids.add(r.getId());
        Map<Id, Task> saved = new Map<Id, Task>([
            SELECT Id, Subject, Status, Priority, ActivityDate, What.Name, Who.Name, Owner.Name
            FROM Task WHERE Id IN :ids WITH USER_MODE
        ]);

        List<CreateTaskResponse> responses = new List<CreateTaskResponse>();
        for (Integer i = 0; i < results.size(); i++) {
            CreateTaskResponse res = new CreateTaskResponse();
            res.task = results[i].isSuccess() ? toCard(saved.get(results[i].getId())) : failed(requests[i], results[i]);
            responses.add(res);
        }
        return responses;
    }

    private static TaskCard toCard(Task t) {
        TaskCard c = new TaskCard();
        c.created = true;
        c.taskId = t.Id;
        c.subject = t.Subject;
        c.status = t.Status;
        c.priority = t.Priority;
        c.dueDate = t.ActivityDate == null ? 'No due date' : Datetime.newInstance(t.ActivityDate, Time.newInstance(12, 0, 0, 0)).format('MMM d, yyyy');
        c.relatedTo = t.What == null ? '—' : t.What.Name;
        c.name = t.Who == null ? '—' : t.Who.Name;
        c.assignedTo = t.Owner == null ? '—' : t.Owner.Name;
        c.message = 'Task created';
        c.recordUrl = URL.getOrgDomainUrl().toExternalForm() + '/lightning/r/Task/' + t.Id + '/view';
        return c;
    }

    // The real error goes back to the agent so it can say exactly what went wrong.
    private static TaskCard failed(CreateTaskRequest req, Database.SaveResult r) {
        List<String> errors = new List<String>();
        for (Database.Error e : r.getErrors()) errors.add(e.getMessage());
        TaskCard c = new TaskCard();
        c.created = false;
        c.subject = req.subject;
        c.status = '—';
        c.priority = '—';
        c.dueDate = '—';
        c.relatedTo = '—';
        c.name = '—';
        c.assignedTo = '—';
        c.message = 'Task not created: ' + String.join(errors, '; ');
        return c;
    }

    global class CreateTaskRequest {
        @InvocableVariable(label='Subject' description='Task subject' required=true)
        global String subject;
        @InvocableVariable(label='Related To Id' description='Id of the related record (Account, Opportunity, Case…)')
        global String whatId;
        @InvocableVariable(label='Name Id' description='Id of the Contact or Lead the task is about')
        global String whoId;
        @InvocableVariable(label='Status' description='Task status; defaults to Not Started')
        global String status;
        @InvocableVariable(label='Priority' description='High, Normal or Low; defaults to Normal')
        global String priority;
        @InvocableVariable(label='Due Date' description='Due date as YYYY-MM-DD')
        global String activityDate;
        @InvocableVariable(label='Details' description='Longer task description')
        global String details;
    }

    global class CreateTaskResponse {
        @InvocableVariable(label='Task')
        global TaskCard task;
    }

    global class TaskCard {
        @InvocableVariable global Boolean created;
        @InvocableVariable global String taskId;
        @InvocableVariable global String subject;
        @InvocableVariable global String status;
        @InvocableVariable global String priority;
        @InvocableVariable global String dueDate;
        @InvocableVariable global String relatedTo;
        @InvocableVariable global String name;
        @InvocableVariable global String assignedTo;
        @InvocableVariable global String message;
        @InvocableVariable global String recordUrl;
    }
}
