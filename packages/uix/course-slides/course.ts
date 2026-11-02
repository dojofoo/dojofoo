import { shallowRef } from 'vue'

import type { CourseSlideState } from './types'


export const course = shallowRef<CourseSlideState>()
export function act(action: 'answer' | 'next' | 'previous' | 'exit', answer?: string) {
  if (course.value?.busy) return
  window.parent.postMessage({ type: 'dojo:course-action', action, answer }, '*')
}
