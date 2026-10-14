"""Seedable synthetic UPI transaction generator.

All data is synthetic. Nothing here is derived from real people or real banking data.

How it works
------------
1. Build ~150 users from four personas (salaried, student, shopkeeper, senior citizen) with distinct
   amount, time-of-day, payee and income habits, plus a pool of merchants and personal contacts.
2. Emit legitimate payments, income credits, failed logins and payee reports as timestamped events,
   including realistic hard negatives: monthly rent, festival shopping, first purchases from new
   merchants, shopkeeper supplier batches, night-owl students, phone changes and login typos.
   Legitimate payees are not all old: new shops open, friends join the platform, and festival pop-up stalls are
   paid by many people on the same day (which looks like a mule account to naive rules).
3. Inject ~2-3% fraud from four scenarios: impersonation/authorized push payment, mule collection,
   velocity drain and account takeover.
4. Replay every event in time order, keeping the same state the API keeps (30-day baselines, velocity
   windows, payee sender sets, devices, reports), and compute features with the shared feature spec.
   This makes training features match what the API sees at decision time (no look-ahead).

The first 30 simulated days are a burn-in so baselines are warm; only the following 90 days are written.
"""

import argparse
import math
import random
from collections import Counter, deque
from dataclasses import dataclass, field
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from .features import DAY_MS, compute_features, hour_angle, ist_hour
from .spec import DATA_DIR, FEATURE_NAMES

IST_OFFSET_MS = 330 * 60_000
HOUR_MS = 3_600_000
MIN_MS = 60_000
BURN_IN_DAYS = 30
OUTPUT_DAYS = 90
TOTAL_DAYS = BURN_IN_DAYS + OUTPUT_DAYS
EPOCH_MS = int(datetime(2026, 4, 1, tzinfo=timezone.utc).timestamp() * 1000) - IST_OFFSET_MS  # IST midnight
FESTIVAL_DAYS = set(range(52, 56)) | set(range(106, 113))  # a small one in training, Diwali-like in the holdout
MAX_AMOUNT = 100_000

# (start hour, end hour exclusive, weight)
PERSONAS = {
    "salaried": dict(count=50, rate=9, median=260, sigma=1.0, hours=[(7, 10, 3), (12, 15, 2), (18, 23, 4)],
                     balance=(20_000, 150_000), income="monthly", income_amt=(30_000, 120_000), rent=0.9,
                     merchants=(12, 25), contacts=(4, 10), vulnerability=1.0),
    "student": dict(count=40, rate=7, median=120, sigma=0.8, hours=[(10, 14, 2), (15, 20, 3), (20, 24, 3), (0, 2, 1)],
                    balance=(2_000, 15_000), income="monthly", income_amt=(5_000, 12_000), rent=0.6,
                    merchants=(8, 18), contacts=(6, 14), vulnerability=1.2),
    "shopkeeper": dict(count=30, rate=25, median=900, sigma=1.1, hours=[(8, 12, 3), (12, 17, 3), (17, 22, 3)],
                       balance=(30_000, 200_000), income="daily", income_amt=(3_000, 20_000), rent=0.0,
                       merchants=(15, 30), contacts=(3, 8), vulnerability=0.8),
    "senior": dict(count=30, rate=3, median=400, sigma=0.9, hours=[(7, 11, 4), (11, 15, 2), (15, 19, 2)],
                   balance=(50_000, 400_000), income="monthly", income_amt=(15_000, 40_000), rent=0.0,
                   merchants=(6, 12), contacts=(3, 8), vulnerability=1.3),
}
SCAM_FEES = [499, 999, 1499, 1999, 2499, 4999, 9999, 14999, 19999, 24999, 49999]
SCAM_ROUND = [500, 1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 25000, 40000, 50000]


def ts_at(day: int, hour: float, minute: float = 0, second: float = 0) -> int:
    return int(EPOCH_MS + day * DAY_MS + ((hour * 60 + minute) * 60 + second) * 1000)


