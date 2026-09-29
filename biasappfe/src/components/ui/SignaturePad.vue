<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps<{
  modelValue?: string
  width?: string
  height?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const wrapperRef = ref<HTMLDivElement | null>(null)
const canvasRef  = ref<HTMLCanvasElement | null>(null)

let ctx: CanvasRenderingContext2D | null = null
let isDrawing = false
let canvasW = 0
let canvasH = 0
let lastEmitted = ''   // track what we emitted to avoid echo-clearing

function setup() {
  const wrapper = wrapperRef.value
  const canvas  = canvasRef.value
  if (!wrapper || !canvas) return

  const w = wrapper.clientWidth
  const h = wrapper.clientHeight
  if (w < 10 || h < 10) return

  const dpr = window.devicePixelRatio || 1
  canvasW = w
  canvasH = h

  canvas.width  = Math.floor(w * dpr)
  canvas.height = Math.floor(h * dpr)
  canvas.style.width  = w + 'px'
  canvas.style.height = h + 'px'

  ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.strokeStyle = '#111'
  ctx.lineWidth   = 2
  ctx.lineCap     = 'round'
  ctx.lineJoin    = 'round'

  restoreFromModel()
}

function restoreFromModel() {
  if (!ctx || !canvasRef.value) return
  ctx.clearRect(0, 0, canvasW, canvasH)
  if (props.modelValue?.startsWith('data:image')) {
    const img = new Image()
    img.onload = () => ctx?.drawImage(img, 0, 0, canvasW, canvasH)
    img.src = props.modelValue
  }
}

function pos(e: MouseEvent | TouchEvent) {
  const canvas = canvasRef.value!
  const r = canvas.getBoundingClientRect()
  if ('touches' in e) {
    return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top }
  }
  return { x: (e as MouseEvent).clientX - r.left, y: (e as MouseEvent).clientY - r.top }
}

function onDown(e: MouseEvent | TouchEvent) {
  e.preventDefault()
  if (!ctx) { setup(); if (!ctx) return }
  isDrawing = true
  const { x, y } = pos(e)
  ctx.beginPath()
  ctx.moveTo(x, y)
}

function onMove(e: MouseEvent | TouchEvent) {
  if (!isDrawing || !ctx) return
  e.preventDefault()
  const { x, y } = pos(e)
  ctx.lineTo(x, y)
  ctx.stroke()
}

function onUp() {
  if (!isDrawing) return
  isDrawing = false
  if (canvasRef.value) {
    lastEmitted = canvasRef.value.toDataURL()
    emit('update:modelValue', lastEmitted)
  }
}

function clear() {
  if (!ctx || !canvasRef.value) return
  ctx.clearRect(0, 0, canvasW, canvasH)
  lastEmitted = ''
  emit('update:modelValue', '')
}

// When parent resets the form (modelValue becomes '' or new value), sync canvas
watch(() => props.modelValue, (newVal) => {
  if (newVal === lastEmitted) return  // we emitted this ourselves, ignore
  if (!newVal || newVal === '') {
    // form was reset — clear canvas
    if (ctx) ctx.clearRect(0, 0, canvasW, canvasH)
  } else if (newVal.startsWith('data:image')) {
    // editing existing record — restore image
    restoreFromModel()
  }
})

let ro: ResizeObserver | null = null
let tries = 0

function trySetup() {
  if (ctx) return
  setup()
  if (!ctx && tries < 10) {
    tries++
    setTimeout(trySetup, 100)
  }
}

onMounted(() => {
  ro = new ResizeObserver(trySetup)
  if (wrapperRef.value) ro.observe(wrapperRef.value)
  trySetup()
})

onUnmounted(() => ro?.disconnect())
</script>

<template>
  <div
    ref="wrapperRef"
    class="sig-wrap"
    :style="{ height: props.height || '160px', width: props.width || '100%' }"
  >
    <canvas
      ref="canvasRef"
      class="sig-canvas"
      @mousedown="onDown"
      @mousemove="onMove"
      @mouseup="onUp"
      @mouseleave="onUp"
      @touchstart="onDown"
      @touchmove="onMove"
      @touchend="onUp"
    />
    <button type="button" class="sig-clear" @click.prevent="clear">Clear</button>
  </div>
</template>

<style scoped>
.sig-wrap {
  position: relative;
  background: #fff;
  border: 1.5px solid var(--color-border, #d1d5db);
  border-radius: 8px;
  overflow: hidden;
  display: block;
}

.sig-canvas {
  display: block;
  cursor: crosshair;
  touch-action: none;
}

.sig-clear {
  position: absolute;
  top: 6px;
  right: 8px;
  padding: 2px 10px;
  font-size: 11px;
  font-weight: 500;
  background: rgba(255,255,255,0.9);
  border: 1px solid #d1d5db;
  border-radius: 20px;
  cursor: pointer;
  color: #6b7280;
  line-height: 1.6;
}

.sig-clear:hover {
  border-color: #ef4444;
  color: #ef4444;
}
</style>
