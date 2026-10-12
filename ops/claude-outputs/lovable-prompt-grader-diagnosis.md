The Website Grader report email worked last night but isn't arriving today. Please **diagnose only, don't change anything yet**, and report back what each step shows:

1. The most recent grader leads:
   ```sql
   select id, created_at, url, score, grade, notified_at
   from website_grader_leads order by created_at desc limit 10;
   ```

2. What the trigger's HTTP call to the function returned. pg_net keeps the responses:
   ```sql
   select id, status_code, left(content::text, 200) as content, created
   from net._http_response order by created desc limit 10;
   ```

3. `send-grader-report` logs since yesterday evening, especially any line containing `brevo status`, `missing configuration`, `invalid template id` or `read failed`.

4. `grade-website` logs, especially any line containing `lead insert failed` or `lead insert threw`.

Then say which of these it is:
- **No new row** → the lead was never stored (grade-website insert problem).
- **Row with `notified_at` empty** → the send failed. Include the Brevo status code from the logs.
- **Row with `notified_at` filled** → Brevo accepted the email, so this is a delivery issue on Brevo's side, not ours.