@dataclass
class Payee:
    upi: str
    created_ms: int
    factor: float = 1.0  # typical amount multiplier for this payee


@dataclass
class User:
    uid: str
    persona: str
    created_ms: int
    balance: float
    merchants: list
    merchant_weights: np.ndarray
    contacts: list
    device: str
    second_device_day: int | None = None
    rent_day: int | None = None
    rent_amount: float = 0.0
    landlord: str | None = None
    switch_device_day: int | None = None


@dataclass
class Event:
    ts: int
    kind: str  # txn | credit | fail | report
    user: str | None = None
    payee: str | None = None
    amount: float = 0.0
    scenario: str = "legit"
    incident: str | None = None
    # Amount resolved at replay time from the balance: ("drain", fraction) or ("split", fraction, n)
    balance_rule: tuple | None = None
    device: str | None = None
    context: dict | None = None
    seq: int = field(default=0)


class Generator:
    def __init__(self, seed: int):
        self.rng = random.Random(seed)
        self.np = np.random.default_rng(seed)
        self.payees: dict[str, Payee] = {}
        self.users: list[User] = []
        self.events: list[Event] = []
        self.scammers = 0

    # ---------- population ----------
    def _new_payee(self, prefix: str, created_ms: int, factor: float = 1.0) -> str:
        upi = f"{prefix}{len(self.payees):05d}@{self.rng.choice(['okaxis', 'ybl', 'paytm', 'oksbi', 'ibl'])}"
        self.payees[upi] = Payee(upi, created_ms, factor)
        return upi

    def build_population(self):
        r = self.rng
        merchants, self.merchant_pool = [], []
        for _ in range(1500):
            # 20% of merchants open during the simulation (new shops are legitimate hard negatives)
            created = ts_at(int(r.uniform(0, TOTAL_DAYS)), 9) if r.random() < 0.2 else ts_at(-int(r.uniform(30, 1500)), 9)
            upi = self._new_payee("m", created, float(self.np.lognormal(0, 0.5)))
            self.merchant_pool.append(upi)
            if created < EPOCH_MS:
                merchants.append(upi)
        self.popups: dict[int, list[str]] = {
            d: [self._new_payee("m", ts_at(d, 8), float(self.np.lognormal(-0.3, 0.4))) for _ in range(2)]
            for d in FESTIVAL_DAYS
        }
        popularity = 1 / np.arange(1, len(merchants) + 1) ** 0.8
        idx = 0
        for persona, p in PERSONAS.items():
            for _ in range(p["count"]):
                idx += 1
                n_m = r.randint(*p["merchants"])
                chosen = list(self.np.choice(len(merchants), n_m, replace=False, p=popularity / popularity.sum()))
                user_merchants = [merchants[i] for i in chosen]
                weights = 1 / np.arange(1, n_m + 1) ** 1.1
                contacts = [
                    self._new_payee("c", ts_at(-int(r.uniform(100, 2000)), 9), float(self.np.lognormal(0.3, 0.6)))
                    for _ in range(r.randint(*p["contacts"]))
                ]
                user = User(
                    uid=f"u{idx:04d}", persona=persona,
                    created_ms=ts_at(-int(r.uniform(20, 1500)), r.uniform(8, 20)),
                    balance=r.uniform(*p["balance"]),
                    merchants=user_merchants, merchant_weights=weights / weights.sum(), contacts=contacts,
                    device=f"dev-{idx:04d}-a",
                )
                if r.random() < p["rent"]:
                    user.rent_day = r.randint(0, 4)
                    user.rent_amount = round(r.uniform(6_000, 25_000) if persona == "salaried" else r.uniform(3_000, 9_000), -2)
                    user.landlord = self._new_payee("c", ts_at(-int(r.uniform(200, 900)), 9))
                if r.random() < 0.25:  # phone upgrade
                    user.switch_device_day = r.randint(0, TOTAL_DAYS - 1)
                if r.random() < 0.15:  # starts also paying from a tablet/laptop
                    user.second_device_day = r.randint(0, TOTAL_DAYS - 1)
                self.users.append(user)

    # ---------- legitimate behaviour ----------
    def _hour(self, persona: str) -> float:
        windows = PERSONAS[persona]["hours"]
        lo, hi, _ = self.rng.choices(windows, weights=[w for *_, w in windows])[0]
        return self.rng.uniform(lo, hi) % 24

    def _legit_amount(self, user: User, payee_factor: float, festival: bool) -> float:
        p = PERSONAS[user.persona]
        amount = float(self.np.lognormal(math.log(p["median"] * payee_factor), p["sigma"]))
        if festival and self.rng.random() < 0.3:
            amount *= self.rng.uniform(2, 5)
        amount = min(amount, 50_000)
        return round(amount, 0) if amount < 1000 or self.rng.random() < 0.5 else round(amount, -1)

    def _device(self, user: User, day: int) -> str:
        if user.second_device_day is not None and day >= user.second_device_day and self.rng.random() < 0.08:
            return user.device[:-1] + "t"
        return user.device if user.switch_device_day is None or day < user.switch_device_day else user.device[:-1] + "b"

    def _new_merchant(self, day: int, festival: bool) -> str:
        """A merchant the user has probably never paid; biased towards recently opened shops and festival stalls."""
        r = self.rng
        if festival and r.random() < 0.25:
            return r.choice(self.popups[day])
        now = ts_at(day, 23)
        if r.random() < 0.35:
            recent = [m for m in self.recent_merchants if now - DAY_MS * 60 <= self.payees[m].created_ms <= now]
            if recent:
                return r.choice(recent)
        while True:
            m = r.choice(self.merchant_pool)
            if self.payees[m].created_ms <= now:
                return m

    def legit_events(self):
        r = self.rng
        self.recent_merchants = [m for m in self.merchant_pool if self.payees[m].created_ms >= EPOCH_MS]
        for user in self.users:
            self._new_contacts(user)
            p = PERSONAS[user.persona]
            for day in range(TOTAL_DAYS):
                festival = day in FESTIVAL_DAYS
                weekend = (day % 7) in (5, 6)
                rate = p["rate"] * (1.6 if festival else 1.0) * (1.15 if weekend else 1.0)
                for _ in range(self.np.poisson(rate)):
                    self._legit_payment(user, day, festival)
                self._income(user, day, p)
                if user.rent_day is not None and day % 30 == user.rent_day:
                    self.events.append(Event(ts_at(day, r.uniform(9, 21)), "txn", user.uid, user.landlord,
                                             user.rent_amount, "legit_rent", device=self._device(user, day)))
                if r.random() < 0.004:  # occasional big first purchase from a new merchant (electronics, travel)
                    self.events.append(Event(ts_at(day, r.uniform(10, 21)), "txn", user.uid, self._new_merchant(day, False),
                                             round(r.uniform(8_000, 45_000), -2), "legit_new_merchant",
                                             device=self._device(user, day), context=self._legit_context()))
                if user.persona == "shopkeeper" and r.random() < 0.15:  # supplier batch: several payments in minutes
                    start = ts_at(day, r.uniform(9, 19))
                    for i in range(r.randint(3, 5)):
                        self.events.append(Event(start + i * int(r.uniform(1, 3) * MIN_MS), "txn", user.uid,
                                                 r.choice(user.merchants[:6]), round(r.uniform(2_000, 15_000), -1),
                                                 "legit_batch", device=self._device(user, day)))
                if r.random() < 0.02:  # login typos
                    t = ts_at(day, r.uniform(7, 23))
                    for i in range(r.choices([1, 2, 3], weights=[70, 25, 5])[0]):
                        self.events.append(Event(t + i * 20_000, "fail", user.uid))

    def _legit_payment(self, user: User, day: int, festival: bool):
        r = self.rng
        new_merchant_p = 0.25 if festival else 0.06
        roll = r.random()
        if roll < new_merchant_p:
            payee, factor = self._new_merchant(day, festival), 1.0
            scenario = "legit_festival" if festival else "legit_new_payee"
        elif roll < new_merchant_p + 0.2:
            payee = r.choice(user.contacts)
            factor, scenario = self.payees[payee].factor, "legit"
        else:
            payee = user.merchants[self.np.choice(len(user.merchants), p=user.merchant_weights)]
            factor, scenario = self.payees[payee].factor, "legit_festival" if festival else "legit"
        amount = self._legit_amount(user, factor, festival)
        context = self._legit_context() if scenario != "legit" and amount > 2000 else None
        self.events.append(Event(ts_at(day, self._hour(user.persona)), "txn", user.uid, payee, amount, scenario,
                                 device=self._device(user, day), context=context))

    def _new_contacts(self, user: User):
        """Friends who join the platform during the simulation and get paid soon after (young, new payees)."""
        r = self.rng
        for _ in range(r.choices([0, 1, 2, 3], weights=[30, 35, 25, 10])[0]):
            day = r.randint(0, TOTAL_DAYS - 4)
            contact = self._new_payee("c", ts_at(day, r.uniform(8, 12)))
            for k in range(r.randint(1, 4)):
                d = day + r.randint(0, 3)
                amount = round(float(self.np.lognormal(math.log(600), 0.9)), 0)
                self.events.append(Event(ts_at(d, r.uniform(12, 23)), "txn", user.uid, contact, min(amount, 30_000),
                                         "legit_new_contact", device=self._device(user, d),
                                         context=self._legit_context() if amount > 2000 else None))

    def _legit_context(self) -> dict | None:
        """Some unusual legitimate payments get a questionnaire; genuine users rarely report pressure."""
        if self.rng.random() > 0.3:
            return None
        return {"pressure": self.rng.random() < 0.03, "otpOrApp": self.rng.random() < 0.005,
                "unknownRecipient": self.rng.random() < 0.4}

    def _income(self, user: User, day: int, p: dict):
        if (p["income"] == "monthly" and day % 30 == 0) or p["income"] == "daily":
            self.events.append(Event(ts_at(day, 6), "credit", user.uid, amount=self.rng.uniform(*p["income_amt"])))

    # ---------- fraud scenarios ----------
    def _victim(self) -> User:
        weights = [PERSONAS[u.persona]["vulnerability"] for u in self.users]
        return self.rng.choices(self.users, weights=weights)[0]

    def _scammer(self, at_ms: int, old_account_p: float) -> str:
        """Scam payee. Many scams use older, bought or rented accounts, not only brand-new ones."""
        age_days = self.rng.uniform(60, 900) if self.rng.random() < old_account_p else self.rng.uniform(0.2, 30)
        return self._new_payee("s", at_ms - int(age_days * DAY_MS))

    def _fraud_context(self, answered_p: float, pressure: float, otp: float, unknown: float) -> dict | None:
        r = self.rng
        if r.random() > answered_p:
            return None
        return {"pressure": r.random() < pressure, "otpOrApp": r.random() < otp, "unknownRecipient": r.random() < unknown}

    def _report_later(self, at_ms: int, payee: str, p: float = 0.3):
        if self.rng.random() < p:
            self.events.append(Event(at_ms + int(self.rng.uniform(1, 48) * HOUR_MS), "report", payee=payee))

    def impersonation(self, n: int):
        """Caller poses as bank/KYC/police/buyer; victim pays a new payee an unusually large sum, often evenings."""
        r = self.rng
        recent: deque = deque(maxlen=20)
        for i in range(n):
            v = self._victim()
            day = r.randint(0, TOTAL_DAYS - 1)
            hour = r.choices([r.uniform(17, 22), r.uniform(10, 17), r.uniform(22, 24)], weights=[60, 25, 15])[0]
            t = ts_at(day, hour)
            payee = recent[-1][1] if recent and r.random() < 0.3 and t - recent[-1][0] < 7 * DAY_MS else self._scammer(t, 0.4)
            recent.append((t, payee))
            target = PERSONAS[v.persona]["median"] * r.uniform(3, 40)
            menu = SCAM_FEES if r.random() < 0.5 else SCAM_ROUND
            amount = min(min(menu, key=lambda f: abs(f - target)), MAX_AMOUNT)
            for k in range(1 + (r.random() < 0.5) * r.randint(1, 2)):
                ts = t + k * int(r.uniform(10, 90) * MIN_MS)
                amt = amount if k == 0 else round(amount * r.uniform(0.8, 2.0), -1)
                self.events.append(Event(ts, "txn", v.uid, payee, min(amt, MAX_AMOUNT), "impersonation", f"imp{i}",
                                         device=self._device(v, day), context=self._fraud_context(0.55, 0.85, 0.25, 0.75)))
                self._report_later(ts, payee)

    def mule_collection(self, n: int):
        """One fresh mule account collects 'fees' from many victims within a day or two."""
        r = self.rng
        for i in range(n):
            day = r.randint(0, TOTAL_DAYS - 2)
            start = ts_at(day, r.uniform(8, 14))
            age = r.uniform(30, 400) if r.random() < 0.4 else r.uniform(0, 10)
            mule = self._new_payee("s", start - int(age * DAY_MS))
            span = r.uniform(6, 36) * HOUR_MS
            victims = r.sample(self.users, r.randint(10, 28))
            fee = r.choice([499, 999, 1499, 2000, 2500, 5000])
            for j, v in enumerate(victims):
                ts = start + int(span * j / len(victims) + r.uniform(0, 30) * MIN_MS)
                for k in range(1 + (r.random() < 0.2)):
                    self.events.append(Event(ts + k * int(r.uniform(5, 40) * MIN_MS), "txn", v.uid, mule, fee, "mule",
                                             f"mule{i}", device=self._device(v, day),
                                             context=self._fraud_context(0.4, 0.4, 0.1, 0.9)))
                self._report_later(ts, mule, 0.15)

    def velocity_drain(self, n: int):
        """Remote-access / screen-share scam: rapid similar payments that empty the balance."""
        r = self.rng
        for i in range(n):
            v = self._victim()
            day = r.randint(0, TOTAL_DAYS - 1)
            t = ts_at(day, self._hour(v.persona))
            payees = [self._scammer(t, 0.3) for _ in range(r.choice([1, 1, 2]))]
            parts = r.randint(4, 9)
            frac = r.uniform(0.85, 1.0)
            for k in range(parts):
                ts = t + k * int(r.uniform(0.5, 2.0) * MIN_MS)
                payee = payees[k % len(payees)]
                self.events.append(Event(ts, "txn", v.uid, payee, 0, "velocity", f"vel{i}", ("split", frac, parts),
                                         device=self._device(v, day), context=self._fraud_context(0.3, 0.4, 0.6, 0.8)))
                self._report_later(ts, payee, 0.1)

    def account_takeover(self, n: int):
        """Credentials stolen: failed logins, a new device, usually at night, then the balance is drained."""
        r = self.rng
        for i in range(n):
            v = self._victim()
            day = r.randint(0, TOTAL_DAYS - 1)
            hour = r.uniform(0, 5) if r.random() < 0.75 else r.uniform(0, 24)
            t = ts_at(day, hour)
            for k in range(r.randint(2, 6)):
                self.events.append(Event(t - int(r.uniform(1, 12) * MIN_MS) + k * 15_000, "fail", v.uid))
            payee = self._scammer(t, 0.3)
            device = f"atk-{i:04d}"
            for k in range(r.randint(1, 3)):
                ts = t + k * int(r.uniform(1, 6) * MIN_MS)
                rule = ("drain", r.uniform(0.7, 0.95)) if k == 0 else ("drain", r.uniform(0.4, 0.9))
                self.events.append(Event(ts, "txn", v.uid, payee, 0, "takeover", f"ato{i}", rule, device=device))
                self._report_later(ts, payee, 0.5)

    def spurious_reports(self):
        for upi in self.rng.sample(self.merchant_pool, 5):
            self.events.append(Event(ts_at(self.rng.randint(0, TOTAL_DAYS - 1), 12), "report", payee=upi))


