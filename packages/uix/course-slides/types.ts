export type CourseSlideState = {
  lessonId: string
  lessonTitle: string
  lessonIndex: number
  lessons: { id: string; title: string }[]
  current: { id: string; type: 'present' | 'question' | 'complete'; explanation?: string } | null
  response: { answer: string; correct: boolean } | null
  step: number
  totalSteps: number
  unlockedStep: number
  complete: boolean
  busy: boolean
  error?: string
}

