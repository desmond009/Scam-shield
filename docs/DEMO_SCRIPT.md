# ScamShield: 7-minute demo script

## Before the demo

1. Run `make demo` on a fresh install. If the stack was used before, run `make reset` first. `make reset` deletes all
   data, so do it before the audience arrives.
2. Wait until `make demo` prints **"ScamShield is up"**.
3. Open three browser windows:
   - **Window A:** http://localhost:3000. Click the **Asha Verma** demo button.
   - **Window B:** a private window at http://localhost:3000. Click **Ravi Iyer** (Analyst) and open **Alerts**.
   - **Window C:** http://localhost:3000/admin/simulator, signed in as **Admin**. Use a second private or guest
     profile, because the sign-in cookie is shared within a profile.
4. Optional: open a terminal in the project folder for the resilience step (step 6).
5. Use the demo buttons on the landing page to sign in. They sign in on the account's registered device, so payments
   don't trigger the "new device" warning by accident.

## Walkthrough

| Time | Who | What to do | What to say |
|---|---|---|---|
| 0:00–0:40 | Presenter | Show the landing page. | "Most UPI scams aren't hacks. The victim is talked into sending the money. Once it's sent, it's very hard to get back. ScamShield checks each payment *before* the money moves and steps in only when something looks wrong." |
| 0:40–1:30 | Window A | **Wallet**, then **Send money**. Pay `kirana.sharma@okaxis` ₹350. | "A normal payment to a shop Asha pays regularly. The check takes a few milliseconds, the score is low, and it goes through instantly with no extra friction. That matters: if a warning appears on every payment, people learn to ignore it." |
| 1:30–3:00 | Window A | Pay `kyc.update.desk@ybl` ₹2,999. Before typing the amount, point at the recipient card: "first payment", "on ScamShield for 2 days". The result is **MEDIUM**, with reasons shown. Answer the questions: **Yes** someone called, **No** OTP, **No** I don't know them. | "Asha has never paid this account, it is two days old, and the amount is far above her usual. We show at most three reasons in plain language. Then three questions catch what transaction data alone can't: pressure from a caller. Her answers are scored, and the payment moves to **HIGH**." |
| 3:00–3:40 | Window A | The HIGH screen appears and can't be dismissed. Click "I know this person…" to show the 10-second pause and the retype box. Then click **Cancel and report this account**. | "For high risk we add friction on purpose: a short pause and retyping the UPI ID. Scammers depend on hurry. The safe choice is the big red button. Asha reports the account, which raises its risk for everyone else." |
| 3:40–4:40 | Window C | Run **Mule collection**. Point at the step strip: LOW ×4, then MEDIUM, then HIGH. Open a MEDIUM step to show *Recipient collecting from many people* plus the ML score. | "Each victim alone looks ordinary: a small fee to someone new. The pattern only shows across many people. Once five or more different people pay a new account within a day, both the rules and the model detect a money-mule account." |
| 4:40–5:30 | Window B | The alerts arrived live (the green **Live** dot). Open Asha's KYC alert: score breakdown, all reasons with analyst detail, the model's top features, the payee panel. Click **Confirm fraud**. | "Analysts get the full picture. Confirming fraud labels the transaction, feeds the next training run, and blocks every future payment to this account for every user." |
| 5:30–6:00 | Window A | Pay `kyc.update.desk@ybl` again (any amount). | "Now it's stopped outright: **Payment stopped**, with no option to continue. That's the hard override from the analyst's decision." |
| 6:00–6:40 | Window C → **Model** | Show the headline sentence, the comparison table, the precision-recall curves and the per-scenario table. | "This is the evidence. On a time-based holdout the model never saw, at the same false-alarm rate as rules alone, the hybrid catches about 96% of scams versus 73%. ML alone ranks slightly better, and we say so on the page. The rules add explanations and keep working when the model is down." |
| 6:40–7:00 | Terminal + Window C | `docker compose stop ml`, then run the **Account takeover** scenario. Open **Health**. Afterwards: `docker compose start ml`. | "If the model service dies, payments are still checked with rules only. The decision is marked 'rules only' and the circuit breaker stops us waiting on a dead service. Nobody's payment is held up." |

If time is short, skip the Health page in the last step and only show "rules only" on the simulator result.

## 15 likely viva questions, with answers

**1. Why combine rules and ML instead of using only ML, since ML scores better?**
They do different jobs. The rules encode known patterns, can be explained in one sentence, and keep working when the
model is unavailable. They also carry hard overrides, such as a confirmed scam account or an OTP request, which must
always win. The model catches combinations the rules miss. Our evaluation shows both sides honestly. ML-only has the
higher PR-AUC (0.946 vs 0.933). At the false-positive rate rules-only runs at, the hybrid catches 95.6% of scams
versus 73.3% for rules alone, and it has the best precision at our MEDIUM threshold.

**2. How do you know the model isn't overfitting?**
- **Time-based split:** we train on the first 60% of the timeline, calibrate on the next 15%, and test on the last
  25%. That last part includes a festival period the model never saw.
- **Leak hunting:** we checked feature importance and found two leaks in our own generator. The model was memorising
  exact scam amounts, and it was relying on payee age because every scammer account was brand new. We fixed the
  generator rather than reporting the inflated 0.99.
