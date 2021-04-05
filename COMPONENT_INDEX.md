# Component Index

## Components

- [`VirtualInfiniteList`](#virtualinfinitelist)

---

## `VirtualInfiniteList`

### Props

| Prop name           | Kind                  | Reactive | Type                   | Default value                                                               | Description                                                                                                                                                     |
| :------------------ | :-------------------- | :------- | :--------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| end                 | <code>let</code>      | Yes      | <code>number</code>    | <code>0</code>                                                              | read-only, but visible to consumers via bind:end                                                                                                                |
| start               | <code>let</code>      | Yes      | <code>number</code>    | <code>0</code>                                                              | read-only, but visible to consumers via bind:start                                                                                                              |
| items               | <code>let</code>      | No       | --                     | --                                                                          | --                                                                                                                                                              |
| height              | <code>let</code>      | No       | <code>string</code>    | <code>'100%'</code>                                                         | --                                                                                                                                                              |
| itemHeight          | <code>let</code>      | No       | --                     | --                                                                          | --                                                                                                                                                              |
| maxItemCountPerLoad | <code>let</code>      | No       | --                     | --                                                                          | Maximum number of items loaded per load.<br />The offset after loaded may be significantly shift<br />if the number of items that exceeds this value is loaded. |
| loading             | <code>let</code>      | No       | --                     | --                                                                          | --                                                                                                                                                              |
| direction           | <code>let</code>      | No       | --                     | --                                                                          | --                                                                                                                                                              |
| scrollTo            | <code>function</code> | No       | <code>() => any</code> | <code>() => { mounted && viewport && (viewport.scrollTop = offset) }</code> | --                                                                                                                                                              |

### Slots

| Slot name | Default | Props                              | Fallback                           |
| :-------- | :------ | :--------------------------------- | :--------------------------------- |
| empty     | No      | --                                 | <code>Empty!!!</code>              |
| item      | No      | <code>{ item: {row.data} } </code> | <code>Template Not Found!!!</code> |
| loader    | No      | --                                 | <code>Loading...</code>            |

### Events

| Event name | Type       | Detail |
| :--------- | :--------- | :----- |
| initialize | dispatched | --     |
| infinite   | dispatched | --     |
