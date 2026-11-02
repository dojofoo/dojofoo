<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createRoot, type Root } from 'react-dom/client'
import { renderSlideComponent, type SlideComponentName } from '../ui'

const props = defineProps<{ component: SlideComponentName; componentProps?: Record<string, unknown> }>()
const element = ref<HTMLElement>()
let root: Root | undefined
const render = () => root?.render(renderSlideComponent(props.component, props.componentProps ?? {}))
watch(() => [props.component, props.componentProps], render)
onMounted(() => { root = createRoot(element.value!); render() })
onBeforeUnmount(() => root?.unmount())
</script>

<template><div ref="element" class="dojo-interaction" /></template>
