<script setup lang="ts">
import { act, course } from '../course'
defineProps<{ lessonId: string; slideId: string }>()
</script>

<template>
  <DojoUI v-if="course && course.lessonId === lessonId && course.current?.id === slideId" :key="slideId" component="Question"
    :component-props="{ state: course, onAnswer: (answer: string) => act('answer', answer) }" />
</template>
