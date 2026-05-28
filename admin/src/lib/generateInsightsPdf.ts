// Thin entry-point for the Tenant Insights PDF generator. Mirrors the
// generateDocumentPdf pattern — the heavy @react-pdf/renderer chain
// lives in the .impl file and is loaded only when an operator clicks
// Download on the Insights tab.

import type { ServiceTimingInsight } from "@/hooks/useServiceTimingInsights";
import type { AppointmentOutcomesReport } from "@/hooks/useAppointmentOutcomes";
import type { StaffUtilisationRow } from "@/hooks/useChairUtilisation";
import type { TreatmentVolumeRow } from "@/hooks/useTreatmentVolume";

export interface GenerateInsightsPdfArgs {
  practiceName: string;
  windowDays: number;
  timingInsights: ServiceTimingInsight[];
  outcomes: AppointmentOutcomesReport | null;
  utilisation: StaffUtilisationRow[];
  volume: TreatmentVolumeRow[];
  volumeTotal: number;
}

export async function generateInsightsPdf(args: GenerateInsightsPdfArgs): Promise<void> {
  const { renderInsightsPdf } = await import("./generateInsightsPdf.impl");
  return renderInsightsPdf(args);
}
