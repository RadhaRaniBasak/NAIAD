# Runbook: Subscription Payment Failure Surge (`SubscriptionPaymentFailureSurge`)

**Severity:** P3 (Medium)  
**Alert Definition:** More than 3 `invoice.payment_failed` webhook events within a rolling 24 hours.

The alert rule is part of the monitoring plan in `docs/monitoring.md`; nothing in the repository sends it. The count comes from the query in §2.

---

## 1. What Naiad Does With Billing Events

Naiad never calls Stripe. Stripe calls `POST /api/v1/webhooks/stripe`, and the billing service (`src/services/billing.ts`) reacts to five event types. The organization is taken from `metadata.organization_id`, or from `client_reference_id`.

| Event | Effect |
| :--- | :--- |
| `invoice.paid` | Sets the organization active (`is_active = 1`). |
| `invoice.payment_failed` | **A warning in the log, nothing else.** No email is sent and nothing is downgraded or locked. |
| `customer.subscription.updated` | Sets `subscription_plan` to `metadata.plan_tier` (`pilot`, `standard` or `enterprise`). An event without that field sets `standard`; an unknown value changes nothing. |
| `customer.subscription.deleted` | Sets `subscription_plan` to `pilot`. |
| `charge.refunded` | A line in the log. |

Every accepted event is recorded once in `processed_webhook_events`; a repeated delivery is answered with `already_processed` and has no further effect. The event payload is not stored.

Two things follow. A failed payment has **no automatic consequence** for the organization, so there is no lockout to prevent. And the plan is stored but **not enforced**: no API route checks it yet (`hasFeature` exists and is tested, and nothing calls it).

---

## 2. Check Impact

```sql
-- On the host: the most recent failed payments
SELECT event_id, organization_id, processed_at
FROM processed_webhook_events
WHERE event_type = 'invoice.payment_failed'
ORDER BY processed_at DESC LIMIT 10;
```

The decline reason (`card_declined`, `expired_card`, an authentication challenge) is in the Stripe dashboard under the invoice, not in Naiad.

---

## 3. Likely Causes

1. **Cards expiring or declined**, or a bank asking the customer to authenticate the payment. This is between Stripe and the customer.
2. **Naiad is refusing Stripe's deliveries**, so its records are out of date. The Stripe dashboard shows failed webhook deliveries, and the request log shows the webhook path answering 400:
   - `INVALID_SIGNATURE`: `STRIPE_WEBHOOK_SECRET` does not match the endpoint's signing secret in Stripe, or the host's clock is more than five minutes off (signatures older or newer than that are refused).
   - `VALIDATION_FAILED`: the signature was right but the body is not a Stripe event (`id`, `type` and `data.object` are required).

---

## 4. Mitigation

1. **Confirm deliveries are accepted:**
   ```bash
   <your log command> | grep 'HTTP request finished' | grep '/api/v1/webhooks/stripe' | jq -r .data.statusCode | sort | uniq -c
   ```
   Anything other than 200 needs fixing first: correct the secret (it needs a restart) or the clock, then resend the failed deliveries from the Stripe dashboard. Resending is safe; each event is applied once.
2. **Contact the customer** about the failed payment. Stripe retries the charge on its own schedule; Naiad has no dunning of its own.
3. **Correct an organization's plan by hand** if an event set the wrong one:
   ```sql
   UPDATE organizations
   SET subscription_plan = 'enterprise', updated_at = CURRENT_TIMESTAMP
   WHERE id = '<organization id>';
   ```
   It applies to the next request; no restart is needed.

---

## 5. Escalation

- More than 10 failed payments in a day: tell whoever handles billing.
- Stripe deliveries refused for more than an hour: treat as a **SEV-2** (`incident.md`), because plan changes are not reaching Naiad.
