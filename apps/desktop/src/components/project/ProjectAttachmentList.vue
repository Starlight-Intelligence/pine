<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { FileIcon, FolderIcon, XIcon } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/components/ui/attachment";
import { cn } from "@/lib/utils";
import type { PineAttachment } from "@/shared/attachments";

const props = withDefaults(
  defineProps<{
    attachments: readonly PineAttachment[];
    class?: HTMLAttributes["class"];
    removable?: boolean;
    surface: "composer" | "message";
  }>(),
  { removable: false },
);

const emit = defineEmits<{
  open: [path: string];
  remove: [path: string];
}>();

const { t } = useI18n();

function formatFileSize(size: number): string {
  if (size < 1_000) return `${size} B`;
  if (size < 1_000_000) return `${(size / 1_000).toFixed(1)} KB`;
  if (size < 1_000_000_000) return `${(size / 1_000_000).toFixed(1)} MB`;
  return `${(size / 1_000_000_000).toFixed(1)} GB`;
}
</script>

<template>
  <AttachmentGroup
    :class="cn('project-attachment-list gap-1.5', props.class)"
    role="list"
  >
    <Attachment
      v-for="attachment in attachments"
      :key="attachment.path"
      :class="
        cn(
          'project-attachment max-w-72',
          surface === 'composer' &&
            'rounded-[var(--session-composer-attachment-radius)]',
          surface === 'message' && 'hover:bg-muted/50',
        )
      "
      size="sm"
      role="listitem"
    >
      <AttachmentMedia>
        <FolderIcon v-if="attachment.kind === 'directory'" />
        <FileIcon v-else />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{{ attachment.name }}</AttachmentTitle>
        <AttachmentDescription>
          {{
            attachment.kind === "directory"
              ? t("project.composer.folderAttachment")
              : formatFileSize(attachment.size)
          }}
        </AttachmentDescription>
      </AttachmentContent>
      <AttachmentActions v-if="removable">
        <AttachmentAction
          type="button"
          :aria-label="
            t('project.composer.removeAttachment', { name: attachment.name })
          "
          @click="emit('remove', attachment.path)"
        >
          <XIcon />
        </AttachmentAction>
      </AttachmentActions>
      <AttachmentTrigger
        v-if="surface === 'message'"
        type="button"
        class="cursor-pointer"
        :aria-label="
          t('project.composer.openAttachment', { name: attachment.name })
        "
        @click="emit('open', attachment.path)"
      />
    </Attachment>
  </AttachmentGroup>
</template>
