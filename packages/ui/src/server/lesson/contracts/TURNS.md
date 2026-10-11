# Sensei turn prompts

Hidden host messages that start a Sensei turn. Each `##` heading is a turn ID. `{{attempt}}` is the number of unchanged failing checks. The check sections are appended to `check-base`.

## begin

Begin the lesson.

## checks-ran

Ran lesson checks.

## learner-evidence

Current local test evidence. Mention it only if it is relevant to the learner's message.

## check-base

This check already completed. Use the attached evidence; do not rerun it or recite test counts.

## check-passed

Checks pass. Follow the lesson's completion guidance.

## check-changed

Respond to what the learner tried: name what improved, then connect one failing behavior to one achievable next move.

## check-unchanged

The evidence is unchanged. Stay quiet unless one new observation would clearly help.

## check-unchanged-again

This is the second unchanged check. Climb one hint rung: be friendlier and more concrete than your last message.

## check-repeated

The learner has run the same failing check {{attempt}} times without changing the code. Treat it as a request for help. Acknowledge the effort, then climb one hint rung: an authored fragment, a docs link, or a worked example on a different problem. Do not repeat earlier advice.
