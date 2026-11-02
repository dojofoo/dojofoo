<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useNav } from '@slidev/client'
import { act, course } from './course'

const nav = useNav()
const reducedMotion = computed(() => settings.value.reducedMotion)
const settings = ref({ reducedMotion: false })
const page = computed(() => nav.slides.value.find(route => {
  const meta = route.meta.slide.frontmatter
  return meta.dojoLesson === course.value?.lessonId && meta.dojoSlide === course.value?.current?.id
})?.no)
const canNext = computed(() => course.value && (course.value.current?.type !== 'question' || course.value.response?.correct || course.value.step < course.value.unlockedStep))
function sync() { if (page.value && nav.currentSlideNo.value !== page.value) void nav.go(page.value) }
function receive(event: MessageEvent) {
  if (event.source !== window.parent || event.origin !== new URL(document.referrer).origin) return
  if (event.data?.type === 'dojo:course-state') course.value = event.data.state
  if (event.data?.type === 'dojo:slides-settings') settings.value = event.data.preferences
}
function key(event: KeyboardEvent) {
  if ((event.target as HTMLElement)?.closest('input, textarea, button, a')) return
  // Slidev's free navigation cannot bypass server-owned lesson/checkpoint locks.
  if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'ArrowLeft', 'ArrowUp', 'PageUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault(); event.stopImmediatePropagation()
    if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) { if (course.value?.step) act('previous') }
    else if (canNext.value && course.value?.current?.type !== 'complete') act('next')
  }
}
watch([page, nav.currentSlideNo], () => {
  sync()
  void nextTick(() => {
    // Slidev retains outgoing slides while animating. Only the current slide may
    // expose controls or content to keyboard and assistive technology.
    for (const slide of document.querySelectorAll<HTMLElement>('[data-slidev-no]')) {
      const active = Number(slide.dataset.slidevNo) === page.value
      slide.inert = !active
      slide.setAttribute('aria-hidden', String(!active))
    }
  })
}, { flush: 'post' })
watch(reducedMotion, value => document.documentElement.toggleAttribute('data-dojo-reduced-motion', value), { immediate: true })
onMounted(() => {
  window.addEventListener('message', receive)
  window.addEventListener('keydown', key, true)
  window.parent.postMessage({ type: 'dojo:slides-ready' }, '*')
})
onUnmounted(() => {
  window.removeEventListener('message', receive)
  window.removeEventListener('keydown', key, true)
})
</script>

<template></template>
