# RFC: Should Jantt Playground support multiple languages?

Jantt Playground currently presents its controls in English. I’d like to use it in Simplified Chinese, particularly when sharing a plan with teammates who work in Chinese. A team can already write task names and notes in Chinese, but people still need to read English to create tasks, change their status, interpret the timeline, and understand error messages. This is one concrete use case. Broader demand and the cost of maintaining translations are open questions.

## What an initial release could cover

- Offer English and Simplified Chinese (`zh-CN`) in a language selector on desktop and mobile. Save the choice as a personal preference so teammates can view the same plan in different languages.
- Start with a coherent planning workflow: navigation, creating and editing tasks, status labels, and reading the timeline and board. The Gantt and Canvas renderers have labels of their own, so the timeline work would include both. Keep project JSON, task IDs, status values, and user-authored content as entered.
- Consider exports, sample plans, SDK documentation, and Copilot output in separate follow-ups if there is demand.

## One translation file per language

Store translations in separate files such as `locales/en.json` and `locales/zh-CN.json`. Load the selected language on demand and use English as the fallback for missing entries. UI components and chart renderers use the same message keys across languages.

| File | Value for `task.assignedTo` |
| --- | --- |
| `locales/en.json` | `Assigned to {name}` |
| `locales/zh-CN.json` | `负责人：{name}` |

For example, `t("task.assignedTo", { name: assigneeName })` resolves the key and fills in the dynamic value. Each language controls the complete phrase, including where the placeholder appears. Use the selected locale for display dates and numbers. Contributors can add a language by providing its translation file and registering the locale for the selector.

## Questions for maintainers

1. Does an interface in multiple languages fit the project’s priorities? Have you heard of similar needs from other users?
2. Would English and Simplified Chinese covering the core planning workflow be a useful first release? Which workflow should determine whether it is ready?
3. Would contributor-maintained translation files with English fallback be sustainable? What translation review or checks would you want for future interface changes?
