import { toast } from 'vue-sonner';

export interface ErrorNotification {
  description?: string;
  id: string;
  title: string;
}

export function handleError(error: unknown, notification: ErrorNotification): void {
  console.error(`[Pine] ${notification.id}`, error);
  toast.error(notification.title, {
    description: notification.description,
    id: notification.id,
  });
}
