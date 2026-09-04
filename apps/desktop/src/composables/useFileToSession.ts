import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { handleError } from "@/app/errors/errorHandler";
import type { ProjectFilePreviewRequest } from "@/shared/projectFiles";
import type { AttachmentSelection } from "@/shared/attachments";
import type { PineSessionSummary } from "@/shared/sessions";
import { useContentTabsStore } from "@/stores/contentTabs";
import { useProjectStore } from "@/stores/project";
import { useContentTabNavigation } from "./useContentTabNavigation";

export function useFileToSession() {
  const { t } = useI18n();
  const tabs = useContentTabsStore();
  const project = useProjectStore();
  const navigation = useContentTabNavigation();
  const pending = ref(0);
  const isSending = computed(() => pending.value > 0);

  async function sendFile(
    file: ProjectFilePreviewRequest,
    target: string | PineSessionSummary | null,
    selection?: AttachmentSelection,
  ): Promise<void> {
    const origin = project.activeProject;
    if (!origin || origin.id !== file.projectId) return;
    pending.value += 1;
    try {
      const result = await window.pine.inspectProjectAttachments([
        { folderId: file.folderId, relativePath: file.relativePath },
      ]);
      // Do not deliver late inspection results into another project or a closed tab.
      if (project.activeProject !== origin) return;
      const tab =
        target === null
          ? tabs.createSessionTab({ reuseDraft: false })
          : typeof target === "string"
            ? tabs.tabs.find(
                (tab) => tab.id === target && tab.kind === "session",
              )
            : tabs.openSession(target);
      const attachments = selection
        ? result.attachments.map((attachment) => ({ ...attachment, selection }))
        : result.attachments;
      if (!tab || !tabs.addAttachments(tab.id, attachments)) return;
      navigation.activate(tab.id);
    } catch (error) {
      handleError(error, {
        id: "project.preview.send",
        title: t("project.preview.sendFailed"),
      });
    } finally {
      pending.value -= 1;
    }
  }

  function sendFileToNewSession(
    file: ProjectFilePreviewRequest,
    selection?: AttachmentSelection,
  ): Promise<void> {
    return sendFile(file, null, selection);
  }

  return { isSending, sendFile, sendFileToNewSession };
}
