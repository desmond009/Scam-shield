"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { paramValid, RuleCard } from "@/components/admin/rule-card";
import { thresholdErrors, ThresholdsForm } from "@/components/admin/thresholds-form";
import { WhatIfPanel } from "@/components/admin/what-if-panel";
import { PageHeader, RoleGate } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { api, errorMessage } from "@/lib/api";
import type { RuleConfigEntry, RuleView, Thresholds, WhatIfResult } from "@/lib/types";

const RULES_KEY = ["admin", "rules"];
const THRESHOLDS_KEY = ["admin", "thresholds"];

const toEntry = ({ code, enabled, weight, params }: RuleConfigEntry): RuleConfigEntry => ({ code, enabled, weight, params: { ...params } });
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function RulesPage() {
  return (
    <RoleGate roles={["ADMIN"]}>
      <RulesEditor />
    </RoleGate>
  );
}

function RulesEditor() {
  const qc = useQueryClient();
  const rulesQ = useQuery({ queryKey: RULES_KEY, queryFn: () => api<{ rules: RuleView[] }>("/admin/rules") });
  const thresholdsQ = useQuery({ queryKey: THRESHOLDS_KEY, queryFn: () => api<Thresholds>("/admin/thresholds") });

  const [rules, setRules] = useState<RuleConfigEntry[] | null>(null);
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);

  const savedRules = useMemo(() => rulesQ.data?.rules.map(toEntry) ?? null, [rulesQ.data]);
  useEffect(() => {
    if (savedRules) setRules(savedRules);
  }, [savedRules]);
  useEffect(() => {
    if (thresholdsQ.data) setThresholds(thresholdsQ.data);
  }, [thresholdsQ.data]);

  const rulesDirty = !!rules && !!savedRules && !same(rules, savedRules);
  const thresholdsDirty = !!thresholds && !!thresholdsQ.data && !same(thresholds, thresholdsQ.data);
  const rulesValid = !!rules && rules.every((r) => Object.values(r.params).every(paramValid));
  const tErrors = thresholds ? thresholdErrors(thresholds) : {};
  const thresholdsValid = !!thresholds && !tErrors.medium && !tErrors.high;

  const draft = useMemo(() => (rules && thresholds ? { rules, thresholds } : null), [rules, thresholds]);
  const debounced = useDebounced(draft, 400);
  const blockedReason = !rulesValid
    ? "Fix the highlighted rule settings to see a preview."
    : !thresholdsValid
      ? "Fix the thresholds to see a preview."
      : null;

  const whatIf = useQuery({
    queryKey: ["admin", "what-if", debounced],
    queryFn: () => api<WhatIfResult>("/admin/rules/what-if", { method: "POST", body: debounced }),
    enabled: !!debounced && !blockedReason,
    placeholderData: keepPreviousData,
    retry: false,
  });

  const saveRules = useMutation({
    mutationFn: (body: RuleConfigEntry[]) => api<{ rules: RuleView[] }>("/admin/rules", { method: "PUT", body: { rules: body } }),
    onSuccess: (data) => {
      qc.setQueryData(RULES_KEY, data);
      qc.invalidateQueries({ queryKey: ["admin", "what-if"] });
      toast.success("Rules saved. New payments use them right away.");
    },
    onError: (e) => toast.error(`Couldn't save rules: ${errorMessage(e)}`),
  });

  const saveThresholds = useMutation({
    mutationFn: (body: Thresholds) => api<Thresholds>("/admin/thresholds", { method: "PUT", body }),
    onSuccess: (data) => {
      qc.setQueryData(THRESHOLDS_KEY, data);
      qc.invalidateQueries({ queryKey: ["admin", "what-if"] });
      toast.success("Thresholds saved.");
    },
    onError: (e) => toast.error(`Couldn't save thresholds: ${errorMessage(e)}`),
  });

  const loadError = rulesQ.error ?? thresholdsQ.error;
  if (loadError) {
    return (
      <>
        <PageHeader title="Rules & thresholds" />
        <Card>
          <ErrorState
            error={loadError}
            onRetry={() => {
              rulesQ.refetch();
              thresholdsQ.refetch();
            }}
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Rules & thresholds"
        description="Tune the rule engine and the risk bands. The preview shows the effect before you save."
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Blend & thresholds</CardTitle>
              <CardDescription>How rule and ML scores combine, and which scores count as medium or high risk.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {thresholds ? <ThresholdsForm value={thresholds} onChange={setThresholds} /> : <Skeleton className="h-36 w-full" />}
              <SaveBar
                dirty={thresholdsDirty}
                valid={thresholdsValid}
                pending={saveThresholds.isPending}
                label="Save thresholds"
                onSave={() => thresholds && saveThresholds.mutate(thresholds)}
                onDiscard={() => thresholdsQ.data && setThresholds(thresholdsQ.data)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rules</CardTitle>
              <CardDescription>Each rule adds points (× its weight) to the rule score, capped at 100.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {rules && rulesQ.data
                ? rulesQ.data.rules.map((view) => {
                    const d = rules.find((r) => r.code === view.code);
                    return d ? (
                      <RuleCard
                        key={view.code}
                        view={view}
                        draft={d}
                        onChange={(next) => setRules((prev) => prev && prev.map((r) => (r.code === next.code ? next : r)))}
                      />
                    ) : null;
                  })
                : Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-36 w-full" />)}
              <div className="sticky bottom-3 rounded-lg border border-border bg-surface p-3 shadow-sm">
                <SaveBar
                  dirty={rulesDirty}
                  valid={rulesValid}
                  pending={saveRules.isPending}
                  label="Save rules"
                  onSave={() => rules && saveRules.mutate(rules)}
                  onDiscard={() => savedRules && setRules(savedRules)}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0">
          <Card className="lg:sticky lg:top-20">
            <CardHeader>
              <CardTitle>What-if preview</CardTitle>
              <CardDescription>Saved settings (current) vs your unsaved draft (proposed).</CardDescription>
            </CardHeader>
            <CardContent>
              <WhatIfPanel
                data={whatIf.data}
                isFetching={whatIf.isFetching}
                error={whatIf.error}
                blockedReason={blockedReason}
                onRetry={() => whatIf.refetch()}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function SaveBar({
  dirty,
  valid,
  pending,
  label,
  onSave,
  onDiscard,
}: {
  dirty: boolean;
  valid: boolean;
  pending: boolean;
  label: string;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="mr-auto text-xs text-muted-foreground" aria-live="polite">
        {dirty ? "Unsaved changes" : "All changes saved"}
      </span>
      <Button variant="ghost" size="sm" onClick={onDiscard} disabled={!dirty || pending}>
        <Undo2 aria-hidden />
        Discard
      </Button>
      <Button size="sm" onClick={onSave} disabled={!dirty || !valid || pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
        {label}
      </Button>
    </div>
  );
}