class Replayer:
    """Replays events in time order, maintaining the same state the API keeps, and computes features."""

    def __init__(self, gen: Generator):
        self.gen = gen
        self.users = {u.uid: u for u in gen.users}
        self.window = {u: deque() for u in self.users}  # (ts, amount, hour) for 30-day stats
        self.sums = {u: [0.0, 0.0, 0.0, 0.0] for u in self.users}  # sum, sumsq, sin, cos
        self.maxq = {u: deque() for u in self.users}  # monotonic deque (ts, amount)
        self.recent = {u: deque() for u in self.users}  # (ts, payee, amount) last hour
        self.known_payees = {u: set() for u in self.users}
        self.devices = {u: set() for u in self.users}
        self.fails = {u: deque() for u in self.users}
        self.payee_senders: dict[str, deque] = {}
        self.payee_sender_counts: dict[str, Counter] = {}
        self.reports: Counter = Counter()
        self.split_base: dict[str, float] = {}

    def _history(self, uid: str, now: int) -> dict:
        w, s, mq = self.window[uid], self.sums[uid], self.maxq[uid]
        cutoff = now - 30 * DAY_MS
        while w and w[0][0] <= cutoff:
            _, a, h = w.popleft()
            s[0] -= a
            s[1] -= a * a
            s[2] -= math.sin(hour_angle(h))
            s[3] -= math.cos(hour_angle(h))
        while mq and mq[0][0] <= cutoff:
            mq.popleft()
        n = len(w)
        if n == 0:
            return {"count": 0, "mean": 0.0, "std": 0.0, "max": 0.0, "hourSin": 0.0, "hourCos": 0.0}
        mean = s[0] / n
        return {"count": n, "mean": mean, "std": math.sqrt(max(0.0, s[1] / n - mean * mean)), "max": mq[0][1],
                "hourSin": s[2], "hourCos": s[3]}

    def _distinct_senders(self, payee: str, uid: str, now: int) -> int:
        dq = self.payee_senders.setdefault(payee, deque())
        counts = self.payee_sender_counts.setdefault(payee, Counter())
        while dq and dq[0][0] <= now - DAY_MS:
            _, s = dq.popleft()
            counts[s] -= 1
            if counts[s] == 0:
                del counts[s]
        return len(counts) - (1 if uid in counts else 0)

    def _resolve_amount(self, e: Event, balance: float) -> float:
        if e.balance_rule is None:
            return e.amount
        if e.balance_rule[0] == "drain":
            return max(100.0, round(balance * e.balance_rule[1], -1))
        _, frac, parts = e.balance_rule
        base = self.split_base.setdefault(e.incident, balance * frac / parts)
        return max(100.0, round(min(base * self.gen.rng.uniform(0.95, 1.05), MAX_AMOUNT), -1))

    def run(self) -> pd.DataFrame:
        rows = []
        burn_in_end = ts_at(BURN_IN_DAYS, 0)
        events = sorted(self.gen.events, key=lambda e: (e.ts, e.kind != "credit"))
        for e in events:
            if e.kind == "credit":
                self.users[e.user].balance += e.amount
            elif e.kind == "fail":
                self.fails[e.user].append(e.ts)
            elif e.kind == "report":
                self.reports[e.payee] += 1
            else:
                row = self._payment(e)
                if e.ts >= burn_in_end:
                    rows.append(row)
        return pd.DataFrame(rows)

    def _payment(self, e: Event) -> dict:
        user = self.users[e.user]
        uid, now = e.user, e.ts
        amount = self._resolve_amount(e, user.balance)
        if amount > user.balance:  # top-up from another account so the payment can go through
            user.balance += amount + self.gen.rng.uniform(500, 5000)
        recent = self.recent[uid]
        while recent and recent[0][0] <= now - HOUR_MS:
            recent.popleft()
        fails = self.fails[uid]
        while fails and fails[0] <= now - 15 * MIN_MS:
            fails.popleft()
        payee = self.gen.payees[e.payee]
        inp = {
            "amount": amount,
            "balance": user.balance,
            "timestampMs": now,
            "accountCreatedAtMs": user.created_ms,
            "history": self._history(uid, now),
            "isNewPayee": e.payee not in self.known_payees[uid],
            "payeeFirstSeenAtMs": payee.created_ms if payee.created_ms <= now else None,
            "payeeDistinctSenders24h": self._distinct_senders(e.payee, uid, now),
            "payeeReportCount": self.reports[e.payee],
            "userTxnCount10min": sum(1 for t, _, _ in recent if t > now - 10 * MIN_MS),
            "userTxnCount1h": len(recent),
            "sameAmountRepeat1h": sum(1 for _, p, a in recent if p == e.payee and abs(a - amount) <= 0.2 * amount),
            "isNewDevice": e.device not in self.devices[uid],
            "failedAttempts15min": len(fails),
            "context": e.context,
        }
        features = compute_features(inp)
        self._commit(uid, e, amount, now)
        return {"txn_id": f"t{now}{uid}", "ts": now, "user_id": uid, "persona": user.persona, "payee_upi": e.payee,
                "balance_before": round(inp["balance"], 2), "device": e.device, "scenario": e.scenario,
                "incident": e.incident or "", "is_fraud": int(not e.scenario.startswith("legit")),
                "context_answered": int(e.context is not None), **features}

    def _commit(self, uid: str, e: Event, amount: float, now: int):
        user = self.users[uid]
        user.balance -= amount
        hour = ist_hour(now)
        self.window[uid].append((now, amount, hour))
        s = self.sums[uid]
        s[0] += amount
        s[1] += amount * amount
        s[2] += math.sin(hour_angle(hour))
        s[3] += math.cos(hour_angle(hour))
        mq = self.maxq[uid]
        while mq and mq[-1][1] <= amount:
            mq.pop()
        mq.append((now, amount))
        self.recent[uid].append((now, e.payee, amount))
        self.known_payees[uid].add(e.payee)
        self.devices[uid].add(e.device)
        self.payee_senders[e.payee].append((now, uid))
        self.payee_sender_counts[e.payee][uid] += 1


def generate(seed: int = 42) -> pd.DataFrame:
    gen = Generator(seed)
    gen.build_population()
    gen.legit_events()
    gen.impersonation(1100)
    gen.mule_collection(80)
    gen.velocity_drain(130)
    gen.account_takeover(330)
    gen.spurious_reports()
    df = Replayer(gen).run()
    return df[[c for c in df.columns if c not in FEATURE_NAMES] + FEATURE_NAMES]


def main():
    parser = argparse.ArgumentParser(description="Generate the synthetic ScamShield dataset")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    df = generate(args.seed)
    out = DATA_DIR / "transactions.csv"
    df.to_csv(out, index=False)
    print(f"wrote {len(df):,} transactions to {out}")
    print(f"fraud rate {df.is_fraud.mean():.2%}")
    print(df.scenario.value_counts().to_string())


if __name__ == "__main__":
    main()
