<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AdminLayout from './components/layout/AdminLayout.vue'
import ToastHost from './components/ui/ToastHost.vue'

const route = useRoute()
const isLoginPage = computed(() => route.name === 'login')
</script>

<template>
  <AdminLayout v-if="!isLoginPage">
    <router-view />
  </AdminLayout>
  <router-view v-else />
  <ToastHost />
</template>
