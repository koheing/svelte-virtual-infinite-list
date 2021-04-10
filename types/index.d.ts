/// <reference types="svelte" />
import { SvelteComponentTyped } from 'svelte'

export interface InfiniteEventDetail {
  on: 'top' | 'bottom'
}
export interface InfiniteEvent extends CustomEvent<InfiniteEventDetail> {}
export interface InitializeEvent extends CustomEvent<any>{}

export interface VirtualInfiniteListProps {
  items: any[]
  loading: boolean
  direction: 'top' | 'bottom'
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

export interface VirtualInfiniteListEvents {
  infinite: InfiniteEvent;
  initialize: InitializeEvent
}

export interface VirtualInfiniteListSlots {
  item: any
  loader: {}
  empty: {}
}

export default class VirtualInfiniteList extends SvelteComponentTyped<
  VirtualInfiniteListProps,
  VirtualInfiniteListEvents,
  VirtualInfiniteListSlots
> {}
