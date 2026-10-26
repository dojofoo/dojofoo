<script setup lang="ts">
import { onMounted, onUnmounted, reactive, watch } from 'vue'
import { useNav } from '@slidev/client'
import { createFixedClicks } from '@slidev/client/composables/useClicks.ts'
import { CLICKS_MAX } from '@slidev/client/constants.ts'
import SlideContainer from '@slidev/client/internals/SlideContainer.vue'
import SlideWrapper from '@slidev/client/internals/SlideWrapper.vue'

const nav = useNav()
const preferences = reactive({ thumbnails: false, progress: true, reducedMotion: false })
function announce() {
  window.parent.postMessage({ type: 'dojo:slides-position', current: nav.currentSlideNo.value, total: nav.total.value }, window.location.origin)
}
function receive(event: MessageEvent) {
  if (event.source !== window.parent || event.origin !== window.location.origin) return
  if (event.data?.type === 'dojo:slides-navigate') {
    if (event.data.direction === 'next' && nav.currentSlideNo.value < nav.total.value) void nav.nextSlide()
    if (event.data.direction === 'previous' && nav.currentSlideNo.value > 1) void nav.prevSlide()
    return
  }
  if (event.data?.type !== 'dojo:slides-settings') return
  for (const key of ['thumbnails', 'progress', 'reducedMotion'] as const) {
    if (typeof event.data.preferences?.[key] === 'boolean') preferences[key] = event.data.preferences[key]
  }
  announce()
}
watch([nav.currentSlideNo, nav.total], announce)
watch(() => preferences.reducedMotion, value => document.documentElement.toggleAttribute('data-dojo-reduced-motion', value), { immediate: true })
onMounted(() => {
  window.addEventListener('message', receive)
  window.parent.postMessage({ type: 'dojo:slides-ready' }, window.location.origin)
  announce()
})
onUnmounted(() => window.removeEventListener('message', receive))
</script>

<template>
  <nav v-if="preferences.thumbnails" aria-label="Slide thumbnails" class="dojo-slide-thumbnails">
    <button v-for="route in nav.slides.value" :key="route.no" type="button" :aria-label="`Go to slide ${route.no}`" :aria-current="nav.currentSlideNo.value === route.no ? 'page' : undefined" @click="nav.go(route.no)">
      <SlideContainer :no="route.no" :width="144" :use-snapshot="true" class="pointer-events-none">
        <SlideWrapper :clicks-context="createFixedClicks(route, CLICKS_MAX)" :route="route" render-context="overview" />
      </SlideContainer>
    </button>
  </nav>
</template>

<style>
.dojo-slide-thumbnails { position: fixed; z-index: 100; bottom: 0; inset-inline: 0; display: flex; gap: 8px; overflow-x: auto; padding: 10px; background: #171717ed; }
.dojo-slide-thumbnails > button { flex: none; overflow: hidden; border: 2px solid transparent; border-radius: 6px; cursor: pointer; }
.dojo-slide-thumbnails > button[aria-current="page"] { border-color: #ff005c; }
.dojo-slide-thumbnails > button:focus-visible { outline: 2px solid white; outline-offset: 2px; }
html[data-dojo-reduced-motion] *, html[data-dojo-reduced-motion] ::before, html[data-dojo-reduced-motion] ::after { animation-duration: .001ms !important; transition-duration: .001ms !important; }
</style>
