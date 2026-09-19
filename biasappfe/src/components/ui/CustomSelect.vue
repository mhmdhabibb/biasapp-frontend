<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

export interface SelectOption {
  value: number | string
  label: string
}

const props = withDefaults(defineProps<{
  modelValue: number | string | null
  options: SelectOption[]
  placeholder?: string
  searchable?: boolean
  id?: string
}>(), {
  placeholder: 'Pilih opsi',
  searchable: true,
  id: '',
})

const emit = defineEmits<{
  'update:modelValue': [val: number | string | null]
}>()

const isOpen = ref(false)
const searchQuery = ref('')
const highlightedIndex = ref(-1)
const dropdownRef = ref<HTMLElement>()
const listRef = ref<HTMLElement>()
const searchInputRef = ref<HTMLInputElement>()

const selectedLabel = computed(() => {
  if (props.modelValue === null || props.modelValue === undefined) return ''
  const found = props.options.find(o => o.value === props.modelValue)
  return found ? found.label : ''
})

const filteredOptions = computed(() => {
  if (!searchQuery.value.trim()) return props.options
  const q = searchQuery.value.toLowerCase()
  return props.options.filter(o => o.label.toLowerCase().includes(q))
})

function toggle() {
  isOpen.value ? close() : open()
}

function open() {
  isOpen.value = true
  searchQuery.value = ''
  highlightedIndex.value = -1
  nextTick(() => {
    searchInputRef.value?.focus()
  })
}

function close() {
  isOpen.value = false
  searchQuery.value = ''
  highlightedIndex.value = -1
}

function select(option: SelectOption) {
  emit('update:modelValue', option.value)
  close()
}

function handleKeydown(e: KeyboardEvent) {
  if (!isOpen.value) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault()
      open()
    }
    return
  }

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      highlightedIndex.value = Math.min(highlightedIndex.value + 1, filteredOptions.value.length - 1)
      scrollToHighlighted()
      break
    case 'ArrowUp':
      e.preventDefault()
      highlightedIndex.value = Math.max(highlightedIndex.value - 1, 0)
      scrollToHighlighted()
      break
    case 'Enter':
      e.preventDefault()
      if (highlightedIndex.value >= 0 && highlightedIndex.value < filteredOptions.value.length) {
        select(filteredOptions.value[highlightedIndex.value])
      }
      break
    case 'Escape':
      e.preventDefault()
      close()
      break
  }
}

function scrollToHighlighted() {
  nextTick(() => {
    const el = listRef.value?.children[highlightedIndex.value] as HTMLElement
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function handleClickOutside(e: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    close()
  }
}

onMounted(() => document.addEventListener('mousedown', handleClickOutside))
onBeforeUnmount(() => document.removeEventListener('mousedown', handleClickOutside))

watch(() => searchQuery.value, () => {
  highlightedIndex.value = filteredOptions.value.length > 0 ? 0 : -1
})
</script>

<template>
  <div ref="dropdownRef" class="custom-select" :class="{ 'is-open': isOpen }">
    <button
      type="button"
      class="custom-select__trigger"
      :id="id"
      role="combobox"
      :aria-expanded="isOpen"
      aria-haspopup="listbox"
      @click="toggle"
      @keydown="handleKeydown"
    >
      <span class="custom-select__value" :class="{ 'is-placeholder': !selectedLabel }">
        {{ selectedLabel || placeholder }}
      </span>
      <span class="custom-select__arrow">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
    </button>

    <Transition name="dropdown">
      <div v-if="isOpen" class="custom-select__dropdown">
        <div v-if="searchable" class="custom-select__search-wrap">
          <svg class="custom-select__search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5.25" stroke="currentColor" stroke-width="1.5"/>
            <path d="M11 11L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            class="custom-select__search"
            placeholder="Cari..."
            @keydown="handleKeydown"
          >
        </div>
        <ul ref="listRef" class="custom-select__list" role="listbox">
          <li
            v-for="(option, idx) in filteredOptions"
            :key="option.value"
            class="custom-select__option"
            :class="{
              'is-selected': option.value === modelValue,
              'is-highlighted': idx === highlightedIndex,
            }"
            role="option"
            :aria-selected="option.value === modelValue"
            @mouseenter="highlightedIndex = idx"
            @click="select(option)"
          >
            <span class="custom-select__option-label">{{ option.label }}</span>
            <svg v-if="option.value === modelValue" class="custom-select__check" width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </li>
          <li v-if="filteredOptions.length === 0" class="custom-select__empty">
            Tidak ditemukan
          </li>
        </ul>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.custom-select {
  position: relative;
  width: 100%;
}

.custom-select__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--font-size-base);
  font-family: var(--font-family);
  line-height: 1.5;
  min-height: 44px;
  cursor: pointer;
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast),
    background var(--transition-fast);
  text-align: left;
}

.custom-select__trigger:hover {
  border-color: var(--color-text-muted);
}

.custom-select.is-open .custom-select__trigger,
.custom-select__trigger:focus-visible {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-sky-surface);
}

.custom-select__value {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: var(--font-weight-normal);
}

.custom-select__value.is-placeholder {
  color: var(--color-text-muted);
}

.custom-select__arrow {
  display: flex;
  align-items: center;
  color: var(--color-text-muted);
  transition: transform var(--transition-base);
  flex-shrink: 0;
  margin-left: var(--space-sm);
}

.custom-select.is-open .custom-select__arrow {
  transform: rotate(180deg);
  color: var(--color-primary);
}

.custom-select__dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 50;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.custom-select__search-wrap {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--color-border-light);
}

.custom-select__search-icon {
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.custom-select__search {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  color: var(--color-text);
  font-size: var(--font-size-sm);
  line-height: 1.5;
  padding: 6px 0;
}

.custom-select__search::placeholder {
  color: var(--color-text-muted);
}

.custom-select__list {
  list-style: none;
  margin: 0;
  padding: var(--space-xs) 0;
  max-height: 360px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.custom-select__list::-webkit-scrollbar {
  width: 5px;
}

.custom-select__list::-webkit-scrollbar-track {
  background: transparent;
}

.custom-select__list::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: var(--radius-full);
}

.custom-select__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 14px;
  cursor: pointer;
  font-size: var(--font-size-sm);
  color: var(--color-text);
  transition:
    background var(--transition-fast),
    color var(--transition-fast);
  user-select: none;
}

.custom-select__option.is-highlighted {
  background: var(--color-primary-surface);
}

.custom-select__option.is-selected {
  color: var(--color-primary);
  font-weight: var(--font-weight-medium);
}

.custom-select__option.is-selected.is-highlighted {
  background: var(--color-primary-surface);
}

.custom-select__option:active {
  background: var(--color-surface-sunken);
}

.custom-select__option-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.custom-select__check {
  flex-shrink: 0;
  color: var(--color-primary);
  margin-left: var(--space-sm);
}

.custom-select__empty {
  padding: 16px 14px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

/* Transition */
.dropdown-enter-active {
  animation: dropdown-in var(--transition-base);
}

.dropdown-leave-active {
  animation: dropdown-out var(--transition-fast);
}

@keyframes dropdown-in {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes dropdown-out {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(-4px) scale(0.98);
  }
}
</style>
