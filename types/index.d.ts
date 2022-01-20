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
  direction: 'top' | 'bottom' | 'vertical'
  /**
   * @default '100%'
   */
  height?: string
  /**
   * @default undefined
   */
  itemHeight?: number
  /**
   * You need to set specify one unique property like `id` in the item object 
   * if you want to use the `scrollToIndex` method.
   * @default undefined
   */
  uniqueKey?: string
  /**
   * @deprecated
   * [**For direction-top infinite scroll user**]
   * Maximum number of items loaded per load.
   * The offset after loaded may be significantly shift
   * if the number of items that exceeds this value is loaded.
   * 
   * @default 0
   */
  maxItemCountPerLoad?: number
  /**
   * [**For direction-top infinite scroll user**]
   * Maximum number of items loaded per load.
   * The offset after loaded may be significantly shift
   * if the number of items that exceeds this value is loaded.
   * 
   */
   persists?: number
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

  scrollTo?: (offset: number) => Promise<void>
  scrollToIndex?: (index: number, options?: { align: 'top' | 'bottom' | 'center' }) => Promise<boolean>
  scrollToBottom?: () => Promise<void>
  scrollToTop?: () => Promise<void>
  reset?: () => Promise<void>
  forceRefresh?: () => Promise<void>
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
