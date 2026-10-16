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

Use this attempt to understand the learner's progress and current difficulty. Respond if you have useful help.

## check-unchanged

The evidence is unchanged. Stay quiet unless one new observation would clearly help.

## check-unchanged-again

This is the second unchanged check. Reconsider what the learner may be missing; don't repeat earlier advice.

## check-repeated

The same failing check has run {{attempt}} times without a code change. Offer help that addresses the gap: a useful observation, explanation, source or different example. Let the learner choose the edit.
