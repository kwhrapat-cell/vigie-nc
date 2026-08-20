import { notFound } from "next/navigation";
import { TopBarPlain } from "@/components/TopBar";
import {
  RiskBadge,
  StatBig,
  MonthlyBars,
  Timeline,
} from "@/components/HistoryWidgets";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { MOCK_ZONE_HISTORY } from "@/lib/mock-data";
import { ZoneHistory } from "@/lib/types";

async function getZoneHistory(zoneId: string): Promise<ZoneHistory | null> {
  if (!isSupabaseConfigured || !supabase) {
    return MOCK_ZONE_HISTORY[zoneId] ?? null;
  }

  const { data, error } = await supabase
    .from("zone_history")
    .select("*")
    .eq("zone_id", zoneId)
    .single();

  if (error || !data) return null;
  return data as ZoneHistory;
}

export default async function HistoriquePage({
  params,
}: {
  params: { zoneId: string };
}) {
  const zone = await getZoneHistory(params.zoneId);
  if (!zone) notFound();

  return (
    <>
      <TopBarPlain title={zone.zoneName} backHref="/" />
      <RiskBadge label={zone.riskLabel} />
      <StatBig
        value={zone.incidentsThisYear}
        label="inondations signalées cette année"
      />
      <MonthlyBars counts={zone.monthlyCounts} />
      <Timeline items={zone.timeline} />
    </>
  );
}
