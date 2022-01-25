<script>
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte'
  import { load, type, changes, reset as rs } from './store'
  import { Type, Direction } from './constant'
  import { getFirstItemMarginTop, getLoaderHeight } from './util'

  const dispatch = createEventDispatcher()

  // props
  export let items
  export let height = '100%'
  export let itemHeight = undefined
  export let direction
  export let loading = false
  export let uniqueKey = undefined

  /**
   * [**For direction-top infinite scroll user**]
   * Maximum number of items loaded per load.
   * The offset after loaded may be significantly shift
   * if the number of items that exceeds this value is loaded.
   */
  export let persists
  /**
   * @deprecated use `persists`
   * [**For direction-top infinite scroll user**]
   * Maximum number of items loaded per load.
   * The offset after loaded may be significantly shift
   * if the number of items that exceeds this value is loaded.
   */
  export let maxItemCountPerLoad = 0

  // read-only, but visible to consumers via bind:start
  export let start = 0
  export let end = 0

  // local state
  let heightMap = []
  let rows
  let viewport
  let contents
  let viewportHeight = 0

  let top = 0
  let bottom = 0
  let averageHeight

  let initialized = false
  let searching = false

  $: if (!initialized && !loading && viewport) initialized = true
  $: if (items) load(items)
  $: persists = persists || maxItemCountPerLoad || 0
  $: visible = initialized
    ? items.slice(start, end + persists).map((data, i) => ({ index: i + start, data }))
    : []

  $: if ($changes && $type) onChange($type, ...$changes)

  async function onChange(type, newers, olders) {
    switch (type) {
      case Type.add: {
        const reachedTop = viewport.scrollTop === 0
        reachedTop ? await onTop(newers, olders) : await refresh(newers, viewportHeight, itemHeight)
        break
      }
      case Type.init: {
        await reset()
        await refresh(newers, viewportHeight, itemHeight)
        break
      }
      case Type.modify: {
        await refresh(newers, viewportHeight, itemHeight)
        break
      }
      case Type.remove: {
        await onRemove()
        if (newers && newers.length === 0) await reset()
        break
      }
    }
    if (newers && newers.length > 0 && olders && olders.length === 0) dispatch('initialize')
  }

  async function onTop(newers, olders) {
    const loader = await getLoaderHeight(
      viewport,
      async () => await refresh(newers, viewportHeight, itemHeight)
    )
    const mt = getFirstItemMarginTop(viewport)

    const diff = newers.length - olders.length

    const previousDom = rows[diff]
      ? rows[diff].firstChild // after second time
      : rows[diff - 1] // first time
      ? rows[diff - 1].firstChild
      : undefined

    if (!previousDom || (persists === 0 && $type !== Type.init)) {
      console.warn(`[Virtual Infinite List]
    The number of items exceeds 'persists' or 'maxItemCountPerLoad',
    so the offset after loaded may be significantly shift.`)
    }

    const t = viewport.getBoundingClientRect().top + loader + mt

    const top = previousDom
      ? previousDom.getBoundingClientRect().top - t
      : heightMap.slice(0, diff).reduce((pre, curr) => pre + curr, 0) - t

    viewport.scrollTo(0, top === 0 ? top + 1 : top)
  }

  async function onRemove() {
    const previous = viewport.scrollTop
    await tick()
    viewport.scrollTo(0, previous)
    await handleScroll()
  }

  // whenever `items` changes, invalidate the current heightmap

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

  async function handleScroll() {
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
    // more. maybe we can just call handleScroll again?
  }

  function onScroll() {
    if (!viewport || loading || items.length === 0 || $type === Type.init || searching) return
    const reachedTop = viewport.scrollTop === 0
    const reachedBottom = viewport.scrollHeight - viewport.scrollTop === viewport.clientHeight

    if (direction !== Direction.bottom && reachedTop) dispatch('infinite', { on: 'top' })
    if (direction !== Direction.top && reachedBottom) dispatch('infinite', { on: 'bottom' })
  }

  async function onResize() {
    if (!initialized || !viewport) return
    await refresh(items, viewportHeight, itemHeight)
  }

  export async function reset() {
    initialized = false
    items = []
    top = 0
    bottom = 0
    start = 0
    end = 0
    rs()
    await tick()
  }

  export async function forceRefresh() {
    if (!initialized || !viewport) return
    await handleScroll()
    await refresh(items, viewportHeight, itemHeight)
  }

  export async function scrollTo(offset) {
    if (!initialized || !viewport) return
    viewport.scrollTo(0, offset)
    await forceRefresh()
  }

  export async function scrollToTop() {
    if (!initialized || !viewport) return
    viewport.scrollTo(0, 0)
    await forceRefresh()
  }

  export async function scrollToBottom() {
    if (!initialized || !viewport) return
    viewport.scrollTo(0, viewportHeight + top + bottom)
    await forceRefresh()
  }

  export async function scrollToIndex(index, options = { align: 'top' }) {
    if (typeof items[index] === 'undefined' || !initialized || !viewport) return false
    if (!uniqueKey) {
      console.warn(`[Virtual Infinite List] You have to set 'uniqueKey' if you use this method.`)
      return false
    }

    searching = true
    const { found, top: t, itemRect } = await search(index)
    if (!found) {
      searching = false
      return false
    }
    let top = 0
    switch (options.align) {
      case 'top': {
        top = t
        break
      }
      case 'bottom': {
        top = t - viewport.getBoundingClientRect().height + itemRect.height
        break
      }
      case 'center': {
        top = t - viewport.getBoundingClientRect().height / 2 + itemRect.height
      }
    }

    if (top === 0) top = 1
    if (top === viewport.clientHeight) top -= 1

    viewport.scrollTo(0, top)
    await forceRefresh()

    if (viewport.scrollTop === 0) viewport.scrollTo(0, 1)
    if (viewport.scrollHeight - viewport.scrollTop === viewport.clientHeight)
      viewport.scrollTo(0, viewport.scrollTop - 1)

    searching = false
    return true
  }

  async function search(index) {
    viewport.scrollTo(0, 0)
    await forceRefresh()

    const isInBuffer = index < persists + 1
    const coef = persists - 1
    const to = isInBuffer ? 1 : index - coef

    let result = getTop(index)
    if (result.found) return result

    const h = heightMap.slice(0, index - 1).reduce((h, curr) => h + curr, 0)
    viewport.scrollTo(0, h)
    await forceRefresh()

    result = getTop(index)
    if (result.found) return result

    if (!isInBuffer) {
      const h = heightMap.slice(0, to).reduce((h, curr) => h + curr, 0)
      viewport.scrollTo(0, h)
      await forceRefresh()
    }

    result = getTop(index)
    return result
  }

  function getTop(index) {
    const element = contents.querySelector(
      `#svelte-virtual-infinite-list-items-${items[index][uniqueKey]}`
    )
    const viewportTop = viewport.getBoundingClientRect().top
    if (element) {
      const itemRect = element.getBoundingClientRect()
      return { found: true, top: viewport.scrollTop + itemRect.top - viewportTop, itemRect }
    }
    return { found: false, top: 0, itemRect: undefined }
  }

  // trigger initial refresh
  onMount(() => {
    rows = contents.getElementsByTagName('virtual-infinite-list-row')
    viewport.addEventListener('scroll', onScroll, { passive: true })
  })

  onDestroy(() => {
    viewport.removeEventListener('scroll', onScroll)
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
  on:scroll={handleScroll}
  style="height: {height};"
>
  <virtual-infinite-list-contents
    bind:this={contents}
    style="padding-top: {top}px; padding-bottom: {bottom}px;"
  >
    {#if visible.length > 0}
      {#if loading && direction !== 'bottom'}
        <slot name="loader" />
      {/if}
      {#each visible as row (row.index)}
        <virtual-infinite-list-row
          id={'svelte-virtual-infinite-list-items-' + String(row.data[uniqueKey])}
        >
          <slot name="item" item={row.data}>Template Not Found!!!</slot>
        </virtual-infinite-list-row>
      {/each}
      {#if loading && direction !== 'top'}
        <slot name="loader" />
      {/if}
    {:else if visible.length === 0 && loading}
      <slot name="loader" />
    {/if}
  </virtual-infinite-list-contents>
  {#if !loading && visible.length === 0}
    <slot name="empty" />
  {/if}
</virtual-infinite-list-viewport>
