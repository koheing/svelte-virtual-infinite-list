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
  import { find } from './find.ts'

  const things = [
    // these can be any values you like
    { name: 'one', number: 1 },
    { name: 'two', number: 2 },
    { name: 'three', number: 3 },
    // ...
    { name: 'six thousand and ninety-two', number: 6092 }
  ]

  let loading = true
  let viewport: HTMLElement | null = null

  function onInitialize() {
    viewport && (viewport.scrollTop = 999999)
  }

  async function onInfinite({ detail }: InfiniteEvent) {
    loading = true

    const data = await find(30)
    if (detail.on === 'top') [...data, ...things]
    else [...things, ...data]

    loading = false
  }

  onMount(async () => {
    viewport = document.querySelector('virtual-infinite-list-viewport') as HTMLElement | null
    const data = await find(30)
    things = [...data]
    loading = false
  })

</script>

<VirtualInfiniteList
  items={things}
  {loading}
  direction="top"
  maxItemCountPerLoad={30}
  on:initialize={onInitialize}
  on:infinite={onInfinite}
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
| 2 |  `direction` | `'top'` or `'bottom'` | Loading direction. |
| 3 |  `maxItemCountPerLoad` | number | [**For direction-top infinite scroll user**] Maximum number of items loaded per load. The offset after loaded may be significantly shift if the number of items that exceeds this value is loaded. `Default value is 0.` |   

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

## LICENSE

[LIL (original)](https://github.com/sveltejs/svelte-virtual-list/blob/master/LICENSE)

[LIL+MIT](https://github.com/koheing/svelte-virtual-infinite-list/blob/main/LICENSE)
