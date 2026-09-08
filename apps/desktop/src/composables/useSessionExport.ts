import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import { handleError } from "@/app/errors/errorHandler";

export function useSessionExport() {
  const { t } = useI18n();

  async function exportSession(sessionId: string): Promise<boolean> {
    try {
      const result = await window.pine.exportSession({ sessionId });
      if (result.saved) {
        toast.success(t("sessions.exportSuccess"));
      }
      return result.saved;
    } catch (error) {
      handleError(error, {
        id: "sessions.export",
        title: t("sessions.exportFailedTitle"),
        description: t("sessions.exportFailedDescription"),
      });
      return false;
    }
  }

  return { exportSession };
}
