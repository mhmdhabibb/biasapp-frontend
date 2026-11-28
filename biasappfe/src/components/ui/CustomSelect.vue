<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

export interface SelectOption {
  value: number | string
  label: string
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  modelValue: number | string | null | Array<number | string>
  options: SelectOption[]
  placeholder?: string
  searchable?: boolean
  disabled?: boolean
  loading?: boolean
  id?: string
  multiple?: boolean
}>(), {
  placeholder: 'Select option',
  searchable: true,
  disabled: false,
  loading: false,
  id: '',
  multiple: false,
})

const emit = defineEmits<{
  'update:modelValue': [val: number | string | null | Array<number | string>]
}>()

const isOpen = ref(false)
const searchQuery = ref('')
const highlightedIndex = ref(-1)
const dropdownRef = ref<HTMLElement>()
const listRef = ref<HTMLElement>()
const searchInputRef = ref<HTMLInputElement>()

const safeOptions = computed(() => (Array.isArray(props.options) ? props.options : []))

const selectedValues = computed(() =>
  Array.isArray(props.modelValue) ? props.modelValue.map((v) => String(v)) : []
)

const selectedLabel = computed(() => {
  if (props.multiple) {
    const count = selectedValues.value.length
    if (count === 0) return ''
    if (count === 1) {
      const found = safeOptions.value.find((o) => String(o.value) === selectedValues.value[0])
      return found ? found.label : '1 dipilih'
    }
    return `${count} item dipilih`
  }
  if (props.modelValue === null || props.modelValue === undefined) return ''
  const found = safeOptions.value.find((o) => o.value === props.modelValue)
  return found ? found.label : ''
})

const MAX_VISIBLE_OPTIONS = 50

const filteredOptions = computed(() => {
  const opts = safeOptions.value
  if (!searchQuery.value.trim()) return opts
  const q = searchQuery.value.toLowerCase()
  return opts.filter((o) => String(o.label || '').toLowerCase().includes(q))
})

// Batasi DOM yang di-render agar dropdown dengan ratusan opsi tidak freeze.
// User bisa mengetik di search untuk memfilter.
const visibleOptions = computed(() => filteredOptions.value.slice(0, MAX_VISIBLE_OPTIONS))

function toggle() {
  if (props.disabled) return
  isOpen.value ? close() : open()
}

function open() {
  if (props.disabled) return
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

function isSelected(option: SelectOption) {
  if (props.multiple) return selectedValues.value.includes(String(option.value))
  return option.value === props.modelValue
}

function select(option: SelectOption) {
  if (option.disabled) return
  if (props.multiple) {
    const current = Array.isArray(props.modelValue) ? [...props.modelValue] : []
    const idx = current.findIndex((v) => String(v) === String(option.value))
    if (idx >= 0) current.splice(idx, 1)
    else current.push(option.value)
    emit('update:modelValue', current)
    return
  }
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
      highlightedIndex.value = Math.min(highlightedIndex.value + 1, visibleOptions.value.length - 1)
      scrollToHighlighted()
      break
    case 'ArrowUp':
      e.preventDefault()
      highlightedIndex.value = Math.max(highlightedIndex.value - 1, 0)
      scrollToHighlighted()
      break
    case 'Enter':
      e.preventDefault()
      if (highlightedIndex.value >= 0 && highlightedIndex.value < visibleOptions.value.length) {
        const highlightedOption = visibleOptions.value[highlightedIndex.value]
        if (highlightedOption && !highlightedOption.disabled) select(highlightedOption)
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

watch(isOpen, (open) => {
  if (open) {
    document.addEventListener('mousedown', handleClickOutside)
  } else {
    document.removeEventListener('mousedown', handleClickOutside)
  }
})
onBeforeUnmount(() => document.removeEventListener('mousedown', handleClickOutside))

watch(() => searchQuery.value, () => {
  highlightedIndex.value = visibleOptions.value.length >0 ? 0 : -1
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
      :disabled="disabled"
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
        <div v-if="searchable && safeOptions.length > 5" class="custom-select__search-wrap">
          <svg class="custom-select__search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5.25" stroke="currentColor" stroke-width="1.5"/>
            <path d="M11 11L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            class="custom-select__search"
            placeholder="Search..."
            @keydown="handleKeydown"
          >
        </div>
        <ul ref="listRef" class="custom-select__list" role="listbox">
          <li
            v-for="(option, idx) in visibleOptions"
            :key="option.value"
            class="custom-select__option"
            :class="{
              'is-selected': isSelected(option),
              'is-highlighted': idx === highlightedIndex,
              'is-disabled': option.disabled,
            }"
            role="option"
            :aria-selected="isSelected(option)"
            :aria-disabled="option.disabled"
            @mouseenter="highlightedIndex = idx"
            @click="select(option)"
          >
            <span class="custom-select__option-left">
              <input v-if="multiple" type="checkbox" class="custom-select__checkbox" :checked="isSelected(option)" tabindex="-1" @click.stop="select(option)" />
              <span class="custom-select__option-label">{{ option.label }}</span>
            </span>
            <svg v-if="!multiple && isSelected(option)" class="custom-select__check" width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </li>
          <li v-if="loading" class="custom-select__empty" style="color: var(--color-primary); font-weight: 500;">
            Memuat data...
          </li>
          <li v-else-if="filteredOptions.length === 0" class="custom-select__empty">
            Tidak ada data ditemukan
          </li>
          <li v-else-if="filteredOptions.length > visibleOptions.length" class="custom-select__empty">
            Menampilkan {{ visibleOptions.length }} dari {{ filteredOptions.length }} — ketik untuk memfilter
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

/* Pengaman: jika pemakai tak sengaja menambah class="form-select"
   (yang ditujukan untuk native <select>), netralkan agar tidak
   muncul border + panah ganda di root. */
.custom-select.form-select {
  border: none;
  background: none;
  padding: 0;
  min-height: 0;
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

.custom-select__trigger:disabled {
  background: var(--color-surface-hover);
  color: var(--color-text-muted);
  cursor: not-allowed;
  opacity: 0.7;
}

.custom-select__trigger:disabled:hover {
  border-color: var(--color-border);
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
  top: 100%;
  left: 0;
  width: 100%;
  margin-top: 6px;
  z-index: 100;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.08);
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
  max-height: min(260px, 45vh);
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
  padding: 10px 14px;
  min-height: 40px;
  gap: 10px;
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

.custom-select__option.is-disabled {
  color: var(--color-text-muted);
  cursor: not-allowed;
  opacity: 0.6;
}

.custom-select__option:active {
  background: var(--color-surface-sunken);
}

.custom-select__option-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.custom-select__checkbox {
  width: 14px;
  height: 14px;
  accent-color: var(--color-primary);
  flex-shrink: 0;
}

.custom-select__option-label {
  word-break: break-word;
  white-space: normal;
  line-height: 1.35;
  flex: 1;
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
