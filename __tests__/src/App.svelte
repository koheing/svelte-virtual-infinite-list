<script>
  import { onMount } from 'svelte'
  import VirtualInfiniteList from '../../src'
  import { find } from './data'

  export let items = []
  export let loading = true
  export let direction = 'top'
  let loadCount = 0
  let virtualInfiniteList
  let start
  let end
  let viewport

  async function onClick() {
    loading = true
    items = []
    direction = direction === 'top' ? 'bottom' : 'top'
    const animals = await find(30)
    items = [...animals]
    loading = false
    loadCount++
  }

  function onInitialize() {
    direction === 'top' && viewport && (viewport.scrollTop = 999999)
  }

  async function onInfinite({ detail }) {
    loading = true
    const animals = await find(30)
    if (detail.on === 'top') items = [...animals, ...items]
    else items = [...items, ...animals]
    loading = false
    loadCount++
  }

  onMount(async () => {
    loading = true
    viewport = document.querySelector('virtual-infinite-list-viewport')
    const animals = await find(30)
    items = [...animals]
    loading = false
    loadCount++
  })

  let value

  $: if (value) {
    scrollToIndex = Number(value)
  }
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
  main {
    text-align: center;
    padding: 1em;
    max-width: 240px;
    margin: 0 auto;
  }
</style>

<main>
  <button on:click={onClick}>Change Direction</button>
  <div class="load-count">{loadCount}</div>
  <input bind:value />
  <button on:click={() => virtualInfiniteList.scrollToIndex(Number(value))} >Get</button>
  
  <div>
    <VirtualInfiniteList
      height="500px"
      {direction}
      {loading}
      {items}
      maxItemCountPerLoad={30}
      on:initialize={onInitialize}
      on:infinite={onInfinite}
      bind:this={virtualInfiniteList}
      bind:start
      bind:end
      let:item>
      <div slot="item">
        <div class="row">{item.name}</div>
      </div>
    </VirtualInfiniteList>
  </div>
  <div>{start} - {end}</div>
</main>
