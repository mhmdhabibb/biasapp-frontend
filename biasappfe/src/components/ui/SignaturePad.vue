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

const canvasRef = ref<HTMLCanvasElement | null>(null)
let isDrawing = false
let ctx: CanvasRenderingContext2D | null = null

function getCoordinates(event: MouseEvent | TouchEvent) {
  if (!canvasRef.value) return { x: 0, y: 0 }
  const rect = canvasRef.value.getBoundingClientRect()
  if (event instanceof TouchEvent) {
    return {
      x: event.touches[0].clientX - rect.left,
      y: event.touches[0].clientY - rect.top
    }
  }
  return {
    x: (event as MouseEvent).clientX - rect.left,
    y: (event as MouseEvent).clientY - rect.top
  }
}

function startDrawing(event: MouseEvent | TouchEvent) {
  isDrawing = true
  if (!ctx) return
  const { x, y } = getCoordinates(event)
  ctx.beginPath()
  ctx.moveTo(x, y)
}

function draw(event: MouseEvent | TouchEvent) {
  if (!isDrawing || !ctx) return
  event.preventDefault() // prevent scrolling while signing
  const { x, y } = getCoordinates(event)
  ctx.lineTo(x, y)
  ctx.stroke()
}

function stopDrawing() {
  if (isDrawing) {
    isDrawing = false
    save()
  }
}

function clear() {
  if (!canvasRef.value || !ctx) return
  ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)
  emit('update:modelValue', '')
}

function save() {
  if (!canvasRef.value) return
  const dataUrl = canvasRef.value.toDataURL('image/png')
  emit('update:modelValue', dataUrl)
}

// Ensure high quality rendering on retina displays
function initCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  ctx = canvas.getContext('2d')
  if (!ctx) return

  // Handle high DPI displays
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr
  
  ctx.scale(dpr, dpr)
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // If there's an initial value (like editing), draw it
  if (props.modelValue && props.modelValue.startsWith('data:image')) {
    const img = new Image()
    img.onload = () => {
      ctx?.drawImage(img, 0, 0, rect.width, rect.height)
    }
    img.src = props.modelValue
  }
}

onMounted(() => {
  // Add a small delay to ensure DOM is fully rendered before measuring
  setTimeout(initCanvas, 100)
  window.addEventListener('resize', initCanvas)
})

onUnmounted(() => {
  window.removeEventListener('resize', initCanvas)
})
</script>

<template>
  <div class="signature-wrapper" :style="{ width: props.width || '100%', height: props.height || '200px' }">
    <canvas
      ref="canvasRef"
      class="signature-pad"
      @mousedown="startDrawing"
      @mousemove="draw"
      @mouseup="stopDrawing"
      @mouseleave="stopDrawing"
      @touchstart="startDrawing"
      @touchmove="draw"
      @touchend="stopDrawing"
    ></canvas>
    <button type="button" class="btn btn-sm btn-outline clear-btn" @click.prevent="clear">Clear</button>
  </div>
</template>

<style scoped>
.signature-wrapper {
  position: relative;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background-color: #fff;
  overflow: hidden;
}
.signature-pad {
  width: 100%;
  height: 100%;
  cursor: crosshair;
  touch-action: none; /* Prevent scrolling on touch */
}
.clear-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 8px;
  font-size: 11px;
  background-color: rgba(255, 255, 255, 0.8);
}
</style>
