<div align="center">
  <img src="https://user-images.githubusercontent.com/55611095/113577028-91f6e800-965b-11eb-8081-4fb0f65fa07b.png" title="svelte-virtual-infinite-list">
</div>

# svelte-virtual-infinite-list([DEMO](https://svelte.dev/repl/be9bc677258c48a0a00446bed658672e?version=3.37.0))

[![test](https://github.com/koheing/svelte-virtual-infinite-list/actions/workflows/ci.yaml/badge.svg)](https://github.com/koheing/svelte-virtual-infinite-list/actions/workflows/ci.yaml)

A virtual list component for Svelte apps. Instead of rendering all your data, `<VirtuaInfinitelList>` just renders the bits that are visible, keeping your page nice and light.  

This library is forked and extends from [@sveltejs/svelte-virtual-list](https://github.com/sveltejs/svelte-virtual-list), and all the basic feature of [@sveltejs/svelte-virtual-list](https://github.com/sveltejs/svelte-virtual-list) are available except default slot.  


## Installation

```bash
npm i svelte-virtual-infinite-list
```


## Usage

```html
<script lang="ts">
  import VirtualInfiniteList from 'svelte-virtual-infinite-list'
  import type { InfiniteEvent } from 'svelte-virtual-infinite-list'
  import { find } from './find'

  let things = [
    // these can be any values you like
    { name: 'one', number: 1 },
    { name: 'two', number: 2 },
    { name: 'three', number: 3 },
    // ...
    { name: 'six thousand and ninety-two', number: 6092 }
  ]

  let loading = true
  let viewport: HTMLElement | null = null
  let virtualInfiniteList: VirtualInfiniteList

  async function onInitialize() {
    await virtualInfiniteList.scrollTo(1)
  }

  async function onInfinite({ detail }: InfiniteEvent) {
    if (detail.on === 'bottom') return
    loading = true

    const data = await find(30)
    things = [...data, ...things]

    loading = false
  }

  onMount(async () => {
    viewport = document.querySelector('virtual-infinite-list-viewport') as HTMLElement | null
    const data = await find(30)
    things = [...data]
    loading = false
  })

  async function scrollToIndex(item) {
    const index = things.findIndex((it) => it)
    await virtualInfiniteList.scrollToIndex(index)
  }
</script>

<VirtualInfiniteList
  items={things}
  {loading}
  direction="top"
  maxItemCountPerLoad={30}
  uniqueKey={'number'}
  on:initialize={onInitialize}
  on:infinite={onInfinite}
  bind:this={virtualInfiniteList}
  let:item
>
  <!-- this will be rendered for each currently visible item -->
  <div slot="item">
    <p>{item.number}: {item.name}</p>
  </div>

  <!-- option -->
  <div slot="loader">
    Loading...
  </div>

  <!-- option -->
  <div slot="empty">
    Empty
  </div>
</VirtualInfiniteList>
```

## Additional Props

| No | Property Name | Type | Note |  
| :--: | :-- | :-- | :-- |
| 1 |  `loading` | boolean | - |
| 2 |  `direction` | `'top'` or `'bottom'` or `'vertical'` | Loading direction. |
| 3 |  `maxItemCountPerLoad` | number | [**For direction-top infinite scroll user**] Maximum number of items loaded per load. The offset after loaded may be significantly shift if the number of items that exceeds this value is loaded. `Default value is 0.` |
| 4 | `uniqueKey` | string | You need to set specify one unique property like `id` in the item object if you want to use the `scrollToIndex` method. `Default value is undefined.` |   

## Additional Events

| No | Property Name | Type | Note |  
| :--: | :-- | :-- | :-- |
| 1 |  `on:initialize` | () => any | Emit on change items count from 0 to more over.  |
| 2 |  `on:infinite` | (event: InfiniteEvent) => any | Emit on scrollbar reached top or bottom. |

## Additional Slots
| No | Slot Name | Note |  
| :--: | :--  | :-- |
| 1 |  `item` | Displayed item   |
| 2 |  `loader` | Displayed element if loading is `true` |
| 3 |  `empty` | Displayed element if items is `[]` and loading is `false` |

## Additional Methods

| No | Method Name | Type | Note |  
| :--: | :-- | :-- | :-- |
| 1 |  `scrollTo` | (offset: number) =>  Promise< void > | This allows you to scroll to a specific offset.  |
| 2 |  `scrollToIndex` | (index: number) => Promise< boolean > | This allows you to scroll to a specific item using the index. Returns `true` if this is possible. |
| 3 |  `scrollToTop` | () =>  Promise< void > | This allows you to scroll to top.  |
| 4 |  `scrollToBottom` | () =>  Promise< void > | This allows you to scroll to bottom.  |
| 5 |  `reset` | () =>  Promise< void > | This allows you to reset VirtualInfiniteList.  |
| 6 |  `forceRefresh` | () =>  Promise< void > | This allows you to tick and render VirtualInfiniteList.  |

## LICENSE

[LIL (original)](https://github.com/sveltejs/svelte-virtual-list/blob/master/LICENSE)

[LIL+MIT](https://github.com/koheing/svelte-virtual-infinite-list/blob/main/LICENSE)
