import type { Pinia } from "pinia";
import {
  createRouter,
  createWebHashHistory,
  type RouteRecordRaw,
  type Router,
  type RouterHistory,
} from "vue-router";
import { useWorkspaceStore } from "@/stores/workspace";
import { ROUTE_NAMES } from "./routes";

declare module "vue-router" {
  interface RouteMeta {
    requiresWorkspace?: boolean;
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: ROUTE_NAMES.welcome,
    component: () => import("@/views/WelcomeView.vue"),
  },
  {
    path: "/workspace",
    name: ROUTE_NAMES.workspace,
    component: () => import("@/views/WorkspaceView.vue"),
    meta: { requiresWorkspace: true },
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: { name: ROUTE_NAMES.welcome },
  },
];

export function createAppRouter(
  pinia: Pinia,
  history: RouterHistory = createWebHashHistory(),
): Router {
  const router = createRouter({
    history,
    routes,
  });

  router.beforeEach((to) => {
    const workspaceStore = useWorkspaceStore(pinia);

    if (to.meta.requiresWorkspace && !workspaceStore.currentWorkspace) {
      return { name: ROUTE_NAMES.welcome };
    }

    if (to.name === ROUTE_NAMES.welcome && workspaceStore.currentWorkspace) {
      return { name: ROUTE_NAMES.workspace };
    }

    return true;
  });

  return router;
}
