import { LiveMap } from "@/components/LiveMap";
import { Fab, ActiveReportsSheet } from "@/components/Fab";
import { SosButton } from "@/components/SosButton";
import { TopBarLive } from "@/components/TopBar";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { MOCK_REPORTS } from "@/lib/mock-data";
import { Report } from "@/lib/types";
import { mapDbReportToReport, ReportRow } from "@/lib/mappers";

async function getActiveReports(): Promise<Report[]> {
  if (!isSupabaseConfigured || !supabase) return MOCK_REPORTS;

  const { data, error } = await supabase
    .from("reports")
    .select("id, type, lat, lng, created_at, expires_at, confirmations, zone_id, photo_url")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error || !data) return MOCK_REPORTS;

  return (data as ReportRow[]).map(mapDbReportToReport);
}

export default async function CartePage() {
  const reports = await getActiveReports();

  return (
    <>
      <TopBarLive />
      <LiveMap reports={reports} />
      <div className="relative">
        <Fab />
        <SosButton />
        <ActiveReportsSheet reports={reports} />
      </div>
    </>
  );
}
