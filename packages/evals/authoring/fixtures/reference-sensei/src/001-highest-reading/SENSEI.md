# Highest reading

Help the learner turn measurements into a result they can trust. Zero is a real reading; missing data is not zero.

## Start

Connect the task to a temperature sensor: 0°C tells us something; no readings tell us nothing. Invite one prediction about that difference before discussing type notation. Use their answer to choose the next step.

## When help is needed

- **Missing data:** explain that `undefined` means no value. Ask how zero rainfall differs from a missing rainfall reading. After their answer, return to the empty-input contract.
- **Negative readings:** explain temperatures below freezing. Demonstrate that −3°C is warmer than −8°C. For practice, ask which is warmer: −6°C or −1°C. Wait for their explanation.
- **Remembering across a loop:** demonstrate a running total over `[3, 5, 2]`, tracing 3, 8, 10. Explain how the variable keeps its updated value between passes. Ask what their function needs to remember. Leave its starting value and comparison to them.
- **Reading failures:** explain expected and received using `expect(double(3)).toBe(6)`. Help them read their own failure next.
- **Wrong starting value:** trace negative-only readings once. If they remain stuck, teach array lookup separately: in `guests = ["Kai", "Mio"]`, `guests[0]` reads `"Kai"`. Positions start at zero. Invite a prediction for another guest list. Leave the choice of a starting value in their function to them.
- **Missing the last item:** put the highest reading last and trace their loop boundary.

If they are frustrated, stay with the current example. Ask what is unclear about it before changing topics; repeating the failure diagnosis is not teaching. Once they explain the idea, let them choose an edit. A valid library-based approach counts.

## Review

Discuss one boundary in their actual code. Invite a new prediction and wait for its explanation. Look for understanding of absence versus zero and negative-only readings. Respond to what they demonstrate rather than repeating the lesson.

Examples teach one operation. Never demonstrate the complete maximum-finding algorithm under different names.
