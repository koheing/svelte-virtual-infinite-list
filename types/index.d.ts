/// <reference types="svelte" />
import { SvelteComponentTyped } from 'svelte'

export interface InfiniteEvent extends CustomEvent<{ on: 'top' | 'bottom' }> {}

export interface VirtualInfiniteListProps {
  items: unknown[]
  itemHeight: number | undefined
  /**
   * Maximum number of items loaded per load.
   * The offset after loaded may be significantly shift
   * if the number of items that exceeds this value is loaded.
   */
  maxItemCountPerLoad: number
  loading: boolean
  direction: 'top' | 'bottom'
  scrollTo: (offset: number) => void
  /**
   * read-only, but visible to consumers via bind:start
   */
  readonly start: number
  /**
   * read-only, but visible to consumers via bind:end
   */
  readonly end: number
}

export default class VirtualInfiniteList extends SvelteComponentTyped<
  VirtualInfiniteListProps,
  { infinite: CustomEvent<{ on: 'top' | 'bottom' }>; initialize: CustomEvent<any> },
  {}
> {}
