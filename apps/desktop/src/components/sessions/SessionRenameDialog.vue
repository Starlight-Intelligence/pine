<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { handleError } from "@/app/errors/errorHandler";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { PineSessionSummary } from "@/shared/sessions";
import { useContentTabsStore } from "@/stores/contentTabs";
import { useSessionStore } from "@/stores/session";

const props = defineProps<{ session: PineSessionSummary | null }>();
const open = defineModel<boolean>("open", { required: true });

const { t } = useI18n();
const sessionStore = useSessionStore();
const contentTabsStore = useContentTabsStore();

const name = ref("");
const isRenaming = ref(false);
const canRename = computed(
  () => name.value.trim().length > 0 && !isRenaming.value,
);

function sessionTitle(session: PineSessionSummary | null): string {
  return session?.name || session?.preview || t("sessions.newSession");
}

watch(open, (isOpen) => {
  if (isOpen) name.value = sessionTitle(props.session);
});

async function renameSession(): Promise<void> {
  const target = props.session;
  const nextName = name.value.trim();
  if (!target || !nextName || isRenaming.value) return;

  isRenaming.value = true;
  try {
    const renamed = await sessionStore.renameSession(target.id, nextName);
    contentTabsStore.updateSession(renamed);
    open.value = false;
  } catch (error) {
    handleError(error, {
      id: "sessions.dialog.rename",
      title: t("errors.sessionRename.title"),
      description: t("errors.sessionRename.description"),
    });
  } finally {
    isRenaming.value = false;
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <form class="flex flex-col gap-6" @submit.prevent="renameSession">
        <DialogHeader>
          <DialogTitle>{{ t("sessions.renameTitle") }}</DialogTitle>
          <DialogDescription>
            {{ t("sessions.renameDescription") }}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel for="session-name">
              {{ t("sessions.nameLabel") }}
            </FieldLabel>
            <Input
              id="session-name"
              v-model="name"
              maxlength="200"
              autocomplete="off"
              required
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            :disabled="isRenaming"
            @click="open = false"
          >
            {{ t("common.cancel") }}
          </Button>
          <Button type="submit" :disabled="!canRename">
            {{ t("common.save") }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
