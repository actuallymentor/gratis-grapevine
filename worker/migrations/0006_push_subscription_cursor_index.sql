UPDATE push_notification_jobs
SET last_subscription_created_at = (
    SELECT push_subscriptions.created_at
    FROM push_subscriptions
    WHERE push_subscriptions.id = push_notification_jobs.last_subscription_id
)
WHERE last_subscription_created_at = ''
    AND last_subscription_id != ''
    AND EXISTS (
        SELECT 1
        FROM push_subscriptions
        WHERE push_subscriptions.id = push_notification_jobs.last_subscription_id
    );

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_created_id
    ON push_subscriptions (created_at, id);

