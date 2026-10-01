<script setup lang="ts">
import { computed } from 'vue'
import { Check, ChevronDown } from '@lucide/vue'
import {
  SelectContent, SelectGroup, SelectItem, SelectItemIndicator, SelectItemText,
  SelectLabel, SelectPortal, SelectRoot, SelectTrigger, SelectValue, SelectViewport,
} from 'reka-ui'

interface Option { value: string; label: string }
interface Group { label: string; options: Option[] }

const props = withDefaults(defineProps<{
  modelValue: string
  label: string
  placeholder?: string
  options?: Option[]
  groups?: Group[]
  disabled?: boolean
}>(), { placeholder: '请选择', options: () => [], groups: () => [] })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const allGroups = computed(() => props.groups.length ? props.groups : [{ label: '', options: props.options }])
const emptyOptionValue = '__canvas_manim_empty_option__'
const hasEmptyOption = computed(() => allGroups.value.some(group => group.options.some(option => option.value === '')))
const selectedValue = computed(() => props.modelValue === '' && hasEmptyOption.value ? emptyOptionValue : props.modelValue)
</script>

<template>
  <SelectRoot :model-value="selectedValue" :disabled="disabled" @update:model-value="value => emit('update:modelValue', value === emptyOptionValue ? '' : String(value ?? ''))">
    <SelectTrigger data-slot="select-trigger" :aria-label="label" class="select-field-trigger">
      <SelectValue :placeholder="placeholder" />
      <ChevronDown aria-hidden="true" />
    </SelectTrigger>
    <SelectPortal>
      <SelectContent data-slot="select-content" class="select-field-content" position="popper" :side-offset="4">
        <SelectViewport class="select-field-viewport">
          <SelectGroup v-for="(group, groupIndex) in allGroups" :key="`${group.label}-${groupIndex}`">
            <SelectLabel v-if="group.label" class="select-field-label">{{ group.label }}</SelectLabel>
            <SelectItem v-for="option in group.options" :key="option.value" :value="option.value === '' ? emptyOptionValue : option.value" class="select-field-item">
              <SelectItemText>{{ option.label }}</SelectItemText>
              <SelectItemIndicator class="select-field-indicator"><Check aria-hidden="true" /></SelectItemIndicator>
            </SelectItem>
          </SelectGroup>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
