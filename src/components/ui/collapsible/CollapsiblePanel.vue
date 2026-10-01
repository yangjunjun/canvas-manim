<script setup lang="ts">
import { ChevronDown } from '@lucide/vue'
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'reka-ui'

defineProps<{ title: string }>()
</script>

<template>
  <CollapsibleRoot class="app-collapsible">
    <CollapsibleTrigger class="app-collapsible-trigger">{{ title }}<ChevronDown aria-hidden="true" /></CollapsibleTrigger>
    <CollapsibleContent class="app-collapsible-content"><slot /></CollapsibleContent>
  </CollapsibleRoot>
</template>