- **Simple model:** we use a 300-tree gradient-boosting model on only 20 features.

**3. Your data is synthetic. Why should anyone trust these numbers?**
They shouldn't be read as real-world performance, and the README and the Model page both say so. The numbers show
that the method works. The pipeline computes features without look-ahead, splits by time, calibrates, and compares
fairly against a baseline. The generator includes realistic legitimate payments that look suspicious: rent,
festival spending, new shops, and pop-up stalls that look like mule accounts. With real labelled data the same code
would retrain.

**4. What does "calibrated" mean, and why does it matter?**
A calibrated probability means what it says: of the payments scored 80%, about 80% are scams. Gradient boosting with
class weights over-estimates fraud, so we fit isotonic regression on a separate time slice. That makes the 0-100 ML
score comparable with the rule score and makes the thresholds meaningful. The calibration chart on the Model page
shows where the model is still over-confident on the holdout.

**5. How do you choose the 35 and 70 thresholds?**
They are trade-offs shown by the threshold sweep. MEDIUM at 35 catches about 93% of scams while flagging about 2% of
payments. HIGH at 70 adds friction only when we are quite sure. Admins can change them live, and the "what-if"
preview shows precision, recall and false-positive rate on a labelled sample before saving.

**6. What happens if the ML service is slow or crashes?**
The ML call has a 150 ms timeout. After 5 failures within 30 seconds, a circuit breaker opens for 15 seconds, so the
API stops waiting on it. After that, a single trial request decides whether to close the breaker again. Meanwhile
decisions come from the rules only and are marked `degraded`. The breaker state lives in Redis, so all API instances
share it. We demonstrate this by stopping the container.

**7. How fast is it?**
In a load test at 20 requests per second, p95 was about 110 ms, against a 300 ms budget. The ML service alone takes
about 6 ms of CPU per request. The load test also found a real bottleneck: scikit-learn's thread pool made
single-row predictions slow. One environment variable (`OMP_NUM_THREADS=1`) tripled throughput.

**8. Can a user simply bypass the check?**
No. `check` never moves money. It returns a signed token, valid for 10 minutes, that binds the user, the
transaction, the amount and the recipient. `confirm` requires that token and re-checks that the amount and recipient
haven't changed. For HIGH risk the server, not just the UI, enforces the cooldown and the retyped UPI ID. Blocked
payments can't be confirmed at all.

**9. What stops double spending if the user taps "Pay" twice?**
- **Idempotency key:** `check` takes an idempotency key, stored in Redis with a unique database index as backup.
- **One transaction:** `confirm` runs in a single database transaction.
  - The status changes from PENDING to COMPLETED only if it is still PENDING, so exactly one tap wins.
  - The balance is debited only if it is still big enough.
  - Our tests fire five concurrent confirms and assert one success and the correct balance.

**10. Couldn't a scammer coach the victim to answer "No" to every question?**
Yes, and that's why the answers can only *raise* the score, never lower it. Without the questionnaire the payment is
scored exactly as if it had never been shown. An honest "yes" to an OTP request forces HIGH.

**11. Why Redis, and what is stored there?**
It holds the data the hot path must read in under a millisecond:
- velocity windows (sorted sets)
- the distinct senders to each payee in 24 hours
- each user's cached baseline
- known payees and devices
- idempotency keys, rate limits and the circuit breaker
- the job queues and the pub/sub channel for live alerts

Each key has a defined lifetime, documented in ARCHITECTURE.md. Postgres remains the source of truth, and any cache
can be rebuilt from it.

**12. Why put work in a background queue?**
Creating alerts, refreshing baselines, updating payee reputation, aggregating metrics and training models don't
change the current decision, and some are slow. Doing them in the request would add latency and make a payment
depend on more components. Jobs retry automatically, and if the queue is down the payment still succeeds.

**13. How do the explanations work?**
- **Users:** each rule produces a reason code, and a catalog turns it into a sentence. Users see the top three, so
  they aren't overwhelmed.
- **Analysts:** they see every reason, plus the model's top features. We compute those by resetting one feature at a
  time to a typical legitimate value and measuring how much the fraud probability drops. That method works with any
  model and is easy to explain.

**14. How does the system learn over time?**
- **Immediately:** user reports and analyst verdicts raise the payee's report count and reputation. A FRAUD verdict
  blocks the account for everyone.
- **Next model:** retraining (the button on the Model page) adds the analyst-labelled decisions to the training data.
  It only adds them to training, never to the holdout, so evaluation stays honest.
- **Registration:** the new model is registered after evaluation.

**15. What would you change for production?**
- **Data:** real labelled data and drift monitoring.
- **Deployment:** a model registry with shadow deployments, so a new model scores live traffic without affecting
  decisions until it is proven.
- **Infrastructure:** Kafka for streaming features, Redis Cluster, a feature store, and several API and ML replicas.
- **Detection:** graph analysis of mule rings and device fingerprinting.
- **Compliance and security:** RBI and NPCI review, secrets management and penetration testing.
- **Learning:** federated learning, so banks share scam patterns without sharing customer data.
