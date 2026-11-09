---
"@dojofoo/uix": patch
"@dojofoo/web": patch
---

Draw a course's lesson-by-lesson numbers as one chart of stepped areas instead of a bar per lesson, so any number of lessons reads cleanly with no overlapping or misshapen bars. Reached and finished show together under an always-visible legend. Every second lesson is a shade off.

A course's chapters are dotted lines between their lessons, numbered along a top axis, with the lessons numbered along the bottom. Pointing at a lesson, or moving with the arrow keys, reads the lesson out. Pointing at a chapter's number reads out how many reached the chapter and how many finished it. Only the plot scrolls, and only when lessons would be narrower than 3px.
