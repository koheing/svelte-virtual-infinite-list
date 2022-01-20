<script>
  import { onMount } from 'svelte'
  import VirtualInfiniteList from '../../src'
  import { find } from './data'

  export let items = []
  export let loading = true
  export let direction = 'bottom'
  let loadCount = 0
  let virtualInfiniteList
  let start
  let end
  let value

  async function onClick() {
    loading = true
    items = []
    switch (direction) {
      case 'top': {
        direction = 'bottom'
        break
      }
      case 'bottom': {
        direction = 'top'
        break
      }
      default: {
        direction = 'top'
      }
    }
    const animals = await find(30)
    items = [...animals]
    loading = false
    loadCount++
  }

  async function onInitialize() {
    direction === 'top' && await virtualInfiniteList.scrollToBottom()
    direction === 'bottom' && await virtualInfiniteList.scrollToTop()
    direction === 'vertical' && await virtualInfiniteList.scrollTo(1)
  }

  async function onInfinite({ detail }) {
    loading = true
    const animals = await find(30)
    if (detail.on === 'top') items = [...animals, ...items]
    else items = [...items, ...animals]
    loading = false
    loadCount++
  }

  function onRemove(id) {
    const i = items.slice()
    const index = i.findIndex((it) => it.id === id)
    if (index < 0) return
    i.splice(index, 1)
    items = [...i]
  }

  onMount(async () => {
    loading = true
    const animals = await find(30)
    items = [...animals]
    loading = false
    loadCount++
  })
</script>

<style>
  .row {
    margin-top: 8px;
    margin-bottom: 8px;
    overflow-wrap: break-word;
  }
  .load-count {
    margin-top: 8px;
    margin-bottom: 8px;
  }
  .direction {
    margin-top: 8px;
    margin-bottom: 8px;
  }
  main {
    text-align: center;
    padding: 1em;
    max-width: 240px;
    margin: 0 auto;
  }
</style>

<main>
  <button id="direction" on:click={onClick}>Change Direction</button>
  <div class="direction">Current Direction: {direction}</div>
  <div class="load-count">{loadCount}</div>
  <input bind:value />
  <button id="scrollTo" on:click={() => virtualInfiniteList.scrollToIndex(Number(value))} >moveTo</button>
  
  <div>
    <VirtualInfiniteList
      height="500px"
      {direction}
      {loading}
      {items}
      uniqueKey={'id'}
      maxItemCountPerLoad={30}
      on:initialize={onInitialize}
      on:infinite={onInfinite}
      bind:this={virtualInfiniteList}
      bind:start
      bind:end
      let:item>
      <div slot="item">
        <div class="row" on:click={() => onRemove(item.id)}>{item.name}</div>
      </div>
    </VirtualInfiniteList>
  </div>
  <div>{start} - {end}</div>
</main>
