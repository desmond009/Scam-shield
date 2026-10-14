# Synthetic data: how it is generated and why

ScamShield is trained and evaluated only on synthetic data. Nothing in this document comes from real people or real
banking data. The data is produced by `services/ml/scamshield_ml/generate_data.py` and is seedable. With the default
seed of 42, it generates the same dataset every time.

## Population

The generator creates 150 users from four personas. Each persona has its own payment habits:

| Persona | Users | Payments per day | Typical amount | Active hours (IST) | Income |
|---|---|---|---|---|---|
| Salaried | 50 | ~9 | ₹260, wide spread | 7-10, 12-15, 18-23 | monthly salary |
| Student | 40 | ~7 | ₹120 | 10-24 and some after midnight | monthly allowance |
| Shopkeeper | 30 | ~25 | ₹900 | 8-22 | daily takings |
| Senior citizen | 30 | ~3 | ₹400 | 7-19 | monthly pension |

- **Merchants:** there are 1,500. Popularity follows a Zipf distribution, and 20% of the merchants open during the
  simulation, so some legitimate payees are new.
- **Contacts:** each user has a set of personal contacts. Some contacts join the platform during the simulation.

## Timeline

The simulation runs for 120 days. The first 30 days are a burn-in period that lets the baselines warm up. Only the
following 90 days are written out, about 165k payments in total.

## Legitimate behaviour, including hard negatives

Hard negatives are legitimate payments that look suspicious. Without them, any detector looks better than it really
is. The generator includes:

- **Rent:** a monthly payment of up to ₹25k. It is much larger than the user's usual amounts.
- **Festival spending:** two windows, with one inside the holdout period. Payments are more frequent and two to five
  times larger, many go to new merchants, and **pop-up stalls** collect money from many people on the same day. That
  last pattern looks like a mule account to a naive rule.
- **First purchases from new merchants:** for example electronics, at ₹8k-45k.
- **Shopkeeper supplier batches:** three to five payments within a few minutes, which looks like velocity.
- **Night-owl students**, phone upgrades and second devices (new devices), and login typos (failed attempts).
- **Prices:** both legitimate and scam amounts often land on price points such as ₹499, ₹1,999 and ₹2,000, as real
  prices do.

## Fraud scenarios

About 2.4% of payments are fraud.

| Scenario | Story | Signals |
|---|---|---|
| Impersonation / authorised push payment | A fake bank, KYC desk, police officer or buyer pressures the victim | New payee, an amount 3-40x the victim's usual, mostly evenings, follow-up "deposits", and questionnaire answers of pressure and unknown recipient |
| Mule collection | One account collects a fixed "fee" from 10-28 victims in 6-36 hours | Many distinct senders, a new or bought account, and repeat payers |
| Velocity drain | A remote-access app empties the account | 4-9 similar payments in minutes to one or two new payees, OTP or app answers |
| Account takeover | Stolen credentials | 2-6 failed logins, a new device, mostly at night, and most of the balance sent to a new payee |

- Scam accounts are often **not** brand new: 30-40% are 60-900 days old, as bought or rented accounts would be.
- Victims report the payee 10-50% of the time, 1-48 hours after paying. These reports feed `payee_report_count`.
- Drained victims get their balance back 1-3 days later.

## Questionnaire answers in the data

In the live app, the questionnaire is shown only for MEDIUM and HIGH payments. To teach the model what the answers
mean, the generator gives answers to a subset of payments:

| Payments | Share answered | Answers given |
|---|---|---|
| Legitimate payments that look unusual | 30% | Pressure is rare (3%), an OTP request is very rare (0.5%), and "I don't know the recipient" is common (40%, since new shops are strangers) |
| Scams | 30-55% | Answered honestly, with scenario-specific rates |
| Account-takeover attackers | none | They never admit anything |

## Features without look-ahead

Events are replayed in time order, and every feature is computed only from what was known **before** that payment.
The state is the same as the API keeps:
- 30-day baselines
- velocity windows of 10 minutes and 1 hour
- distinct senders to each payee in 24 hours
- known payees and devices
- failed attempts in 15 minutes
- reports filed so far

Feature definitions come from the shared spec in `packages/shared/spec/features.json`. Python and TypeScript must
produce identical values, and a parity test checks this.

As in the API, payments labelled as fraud are left out of the user's baseline.

## Splits

Train, calibration and test sets are split **by time**: the first 60% of the timeline is for training, the next 15%
for calibration, and the last 25% is the holdout. Splitting at random would leak future behaviour into training and
make the results look better than they are.

## Leaks we found and fixed

The first versions of the generator made detection look nearly perfect, with a PR-AUC of 0.99. Feature importance
showed why:

1. **Payee age:** every scammer account was a few days old and almost every legitimate payee was years old, so the
   model learned that a young payee means a scam. The fix adds legitimate young payees (new shops, friends joining
   the platform, festival stalls) and older scam accounts.
2. **Polluted baselines:** each user was hit by roughly 14 scams over 120 days, and those scam amounts were included
   in the user's baseline. As a result, a normal ₹500 payment looked extreme in live use. The fix excludes
   fraud-labelled payments from baselines (the API does the same) and gives drained balances back.
3. **Memorised amounts:** scam amounts came from a short menu (₹499, ₹4,999 …) and legitimate amounts never ended in
   99, so the model memorised exact amounts. The fix sends both legitimate and scam amounts through the same
   price-point logic.

After these fixes, the results are no longer near-perfect: PR-AUC is about 0.95 for ML only and 0.51 for rules only.
The remaining strong signals, such as payee age, distinct senders and amount z-score, are ones that real fraud
teams also rely on.

## Limits of this data

- **Scam behaviour is stationary.** Real scammers adapt to whatever gets blocked; this simulation has no adversary.
- **The fraud rate is far higher than in real UPI traffic,** so that a student-sized dataset contains enough
  positive examples. Precision on real traffic would therefore be lower.
- **Users don't interact:** there is no social graph beyond shared merchants and mule victims.
