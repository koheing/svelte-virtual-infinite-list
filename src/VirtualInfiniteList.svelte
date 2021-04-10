<script>
  import { onMount, tick, createEventDispatcher, onDestroy } from 'svelte'

  const dispatch = createEventDispatcher()

  export let items
  export let loading
  export let direction
  export let height = '100%'
  export let itemHeight = undefined
  /**
   * [**For direction-top infinite scroll user**]
   * Maximum number of items loaded per load.
   * The offset after loaded may be significantly shift
   * if the number of items that exceeds this value is loaded.
   */
  export let maxItemCountPerLoad = 0

  export function scrollTo(offset) {
    mounted && viewport && (viewport.scrollTop = offset)
  }

  /**
   * read-only, but visible to consumers via bind:start
   */
  export let start = 0
  /**
   * read-only, but visible to consumers via bind:end
   */
  export let end = 0

  let heightMap = []
  let rows
  let viewport
  let contents
  let viewportHeight = 0
  let mounted = false
  let top = 0
  let bottom = 0
  let averageHeight = 0
  let preItems = []
  let loaderHeight

  $: initialized = initialized || !loading
  $: newItemsLoaded = mounted && items && items.length > 0 && items.length - preItems.length > 0
  $: preItemsExisted = mounted && preItems.length > 0
  $: visible = initialized
    ? items.slice(start, end + maxItemCountPerLoad).map((data, i) => ({ index: i + start, data }))
    : []

  $: if (newItemsLoaded && initialized) {
    const reachedTop = viewport.scrollTop === 0
    reachedTop ? onLoadAtTop() : onLoadAtBottom()
  }

  $: if (mounted && items && items.length === 0) {
    initialized = false
    preItemsExisted = false
    preItems = []
    top = 0
    bottom = 0
    start = 0
    end = 0
  }

  $: if (items.length - preItems.length < 0) {
    top = 0
    bottom = 0
    start = 0
    end = 0
  }

  $: itemsRemoved = mounted && items && items.length > 0 && items.length - preItems.length < 0
  if (itemsRemoved) onRemove()

  async function onLoadAtTop() {
    let firstItemTopOnLoading
    if (!loaderHeight) firstItemTopOnLoading = getRowTop()

    await refresh(items, viewportHeight, itemHeight)

    if (!loaderHeight) {
      const firstItemTopOnLoaded = getRowTop()
      const height = firstItemTopOnLoading - firstItemTopOnLoaded
      loaderHeight = height < 0 ? 0 : height
    }

    const diff = items.length - preItems.length
    if (initialized) {
      const scrollTop = calculateScrollTop(rows, viewport, heightMap, diff, loaderHeight)
      viewport.scrollTop = scrollTop === 0 ? scrollTop + 5 : scrollTop
    }

    if (initialized && !preItemsExisted) dispatch('initialize')

    preItems = [...items]
  }

  async function onLoadAtBottom() {
    await refresh(items, viewportHeight, itemHeight)
    if (initialized && !preItemsExisted) dispatch('initialize')

    preItems = [...items]
  }

  async function onRemove() {
    const beforeScrollTop = viewport.scrollTop
    await refresh(items, viewportHeight, itemHeight)
    viewport.scrollTop = beforeScrollTop

    preItems = [...items]
  }

  // use when direction = 'top'
  function calculateScrollTop(rows, viewport, heightMap, diff, loaderHeight) {
    const previousTopDom = rows[diff]
      ? rows[diff].firstChild // after second time
      : rows[diff - 1] // first time
      ? rows[diff - 1].firstChild
      : undefined

    if (!previousTopDom || maxItemCountPerLoad === 0) {
      console.warn(`[Virtual Infinite List]
  The number of items exceeds 'maxItemCountPerLoad',
  so the offset after loaded may be significantly shift.`)
    }

    const viewportTop = viewport.getBoundingClientRect().top
    const topFromTop = viewportTop + loaderHeight
    const scrollTop = previousTopDom
      ? previousTopDom.getBoundingClientRect().top - topFromTop
      : heightMap.slice(0, diff).reduce((pre, curr) => pre + curr) - topFromTop

    return scrollTop
  }

  function getRowTop() {
    const element = viewport.querySelector('virtual-infinite-list-row')
    return element?.getBoundingClientRect().top ?? 0
  }

  async function refresh(items, viewportHeight, itemHeight) {
    const { scrollTop } = viewport
    await tick() // wait until the DOM is up to date
    let contentHeight = top - scrollTop
    let i = start
    while (contentHeight < viewportHeight && i < items.length) {
      let row = rows[i - start]
      if (!row) {
        end = i + 1
        await tick() // render the newly visible row
        row = rows[i - start]
      }
      const rowHeight = (heightMap[i] = itemHeight || row.offsetHeight)
      contentHeight += rowHeight
      i += 1
    }
    end = i
    const remaining = items.length - end
    averageHeight = (top + contentHeight) / end
    bottom = remaining * averageHeight
    heightMap.length = items.length
  }

  async function onScroll() {
    const { scrollTop } = viewport
    const oldStart = start
    for (let v = 0; v < rows.length; v += 1) {
      heightMap[start + v] = itemHeight || rows[v].offsetHeight
    }
    let i = 0
    let y = 0
    while (i < items.length) {
      const rowHeight = heightMap[i] || averageHeight
      if (y + rowHeight > scrollTop) {
        start = i
        top = y
        break
      }
      y += rowHeight
      i += 1
    }
    while (i < items.length) {
      y += heightMap[i] || averageHeight
      i += 1
      if (y > scrollTop + viewportHeight) break
    }
    end = i
    const remaining = items.length - end
    averageHeight = y / end
    while (i < items.length) heightMap[i++] = averageHeight
    bottom = remaining * averageHeight
    // prevent jumping if we scrolled up into unknown territory
    if (start < oldStart) {
      await tick()
      let expectedHeight = 0
      let actualHeight = 0
      for (let i = start; i < oldStart; i += 1) {
        if (rows[i - start]) {
          expectedHeight += heightMap[i]
          actualHeight += itemHeight || rows[i - start].offsetHeight
        }
      }
      const d = actualHeight - expectedHeight
      viewport.scrollTo(0, scrollTop + d)
    }
    // TODO if we overestimated the space these
    // rows would occupy we may need to add some
    // more. maybe we can just call handle_scroll again?
  }

  async function onResize() {
    initialized && viewport && (await refresh(items, viewportHeight, itemHeight))
  }

  function scrollListener() {
    const loadRequired = loadRequiredAtTop(viewport) || loadRequiredAtBottom(viewport)
    if (!initialized || loading || !loadRequired || items.length === 0 || preItems.length === 0)
      return

    const reachedTop = viewport.scrollTop === 0
    const on = reachedTop ? 'top' : 'bottom'
    dispatch('infinite', { on })
  }

  function loadRequiredAtTop(viewport) {
    const reachedTop = viewport.scrollTop === 0
    return reachedTop && direction === 'top'
  }

  function loadRequiredAtBottom(viewport) {
    const reachedBottom = viewport.scrollHeight - viewport.scrollTop === viewport.clientHeight
    return reachedBottom && direction === 'bottom'
  }

  // trigger initial refresh
  onMount(() => {
    rows = contents.getElementsByTagName('virtual-infinite-list-row')
    mounted = true

    viewport.addEventListener('scroll', scrollListener, { passive: true })
  })

  onDestroy(() => {
    viewport.removeEventListener('scroll', scrollListener)
  })
</script>

<style>
  virtual-infinite-list-viewport {
    position: relative;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    display: block;
  }
  virtual-infinite-list-contents,
  virtual-infinite-list-row {
    display: block;
  }
  virtual-infinite-list-row {
    overflow: hidden;
  }
</style>

<svelte:window on:resize={onResize} />

<virtual-infinite-list-viewport
  bind:this={viewport}
  bind:offsetHeight={viewportHeight}
  on:scroll={onScroll}
  style="height: {height};">
  <virtual-infinite-list-contents
    bind:this={contents}
    style="padding-top: {top}px; padding-bottom: {bottom}px;">
    {#if loading && direction === 'top'}
      <slot name="loader" />
    {/if}

    {#if visible.length > 0}
      {#each visible as row (row.index)}
        <virtual-infinite-list-row>
          <slot name="item" item={row.data}>Template Not Found!!!</slot>
        </virtual-infinite-list-row>
      {/each}
    {:else if !loading && visible.length === 0}
      <slot name="empty" />
    {/if}

    {#if loading && direction === 'bottom'}
      <slot name="loader" />
    {/if}
  </virtual-infinite-list-contents>
</virtual-infinite-list-viewport>
