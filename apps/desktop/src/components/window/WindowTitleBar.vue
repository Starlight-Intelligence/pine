<template>
  <header
    data-slot="window-titlebar"
    class="window-drag absolute inset-x-0 top-0 z-20"
  >
    <div
      class="relative flex min-h-[var(--window-titlebar-control-height)] w-[env(titlebar-area-width,100%)] items-center gap-1 py-[var(--window-titlebar-padding-block)] pr-3 pl-[var(--window-titlebar-leading-offset)] [margin-left:env(titlebar-area-x,0px)]"
    >
      <div class="window-no-drag flex min-w-0 items-center gap-1">
        <slot name="leading" />
      </div>

      <div class="window-no-drag ml-auto flex min-w-0 items-center gap-1">
        <slot name="trailing" />
      </div>
    </div>
  </header>
</template>
