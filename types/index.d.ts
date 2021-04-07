/// <reference types="svelte" />
import { SvelteComponentTyped } from 'svelte'

export interface InfiniteEvent extends CustomEvent<{ on: 'top' | 'bottom' }> {}
export interface InitializeEvent extends CustomEvent<any>{}

export interface VirtualInfiniteListProps {
  items: any[]
  /**
   * @default '100%'
   */
  height?: string
  /**
   * @default undefined
   */
  itemHeight?: number
  /**
   * [**For direction-top infinite scroll user**]
   * Maximum number of items loaded per load.
   * The offset after loaded may be significantly shift
   * if the number of items that exceeds this value is loaded.
   * 
   * @default 0
   */
  maxItemCountPerLoad?: number
  loading: boolean
  direction: 'top' | 'bottom'
  scrollTo?: (offset: number) => void
  /**
   * read-only, but visible to consumers via bind:start
   * 
   * @default 0
   */
  readonly start?: number
  /**
   * read-only, but visible to consumers via bind:end
   * 
   * @default 0
   */
  readonly end?: number
}

export interface VirtualInfiniteListSlot {
  item: any
  loader: {}
  empty: {}
}

export default class VirtualInfiniteList extends SvelteComponentTyped<
  VirtualInfiniteListProps,
  { infinite: InfiniteEvent; initialize: InitializeEvent },
  VirtualInfiniteListSlot
> {}
