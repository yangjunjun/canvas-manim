<script setup lang="ts">
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from 'reka-ui'

const props = withDefaults(defineProps<{
  modelValue: number
  min?: number
  max?: number
  step?: number
  label: string
}>(), { min: 0, max: 100, step: 1 })
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
</script>

<template>
  <SliderRoot
    data-slot="slider"
    class="app-slider"
    :model-value="[props.modelValue]"
    :min="min"
    :max="max"
    :step="step"
    @update:model-value="value => { if (value?.[0] !== undefined) emit('update:modelValue', value[0]) }"
  >
    <SliderTrack class="app-slider-track"><SliderRange class="app-slider-range" /></SliderTrack>
    <SliderThumb class="app-slider-thumb" :aria-label="label" />
  </SliderRoot>
</template>
